# Desktop Capture Feature

This feature enables streaming of the **entire browser window** including tabs, address bar, and all UI elements, not just the tab content.

## What Changed

### Before (Tab Capture)

- Used `Page.startScreencast`
- Only captured webpage content
- Browser UI elements (tabs, address bar) were not visible

### After (Desktop Capture)

- Uses `Page.captureScreenshot` with desktop capture settings
- Captures entire browser window including UI elements
- Falls back to tab capture if desktop capture fails

## Key Features

1. **Full Browser Window Capture**: Captures tabs, address bar, bookmarks, etc.
2. **Configurable Quality**: Adjustable FPS and image quality
3. **Automatic Fallback**: Falls back to tab capture if desktop capture fails
4. **Optimized Performance**: Configurable capture rate and quality

## Configuration

The desktop capture settings are configured in `desktop-capture-config.js`:

```javascript
export const DESKTOP_CAPTURE_CONFIG = {
  CAPTURE_FPS: 10, // Frames per second
  CAPTURE_QUALITY: 90, // JPEG quality (1-100)
  BROWSER_WINDOW: {
    width: 1920,
    height: 1280, // Extra height for Chrome UI
    startMaximized: true, // Start browser maximized
  },
  // ... more settings
};
```

## Browser Launch Settings

The browser is launched with specific flags to enable desktop capture:

- `--start-maximized`: Shows full browser window
- `--enable-usermedia-screen-capturing`: Enables screen capture
- `--disable-extensions`: Removes extension interference
- `--window-size=1920,1280`: Sets appropriate window size

## Usage

### 1. Start Streaming

```javascript
await browserService.startStreaming(sessionId, (frameData) => {
  // frameData contains the captured browser window image
  console.log("Frame captured:", frameData.length, "bytes");
});
```

### 2. The service automatically:

- Tries desktop capture first
- Falls back to tab capture if desktop capture fails
- Provides smooth streaming at configured FPS

### 3. Stop Streaming

```javascript
await browserService.stopStreaming(sessionId);
```

## Testing

Run the test script to verify desktop capture:

```bash
node test-desktop-capture.js
```

This will:

1. Launch a visible browser
2. Navigate to GitHub
3. Start desktop capture
4. Capture 5 frames
5. Display frame information

## Troubleshooting

### Browser Not Visible

- Ensure `headless: false` in browser launch
- Check if display server is running (X11 on Linux)
- Verify Chrome executable path

### Desktop Capture Fails

- Check Chrome version compatibility
- Ensure `--enable-usermedia-screen-capturing` flag is set
- Verify CDP connection is established

### Performance Issues

- Reduce `CAPTURE_FPS` in configuration
- Lower `CAPTURE_QUALITY` for faster processing
- Check system resources

## System Requirements

- **Windows**: Chrome browser installed
- **Linux**: Chrome browser + X11 display server
- **macOS**: Chrome browser + display permissions

## Browser Compatibility

- Chrome 88+ (recommended)
- Chromium-based browsers
- Requires `--enable-usermedia-screen-capturing` support

## Performance Notes

- Desktop capture uses more CPU than tab capture
- Higher FPS increases CPU usage
- Quality settings affect file size and processing time
- Consider using 5-10 FPS for optimal performance

## Fallback Behavior

If desktop capture fails, the system automatically falls back to tab capture:

1. Desktop capture attempt fails
2. Logs warning message
3. Starts traditional tab capture
4. Continues streaming with tab content only

This ensures streaming continues even if desktop capture is not available.




