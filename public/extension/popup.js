/**
 * GenAIScreenShots - Popup Script
 * Handles UI interactions and communicates with background service worker
 */

// Initialize ExtensionPay
const extpay = typeof ExtPay !== 'undefined' ? ExtPay('screenshots') : null;

// State
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let isPremium = false;

// DOM Elements
const elements = {
  // Buttons
  captureVisible: document.getElementById('captureVisible'),
  captureFullPage: document.getElementById('captureFullPage'),
  captureRegion: document.getElementById('captureRegion'),
  startRecording: document.getElementById('startRecording'),
  pauseRecording: document.getElementById('pauseRecording'),
  stopRecording: document.getElementById('stopRecording'),
  upgradeBtn: document.getElementById('upgradeBtn'),
  createSchedule: document.getElementById('createSchedule'),
  manageSubscription: document.getElementById('manageSubscription'),
  
  // Panels
  recordingPanel: document.getElementById('recordingPanel'),
  subscriptionBanner: document.getElementById('subscriptionBanner'),
  premiumBadge: document.getElementById('premiumBadge'),
  scheduleForm: document.getElementById('scheduleForm'),
  schedulePremium: document.getElementById('schedulePremium'),
  
  // Recording options
  includeAudio: document.getElementById('includeAudio'),
  includeMic: document.getElementById('includeMic'),
  recordingTime: document.getElementById('recordingTime'),
  
  // Schedule form
  scheduleType: document.getElementById('scheduleType'),
  scheduleInterval: document.getElementById('scheduleInterval'),
  scheduleUrl: document.getElementById('scheduleUrl'),
  scheduleList: document.getElementById('scheduleList'),
  
  // Settings
  autoDownload: document.getElementById('autoDownload'),
  showNotifications: document.getElementById('showNotifications'),
  imageFormat: document.getElementById('imageFormat'),
  filenameTemplate: document.getElementById('filenameTemplate'),
  
  // Other
  recentGrid: document.getElementById('recentGrid'),
  toast: document.getElementById('toast')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkPremiumStatus();
  await loadSchedules();
  await loadRecentCaptures();
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  // Capture buttons
  elements.captureVisible.addEventListener('click', () => captureScreen('visible'));
  elements.captureFullPage.addEventListener('click', () => captureScreen('fullpage'));
  elements.captureRegion.addEventListener('click', () => captureScreen('region'));
  
  // Recording
  elements.startRecording.addEventListener('click', toggleRecording);
  elements.pauseRecording?.addEventListener('click', pauseRecording);
  elements.stopRecording?.addEventListener('click', stopRecording);
  
  // Subscription
  elements.upgradeBtn?.addEventListener('click', openPayment);
  elements.manageSubscription?.addEventListener('click', manageSubscription);
  
  // Schedule
  elements.createSchedule?.addEventListener('click', createSchedule);
  
  // Settings (auto-save on change)
  elements.autoDownload?.addEventListener('change', saveSettings);
  elements.showNotifications?.addEventListener('change', saveSettings);
  elements.imageFormat?.addEventListener('change', saveSettings);
  elements.filenameTemplate?.addEventListener('change', saveSettings);
}

// Screenshot Capture
async function captureScreen(type) {
  try {
    showToast('📸 Capturing...', 'info');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showToast('❌ Cannot capture this page', 'error');
      return;
    }
    
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'capture',
      type: type,
      tabId: tab.id,
      settings: await getSettings()
    });
    
    if (response.success) {
      showToast('✅ Screenshot saved!', 'success');
      await loadRecentCaptures();
    } else {
      showToast(`❌ ${response.error || 'Capture failed'}`, 'error');
    }
  } catch (error) {
    console.error('Capture error:', error);
    showToast('❌ Capture failed', 'error');
  }
}

// Recording Functions
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showToast('❌ No active tab', 'error');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      tabId: tab.id,
      options: {
        audio: elements.includeAudio.checked,
        mic: elements.includeMic.checked
      }
    });
    
    if (response.success) {
      isRecording = true;
      recordingStartTime = Date.now();
      elements.startRecording.classList.add('active');
      elements.recordingPanel.classList.add('active');
      startRecordingTimer();
      showToast('🔴 Recording started', 'success');
    } else {
      showToast(`❌ ${response.error || 'Failed to start recording'}`, 'error');
    }
  } catch (error) {
    console.error('Recording error:', error);
    showToast('❌ Failed to start recording', 'error');
  }
}

function pauseRecording() {
  chrome.runtime.sendMessage({ action: 'pauseRecording' });
  showToast('⏸️ Recording paused', 'info');
}

async function stopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'stopRecording' });
    
    isRecording = false;
    recordingStartTime = null;
    clearInterval(recordingTimer);
    elements.startRecording.classList.remove('active');
    elements.recordingPanel.classList.remove('active');
    elements.recordingTime.textContent = '00:00';
    
    if (response.success) {
      showToast('✅ Recording saved!', 'success');
    } else {
      showToast(`❌ ${response.error || 'Failed to save recording'}`, 'error');
    }
  } catch (error) {
    console.error('Stop recording error:', error);
  }
}

function startRecordingTimer() {
  recordingTimer = setInterval(() => {
    if (recordingStartTime) {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toString().padStart(2, '0');
      elements.recordingTime.textContent = `${minutes}:${seconds}`;
    }
  }, 1000);
}

