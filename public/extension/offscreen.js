/**
 * GenAIScreenShots - Offscreen Document
 * Handles media recording, image stitching, cropping, and format conversion.
 * Required for Manifest V3 (service workers can't access DOM/Canvas/MediaRecorder).
 */

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;
  
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
    case 'cropImage':
      return await cropImage(message.dataUrl, message.region);
    case 'convertFormat':
      return await convertFormat(message.dataUrl, message.format);
    default:
      return { success: false, error: 'Unknown offscreen action' };
  }
}

// === Recording ===

async function startRecording(streamId, options = {}) {
  try {
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
        micStream.getAudioTracks().forEach(track => mediaStream.addTrack(track));
      } catch (micError) {
        console.warn('Could not access microphone:', micError);
      }
    }
    
    recordedChunks = [];
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    
    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType,
      videoBitsPerSecond: 3000000
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onerror = (error) => {
      console.error('MediaRecorder error:', error);
    };
    
    mediaRecorder.start(1000);
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
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        cleanup();
        resolve({ success: true, dataUrl: reader.result });
      };
      reader.onerror = () => {
        cleanup();
        resolve({ success: false, error: 'Failed to read recording data' });
      };
      reader.readAsDataURL(blob);
    };
    
    mediaRecorder.stop();
  });
}

function cleanup() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  mediaRecorder = null;
  recordedChunks = [];
}

// === Image Stitching ===

async function stitchImages(message) {
  const { captures, totalWidth, totalHeight, viewportWidth, viewportHeight, outputFormat } = message;
  
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  
  for (const capture of captures) {
    const img = await loadImage(capture.dataUrl);
    if (img) {
      const x = capture.col * viewportWidth;
      const y = capture.row * viewportHeight;
      const drawWidth = Math.min(viewportWidth, totalWidth - x);
      const drawHeight = Math.min(viewportHeight, totalHeight - y);
      ctx.drawImage(img, 0, 0, drawWidth, drawHeight, x, y, drawWidth, drawHeight);
    }
  }
  
  const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
  const mime = mimeMap[outputFormat] || 'image/png';
  return canvas.toDataURL(mime, 0.95);
}

// === Region Crop ===

async function cropImage(dataUrl, region) {
  const img = await loadImage(dataUrl);
  if (!img) return dataUrl;
  
  const dpr = region.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
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
  
  return canvas.toDataURL('image/png');
}

// === Format Conversion ===

async function convertFormat(dataUrl, format) {
  const img = await loadImage(dataUrl);
  if (!img) return dataUrl;
  
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  const mimeMap = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
  return canvas.toDataURL(mimeMap[format] || 'image/png', 0.92);
}

// === Helpers ===

function loadImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

console.log('GenAIScreenShots offscreen document loaded');
