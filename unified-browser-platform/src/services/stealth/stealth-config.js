/**
 * Stealth Anti-Detection Configuration
 * Phase 1-6 Implementation: Complete stealth system for browser automation
 */

export const STEALTH_CONFIG = {
  // Phase 1: Browser Launch Arguments Enhancement
  BROWSER_ARGS: [
    // Remove automation detection flags
    "--disable-blink-features=AutomationControlled",
    "--exclude-switches=enable-automation",
    "--disable-extensions-except=",
    "--disable-extensions",
    "--disable-default-apps",

    // Remove webdriver flags
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",

    // Stealth headers and indicators
    "--disable-infobars",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--disable-translate",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-field-trial-config",
    "--disable-back-forward-cache",
    "--disable-ipc-flooding-protection",
    "--password-store=basic",
    "--use-mock-keychain",
    "--no-default-browser-check",
    "--no-first-run",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-report-upload",
    "--no-crash-upload",

    // Memory and performance optimizations for cloud servers
    "--memory-pressure-off",
    "--max_old_space_size=4096",
    "--disable-background-networking",
    "--disable-background-media-suspend",
    "--disable-client-side-phishing-detection",
    "--disable-default-apps",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-sync",
    "--enable-automation=false",
  ],

  // Phase 3: User Agent Pool System
  USER_AGENTS: [
    // Recent Chrome user agents for Linux servers (updated regularly)
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0",
  ],

  // Phase 8: Fingerprint Randomization - Viewport sizes
  VIEWPORT_SIZES: [
    { width: 1920, height: 1080 }, // Most common desktop
    { width: 1366, height: 768 }, // Common laptop
    { width: 1536, height: 864 }, // HD+ laptop
    { width: 1440, height: 900 }, // MacBook Pro 14"
    { width: 1680, height: 1050 }, // 16:10 widescreen
    { width: 1600, height: 900 }, // 16:9 laptop
    { width: 1280, height: 720 }, // HD resolution
  ],

  // Phase 4: Mouse Movement Humanization
  MOUSE_CONFIG: {
    // Bézier curve parameters
    CURVE_STRENGTH: 0.3, // How curved the mouse path should be
    SPEED_VARIATION: 0.4, // Random speed variation factor
    MIN_STEPS: 10, // Minimum steps in mouse movement
    MAX_STEPS: 30, // Maximum steps in mouse movement
    PAUSE_PROBABILITY: 0.2, // Chance of pausing during movement
    OVERSHOOT_PROBABILITY: 0.15, // Chance of slight overshoot
    OVERSHOOT_DISTANCE: 5, // Pixels to overshoot

    // Speed ranges (ms per step)
    FAST_SPEED: { min: 1, max: 3 },
    NORMAL_SPEED: { min: 3, max: 8 },
    SLOW_SPEED: { min: 8, max: 15 },
  },

  // Phase 5: Typing Pattern Simulation
  TYPING_CONFIG: {
    // Keystroke timing (milliseconds)
    CHAR_DELAYS: {
      FAST_TYPING: { min: 50, max: 120 }, // Fast typist
      NORMAL_TYPING: { min: 80, max: 200 }, // Average typist
      SLOW_TYPING: { min: 150, max: 350 }, // Slow typist
    },

    // Special character delays
    SPECIAL_CHAR_DELAY: { min: 100, max: 300 },
    WORD_PAUSE_DELAY: { min: 200, max: 500 },
    SENTENCE_PAUSE_DELAY: { min: 800, max: 1500 },

    // Common words (typed faster)
    COMMON_WORDS: [
      "the",
      "and",
      "for",
      "are",
      "but",
      "not",
      "you",
      "all",
      "can",
      "had",
      "her",
      "was",
      "one",
      "our",
      "out",
      "day",
      "get",
      "has",
      "him",
      "his",
      "how",
      "man",
      "new",
      "now",
      "old",
      "see",
      "two",
      "way",
      "who",
      "boy",
    ],
  },

  // Phase 6: Action Timing Randomization
  ACTION_DELAYS: {
    BETWEEN_ACTIONS: { min: 1000, max: 3000 }, // 1-3 seconds between actions
    READING_TIME: { min: 5000, max: 15000 }, // 5-15 seconds for reading
    FORM_FIELD_PAUSE: { min: 800, max: 2000 }, // Pause between form fields
    CLICK_TO_TYPE_DELAY: { min: 300, max: 800 }, // Click to type delay
    PAGE_LOAD_WAIT: { min: 2000, max: 5000 }, // Wait after page load
  },

  // Phase 9: Request Header Variation
  HTTP_HEADERS: {
    ACCEPT_LANGUAGE: [
      "en-US,en;q=0.9",
      "en-US,en;q=0.8",
      "en-GB,en-US;q=0.9,en;q=0.8",
      "en-US,en;q=0.9,es;q=0.8",
    ],
    ACCEPT_ENCODING: [
      "gzip, deflate, br",
      "gzip, deflate",
      "gzip, deflate, br, zstd",
    ],
    DNT: ["1", "0"],
    CACHE_CONTROL: ["no-cache", "max-age=0", "no-store"],
    SEC_CH_UA: [
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      '"Chromium";v="119", "Not=A?Brand";v="24"',
    ],
  },

  // Phase 11: Resource Management (Cloud Optimization)
  RESOURCE_LIMITS: {
    MAX_CONCURRENT_SESSIONS: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 5,
    MEMORY_LIMIT_MB: parseInt(process.env.MEMORY_LIMIT_MB) || 4096,
    CPU_USAGE_THRESHOLD: parseInt(process.env.CPU_USAGE_THRESHOLD) || 80,
    SESSION_TIMEOUT_MS:
      parseInt(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000, // 30 minutes
    CLEANUP_INTERVAL_MS:
      parseInt(process.env.CLEANUP_INTERVAL_MS) || 5 * 60 * 1000, // 5 minutes
  },

  // Phase 12: Failure Recovery System
  RECOVERY_CONFIG: {
    DETECTION_INDICATORS: [
      "captcha",
      "recaptcha",
      "cloudflare",
      "access denied",
      "blocked",
      "rate limit",
      "too many requests",
      "suspicious activity", 
      "verification required",
      "bot detected",
      "automated traffic"
    ],

    // Ignore these common harmless warnings
    IGNORED_INDICATORS: [
      "blocked script execution in 'about:blank'",
      "sandboxed and the 'allow-scripts' permission is not set",
      "Cannot delete property 'weebdriver'",
      "Cannot redefine property",
      "Target closed",
      "Session closed"
    ],

    RECOVERY_ACTIONS: {
      SESSION_RESET: "reset_session",
      IP_COOLDOWN: "ip_cooldown",
      USER_AGENT_ROTATION: "rotate_user_agent",
      VIEWPORT_CHANGE: "change_viewport",
      DELAY_INCREASE: "increase_delays",
    },

    COOLDOWN_PERIODS: {
      SHORT: 30 * 1000, // 30 seconds
      MEDIUM: 5 * 60 * 1000, // 5 minutes
      LONG: 30 * 60 * 1000, // 30 minutes
    },
  },

  // Environment-based configuration
  ENVIRONMENT: {
    DEVELOPMENT: {
      VISIBLE_BROWSER: true,
      DETAILED_LOGGING: true,
      DISABLE_STEALTH: false,
      SLOW_MODE: true,
    },
    PRODUCTION: {
      VISIBLE_BROWSER: false,
      DETAILED_LOGGING: false,
      DISABLE_STEALTH: false,
      SLOW_MODE: false,
    },
  },

  // Phase 10: Canvas Fingerprint Masking
  CANVAS_NOISE: {
    ENABLED: true,
    NOISE_LEVEL: 0.1, // Very subtle noise
    RANDOMIZE_PER_SESSION: true,
  },

  // Phase 13: Configuration Management
  getEnvironmentConfig() {
    const env = process.env.NODE_ENV || "development";
    return this.ENVIRONMENT[env.toUpperCase()] || this.ENVIRONMENT.DEVELOPMENT;
  },

  // Get random user agent
  getRandomUserAgent() {
    return this.USER_AGENTS[
      Math.floor(Math.random() * this.USER_AGENTS.length)
    ];
  },

  // Get random viewport size
  getRandomViewport() {
    // Use environment variables if available, otherwise use random selection
    const envWidth = parseInt(process.env.BROWSER_WIDTH);
    const envHeight = parseInt(process.env.BROWSER_HEIGHT);

    if (envWidth && envHeight) {
      return { width: envWidth, height: envHeight };
    }

    return this.VIEWPORT_SIZES[
      Math.floor(Math.random() * this.VIEWPORT_SIZES.length)
    ];
  },

  // Get random HTTP headers
  getRandomHeaders() {
    return {
      "Accept-Language":
        this.HTTP_HEADERS.ACCEPT_LANGUAGE[
          Math.floor(Math.random() * this.HTTP_HEADERS.ACCEPT_LANGUAGE.length)
        ],
      "Accept-Encoding":
        this.HTTP_HEADERS.ACCEPT_ENCODING[
          Math.floor(Math.random() * this.HTTP_HEADERS.ACCEPT_ENCODING.length)
        ],
      DNT: this.HTTP_HEADERS.DNT[
        Math.floor(Math.random() * this.HTTP_HEADERS.DNT.length)
      ],
      "Cache-Control":
        this.HTTP_HEADERS.CACHE_CONTROL[
          Math.floor(Math.random() * this.HTTP_HEADERS.CACHE_CONTROL.length)
        ],
      "sec-ch-ua":
        this.HTTP_HEADERS.SEC_CH_UA[
          Math.floor(Math.random() * this.HTTP_HEADERS.SEC_CH_UA.length)
        ],
    };
  },
};

export default STEALTH_CONFIG;
