/**
 * Social Media Platform Configurations
 *
 * Platform-specific anti-detection configurations for major social media platforms
 * including Instagram, LinkedIn, Facebook, Twitter, TikTok, and others.
 */

export const SocialMediaConfigs = {
  instagram: {
    name: "Instagram",
    domains: ["instagram.com", "www.instagram.com"],
    userAgents: [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    headers: {
      "X-Instagram-AJAX": "1",
      "X-IG-App-ID": "936619743392459",
      "X-Requested-With": "XMLHttpRequest",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    timing: {
      mouseMove: { min: 200, max: 800 },
      click: { min: 150, max: 400 },
      type: { min: 100, max: 300 },
      scroll: { min: 300, max: 1200 },
      pageLoad: { min: 2000, max: 5000 },
    },
    detectionPatterns: [
      "__instagram_web_client",
      "__instagram_native_client",
      "__INSTAGRAM_SHARED_DATA",
      "instagram_automation",
      "ig_bot_detection",
    ],
    stealthMeasures: {
      removeWebdriver: true,
      spoofPlugins: true,
      randomizeFingerprint: true,
      hideAutomationProps: true,
      injectRealBehavior: true,
    },
  },

  linkedin: {
    name: "LinkedIn",
    domains: ["linkedin.com", "www.linkedin.com"],
    userAgents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "max-age=0",
      "Sec-CH-UA":
        '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "X-Requested-With": "XMLHttpRequest",
    },
    timing: {
      mouseMove: { min: 150, max: 600 },
      click: { min: 200, max: 500 },
      type: { min: 80, max: 250 },
      scroll: { min: 400, max: 1000 },
      pageLoad: { min: 3000, max: 6000 },
    },
    detectionPatterns: [
      "__linkedin_voyager",
      "linkedin_automation",
      "voyager_automation",
      "li_bot_detection",
      "linkedin_scraper",
    ],
    stealthMeasures: {
      removeWebdriver: true,
      spoofPlugins: true,
      randomizeFingerprint: true,
      hideAutomationProps: true,
      injectRealBehavior: true,
    },
  },

  facebook: {
    name: "Facebook",
    domains: ["facebook.com", "www.facebook.com", "m.facebook.com"],
    userAgents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    timing: {
      mouseMove: { min: 180, max: 700 },
      click: { min: 150, max: 450 },
      type: { min: 90, max: 280 },
      scroll: { min: 350, max: 1100 },
      pageLoad: { min: 2500, max: 5500 },
    },
    detectionPatterns: [
      "__facebook_automation",
      "fb_bot_detection",
      "facebook_scraper",
      "__fb_web_client",
    ],
    stealthMeasures: {
      removeWebdriver: true,
      spoofPlugins: true,
      randomizeFingerprint: true,
      hideAutomationProps: true,
      injectRealBehavior: true,
    },
  },

  twitter: {
    name: "Twitter/X",
    domains: ["twitter.com", "x.com"],
    userAgents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    timing: {
      mouseMove: { min: 160, max: 650 },
      click: { min: 140, max: 380 },
      type: { min: 95, max: 270 },
      scroll: { min: 320, max: 950 },
      pageLoad: { min: 2200, max: 4800 },
    },
    detectionPatterns: [
      "__twitter_automation",
      "twitter_bot_detection",
      "x_automation",
      "__x_web_client",
    ],
    stealthMeasures: {
      removeWebdriver: true,
      spoofPlugins: true,
      randomizeFingerprint: true,
      hideAutomationProps: true,
      injectRealBehavior: true,
    },
  },

  tiktok: {
    name: "TikTok",
    domains: ["tiktok.com", "www.tiktok.com"],
    userAgents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    timing: {
      mouseMove: { min: 190, max: 750 },
      click: { min: 160, max: 420 },
      type: { min: 100, max: 290 },
      scroll: { min: 250, max: 800 },
      pageLoad: { min: 2800, max: 6000 },
    },
    detectionPatterns: [
      "__tiktok_automation",
      "tiktok_bot_detection",
      "tt_automation",
      "__tt_web_client",
    ],
    stealthMeasures: {
      removeWebdriver: true,
      spoofPlugins: true,
      randomizeFingerprint: true,
      hideAutomationProps: true,
      injectRealBehavior: true,
    },
  },

  youtube: {
    name: "YouTube",
    domains: ["youtube.com", "www.youtube.com", "m.youtube.com"],
    userAgents: [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
    },
    timing: {
      mouseMove: { min: 170, max: 680 },
      click: { min: 120, max: 350 },
      type: { min: 85, max: 260 },
      scroll: { min: 300, max: 900 },
      pageLoad: { min: 2000, max: 4500 },
    },
    detectionPatterns: [
      "__youtube_automation",
      "yt_bot_detection",
      "youtube_scraper",
    ],
    stealthMeasures: {
      removeWebdriver: true,
      spoofPlugins: true,
      randomizeFingerprint: true,
      hideAutomationProps: true,
      injectRealBehavior: true,
    },
  },
};

/**
 * Detect platform from URL or task description
 */
export function detectPlatform(input) {
  const lowercaseInput = input.toLowerCase();

  for (const [key, config] of Object.entries(SocialMediaConfigs)) {
    // Check if platform name is mentioned
    if (
      lowercaseInput.includes(key) ||
      lowercaseInput.includes(config.name.toLowerCase())
    ) {
      return key;
    }

    // Check if domain is mentioned
    for (const domain of config.domains) {
      if (lowercaseInput.includes(domain)) {
        return key;
      }
    }
  }

  return null;
}

/**
 * Get platform configuration
 */
export function getPlatformConfig(platform) {
  return SocialMediaConfigs[platform] || null;
}

/**
 * Get enhanced Chrome arguments for specific platform
 */
export function getPlatformChromeArgs(platform, baseArgs = []) {
  const config = getPlatformConfig(platform);
  if (!config) return baseArgs;

  const platformSpecificArgs = [
    // Platform-specific optimizations
    `--user-agent=${config.userAgents[0]}`,
    "--disable-blink-features=AutomationControlled",
    "--exclude-switches=enable-automation",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu-sandbox",
    "--disable-software-rasterizer",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI,BlinkGenPropertyTrees",
    "--disable-ipc-flooding-protection",
    "--enable-features=NetworkService,NetworkServiceLogging",
    "--force-color-profile=srgb",
    "--metrics-recording-only",
    "--use-mock-keychain",
  ];

  return [...baseArgs, ...platformSpecificArgs];
}

export default SocialMediaConfigs;
