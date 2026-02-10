/**
 * GenAIScreenShots - Offscreen Document
 * Handles MediaRecorder, canvas stitching, cropping, and format conversion.
 * Required because MV3 service workers cannot access DOM, Canvas, or MediaRecorder.
 */

var mediaRecorder = null;
var recordedChunks = [];
var mediaStream = null;

// ─── Message Listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.target !== 'offscreen') return false;

  handleMessage(message)
    .then(sendResponse)
    .catch(function (err) {
      console.error('Offscreen error:', err);
      sendResponse({ success: false, error: err.message });
    });
  return true;
});

function handleMessage(message) {
  switch (message.action) {
    case 'startRecording':  return startRecording(message.streamId, message.options);
    case 'pauseRecording':  return Promise.resolve(pauseRecording());
    case 'stopRecording':   return stopRecording();
    case 'stitchImages':    return stitchImages(message);
    case 'cropImage':       return cropImage(message.dataUrl, message.region);
    case 'convertFormat':   return convertFormat(message.dataUrl, message.format);
    default:                return Promise.resolve({ success: false, error: 'Unknown offscreen action' });
  }
}

// ─── Recording ───────────────────────────────────────────────────────────────

async function startRecording(streamId, options) {
  options = options || {};
  try {
    // Clean up any previous stream
    cleanup();

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

    // Optionally add microphone
    if (options.mic) {
      try {
        var micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        var micTracks = micStream.getAudioTracks();
        for (var i = 0; i < micTracks.length; i++) {
          mediaStream.addTrack(micTracks[i]);
        }
      } catch (micErr) {
        console.warn('Microphone not available:', micErr.message);
      }
    }

    recordedChunks = [];

    var mimeType = 'video/webm';
    if (typeof MediaRecorder.isTypeSupported === 'function') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        mimeType = 'video/webm;codecs=vp8';
      }
    }

    mediaRecorder = new MediaRecorder(mediaStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 3000000
    });

    mediaRecorder.ondataavailable = function (e) {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onerror = function (e) {
      console.error('MediaRecorder error:', e);
    };

    mediaRecorder.start(1000); // chunk every 1 s
    return { success: true };
  } catch (err) {
    console.error('startRecording error:', err);
    return { success: false, error: err.message };
  }
}

function pauseRecording() {
  if (!mediaRecorder) return { success: false, error: 'No active recording' };
  if (mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    return { success: true, state: 'paused' };
  }
  if (mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    return { success: true, state: 'recording' };
  }
  return { success: false, error: 'Recorder in unexpected state: ' + mediaRecorder.state };
}

function stopRecording() {
  return new Promise(function (resolve) {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve({ success: false, error: 'No active recording' });
      return;
    }

    mediaRecorder.onstop = function () {
      var blob = new Blob(recordedChunks, { type: 'video/webm' });
      var reader = new FileReader();
      reader.onloadend = function () {
        var dataUrl = reader.result;
        cleanup();
        resolve({ success: true, dataUrl: dataUrl });
      };
      reader.onerror = function () {
        cleanup();
        resolve({ success: false, error: 'Failed to read recording blob' });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.stop();
  });
}

function cleanup() {
  if (mediaStream) {
    var tracks = mediaStream.getTracks();
    for (var i = 0; i < tracks.length; i++) tracks[i].stop();
    mediaStream = null;
  }
  mediaRecorder = null;
  recordedChunks = [];
}

// ─── Image Stitching (Full-Page) ─────────────────────────────────────────────

function stitchImages(msg) {
  var captures     = msg.captures;
  var totalWidth   = msg.totalWidth;
  var totalHeight  = msg.totalHeight;
  var vw           = msg.viewportWidth;
  var vh           = msg.viewportHeight;
  var outputFormat = msg.outputFormat || 'png';

  var canvas = document.createElement('canvas');
  canvas.width  = totalWidth;
  canvas.height = totalHeight;
  var ctx = canvas.getContext('2d');

  var loaded = 0;
  var total  = captures.length;

  return new Promise(function (resolve) {
    if (total === 0) {
      resolve(canvas.toDataURL('image/png'));
      return;
    }

    captures.forEach(function (cap) {
      var img = new Image();
      img.onload = function () {
        var dx = cap.col * vw;
        var dy = cap.row * vh;
        var dw = Math.min(vw, totalWidth  - dx);
        var dh = Math.min(vh, totalHeight - dy);
        ctx.drawImage(img, 0, 0, dw, dh, dx, dy, dw, dh);
        loaded++;
        if (loaded === total) finish();
      };
      img.onerror = function () {
        loaded++;
        if (loaded === total) finish();
      };
      img.src = cap.dataUrl;
    });

    function finish() {
      var mimeMap = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
      var mime = mimeMap[outputFormat] || 'image/png';
      resolve(canvas.toDataURL(mime, 0.95));
    }
  });
}

// ─── Region Crop ─────────────────────────────────────────────────────────────

function cropImage(dataUrl, region) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var dpr = region.devicePixelRatio || 1;
      var canvas = document.createElement('canvas');
      canvas.width  = region.width  * dpr;
      canvas.height = region.height * dpr;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        region.x * dpr, region.y * dpr, region.width * dpr, region.height * dpr,
        0, 0, region.width * dpr, region.height * dpr
      );
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = function () { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

// ─── Format Conversion ──────────────────────────────────────────────────────

function convertFormat(dataUrl, format) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var mimeMap = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp' };
      resolve(canvas.toDataURL(mimeMap[format] || 'image/png', 0.92));
    };
    img.onerror = function () { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

console.log('GenAIScreenShots offscreen document ready');
