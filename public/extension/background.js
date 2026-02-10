/**
 * GenAIScreenShots - Background Service Worker
 * Handles screenshot capture, recording, scheduling, and offscreen document management
 */

// Offscreen document management
let creatingOffscreen = null;

async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  
  if (existingContexts.length > 0) return;
  
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: [chrome.offscreen.Reason.USER_MEDIA, chrome.offscreen.Reason.DISPLAY_MEDIA],
      justification: 'Recording tab audio and video'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

/**
 * Send a message specifically to the offscreen document.
 * Uses a port-based approach to avoid the background listener intercepting it.
 */
async function sendToOffscreen(message) {
  await setupOffscreenDocument();
  
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };
    // We use a BroadcastChannel as a workaround:
    // Actually, the simplest fix is to tag messages and skip them in the background listener.
    // Let's use chrome.runtime.sendMessage with a target field and skip in our handler.
    chrome.runtime.sendMessage({ ...message, target: 'offscreen' })
      .then(resolve)
      .catch(reject);
  });
}

// Message handler — skip messages targeted at offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // CRITICAL: Don't intercept messages meant for the offscreen document
  if (message.target === 'offscreen') return false;
  
  handleMessage(message, sender).then(sendResponse).catch(error => {
    console.error('Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'capture':
      return await handleCapture(message);
    
    case 'captureRegion':
      return await handleCaptureRegion(message);
    
    case 'startRecording':
      return await handleStartRecording(message);
    
    case 'pauseRecording':
      return await handlePauseRecording();
    
    case 'stopRecording':
      return await handleStopRecording();
    
    case 'createSchedule':
      return await handleCreateSchedule(message.schedule);
    
    case 'deleteSchedule':
      return await handleDeleteSchedule(message.scheduleId);
    
    case 'openCapture':
      return await handleOpenCapture(message.captureId);
    
    default:
      return { success: false, error: 'Unknown action' };
  }
}

// === Screenshot Capture ===

async function handleCapture(message) {
  const { type, settings } = message;
  let { tabId } = message;
  
  try {
    // If no tabId, get active tab
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab) throw new Error('No active tab found. Please open a webpage and try again.');
      tabId = activeTab.id;
    }
    
    // Validate URL
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      throw new Error('Cannot capture this page. Navigate to a regular webpage (http/https) and try again.');
    }
    
    let dataUrl;
    const format = settings.imageFormat || 'png';
    
    switch (type) {
      case 'visible':
        dataUrl = await captureVisibleTab(tab.windowId, format);
        break;
      
      case 'fullpage':
        dataUrl = await captureFullPage(tabId, format);
        break;
      
      case 'region':
        await chrome.tabs.sendMessage(tabId, { action: 'startRegionSelection' });
        return { success: true, pending: true };
      
      default:
        throw new Error('Unknown capture type');
    }
    
    const filename = generateFilename(settings.filenameTemplate, format);
    
    if (settings.autoDownload) {
      await downloadImage(dataUrl, filename);
    }
    
    await saveToRecent(dataUrl, type);
    
    if (settings.showNotifications) {
      await showNotification('Screenshot Captured', `Saved as ${filename}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Capture error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle region capture from content script.
 * Content script sends the selected region coords after the user draws.
 */
async function handleCaptureRegion(message) {
  const { region } = message;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab');
    
    // Focus the window and capture visible tab
    await chrome.windows.update(tab.windowId, { focused: true });
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 100
    });
    
    // Crop using offscreen document
    await setupOffscreenDocument();
    const croppedDataUrl = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'cropImage',
      dataUrl: fullDataUrl,
      region
    });
    
    const settings = await getSettings();
    const filename = generateFilename(settings.filenameTemplate, settings.imageFormat || 'png');
    
    if (settings.autoDownload) {
      await downloadImage(croppedDataUrl, filename);
    }
    
    await saveToRecent(croppedDataUrl, 'region');
    
    if (settings.showNotifications) {
      await showNotification('Region Captured', `Saved as ${filename}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Region capture error:', error);
    return { success: false, error: error.message };
  }
}

async function captureVisibleTab(windowId, format = 'png') {
  await chrome.windows.update(windowId, { focused: true });
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // chrome.tabs.captureVisibleTab only supports png and jpeg
  const captureFormat = (format === 'jpeg' || format === 'jpg') ? 'jpeg' : 'png';
  
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: captureFormat,
    quality: 100
  });
  
  // If user wants webp, convert via offscreen
  if (format === 'webp') {
    await setupOffscreenDocument();
    return await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'convertFormat',
      dataUrl,
      format: 'webp'
    });
  }
  
  return dataUrl;
}

