/**
 * GenAIScreenShots - Offscreen Document
 * Handles media recording and image stitching operations
 * (Required for Manifest V3 since service workers can't access MediaRecorder)
 */

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;
  
  handleMessage(message).then(sendResponse).catch(error => {
    console.error('Offscreen error:', error);
    sendResponse({ success: false, error: error.message });
  });
  
  return true;
});

async function handleMessage(message) {
  switch (message.action) {
    case 'startRecording':
      return await startRecording(message.streamId, message.options);
    
    case 'pauseRecording':
      return pauseRecording();
    
    case 'stopRecording':
      return await stopRecording();
    
    case 'stitchImages':
      return await stitchImages(message);
    
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// Recording Functions
async function startRecording(streamId, options = {}) {
  try {
    // Get the media stream using the stream ID
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
    
    // Add microphone if requested
    if (options.mic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTracks = micStream.getAudioTracks();
        audioTracks.forEach(track => mediaStream.addTrack(track));
      } catch (micError) {
        console.warn('Could not access microphone:', micError);
      }
    }
    
    // Setup MediaRecorder
    recordedChunks = [];
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType,
      videoBitsPerSecond: 3000000 // 3 Mbps
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onerror = (error) => {
      console.error('MediaRecorder error:', error);
    };
    
    mediaRecorder.start(1000); // Collect data every second
    
    return { success: true };
  } catch (error) {
    console.error('Start recording error:', error);
    return { success: false, error: error.message };
  }
}

function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    return { success: true, state: 'paused' };
  } else if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    return { success: true, state: 'recording' };
  }
  return { success: false, error: 'No active recording' };
}

async function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve({ success: false, error: 'No active recording' });
      return;
    }
    
    mediaRecorder.onstop = async () => {
      // Create blob from recorded chunks
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      
      // Convert to data URL
      const reader = new FileReader();
      reader.onloadend = () => {
        // Cleanup
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
          mediaStream = null;
        }
        mediaRecorder = null;
        recordedChunks = [];
        
        resolve({
          success: true,
          dataUrl: reader.result
        });
      };
      reader.readAsDataURL(blob);
    };
    
    mediaRecorder.stop();
  });
}

// Image Stitching for Full Page Screenshots
async function stitchImages(message) {
  const { captures, totalWidth, totalHeight, viewportWidth, viewportHeight } = message;
  
  return new Promise(async (resolve) => {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    
    // Load and draw all images
    const loadImage = (dataUrl) => {
      return new Promise((res) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = dataUrl;
      });
    };
    
    for (const capture of captures) {
      const img = await loadImage(capture.dataUrl);
      if (img) {
        // Calculate exact position
        const x = capture.col * viewportWidth;
        const y = capture.row * viewportHeight;
        
        // Handle edge cases for last row/column
        const drawWidth = Math.min(viewportWidth, totalWidth - x);
        const drawHeight = Math.min(viewportHeight, totalHeight - y);
        
        ctx.drawImage(
          img,
          0, 0, drawWidth, drawHeight, // Source
          x, y, drawWidth, drawHeight   // Destination
        );
      }
    }
    
    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png');
    resolve(dataUrl);
  });
}

// Region capture cropping
async function cropImage(dataUrl, region) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const dpr = region.devicePixelRatio || 1;
      
      canvas.width = region.width * dpr;
      canvas.height = region.height * dpr;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        region.x * dpr, region.y * dpr,
        region.width * dpr, region.height * dpr,
        0, 0,
        region.width * dpr, region.height * dpr
      );
      
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

console.log('GenAIScreenShots offscreen document loaded');
