/**
 * Desktop Capture Configuration
 * Settings for capturing the entire browser window including UI elements
 */

import ENV_CONFIG from "./env-config.js";

export const DESKTOP_CAPTURE_CONFIG = {
  // Capture settings
  CAPTURE_FPS: ENV_CONFIG.CAPTURE_FPS, // Frames per second for desktop capture
  CAPTURE_QUALITY: ENV_CONFIG.CAPTURE_QUALITY, // JPEG quality (1-100)
  CAPTURE_FORMAT: "jpeg", // Image format for capture

  // Browser window settings for full UI capture
  BROWSER_WINDOW: {
    width: ENV_CONFIG.BROWSER_WIDTH,
    height: ENV_CONFIG.BROWSER_HEIGHT, // Extra height to capture Chrome UI elements
    startMaximized: true, // Start browser maximized
    showUI: true, // Show browser UI elements
  },

  // Chrome arguments for desktop capture
  CHROME_ARGS: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
    "--disable-gpu",
    "--use-gl=swiftshader",
    "--start-maximized", // Start maximized to show full browser UI
    "--disable-infobars", // Remove infobars for cleaner look
    "--hide-scrollbars",
    "--mute-audio",
    "--window-size=1920,1280", // Larger window for UI capture
    "--enable-usermedia-screen-capturing", // Enable screen capture
    "--allow-running-insecure-content", // Allow mixed content
    "--disable-features=TranslateUI", // Disable translate UI
    "--disable-extensions", // Disable extensions
    "--disable-plugins", // Disable plugins
    "--disable-default-apps", // Disable default apps
    "--disable-sync", // Disable sync
    "--disable-translate", // Disable translate
    "--disable-background-timer-throttling", // Keep browser responsive
    "--disable-backgrounding-occluded-windows", // Keep browser active
    "--disable-renderer-backgrounding", // Keep renderer active
    "--force-device-scale-factor=1", // Force 100% zoom level
    "--disable-zoom", // Disable zoom functionality
    "--disable-notifications", // Disable notifications
    "--disable-popup-blocking", // Disable popup blocking
    "--disable-blink-features=AutomationControlled", // Hide automation
    "--remote-debugging-port=0", // Use random port
    "--enable-experimental-web-platform-features", // Enable experimental features
    "--enable-features=DesktopCapture", // Enable desktop capture
    "--allow-sandbox-debugging", // Allow sandbox debugging for capture
    "--disable-background-timer-throttling", // Keep timers active
    "--disable-backgrounding-occluded-windows", // Keep windows active
    "--disable-renderer-backgrounding", // Keep renderer active
    "--use-fake-ui-for-media-stream", // Use fake UI for media stream (no permission prompts)
    "--use-fake-device-for-media-stream", // Use fake device for media stream
    "--allow-running-insecure-content", // Allow insecure content for screen capture
    "--disable-web-security", // Disable web security for screen capture
    "--disable-features=VizDisplayCompositor", // Disable display compositor
    "--enable-usermedia-screen-capturing", // Enable user media screen capturing
  ],

  // CDP settings for desktop capture
  CDP_SETTINGS: {
    captureBeyondViewport: true, // Capture beyond viewport
    fromSurface: true, // Capture from surface
    format: "jpeg",
    quality: ENV_CONFIG.CAPTURE_QUALITY,
  },

  // Fallback settings
  FALLBACK: {
    enabled: true, // Enable fallback to tab capture
    method: "Page.startScreencast", // Fallback method
    quality: 80, // Lower quality for fallback
    fps: 5, // Lower FPS for fallback
  },
};

export default DESKTOP_CAPTURE_CONFIG;