async function captureFullPage(tabId, format = 'png') {
  const [{ result: dimensions }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    })
  });
  
  const { scrollWidth, scrollHeight, viewportWidth, viewportHeight, scrollX: originalX, scrollY: originalY } = dimensions;
  
  const captures = [];
  const cols = Math.ceil(scrollWidth / viewportWidth);
  const rows = Math.ceil(scrollHeight / viewportHeight);
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * viewportWidth;
      const y = row * viewportHeight;
      
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (sx, sy) => window.scrollTo(sx, sy),
        args: [x, y]
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 100
      });
      
      captures.push({ dataUrl, x, y, col, row });
    }
  }
  
  // Restore scroll
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sx, sy) => window.scrollTo(sx, sy),
    args: [originalX, originalY]
  });
  
  // Stitch via offscreen
  await setupOffscreenDocument();
  
  const stitchedDataUrl = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stitchImages',
    captures,
    totalWidth: scrollWidth,
    totalHeight: scrollHeight,
    viewportWidth,
    viewportHeight,
    outputFormat: format
  });
  
  return stitchedDataUrl;
}

// === Recording ===

async function handleStartRecording(message) {
  const { tabId, options } = message;
  
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });
    
    await setupOffscreenDocument();
    
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'startRecording',
      streamId,
      options
    });
    
    return response;
  } catch (error) {
    console.error('Start recording error:', error);
    return { success: false, error: error.message };
  }
}

async function handlePauseRecording() {
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'pauseRecording'
  });
  return response;
}

async function handleStopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'stopRecording'
    });
    
    if (response && response.success && response.dataUrl) {
      const filename = generateFilename('recording_{date}_{time}', 'webm');
      await downloadVideo(response.dataUrl, filename);
      await showNotification('Recording Saved', `Saved as ${filename}`);
    }
    
    return response || { success: false, error: 'No response from recorder' };
  } catch (error) {
    console.error('Stop recording error:', error);
    return { success: false, error: error.message };
  }
}

// === Scheduling ===

async function handleCreateSchedule(schedule) {
  await chrome.alarms.create(`schedule_${schedule.id}`, {
    delayInMinutes: schedule.intervalMinutes,
    periodInMinutes: schedule.intervalMinutes
  });
  return { success: true };
}

async function handleDeleteSchedule(scheduleId) {
  await chrome.alarms.clear(`schedule_${scheduleId}`);
  return { success: true };
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('schedule_')) return;
  
  const scheduleId = alarm.name.replace('schedule_', '');
  const { schedules = [] } = await chrome.storage.sync.get('schedules');
  const schedule = schedules.find(s => s.id === scheduleId);
  
  if (!schedule) {
    await chrome.alarms.clear(alarm.name);
    return;
  }
  
  try {
    const tab = await chrome.tabs.create({ url: schedule.url, active: false });
    
    // Wait for page load using onUpdated
    await new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Fallback timeout
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 10000);
    });
    
    const settings = await getSettings();
    await handleCapture({ type: schedule.type, tabId: tab.id, settings });
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.error('Scheduled capture error:', error);
  }
});

// === Keyboard Shortcuts ===

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  const settings = await getSettings();
  
  switch (command) {
    case 'capture-full-page':
      await handleCapture({ type: 'fullpage', tabId: tab.id, settings });
      break;
    case 'capture-visible':
      await handleCapture({ type: 'visible', tabId: tab.id, settings });
      break;
    case 'start-recording':
      break;
  }
});

// === Utilities ===

async function getSettings() {
  const { settings = {} } = await chrome.storage.sync.get('settings');
  return {
    autoDownload: settings.autoDownload ?? true,
    showNotifications: settings.showNotifications ?? true,
    imageFormat: settings.imageFormat ?? 'png',
    filenameTemplate: settings.filenameTemplate ?? 'screenshot_{date}_{time}'
  };
}

function generateFilename(template, format) {
  const now = new Date();
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  return template.replace('{date}', date).replace('{time}', time) + '.' + format;
}

async function downloadImage(dataUrl, filename) {
  await chrome.downloads.download({
    url: dataUrl,
    filename: `GenAIScreenShots/${filename}`,
    saveAs: false
  });
}

async function downloadVideo(dataUrl, filename) {
  await chrome.downloads.download({
    url: dataUrl,
    filename: `GenAIScreenShots/${filename}`,
    saveAs: false
  });
}

async function saveToRecent(dataUrl, type) {
  const { recentCaptures = [] } = await chrome.storage.local.get('recentCaptures');
  
  recentCaptures.unshift({
    id: Date.now().toString(),
    thumbnail: dataUrl,
    type,
    timestamp: Date.now()
  });
  
  const trimmed = recentCaptures.slice(0, 20);
  await chrome.storage.local.set({ recentCaptures: trimmed });
}

async function showNotification(title, message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}

async function handleOpenCapture(captureId) {
  const { recentCaptures = [] } = await chrome.storage.local.get('recentCaptures');
  const capture = recentCaptures.find(c => c.id === captureId);
  if (capture) {
    await chrome.tabs.create({ url: capture.thumbnail });
  }
  return { success: true };
}

// === Init ===

chrome.runtime.onInstalled.addListener(async () => {
  console.log('GenAIScreenShots installed');
  const { settings } = await chrome.storage.sync.get('settings');
  if (!settings) {
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
