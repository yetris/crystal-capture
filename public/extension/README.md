/**
 * GenAIScreenShots - README
 * A comprehensive Chrome Extension for screenshots and screen recording
 * 
 * EXTENSION ID: screenshots (for ExtensionPay)
 * PRICE: $5/month subscription
 */

# GenAIScreenShots Chrome Extension

A powerful, feature-rich screenshot and screen recording extension with a beautiful glassmorphism design.

## 📁 File Structure

```
extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── popup.html            # Main popup UI
├── popup.css             # Glassmorphism styles
├── popup.js              # Popup logic & interactions
├── background.js         # Service worker for captures & scheduling
├── content.js            # Content script for region selection
├── content.css           # Content script styles
├── offscreen.html        # Offscreen document container
├── offscreen.js          # Media recording & image stitching
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 🚀 Features

### Screenshot Capture
- **Visible Area**: Instant capture of current viewport
- **Full Page**: Stitched scrolling capture of entire page
- **Region Selection**: Drag to select custom area

### Video Recording
- Tab video capture using chrome.tabCapture API
- Include tab audio and/or microphone
- WebM output with VP9 codec
- Pause/resume functionality

### Scheduling (Premium)
- Schedule recurring captures
- Custom intervals (5min to daily)
- Automatic background execution

### Premium Features ($5/month)
- Scheduling functionality
- HD video recording
- Priority support

## 🔧 Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension` folder
5. The extension icon will appear in your toolbar

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Full page screenshot |
| `Ctrl+Shift+V` | Visible area screenshot |
| `Ctrl+Shift+R` | Start/stop recording |

## 💳 Monetization

This extension uses [ExtensionPay](https://extensionpay.com) for subscription payments.

- Extension ID: `screenshots`
- Price: $5/month
- Features unlocked: Scheduling, HD recording

## 🎨 Design

The UI features a modern glassmorphism design with:
- Frosted glass panels
- Subtle gradients and glows
- Smooth micro-animations
- Dark theme optimized

## 📋 Permissions Used

- `activeTab`: Capture current tab
- `tabs`: Query tab information
- `scripting`: Inject content scripts
- `storage`: Save settings & recent captures
- `alarms`: Scheduled captures
- `notifications`: Capture notifications
- `offscreen`: Media recording
- `tabCapture`: Video recording

## 🔒 Privacy

- No data sent to external servers (except payment processing)
- All captures stored locally
- Settings synced via Chrome Sync

## 📝 License

MIT License - Feel free to modify and distribute.
