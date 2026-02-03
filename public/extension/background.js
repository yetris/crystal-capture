/**
 * GenAIScreenShots - Background Service Worker
 * Handles screenshot capture, recording, scheduling, and offscreen document management
 */

// Offscreen document management
let creatingOffscreen = null;

async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  
  if (existingContexts.length > 0) {
    return;
  }
  
  // Create offscreen document
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

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(error => {
    console.error('Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  });
  return true; // Keep message channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'capture':
      return await handleCapture(message);
    
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

// Screenshot capture
async function handleCapture(message) {
  const { type, tabId, settings } = message;
  
  try {
    let dataUrl;
    
    switch (type) {
      case 'visible':
        dataUrl = await captureVisibleTab();
        break;
      
      case 'fullpage':
        dataUrl = await captureFullPage(tabId);
        break;
      
      case 'region':
        // Inject region selection overlay
        await chrome.tabs.sendMessage(tabId, { action: 'startRegionSelection' });
        return { success: true, pending: true };
      
      default:
        throw new Error('Unknown capture type');
    }
    
    // Generate filename
    const filename = generateFilename(settings.filenameTemplate, settings.imageFormat);
    
    // Download the image
    if (settings.autoDownload) {
      await downloadImage(dataUrl, filename);
    }
    
    // Save to recent captures
    await saveToRecent(dataUrl, type);
    
    // Show notification
    if (settings.showNotifications) {
      await showNotification('Screenshot Captured', `Saved as ${filename}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Capture error:', error);
    return { success: false, error: error.message };
  }
}

async function captureVisibleTab() {
  return await chrome.tabs.captureVisibleTab(null, {
    format: 'png',
    quality: 100
  });
}

async function captureFullPage(tabId) {
  // Get page dimensions
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
  
  // Capture each viewport section
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * viewportWidth;
      const y = row * viewportHeight;
      
      // Scroll to position
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (scrollX, scrollY) => window.scrollTo(scrollX, scrollY),
        args: [x, y]
      });
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Capture
      const dataUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 100
      });
      
      captures.push({
        dataUrl,
        x: Math.min(x, scrollWidth - viewportWidth),
        y: Math.min(y, scrollHeight - viewportHeight),
        col,
        row
      });
    }
  }
  
  // Restore original scroll position
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (scrollX, scrollY) => window.scrollTo(scrollX, scrollY),
    args: [originalX, originalY]
  });
  
  // Stitch images together using offscreen document
  await setupOffscreenDocument();
  
  const stitchedDataUrl = await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stitchImages',
    captures,
    totalWidth: scrollWidth,
    totalHeight: scrollHeight,
    viewportWidth,
    viewportHeight
  });
  
  return stitchedDataUrl;
}

// Recording functions
async function handleStartRecording(message) {
  const { tabId, options } = message;
  
  try {
    // Get a MediaStream for the tab
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });
    
    // Setup offscreen document for recording
    await setupOffscreenDocument();
    
    // Send stream ID to offscreen document to start recording
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
  await chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'pauseRecording'
  });
  return { success: true };
}

async function handleStopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'stopRecording'
    });
    
    if (response.success && response.dataUrl) {
      const filename = generateFilename('recording_{date}_{time}', 'webm');
      await downloadVideo(response.dataUrl, filename);
      await showNotification('Recording Saved', `Saved as ${filename}`);
    }
    
    return response;
  } catch (error) {
    console.error('Stop recording error:', error);
    return { success: false, error: error.message };
  }
}

// Scheduling
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

// Alarm listener for scheduled captures
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('schedule_')) return;
  
  const scheduleId = alarm.name.replace('schedule_', '');
  const { schedules = [] } = await chrome.storage.sync.get('schedules');
  const schedule = schedules.find(s => s.id === scheduleId);
  
  if (!schedule) {
    await chrome.alarms.clear(alarm.name);
    return;
  }
  
  // Create a new tab, capture, then close
  try {
    const tab = await chrome.tabs.create({ url: schedule.url, active: false });
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page load
    
    const settings = await getSettings();
    await handleCapture({
      type: schedule.type,
      tabId: tab.id,
      settings
    });
    
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.error('Scheduled capture error:', error);
  }
});

// Keyboard shortcuts
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
      // Toggle recording
      // (Would need state tracking for proper toggle)
      break;
  }
});

// Utility functions
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
  
  return template
    .replace('{date}', date)
    .replace('{time}', time) + '.' + format;
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
  
  // Create thumbnail (smaller version)
  const thumbnail = dataUrl; // In production, resize this
  
  recentCaptures.unshift({
    id: Date.now().toString(),
    thumbnail,
    type,
    timestamp: Date.now()
  });
  
  // Keep only last 20 captures
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
    // Open in new tab
    await chrome.tabs.create({ url: capture.thumbnail });
  }
  
  return { success: true };
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
  console.log('GenAIScreenShots installed');
  
  // Set default settings
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
