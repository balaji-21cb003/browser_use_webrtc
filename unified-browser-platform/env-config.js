/**
 * Environment Configuration for Desktop Capture
 * Copy this file and adjust values as needed
 */

export const ENV_CONFIG = {
  // Browser Settings
  BROWSER_HEADLESS: process.env.BROWSER_HEADLESS === "true" || false,
  CHROME_PATH: process.env.CHROME_PATH || "/usr/bin/google-chrome",

  // Display Settings (for Linux)
  DISPLAY: process.env.DISPLAY || ":0",

  // Capture Settings
  CAPTURE_FPS: parseInt(process.env.CAPTURE_FPS) || 10,
  CAPTURE_QUALITY: parseInt(process.env.CAPTURE_QUALITY) || 90,

  // Browser Window Settings
  BROWSER_WIDTH: parseInt(process.env.BROWSER_WIDTH) || 1920,
  BROWSER_HEIGHT: parseInt(process.env.BROWSER_HEIGHT) || 1280,

  // Performance Settings
  MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS) || 5,
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 300000,

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  LOG_TO_FILE: process.env.LOG_TO_FILE === "true" || false,
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || "./logs/browser-streaming.log",

  // Development Settings
  NODE_ENV: process.env.NODE_ENV || "development",
  DEBUG: process.env.DEBUG === "true" || false,
};

export default ENV_CONFIG;




