/**
 * GenAIScreenShots - Content Script
 * Handles region selection overlay and page interactions
 */

let regionOverlay = null;
let startX = 0;
let startY = 0;
let isSelecting = false;

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'startRegionSelection':
      startRegionSelection();
      sendResponse({ success: true });
      break;
    
    case 'cancelRegionSelection':
      cancelRegionSelection();
      sendResponse({ success: true });
      break;
  }
  return true;
});

function startRegionSelection() {
  // Create overlay
  regionOverlay = document.createElement('div');
  regionOverlay.id = 'genai-region-overlay';
  regionOverlay.innerHTML = `
    <div class="genai-region-instructions">
      <span>🎯 Click and drag to select region</span>
      <span class="genai-hint">Press ESC to cancel</span>
    </div>
    <div class="genai-selection-box"></div>
    <div class="genai-dimension-label"></div>
  `;
  document.body.appendChild(regionOverlay);
  
  // Event listeners
  regionOverlay.addEventListener('mousedown', handleMouseDown);
  regionOverlay.addEventListener('mousemove', handleMouseMove);
  regionOverlay.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('keydown', handleKeyDown);
}

function handleMouseDown(e) {
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  
  const box = regionOverlay.querySelector('.genai-selection-box');
  box.style.left = startX + 'px';
  box.style.top = startY + 'px';
  box.style.width = '0';
  box.style.height = '0';
  box.style.display = 'block';
}

function handleMouseMove(e) {
  if (!isSelecting) return;
  
  const box = regionOverlay.querySelector('.genai-selection-box');
  const label = regionOverlay.querySelector('.genai-dimension-label');
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  box.style.left = left + 'px';
  box.style.top = top + 'px';
  box.style.width = width + 'px';
  box.style.height = height + 'px';
  
  // Show dimensions
  label.textContent = `${width} × ${height}`;
  label.style.left = (left + width / 2) + 'px';
  label.style.top = (top + height + 10) + 'px';
  label.style.display = 'block';
}

function handleMouseUp(e) {
  if (!isSelecting) return;
  isSelecting = false;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  // Minimum size check
  if (width < 10 || height < 10) {
    cancelRegionSelection();
    return;
  }
  
  // Capture the region
  captureRegion({ left, top, width, height });
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    cancelRegionSelection();
  }
}

async function captureRegion(region) {
  // Remove overlay
  cancelRegionSelection();
  
  // Send region data to background for capture
  chrome.runtime.sendMessage({
    action: 'captureRegion',
    region: {
      x: region.left + window.scrollX,
      y: region.top + window.scrollY,
      width: region.width,
      height: region.height,
      devicePixelRatio: window.devicePixelRatio
    }
  });
}

function cancelRegionSelection() {
  if (regionOverlay) {
    regionOverlay.remove();
    regionOverlay = null;
  }
  document.removeEventListener('keydown', handleKeyDown);
  isSelecting = false;
}

// Cleanup on page unload
window.addEventListener('beforeunload', cancelRegionSelection);
