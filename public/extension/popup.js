/**
 * GenAIScreenShots - Popup Script
 * Handles all UI interactions, premium gating, and communicates with background.
 */

// ─── ExtensionPay Init ──────────────────────────────────────────────────────

var extpay = (typeof ExtPay !== 'undefined') ? ExtPay('screenshots') : null;

// ─── State ───────────────────────────────────────────────────────────────────

var isRecording = false;
var recordingStartTime = null;
var recordingTimer = null;
var isPremium = false;

// ─── DOM References ──────────────────────────────────────────────────────────

var el = {};

document.addEventListener('DOMContentLoaded', async function () {
  // Cache all DOM elements
  el = {
    captureVisible:    document.getElementById('captureVisible'),
    captureFullPage:   document.getElementById('captureFullPage'),
    captureRegion:     document.getElementById('captureRegion'),
    startRecording:    document.getElementById('startRecording'),
    pauseRecording:    document.getElementById('pauseRecording'),
    stopRecording:     document.getElementById('stopRecording'),
    upgradeBtn:        document.getElementById('upgradeBtn'),
    createSchedule:    document.getElementById('createSchedule'),
    manageSubscription: document.getElementById('manageSubscription'),
    recordingPanel:    document.getElementById('recordingPanel'),
    subscriptionBanner: document.getElementById('subscriptionBanner'),
    premiumBadge:      document.getElementById('premiumBadge'),
    scheduleForm:      document.getElementById('scheduleForm'),
    schedulePremium:   document.getElementById('schedulePremium'),
    includeAudio:      document.getElementById('includeAudio'),
    includeMic:        document.getElementById('includeMic'),
    recordingTime:     document.getElementById('recordingTime'),
    scheduleType:      document.getElementById('scheduleType'),
    scheduleInterval:  document.getElementById('scheduleInterval'),
    scheduleUrl:       document.getElementById('scheduleUrl'),
    scheduleList:      document.getElementById('scheduleList'),
    autoDownload:      document.getElementById('autoDownload'),
    showNotifications: document.getElementById('showNotifications'),
    imageFormat:       document.getElementById('imageFormat'),
    filenameTemplate:  document.getElementById('filenameTemplate'),
    recentGrid:        document.getElementById('recentGrid'),
    toast:             document.getElementById('toast')
  };

  // Check if we were recording before popup closed/reopened
  try {
    var state = await chrome.runtime.sendMessage({ action: 'getRecordingState' });
    if (state && state.isRecording) {
      isRecording = true;
      recordingStartTime = Date.now(); // approximate
      el.startRecording.classList.add('active');
      el.recordingPanel.classList.add('active');
      startRecordingTimer();
    }
  } catch (e) { /* ignore */ }

  await loadSettings();
  await checkPremiumStatus();
  await loadSchedules();
  await loadRecentCaptures();
  bindEvents();
});

// ─── Event Binding ───────────────────────────────────────────────────────────

function bindEvents() {
  // Captures
  el.captureVisible.addEventListener('click', function () { captureScreen('visible'); });
  el.captureFullPage.addEventListener('click', function () { captureScreen('fullpage'); });
  el.captureRegion.addEventListener('click', function () { captureScreen('region'); });

  // Recording
  el.startRecording.addEventListener('click', toggleRecording);
  if (el.pauseRecording) el.pauseRecording.addEventListener('click', doPauseRecording);
  if (el.stopRecording)  el.stopRecording.addEventListener('click', doStopRecording);

  // Subscription
  if (el.upgradeBtn)        el.upgradeBtn.addEventListener('click', openPayment);
  if (el.manageSubscription) el.manageSubscription.addEventListener('click', manageSubscription);

  // Schedule
  if (el.createSchedule) el.createSchedule.addEventListener('click', createSchedule);

  // Settings auto-save
  ['autoDownload', 'showNotifications', 'imageFormat', 'filenameTemplate'].forEach(function (key) {
    if (el[key]) el[key].addEventListener('change', saveSettings);
  });
}

// ─── Screenshot Capture ──────────────────────────────────────────────────────

async function captureScreen(type) {
  try {
    showToast('Capturing...', 'info');

    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];

    if (!tab || !tab.url || /^(chrome|chrome-extension|about|edge):/.test(tab.url)) {
      showToast('Cannot capture this page', 'error');
      return;
    }

    var settings = await getSettings();

    var response = await chrome.runtime.sendMessage({
      action: 'capture',
      type: type,
      tabId: tab.id,
      settings: settings
    });

    if (response && response.success) {
      if (response.pending) {
        // Region selection — popup will close, capture happens on content script
        showToast('Select a region on the page', 'info');
        // Close popup after short delay so user sees the toast
        setTimeout(function () { window.close(); }, 400);
      } else {
        showToast('Screenshot saved!', 'success');
        await loadRecentCaptures();
      }
    } else {
      showToast(response ? response.error : 'Capture failed', 'error');
    }
  } catch (err) {
    console.error('Capture error:', err);
    showToast('Capture failed', 'error');
  }
}

