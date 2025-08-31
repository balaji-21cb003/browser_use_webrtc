/**
 * OS-Level Capture Configuration
 * Controls different capture modes for desktop streaming
 */

import fs from "fs";
import path from "path";

// Load configuration from JSON file
function loadCaptureConfig() {
  try {
    const configPath = path.join(process.cwd(), "capture-settings.json");
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configData);
    }
  } catch (error) {
    console.warn("⚠️ Could not load capture-settings.json, using defaults");
  }
  return null;
}

const jsonConfig = loadCaptureConfig();

export const OS_CAPTURE_CONFIG = {
  // Default capture mode
  DEFAULT_CAPTURE_MODE:
    jsonConfig?.os_capture_mode || process.env.OS_CAPTURE_MODE || "full_screen",

  // Available capture modes
  CAPTURE_MODES: {
    FULL_SCREEN: "full_screen", // Entire desktop
    BROWSER_ONLY: "browser_only", // Only Chrome browser window
    CUSTOM_REGION: "custom_region", // Custom screen region
    SMART_BROWSER: "smart_browser", // Auto-detect browser area
  },

  // Browser detection settings
  BROWSER_DETECTION: {
    ENABLED:
      jsonConfig?.browser_detection?.enabled ??
      (process.env.BROWSER_DETECTION_ENABLED === "true" || true),
    DETECTION_METHOD:
      jsonConfig?.browser_detection?.method ||
      process.env.BROWSER_DETECTION_METHOD ||
      "process_list",
    CHROME_PROCESS_NAME:
      jsonConfig?.browser_detection?.chrome_process_name ||
      process.env.CHROME_PROCESS_NAME ||
      "chrome.exe",
    FALLBACK_TO_FULL_SCREEN:
      jsonConfig?.browser_detection?.fallback_to_full_screen ??
      (process.env.FALLBACK_TO_FULL_SCREEN === "true" || true),
  },

  // Screen region settings
  SCREEN_REGIONS: {
    // Default browser region (will be auto-detected)
    BROWSER: {
      x:
        jsonConfig?.screen_regions?.browser?.x ??
        (parseInt(process.env.BROWSER_REGION_X) || 50),
      y:
        jsonConfig?.screen_regions?.browser?.y ??
        (parseInt(process.env.BROWSER_REGION_Y) || 100),
      width:
        jsonConfig?.screen_regions?.browser?.width ??
        (parseInt(process.env.BROWSER_REGION_WIDTH) || 1820),
      height:
        jsonConfig?.screen_regions?.browser?.height ??
        (parseInt(process.env.BROWSER_REGION_HEIGHT) || 880),
    },

    // Custom regions
    CUSTOM: {
      x:
        jsonConfig?.screen_regions?.custom?.x ??
        (parseInt(process.env.CUSTOM_REGION_X) || 0),
      y:
        jsonConfig?.screen_regions?.custom?.y ??
        (parseInt(process.env.CUSTOM_REGION_HEIGHT) || 0),
      width:
        jsonConfig?.screen_regions?.custom?.width ??
        (parseInt(process.env.CUSTOM_REGION_WIDTH) || 1920),
      height:
        jsonConfig?.screen_regions?.custom?.height ??
        (parseInt(process.env.CUSTOM_REGION_HEIGHT) || 1080),
    },
  },

  // Capture quality settings
  CAPTURE_QUALITY: {
    FPS: parseInt(process.env.CAPTURE_FPS) || 1,
    JPEG_QUALITY: parseInt(process.env.JPEG_QUALITY) || 90,
    MAX_WIDTH: parseInt(process.env.MAX_WIDTH) || 1920,
    MAX_HEIGHT: parseInt(process.env.MAX_HEIGHT) || 1080,
  },

  // Environment-based overrides
  ENVIRONMENT_OVERRIDES: {
    DEVELOPMENT: {
      captureMode: "browser_only",
      browserDetection: { enabled: true },
      quality: { fps: 2, jpegQuality: 80 },
    },
    PRODUCTION: {
      captureMode: "full_screen",
      browserDetection: { enabled: false },
      quality: { fps: 1, jpegQuality: 90 },
    },
    TESTING: {
      captureMode: "custom_region",
      customRegion: { x: 100, y: 100, width: 800, height: 600 },
    },
  },
};

// Helper function to get capture mode from environment or config
export function getCaptureMode() {
  return process.env.OS_CAPTURE_MODE || OS_CAPTURE_CONFIG.DEFAULT_CAPTURE_MODE;
}

// Helper function to get capture options
export function getCaptureOptions() {
  const mode = getCaptureMode();
  const options = {
    captureMode: mode,
    customRegion: null,
  };

  if (mode === "custom_region") {
    options.customRegion = OS_CAPTURE_CONFIG.SCREEN_REGIONS.CUSTOM;
  }

  return options;
}

// Helper function to get environment-specific config
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV || "development";
  return OS_CAPTURE_CONFIG.ENVIRONMENT_OVERRIDES[env.toUpperCase()] || {};
}

export default OS_CAPTURE_CONFIG;
