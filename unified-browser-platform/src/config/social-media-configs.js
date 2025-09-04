/**
 * Social Media Platform Configurations
 *
 * Specialized settings and stealth measures for different social media platforms
 * to bypass bot detection and ensure successful automation.
 */

export const SOCIAL_MEDIA_CONFIGS = {
  instagram: {
    name: "Instagram",
    domains: ["instagram.com", "cdninstagram.com", "fbcdn.net"],
    stealth: {
      userAgents: [
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-Instagram-AJAX": "1",
        "X-IG-App-ID": "936619743392459",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      timing: {
        minDelay: 1000,
        maxDelay: 3000,
        scrollSpeed: { min: 200, max: 600 },
        clickDelay: { min: 500, max: 1500 },
      },
      viewport: {
        width: 1920,
        height: 1080,
        mobile: false,
      },
    },
    detectionPatterns: [
      "__instagram_web_client",
      "__instagram_native_client",
      "__INSTAGRAM_SHARED_DATA",
      "challengeData",
      "checkpoint",
    ],
  },

  linkedin: {
    name: "LinkedIn",
    domains: ["linkedin.com", "licdn.com"],
    stealth: {
      userAgents: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      timing: {
        minDelay: 2000,
        maxDelay: 5000,
        scrollSpeed: { min: 300, max: 800 },
        clickDelay: { min: 1000, max: 2500 },
      },
      viewport: {
        width: 1920,
        height: 1080,
        mobile: false,
      },
    },
    detectionPatterns: [
      "voyager-web",
      "linkedin-bot",
      "automation-target",
      "li-sled",
    ],
  },

  facebook: {
    name: "Facebook",
    domains: ["facebook.com", "fbcdn.net", "fbsbx.com"],
    stealth: {
      userAgents: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "max-age=0",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
      },
      timing: {
        minDelay: 1500,
        maxDelay: 4000,
        scrollSpeed: { min: 250, max: 700 },
        clickDelay: { min: 800, max: 2000 },
      },
      viewport: {
        width: 1920,
        height: 1080,
        mobile: false,
      },
    },
    detectionPatterns: [
      "__fb_debug__",
      "_facebook_client",
      "facebook-bot-detector",
    ],
  },

  twitter: {
    name: "Twitter/X",
    domains: ["twitter.com", "x.com", "twimg.com"],
    stealth: {
      userAgents: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Authorization:
          "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "X-Twitter-Active-User": "yes",
        "X-Twitter-Client-Language": "en",
      },
      timing: {
        minDelay: 1000,
        maxDelay: 3000,
        scrollSpeed: { min: 200, max: 500 },
        clickDelay: { min: 600, max: 1800 },
      },
      viewport: {
        width: 1920,
        height: 1080,
        mobile: false,
      },
    },
    detectionPatterns: ["twitter-client", "tweetdeck", "twitter-bot"],
  },

  tiktok: {
    name: "TikTok",
    domains: ["tiktok.com", "tiktokcdn.com"],
    stealth: {
      userAgents: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      timing: {
        minDelay: 800,
        maxDelay: 2500,
        scrollSpeed: { min: 150, max: 400 },
        clickDelay: { min: 400, max: 1200 },
      },
      viewport: {
        width: 1920,
        height: 1080,
        mobile: false,
      },
    },
    detectionPatterns: ["tiktok-automation", "tt-bot", "bytedance-detector"],
  },
};

/**
 * Detect which social media platform based on URL or task description
 */
export function detectPlatform(urlOrTask) {
  const text = urlOrTask.toLowerCase();

  for (const [platform, config] of Object.entries(SOCIAL_MEDIA_CONFIGS)) {
    // Check domain matches
    if (config.domains.some((domain) => text.includes(domain))) {
      return platform;
    }

    // Check platform name mentions
    if (text.includes(platform) || text.includes(config.name.toLowerCase())) {
      return platform;
    }
  }

  return null;
}

/**
 * Get platform-specific configuration
 */
export function getPlatformConfig(platform) {
  return SOCIAL_MEDIA_CONFIGS[platform] || null;
}

/**
 * Get appropriate timing delays for human-like behavior
 */
export function getRandomDelay(platform, action = "default") {
  const config = getPlatformConfig(platform);
  if (!config) {
    return Math.random() * 2000 + 1000; // Default 1-3 seconds
  }

  const timing = config.stealth.timing;

  switch (action) {
    case "click":
      return (
        Math.random() * (timing.clickDelay.max - timing.clickDelay.min) +
        timing.clickDelay.min
      );
    case "scroll":
      return (
        Math.random() * (timing.scrollSpeed.max - timing.scrollSpeed.min) +
        timing.scrollSpeed.min
      );
    default:
      return (
        Math.random() * (timing.maxDelay - timing.minDelay) + timing.minDelay
      );
  }
}

/**
 * Enhanced Chrome arguments for specific platforms
 */
export function getPlatformSpecificArgs(platform) {
  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--exclude-switches=enable-automation",
  ];

  const platformSpecific = {
    instagram: [
      "--disable-features=VizDisplayCompositor",
      "--disable-web-security",
      "--allow-running-insecure-content",
      "--disable-site-isolation-trials",
    ],
    linkedin: [
      "--enable-features=NetworkService",
      "--disable-client-side-phishing-detection",
      "--disable-component-extensions-with-background-pages",
    ],
    facebook: [
      "--disable-features=TranslateUI",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
    ],
    twitter: [
      "--force-color-profile=srgb",
      "--metrics-recording-only",
      "--disable-domain-reliability",
    ],
    tiktok: [
      "--use-mock-keychain",
      "--disable-component-update",
      "--aggressive-cache-discard",
    ],
  };

  return [...baseArgs, ...(platformSpecific[platform] || [])];
}

export default SOCIAL_MEDIA_CONFIGS;
