/**
 * GenAIScreenShots - Background Service Worker
 * Handles screenshot capture, recording, scheduling, and offscreen document management.
 * Manifest V3 compliant — no ES modules, no DOM access.
 */

// ─── Offscreen Document Management ───────────────────────────────────────────

let creatingOffscreen = null;
let isRecordingActive = false;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url]
  });
  if (contexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA', 'DISPLAY_MEDIA'],
    justification: 'Recording tab video/audio and stitching images via canvas'
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

// ─── Message Router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Skip messages meant for the offscreen document
  if (message.target === 'offscreen') return false;

  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('Background message error:', err);
      sendResponse({ success: false, error: err.message });
    });
  return true; // async
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'capture':        return handleCapture(message);
    case 'captureRegion':  return handleCaptureRegion(message);
    case 'startRecording': return handleStartRecording(message);
    case 'pauseRecording': return handlePauseRecording();
    case 'stopRecording':  return handleStopRecording();
    case 'getRecordingState': return { success: true, isRecording: isRecordingActive };
    case 'createSchedule': return handleCreateSchedule(message.schedule);
    case 'deleteSchedule': return handleDeleteSchedule(message.scheduleId);
    case 'openCapture':    return handleOpenCapture(message.captureId);
    default:               return { success: false, error: 'Unknown action: ' + message.action };
  }
}

// ─── Screenshot: Visible / Full Page ─────────────────────────────────────────

async function handleCapture(message) {
  var type = message.type;
  var settings = message.settings;
  var tabId = message.tabId;

  try {
    if (!tabId) {
      var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) throw new Error('No active tab found. Open a webpage first.');
      tabId = tabs[0].id;
    }

    var tab = await chrome.tabs.get(tabId);
    if (!tab.url || /^(chrome|chrome-extension|about|edge):/.test(tab.url)) {
      throw new Error('Cannot capture this page. Navigate to an http/https page.');
    }

    var format = (settings && settings.imageFormat) || 'png';
    var dataUrl;

    if (type === 'visible') {
      dataUrl = await captureVisible(tab.windowId, format);
    } else if (type === 'fullpage') {
      dataUrl = await captureFullPage(tabId, format);
    } else if (type === 'region') {
      // Tell content script to show selection overlay
      await chrome.tabs.sendMessage(tabId, { action: 'startRegionSelection' });
      return { success: true, pending: true };
    } else {
      throw new Error('Unknown capture type: ' + type);
    }

    var filename = makeFilename(settings.filenameTemplate, format);
    if (settings.autoDownload) await downloadFile(dataUrl, filename);
    await saveToRecent(dataUrl, type);
    if (settings.showNotifications) await notify('Screenshot Captured', filename);

    return { success: true, dataUrl: dataUrl };
  } catch (err) {
    console.error('Capture error:', err);
    return { success: false, error: err.message };
  }
}

async function captureVisible(windowId, format) {
  await chrome.windows.update(windowId, { focused: true });
  await delay(120);

  var apiFormat = (format === 'jpeg' || format === 'jpg') ? 'jpeg' : 'png';
  var dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: apiFormat, quality: 100 });

  if (format === 'webp') {
    await ensureOffscreen();
    dataUrl = await chrome.runtime.sendMessage({
      target: 'offscreen', action: 'convertFormat', dataUrl: dataUrl, format: 'webp'
    });
  }
  return dataUrl;
}

async function captureFullPage(tabId, format) {
  var result = await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function () {
      return {
        sw: document.documentElement.scrollWidth,
        sh: document.documentElement.scrollHeight,
        vw: window.innerWidth,
        vh: window.innerHeight,
        ox: window.scrollX,
        oy: window.scrollY
      };
    }
  });
  var d = result[0].result;

  var cols = Math.ceil(d.sw / d.vw);
  var rows = Math.ceil(d.sh / d.vh);
  var captures = [];

  // Hide scrollbars during capture
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function () { document.documentElement.style.overflow = 'hidden'; }
  });

  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      var sx = col * d.vw;
      var sy = row * d.vh;

      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function (x, y) { window.scrollTo(x, y); },
        args: [sx, sy]
      });
      await delay(250);

      var shot = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
      captures.push({ dataUrl: shot, col: col, row: row });
    }
  }

  // Restore
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function (x, y) {
      document.documentElement.style.overflow = '';
      window.scrollTo(x, y);
    },
    args: [d.ox, d.oy]
  });

  await ensureOffscreen();
  var stitched = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stitchImages',
    captures: captures,
    totalWidth: d.sw,
    totalHeight: d.sh,
    viewportWidth: d.vw,
    viewportHeight: d.vh,
    outputFormat: format
  });

  return stitched;
}

// ─── Screenshot: Region ──────────────────────────────────────────────────────

async function handleCaptureRegion(message) {
  var region = message.region;
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab) throw new Error('No active tab');

    await chrome.windows.update(tab.windowId, { focused: true });
    await delay(200);

    var fullShot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png', quality: 100 });

    await ensureOffscreen();
    var cropped = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'cropImage',
      dataUrl: fullShot,
      region: region
    });

    var settings = await getSettings();
    var filename = makeFilename(settings.filenameTemplate, settings.imageFormat);

    if (settings.autoDownload) await downloadFile(cropped, filename);
    await saveToRecent(cropped, 'region');
    if (settings.showNotifications) await notify('Region Captured', filename);

    return { success: true };
  } catch (err) {
    console.error('Region capture error:', err);
    return { success: false, error: err.message };
  }
}

