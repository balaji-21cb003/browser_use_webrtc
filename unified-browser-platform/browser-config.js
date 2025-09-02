/**
 * Browser Configuration
 * Easy way to toggle browser visibility and window settings
 */

export const BROWSER_CONFIG = {
  // Set to true to completely hide the browser (headless mode)
  // Set to false to show the browser window
  // Force headless on Linux cloud servers for stability
  HEADLESS:
    process.env.BROWSER_HEADLESS === "true" || process.platform === "linux",

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

  // Additional Chrome arguments to bypass version checks
  EXTRA_ARGS: [
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
    // Linux cloud server stability fixes
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--single-process",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-extensions",
    "--disable-plugins",
    "--disable-sync",
    "--memory-pressure-off",
    "--max_old_space_size=4096",
    "--disable-ipc-flooding-protection",
    "--aggressive-cache-discard",
    "--ignore-certificate-errors",
    "--ignore-ssl-errors",
    "--allow-running-insecure-content",
    "--disable-component-extensions-with-background-pages",
  ],
};

export default BROWSER_CONFIG;
