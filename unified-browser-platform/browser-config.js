/**
 * Browser Configuration
 * Easy way to toggle browser visibility and window settings
 */

export const BROWSER_CONFIG = {
  // Set to true to completely hide the browser (headless mode)
  // Set to false to show the browser window
  HEADLESS: process.env.BROWSER_HEADLESS === "true",

  // Chrome executable path - Force use of system Chrome
  // This bypasses Puppeteer's bundled Chrome version requirement
  CHROME_EXECUTABLE_PATH: process.env.CHROME_PATH || "/usr/bin/google-chrome",

  // Window mode options:
  // 'maximized' - Full window with browser UI
  // 'fullscreen' - True fullscreen (no UI) - uses --kiosk flag
  // 'custom' - Custom window size
  // 'taskbar_hidden' - Full window without taskbar
  WINDOW_MODE: "taskbar_hidden",

  // Hide Windows taskbar (Windows only)
  HIDE_TASKBAR: process.env.HIDE_TASKBAR === "true" || true,

  // Custom window size (only used if WINDOW_MODE is 'custom')
  CUSTOM_SIZE: {
    width: 1920,
    height: 1480, // Increased height for full browser capture
  },

  // Additional Chrome arguments to bypass version checks and enable stealth
  EXTRA_ARGS: [
    // Original flags
    "--disable-infobars",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--disable-blink-features=AutomationControlled",
    "--disable-dev-shm-usage",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
    "--remote-debugging-port=9222",
    "--user-data-dir=/tmp/chrome-user-data",
    "--force-device-scale-factor=1", // Force 100% zoom level
    "--disable-zoom", // Disable zoom functionality
    "--app=about:blank", // App mode to hide taskbar on Windows
    "--kiosk", // Kiosk mode for fullscreen without taskbar

    // Enhanced stealth flags
    "--exclude-switches=enable-automation",
    "--disable-extensions-except=",
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-translate",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-field-trial-config",
    "--disable-back-forward-cache",
    "--disable-ipc-flooding-protection",
    "--password-store=basic",
    "--use-mock-keychain",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-report-upload",
    "--no-crash-upload",
    "--memory-pressure-off",
    "--disable-background-networking",
    "--disable-background-media-suspend",
    "--disable-client-side-phishing-detection",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--enable-automation=false",
  ],

  // Stealth mode configuration
  STEALTH_MODE: {
    ENABLED: process.env.DISABLE_STEALTH !== "true", // Enable by default
    ENVIRONMENT: process.env.NODE_ENV || "development",
    LOG_LEVEL: process.env.STEALTH_LOG_LEVEL || "info",
  },
};

export default BROWSER_CONFIG;