// ─── Recording ───────────────────────────────────────────────────────────────

async function handleStartRecording(message) {
  var tabId = message.tabId;
  var options = message.options || {};

  try {
    var streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreen();

    var resp = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'startRecording',
      streamId: streamId,
      options: options
    });

    if (resp && resp.success) isRecordingActive = true;
    return resp;
  } catch (err) {
    console.error('Start recording error:', err);
    return { success: false, error: err.message };
  }
}

async function handlePauseRecording() {
  try {
    return await chrome.runtime.sendMessage({ target: 'offscreen', action: 'pauseRecording' });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleStopRecording() {
  try {
    var resp = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'stopRecording' });

    isRecordingActive = false;

    if (resp && resp.success && resp.dataUrl) {
      var filename = makeFilename('recording_{date}_{time}', 'webm');
      await downloadFile(resp.dataUrl, filename);
      await notify('Recording Saved', filename);
    }
    return resp || { success: false, error: 'No response from recorder' };
  } catch (err) {
    console.error('Stop recording error:', err);
    isRecordingActive = false;
    return { success: false, error: err.message };
  }
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

async function handleCreateSchedule(schedule) {
  await chrome.alarms.create('schedule_' + schedule.id, {
    delayInMinutes: schedule.intervalMinutes,
    periodInMinutes: schedule.intervalMinutes
  });
  return { success: true };
}

async function handleDeleteSchedule(scheduleId) {
  await chrome.alarms.clear('schedule_' + scheduleId);
  return { success: true };
}

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (!alarm.name.startsWith('schedule_')) return;

  var scheduleId = alarm.name.replace('schedule_', '');
  var data = await chrome.storage.sync.get('schedules');
  var schedules = data.schedules || [];
  var schedule = schedules.find(function (s) { return s.id === scheduleId; });

  if (!schedule) {
    await chrome.alarms.clear(alarm.name);
    return;
  }

  try {
    var tab = await chrome.tabs.create({ url: schedule.url, active: false });

    // Wait for page load
    await new Promise(function (resolve) {
      function onUpdate(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdate);
      setTimeout(function () {
        chrome.tabs.onUpdated.removeListener(onUpdate);
        resolve();
      }, 12000);
    });

    var settings = await getSettings();
    await handleCapture({ type: schedule.type, tabId: tab.id, settings: settings });
    await chrome.tabs.remove(tab.id);
  } catch (err) {
    console.error('Scheduled capture error:', err);
  }
});

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async function (command) {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return;
  var tab = tabs[0];
  var settings = await getSettings();

  switch (command) {
    case 'capture-full-page':
      await handleCapture({ type: 'fullpage', tabId: tab.id, settings: settings });
      break;
    case 'capture-visible':
      await handleCapture({ type: 'visible', tabId: tab.id, settings: settings });
      break;
    case 'start-recording':
      if (isRecordingActive) {
        await handleStopRecording();
      } else {
        await handleStartRecording({ tabId: tab.id, options: { audio: true, mic: false } });
      }
      break;
  }
});

// ─── Utilities ───────────────────────────────────────────────────────────────

async function getSettings() {
  var data = await chrome.storage.sync.get('settings');
  var s = data.settings || {};
  return {
    autoDownload:      s.autoDownload !== undefined ? s.autoDownload : true,
    showNotifications: s.showNotifications !== undefined ? s.showNotifications : true,
    imageFormat:       s.imageFormat || 'png',
    filenameTemplate:  s.filenameTemplate || 'screenshot_{date}_{time}'
  };
}

function makeFilename(template, format) {
  var now = new Date();
  var date = now.toISOString().split('T')[0];
  var time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return (template || 'screenshot_{date}_{time}')
    .replace('{date}', date)
    .replace('{time}', time) + '.' + format;
}

async function downloadFile(dataUrl, filename) {
  return chrome.downloads.download({
    url: dataUrl,
    filename: 'GenAIScreenShots/' + filename,
    saveAs: false
  });
}

async function saveToRecent(dataUrl, type) {
  var data = await chrome.storage.local.get('recentCaptures');
  var captures = data.recentCaptures || [];

  captures.unshift({
    id: Date.now().toString(),
    thumbnail: dataUrl,
    type: type,
    timestamp: Date.now()
  });

  // Keep last 20
  if (captures.length > 20) captures = captures.slice(0, 20);
  await chrome.storage.local.set({ recentCaptures: captures });
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: title,
      message: message
    });
  } catch (e) {
    console.warn('Notification error:', e);
  }
}

async function handleOpenCapture(captureId) {
  var data = await chrome.storage.local.get('recentCaptures');
  var captures = data.recentCaptures || [];
  var capture = captures.find(function (c) { return c.id === captureId; });
  if (capture) {
    await chrome.tabs.create({ url: capture.thumbnail });
  }
  return { success: true };
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ─── Init ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async function () {
  console.log('GenAIScreenShots installed — v1.0.0');
  var data = await chrome.storage.sync.get('settings');
  if (!data.settings) {
    await chrome.storage.sync.set({
      settings: {
        autoDownload: true,
        showNotifications: true,
        imageFormat: 'png',
        filenameTemplate: 'screenshot_{date}_{time}'
      }
    });
  }
});