// Scheduling
async function createSchedule() {
  if (!isPremium) {
    showToast('✨ Upgrade to Pro for scheduling', 'info');
    openPayment();
    return;
  }
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = elements.scheduleUrl.value || tab?.url || '';
  const type = elements.scheduleType.value;
  const intervalMinutes = parseInt(elements.scheduleInterval.value);
  
  if (!url) {
    showToast('❌ Please enter a URL', 'error');
    return;
  }
  
  const schedule = {
    id: Date.now().toString(),
    url,
    type,
    intervalMinutes,
    createdAt: Date.now(),
    nextRun: Date.now() + (intervalMinutes * 60 * 1000)
  };
  
  // Save to storage
  const { schedules = [] } = await chrome.storage.sync.get('schedules');
  schedules.push(schedule);
  await chrome.storage.sync.set({ schedules });
  
  // Create alarm
  await chrome.runtime.sendMessage({
    action: 'createSchedule',
    schedule
  });
  
  showToast('✅ Schedule created', 'success');
  elements.scheduleUrl.value = '';
  await loadSchedules();
}

async function deleteSchedule(id) {
  const { schedules = [] } = await chrome.storage.sync.get('schedules');
  const filtered = schedules.filter(s => s.id !== id);
  await chrome.storage.sync.set({ schedules: filtered });
  
  await chrome.runtime.sendMessage({
    action: 'deleteSchedule',
    scheduleId: id
  });
  
  await loadSchedules();
  showToast('🗑️ Schedule deleted', 'info');
}

async function loadSchedules() {
  const { schedules = [] } = await chrome.storage.sync.get('schedules');
  
  if (schedules.length === 0) {
    elements.scheduleList.innerHTML = `
      <div class="empty-schedules">No active schedules</div>
    `;
    return;
  }
  
  elements.scheduleList.innerHTML = schedules.map(schedule => `
    <div class="schedule-item" data-id="${schedule.id}">
      <div class="schedule-info">
        <span class="schedule-url">${truncateUrl(schedule.url)}</span>
        <span class="schedule-interval">${formatInterval(schedule.intervalMinutes)} • ${schedule.type}</span>
      </div>
      <button class="btn-delete" onclick="deleteSchedule('${schedule.id}')">
        <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
          <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `).join('');
}

// Recent Captures
async function loadRecentCaptures() {
  const { recentCaptures = [] } = await chrome.storage.local.get('recentCaptures');
  
  if (recentCaptures.length === 0) {
    elements.recentGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📷</span>
        <p>No captures yet</p>
        <span class="empty-hint">Start by capturing your first screenshot!</span>
      </div>
    `;
    return;
  }
  
  elements.recentGrid.innerHTML = recentCaptures.slice(0, 6).map(capture => `
    <div class="capture-thumbnail" onclick="openCapture('${capture.id}')">
      <img src="${capture.thumbnail}" alt="Screenshot">
      <div class="capture-overlay">
        <span class="capture-time">${formatTime(capture.timestamp)}</span>
      </div>
    </div>
  `).join('');
}

// Payment Functions
async function checkPremiumStatus() {
  if (!extpay) {
    console.log('ExtPay not loaded');
    return;
  }
  
  try {
    const user = await extpay.getUser();
    isPremium = user.paid;
    
    if (isPremium) {
      elements.subscriptionBanner.classList.add('hidden');
      elements.premiumBadge.classList.add('active');
      elements.schedulePremium.style.display = 'none';
      elements.scheduleForm.classList.remove('disabled');
    }
  } catch (error) {
    console.error('Error checking premium status:', error);
  }
}

function openPayment() {
  if (extpay) {
    extpay.openPaymentPage();
  } else {
    // Fallback: open ExtensionPay website
    chrome.tabs.create({ url: 'https://extensionpay.com/home' });
  }
}

function manageSubscription() {
  if (extpay) {
    extpay.openPaymentPage();
  }
}

// Settings
async function loadSettings() {
  const settings = await getSettings();
  
  elements.autoDownload.checked = settings.autoDownload ?? true;
  elements.showNotifications.checked = settings.showNotifications ?? true;
  elements.imageFormat.value = settings.imageFormat ?? 'png';
  elements.filenameTemplate.value = settings.filenameTemplate ?? 'screenshot_{date}_{time}';
}

async function saveSettings() {
  const settings = {
    autoDownload: elements.autoDownload.checked,
    showNotifications: elements.showNotifications.checked,
    imageFormat: elements.imageFormat.value,
    filenameTemplate: elements.filenameTemplate.value
  };
  
  await chrome.storage.sync.set({ settings });
  showToast('✅ Settings saved', 'success');
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.sync.get('settings');
  return {
    autoDownload: settings.autoDownload ?? true,
    showNotifications: settings.showNotifications ?? true,
    imageFormat: settings.imageFormat ?? 'png',
    filenameTemplate: settings.filenameTemplate ?? 'screenshot_{date}_{time}'
  };
}

// Toast Notification
function showToast(message, type = 'info') {
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };
  
  elements.toast.querySelector('.toast-icon').textContent = icons[type] || 'ℹ️';
  elements.toast.querySelector('.toast-message').textContent = message.replace(/^[✅❌📸🔴⏸️✨🗑️ℹ️]+\s*/, '');
  elements.toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 3000);
}

// Utility Functions
function truncateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname.length > 20 ? parsed.pathname.slice(0, 20) + '...' : parsed.pathname);
  } catch {
    return url.slice(0, 30) + '...';
  }
}

function formatInterval(minutes) {
  if (minutes < 60) return `Every ${minutes} min`;
  if (minutes < 1440) return `Every ${minutes / 60} hour${minutes > 60 ? 's' : ''}`;
  return 'Daily';
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function openCapture(id) {
  chrome.runtime.sendMessage({ action: 'openCapture', captureId: id });
}

// Make deleteSchedule globally accessible
window.deleteSchedule = deleteSchedule;