// ─── Recording ───────────────────────────────────────────────────────────────

function toggleRecording() {
  if (isRecording) {
    doStopRecording();
  } else {
    doStartRecording();
  }
}

async function doStartRecording() {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab) { showToast('No active tab', 'error'); return; }

    var response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      tabId: tab.id,
      options: {
        audio: el.includeAudio ? el.includeAudio.checked : true,
        mic: el.includeMic ? el.includeMic.checked : false
      }
    });

    if (response && response.success) {
      isRecording = true;
      recordingStartTime = Date.now();
      el.startRecording.classList.add('active');
      el.recordingPanel.classList.add('active');
      startRecordingTimer();
      showToast('Recording started', 'success');
    } else {
      showToast(response ? response.error : 'Failed to start recording', 'error');
    }
  } catch (err) {
    console.error('Recording error:', err);
    showToast('Failed to start recording', 'error');
  }
}

function doPauseRecording() {
  chrome.runtime.sendMessage({ action: 'pauseRecording' }, function (resp) {
    if (resp && resp.state === 'paused') {
      showToast('Recording paused', 'info');
    } else if (resp && resp.state === 'recording') {
      showToast('Recording resumed', 'info');
    }
  });
}

async function doStopRecording() {
  try {
    var response = await chrome.runtime.sendMessage({ action: 'stopRecording' });

    isRecording = false;
    recordingStartTime = null;
    clearInterval(recordingTimer);
    el.startRecording.classList.remove('active');
    el.recordingPanel.classList.remove('active');
    el.recordingTime.textContent = '00:00';

    if (response && response.success) {
      showToast('Recording saved!', 'success');
    } else {
      showToast(response ? response.error : 'Failed to save recording', 'error');
    }
  } catch (err) {
    console.error('Stop recording error:', err);
  }
}

