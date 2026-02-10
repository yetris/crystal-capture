/**
 * GenAIScreenShots - Content Script
 * Handles region selection overlay on the page.
 * Injected into all http/https pages.
 */

(function () {
  'use strict';

  var overlay = null;
  var selectionBox = null;
  var dimLabel = null;
  var startX = 0;
  var startY = 0;
  var selecting = false;

  // Listen for messages from background / popup
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === 'startRegionSelection') {
      // Small delay to let popup close first
      setTimeout(function () { showOverlay(); }, 150);
      sendResponse({ success: true });
    } else if (message.action === 'cancelRegionSelection') {
      removeOverlay();
      sendResponse({ success: true });
    }
    return true;
  });

  function showOverlay() {
    // Don't double-create
    if (overlay) removeOverlay();

    overlay = document.createElement('div');
    overlay.id = 'genai-region-overlay';
    overlay.innerHTML =
      '<div class="genai-region-instructions">' +
        '<span>\uD83C\uDFAF Click and drag to select region</span>' +
        '<span class="genai-hint">Press ESC to cancel</span>' +
      '</div>' +
      '<div class="genai-selection-box"></div>' +
      '<div class="genai-dimension-label"></div>';

    document.body.appendChild(overlay);

    selectionBox = overlay.querySelector('.genai-selection-box');
    dimLabel = overlay.querySelector('.genai-dimension-label');

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return; // left click only
    selecting = true;
    startX = e.clientX;
    startY = e.clientY;

    selectionBox.style.left   = startX + 'px';
    selectionBox.style.top    = startY + 'px';
    selectionBox.style.width  = '0';
    selectionBox.style.height = '0';
    selectionBox.style.display = 'block';
    dimLabel.style.display = 'none';
  }

  function onMouseMove(e) {
    if (!selecting) return;

    var curX = e.clientX;
    var curY = e.clientY;

    var left   = Math.min(startX, curX);
    var top    = Math.min(startY, curY);
    var width  = Math.abs(curX - startX);
    var height = Math.abs(curY - startY);

    selectionBox.style.left   = left + 'px';
    selectionBox.style.top    = top + 'px';
    selectionBox.style.width  = width + 'px';
    selectionBox.style.height = height + 'px';

    dimLabel.textContent = width + ' \u00D7 ' + height;
    dimLabel.style.left    = (left + width / 2) + 'px';
    dimLabel.style.top     = (top + height + 10) + 'px';
    dimLabel.style.display = 'block';
  }

  function onMouseUp(e) {
    if (!selecting) return;
    selecting = false;

    var curX = e.clientX;
    var curY = e.clientY;

    var left   = Math.min(startX, curX);
    var top    = Math.min(startY, curY);
    var width  = Math.abs(curX - startX);
    var height = Math.abs(curY - startY);

    // Minimum size
    if (width < 10 || height < 10) {
      removeOverlay();
      return;
    }

    // Remove overlay first so it doesn't appear in the screenshot
    removeOverlay();

    // Wait a frame for the overlay to be removed, then capture
    requestAnimationFrame(function () {
      setTimeout(function () {
        chrome.runtime.sendMessage({
          action: 'captureRegion',
          region: {
            x: left + window.scrollX,
            y: top + window.scrollY,
            width: width,
            height: height,
            devicePixelRatio: window.devicePixelRatio || 1
          }
        });
      }, 100);
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeOverlay();
    }
  }

  function removeOverlay() {
    selecting = false;
    if (overlay) {
      overlay.remove();
      overlay = null;
      selectionBox = null;
      dimLabel = null;
    }
    document.removeEventListener('keydown', onKeyDown);
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', removeOverlay);
})();