function startRecordingTimer() {
  clearInterval(recordingTimer);
  recordingTimer = setInterval(function () {
    if (!recordingStartTime) return;
    var elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    var min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    var sec = String(elapsed % 60).padStart(2, '0');
    el.recordingTime.textContent = min + ':' + sec;
  }, 1000);
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

async function createSchedule() {
  if (!isPremium) {
    showToast('Upgrade to Pro for scheduling', 'info');
    openPayment();
    return;
  }

  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var url = el.scheduleUrl.value || (tabs[0] ? tabs[0].url : '');
  var type = el.scheduleType.value;
  var intervalMinutes = parseInt(el.scheduleInterval.value, 10);

  if (!url) { showToast('Please enter a URL', 'error'); return; }

  var schedule = {
    id: Date.now().toString(),
    url: url,
    type: type,
    intervalMinutes: intervalMinutes,
    createdAt: Date.now()
  };

  var data = await chrome.storage.sync.get('schedules');
  var schedules = data.schedules || [];
  schedules.push(schedule);
  await chrome.storage.sync.set({ schedules: schedules });

  await chrome.runtime.sendMessage({ action: 'createSchedule', schedule: schedule });

  showToast('Schedule created', 'success');
  el.scheduleUrl.value = '';
  await loadSchedules();
}

async function deleteSchedule(id) {
  var data = await chrome.storage.sync.get('schedules');
  var schedules = (data.schedules || []).filter(function (s) { return s.id !== id; });
  await chrome.storage.sync.set({ schedules: schedules });
  await chrome.runtime.sendMessage({ action: 'deleteSchedule', scheduleId: id });
  await loadSchedules();
  showToast('Schedule deleted', 'info');
}

// Make deleteSchedule accessible from inline onclick
window.deleteSchedule = deleteSchedule;

async function loadSchedules() {
  var data = await chrome.storage.sync.get('schedules');
  var schedules = data.schedules || [];

  if (schedules.length === 0) {
    el.scheduleList.innerHTML = '<div class="empty-schedules">No active schedules</div>';
    return;
  }

  el.scheduleList.innerHTML = schedules.map(function (s) {
    return '<div class="schedule-item" data-id="' + s.id + '">' +
      '<div class="schedule-info">' +
        '<span class="schedule-url">' + truncateUrl(s.url) + '</span>' +
        '<span class="schedule-interval">' + formatInterval(s.intervalMinutes) + ' \u2022 ' + s.type + '</span>' +
      '</div>' +
      '<button class="btn-delete" onclick="deleteSchedule(\'' + s.id + '\')">' +
        '<svg viewBox="0 0 24 24" fill="none" width="14" height="14">' +
          '<path d="M6 6l12 12M6 18L18 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>' +
      '</button>' +
    '</div>';
  }).join('');
}

// ─── Recent Captures ─────────────────────────────────────────────────────────

async function loadRecentCaptures() {
  var data = await chrome.storage.local.get('recentCaptures');
  var captures = data.recentCaptures || [];

  if (captures.length === 0) {
    el.recentGrid.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-icon">\uD83D\uDCF7</span>' +
        '<p>No captures yet</p>' +
        '<span class="empty-hint">Start by capturing your first screenshot!</span>' +
      '</div>';
    return;
  }

  el.recentGrid.innerHTML = captures.slice(0, 6).map(function (c) {
    return '<div class="capture-thumbnail" onclick="openCapture(\'' + c.id + '\')">' +
      '<img src="' + c.thumbnail + '" alt="Screenshot">' +
      '<div class="capture-overlay">' +
        '<span class="capture-time">' + formatTime(c.timestamp) + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openCapture(id) {
  chrome.runtime.sendMessage({ action: 'openCapture', captureId: id });
}
window.openCapture = openCapture;

// ─── Payment / Premium ──────────────────────────────────────────────────────

async function checkPremiumStatus() {
  if (!extpay) {
    console.log('ExtPay not loaded — running in free mode');
    applyFreeMode();
    return;
  }

  try {
    var user = await extpay.getUser();
    isPremium = !!user.paid;
  } catch (err) {
    console.warn('ExtPay check failed:', err);
    isPremium = false;
  }

  if (isPremium) {
    applyPremiumMode();
  } else {
    applyFreeMode();
  }
}

function applyPremiumMode() {
  if (el.subscriptionBanner) el.subscriptionBanner.classList.add('hidden');
  if (el.premiumBadge)       el.premiumBadge.classList.add('active');
  if (el.schedulePremium)    el.schedulePremium.style.display = 'none';
  if (el.scheduleForm)       el.scheduleForm.classList.remove('disabled');
}

function applyFreeMode() {
  if (el.subscriptionBanner) el.subscriptionBanner.classList.remove('hidden');
  if (el.premiumBadge)       el.premiumBadge.classList.remove('active');
  if (el.schedulePremium)    el.schedulePremium.style.display = '';
  if (el.scheduleForm)       el.scheduleForm.classList.add('disabled');
}

function openPayment() {
  if (extpay) {
    extpay.openPaymentPage();
  } else {
    chrome.tabs.create({ url: 'https://extensionpay.com/home' });
  }
}

function manageSubscription() {
  if (extpay) {
    extpay.openPaymentPage();
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

async function loadSettings() {
  var settings = await getSettings();
  if (el.autoDownload)      el.autoDownload.checked = settings.autoDownload;
  if (el.showNotifications) el.showNotifications.checked = settings.showNotifications;
  if (el.imageFormat)       el.imageFormat.value = settings.imageFormat;
  if (el.filenameTemplate)  el.filenameTemplate.value = settings.filenameTemplate;
}

async function saveSettings() {
  var settings = {
    autoDownload:      el.autoDownload ? el.autoDownload.checked : true,
    showNotifications: el.showNotifications ? el.showNotifications.checked : true,
    imageFormat:       el.imageFormat ? el.imageFormat.value : 'png',
    filenameTemplate:  el.filenameTemplate ? el.filenameTemplate.value : 'screenshot_{date}_{time}'
  };
  await chrome.storage.sync.set({ settings: settings });
  showToast('Settings saved', 'success');
}

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

// ─── Toast ───────────────────────────────────────────────────────────────────

function showToast(message, type) {
  type = type || 'info';
  var iconMap = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F' };

  var toastIcon = el.toast.querySelector('.toast-icon');
  var toastMsg  = el.toast.querySelector('.toast-message');

  if (toastIcon) toastIcon.textContent = iconMap[type] || '\u2139\uFE0F';
  if (toastMsg)  toastMsg.textContent = message;

  el.toast.className = 'toast ' + type + ' show';

  clearTimeout(el.toast._hideTimer);
  el.toast._hideTimer = setTimeout(function () {
    el.toast.classList.remove('show');
  }, 3000);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function truncateUrl(url) {
  try {
    var parsed = new URL(url);
    var path = parsed.pathname.length > 20 ? parsed.pathname.slice(0, 20) + '...' : parsed.pathname;
    return parsed.hostname + path;
  } catch (e) {
    return url.length > 30 ? url.slice(0, 30) + '...' : url;
  }
}

function formatInterval(minutes) {
  if (minutes < 60) return 'Every ' + minutes + ' min';
  if (minutes < 1440) return 'Every ' + (minutes / 60) + ' hr';
  return 'Daily';
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
