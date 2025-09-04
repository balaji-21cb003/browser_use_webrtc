/**
 * Advanced Anti-Detection Stealth Module
 * 
 * Comprehensive stealth measures to bypass bot detection on social media platforms
 * including Instagram, LinkedIn, Facebook, Twitter, etc.
 * 
 * Features:
 * - Advanced browser fingerprint randomization
 * - User-Agent rotation with realistic profiles
 * - Behavioral randomization (mouse, timing, scrolling)
 * - WebGL fingerprint spoofing
 * - Canvas fingerprint randomization
 * - Hardware fingerprint masking
 * - Network fingerprint spoofing
 * - JavaScript environment cleaning
 * - Real user simulation patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectPlatform, getPlatformConfig, getRandomDelay } from '../config/social-media-configs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AdvancedStealthService {
  constructor(logger) {
    this.logger = logger;
    this.userAgentPool = this.generateUserAgentPool();
    this.hardwareProfiles = this.generateHardwareProfiles();
    this.behavioralPatterns = this.generateBehavioralPatterns();
    this.sessionFingerprints = new Map(); // Store fingerprints per session
  }

  /**
   * Generate a pool of realistic User-Agent strings
   */
  generateUserAgentPool() {
    return [
      // Chrome on Windows 11
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
      
      // Chrome on macOS
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      
      // Chrome on Linux (for server environments)
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
      
      // Firefox alternatives
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
      
      // Edge alternatives
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    ];
  }

  /**
   * Generate realistic hardware profiles
   */
  generateHardwareProfiles() {
    return [
      {
        memory: 8,
        cores: 4,
        platform: "Win32",
        screens: [{ width: 1920, height: 1080, colorDepth: 24 }],
        timezone: "America/New_York",
        language: "en-US",
      },
      {
        memory: 16,
        cores: 8,
        platform: "MacIntel",
        screens: [{ width: 2560, height: 1440, colorDepth: 24 }],
        timezone: "America/Los_Angeles",
        language: "en-US",
      },
      {
        memory: 16,
        cores: 6,
        platform: "Linux x86_64",
        screens: [{ width: 1920, height: 1080, colorDepth: 24 }],
        timezone: "America/Chicago",
        language: "en-US",
      },
      {
        memory: 32,
        cores: 12,
        platform: "Win32",
        screens: [{ width: 3440, height: 1440, colorDepth: 24 }],
        timezone: "Europe/London",
        language: "en-GB",
      },
    ];
  }

  /**
   * Generate behavioral patterns for human-like interaction
   */
  generateBehavioralPatterns() {
    return {
      mouseMovements: {
        speed: { min: 100, max: 300 }, // pixels per second
        pauses: { min: 50, max: 200 }, // milliseconds
        jitter: { min: 1, max: 3 }, // pixels
      },
      typing: {
        speed: { min: 80, max: 120 }, // WPM
        mistakes: 0.02, // 2% chance of typo
        pauses: { min: 100, max: 500 }, // milliseconds between words
      },
      scrolling: {
        speed: { min: 200, max: 800 }, // pixels per scroll
        pauses: { min: 300, max: 1000 }, // milliseconds between scrolls
        direction_changes: 0.1, // 10% chance of direction change
      },
      clicks: {
        duration: { min: 50, max: 150 }, // milliseconds
        double_click_delay: { min: 200, max: 500 },
      },
    };
  }

  /**
   * Get or create a fingerprint for a session
   */
  getSessionFingerprint(sessionId) {
    if (!this.sessionFingerprints.has(sessionId)) {
      const userAgent = this.userAgentPool[Math.floor(Math.random() * this.userAgentPool.length)];
      const hardware = this.hardwareProfiles[Math.floor(Math.random() * this.hardwareProfiles.length)];
      
      const fingerprint = {
        userAgent,
        hardware,
        webgl: this.generateWebGLFingerprint(),
        canvas: this.generateCanvasFingerprint(),
        audio: this.generateAudioFingerprint(),
        fonts: this.generateFontFingerprint(),
        permissions: this.generatePermissionStates(),
        createdAt: new Date(),
      };
      
      this.sessionFingerprints.set(sessionId, fingerprint);
      this.logger.info(`🔒 Generated stealth fingerprint for session ${sessionId}`);
    }
    
    return this.sessionFingerprints.get(sessionId);
  }

  /**
   * Generate WebGL fingerprint data
   */
  generateWebGLFingerprint() {
    const renderers = [
      "ANGLE (Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
      "ANGLE (NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)",
      "ANGLE (AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0)",
      "WebKit WebGL",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    ];
    
    const vendors = [
      "Google Inc. (Intel)",
      "Google Inc. (NVIDIA)",
      "Google Inc. (AMD)",
      "WebKit",
      "Mozilla",
    ];
    
    return {
      renderer: renderers[Math.floor(Math.random() * renderers.length)],
      vendor: vendors[Math.floor(Math.random() * vendors.length)],
      version: "WebGL 1.0",
      shadingLanguageVersion: "WebGL GLSL ES 1.0",
    };
  }

  /**
   * Generate Canvas fingerprint data
   */
  generateCanvasFingerprint() {
    return {
      noise: Math.random() * 0.01, // Add slight noise to canvas rendering
      textBaseline: "alphabetic",
      textAlign: "start",
      fillStyle: `rgb(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)})`,
    };
  }

  /**
   * Generate Audio fingerprint data
   */
  generateAudioFingerprint() {
    return {
      sampleRate: 44100,
      channelCount: 2,
      noise: Math.random() * 0.001, // Add audio context noise
    };
  }

  /**
   * Generate Font fingerprint
   */
  generateFontFingerprint() {
    const commonFonts = [
      "Arial", "Helvetica", "Times New Roman", "Courier New", "Verdana",
      "Georgia", "Palatino", "Garamond", "Bookman", "Comic Sans MS",
      "Trebuchet MS", "Arial Black", "Impact", "Lucida Sans Unicode",
      "Tahoma", "Lucida Console", "Monaco", "Courier", "Bradley Hand ITC",
    ];
    
    // Randomly include/exclude fonts to create unique fingerprints
    return commonFonts.filter(() => Math.random() > 0.1);
  }

  /**
   * Generate Permission states
   */
  generatePermissionStates() {
    return {
      notifications: "default",
      geolocation: "denied",
      camera: "denied", 
      microphone: "denied",
      persistent_storage: "denied",
    };
  }

  /**
   * Apply comprehensive stealth measures to a page
   */
  async applyStealthMeasures(page, sessionId, task = '') {
    const fingerprint = this.getSessionFingerprint(sessionId);
    const platform = detectPlatform(task || page.url() || '');
    const platformConfig = getPlatformConfig(platform);
    
    this.logger.info(`🥷 Applying advanced stealth measures for session ${sessionId}${platform ? ` (${platform} detected)` : ''}`);
    
    try {
      // Use platform-specific User Agent if available
      const userAgent = platformConfig 
        ? platformConfig.stealth.userAgents[Math.floor(Math.random() * platformConfig.stealth.userAgents.length)]
        : fingerprint.userAgent;
      
      await page.setUserAgent(userAgent);
      
      // Set platform-specific viewport if available
      const viewport = platformConfig ? platformConfig.stealth.viewport : fingerprint.hardware.screens[0];
      await page.setViewport({
        width: Math.min(viewport.width - 100, 1920), // Leave space for browser UI
        height: Math.min(viewport.height - 150, 1080),
        deviceScaleFactor: 1,
      });

      // Set platform-specific headers
      const headers = platformConfig ? {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': `${fingerprint.hardware.language},${fingerprint.hardware.language.split('-')[0]};q=0.9,en;q=0.8`,
        'Cache-Control': 'max-age=0',
        'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': `"${fingerprint.hardware.platform === 'Win32' ? 'Windows' : fingerprint.hardware.platform === 'MacIntel' ? 'macOS' : 'Linux'}"`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        ...platformConfig.stealth.headers
      } : {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': `${fingerprint.hardware.language},${fingerprint.hardware.language.split('-')[0]};q=0.9,en;q=0.8`,
        'Cache-Control': 'max-age=0',
        'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': `"${fingerprint.hardware.platform === 'Win32' ? 'Windows' : fingerprint.hardware.platform === 'MacIntel' ? 'macOS' : 'Linux'}"`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      };

      await page.setExtraHTTPHeaders(headers);

      // Apply stealth JavaScript injections with platform-specific enhancements
      await page.evaluateOnNewDocument((fp, platformName, platformDetectionPatterns) => {
        // Advanced webdriver property hiding - handle both direct access and 'in' operator
        try {
          // Remove the property completely
          delete navigator.webdriver;
          delete navigator.__webdriver;
          
          // Override the property descriptor to prevent enumeration
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
            set: () => {},
            enumerable: false,
            configurable: true
          });
          
          // Override hasOwnProperty to hide webdriver
          const originalHasOwnProperty = Object.prototype.hasOwnProperty;
          Object.prototype.hasOwnProperty = function(prop) {
            if (prop === 'webdriver' && this === navigator) {
              return false;
            }
            return originalHasOwnProperty.call(this, prop);
          };
          
        } catch (e) {
          console.log('Webdriver hiding failed:', e);
        }

        // Spoof hardware properties
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => fp.hardware.cores,
          configurable: true
        });

        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => fp.hardware.memory,
          configurable: true
        });

        Object.defineProperty(navigator, 'platform', {
          get: () => fp.hardware.platform,
          configurable: true
        });

        Object.defineProperty(navigator, 'language', {
          get: () => fp.hardware.language,
          configurable: true
        });

        Object.defineProperty(navigator, 'languages', {
          get: () => [fp.hardware.language, fp.hardware.language.split('-')[0]],
          configurable: true
        });

        // Spoof plugins to look realistic
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [
              { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
              { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
              { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' }
            ];
            Object.defineProperty(plugins, 'length', { value: plugins.length });
            return plugins;
          },
          configurable: true
        });

        // Enhance Chrome object
        if (!window.chrome) {
          window.chrome = {};
        }
        
        window.chrome.runtime = {
          onConnect: null,
          onMessage: null,
          PlatformOs: {
            MAC: "mac",
            WIN: "win",
            ANDROID: "android",
            CROS: "cros",
            LINUX: "linux",
            OPENBSD: "openbsd"
          },
          PlatformArch: {
            ARM: "arm",
            X86_32: "x86-32",
            X86_64: "x86-64"
          },
          PlatformNaclArch: {
            ARM: "arm",
            X86_32: "x86-32",
            X86_64: "x86-64"
          },
          RequestUpdateCheckStatus: {
            THROTTLED: "throttled",
            NO_UPDATE: "no_update",
            UPDATE_AVAILABLE: "update_available"
          },
          OnInstalledReason: {
            INSTALL: "install",
            UPDATE: "update",
            CHROME_UPDATE: "chrome_update",
            SHARED_MODULE_UPDATE: "shared_module_update"
          },
          OnRestartRequiredReason: {
            APP_UPDATE: "app_update",
            OS_UPDATE: "os_update",
            PERIODIC: "periodic"
          }
        };

        // Platform-specific stealth measures
        if (platformName === 'instagram') {
          // Instagram-specific measures
          delete window.navigator.__instagram_web_client;
          delete window.navigator.__instagram_native_client;
          delete window.__INSTAGRAM_SHARED_DATA;
          
          // Override Instagram API detection
          const originalFetch = window.fetch;
          window.fetch = function(input, init = {}) {
            if (typeof input === 'string' && input.includes('instagram.com')) {
              init.headers = {
                ...init.headers,
                'X-Requested-With': 'XMLHttpRequest',
                'X-Instagram-AJAX': '1',
                'X-IG-App-ID': '936619743392459'
              };
            }
            return originalFetch(input, init);
          };
        } else if (platformName === 'linkedin') {
          // LinkedIn-specific measures
          delete window.voyager;
          delete window.linkedinBot;
          
          // Remove LinkedIn automation markers
          const style = document.createElement('style');
          style.textContent = `
            [automation-target] { display: none !important; }
            .automation-highlight { opacity: 0 !important; }
            .li-sled { visibility: hidden !important; }
          `;
          document.head.appendChild(style);
        }

        // Remove platform-specific detection patterns
        if (platformDetectionPatterns) {
          platformDetectionPatterns.forEach(pattern => {
            try {
              delete window[pattern];
              delete window.navigator[pattern];
              delete document[pattern];
            } catch (e) {
              // Ignore errors
            }
          });
        }

        // Spoof WebGL fingerprint
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes) {
          const context = originalGetContext.call(this, contextType, contextAttributes);
          
          if (contextType === 'webgl' || contextType === 'experimental-webgl') {
            if (context) {
              const originalGetParameter = context.getParameter;
              context.getParameter = function(parameter) {
                if (parameter === context.RENDERER) {
                  return fp.webgl.renderer;
                }
                if (parameter === context.VENDOR) {
                  return fp.webgl.vendor;
                }
                if (parameter === context.VERSION) {
                  return fp.webgl.version;
                }
                if (parameter === context.SHADING_LANGUAGE_VERSION) {
                  return fp.webgl.shadingLanguageVersion;
                }
                return originalGetParameter.call(context, parameter);
              };
            }
          }
          
          return context;
        };

        // Spoof Canvas fingerprint
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          const result = originalToDataURL.apply(this, arguments);
          // Add slight noise to canvas fingerprint
          if (Math.random() < 0.1) {
            return result.replace(/.$/, String.fromCharCode(Math.floor(Math.random() * 26) + 97));
          }
          return result;
        };

        // Spoof Audio Context
        if (window.AudioContext || window.webkitAudioContext) {
          const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
          
          function StealthAudioContext() {
            const context = new OriginalAudioContext();
            
            Object.defineProperty(context, 'sampleRate', {
              get: () => fp.audio.sampleRate + (Math.random() - 0.5) * fp.audio.noise,
              configurable: true
            });
            
            return context;
          }
          
          window.AudioContext = StealthAudioContext;
          if (window.webkitAudioContext) {
            window.webkitAudioContext = StealthAudioContext;
          }
        }

        // Hide automation properties - comprehensive cleanup
        delete window.navigator.webdriver;
        delete window.navigator.__webdriver_script_fn;
        delete window.navigator.__selenium_unwrapped;
        delete window.navigator.__webdriver_unwrapped;
        delete window.navigator.__driver_evaluate;
        delete window.navigator.__webdriver_evaluate;
        delete window.navigator.__selenium_evaluate;
        delete window.navigator.__fxdriver_evaluate;
        delete window.navigator.__driver_unwrapped;
        delete window.navigator.__fxdriver_unwrapped;
        delete window.navigator.__webdriver_script_func;
        
        // Remove browser-use specific properties
        delete window._browserUse;
        delete window.__browserUse;
        delete window.browserUse;
        delete window._browser_use;
        delete window.__browser_use;

        // Override permission API
        if (navigator.permissions && navigator.permissions.query) {
          const originalQuery = navigator.permissions.query;
          navigator.permissions.query = function(permissionDesc) {
            const permission = permissionDesc.name;
            if (fp.permissions[permission]) {
              return Promise.resolve({
                state: fp.permissions[permission],
                onchange: null
              });
            }
            return originalQuery.call(navigator.permissions, permissionDesc);
          };
        }

        // Remove automation indicators
        const originalQuerySelector = document.querySelector;
        const originalQuerySelectorAll = document.querySelectorAll;
        
        document.querySelector = function(selector) {
          if (selector && typeof selector === 'string') {
            if (selector.includes('automation') || 
                selector.includes('browser-use') || 
                selector.includes('webdriver') ||
                selector.includes('selenium')) {
              return null;
            }
          }
          return originalQuerySelector.call(document, selector);
        };

        document.querySelectorAll = function(selector) {
          if (selector && typeof selector === 'string') {
            if (selector.includes('automation') || 
                selector.includes('browser-use') || 
                selector.includes('webdriver') ||
                selector.includes('selenium')) {
              return [];
            }
          }
          return originalQuerySelectorAll.call(document, selector);
        };

        // Randomize screen properties slightly
        Object.defineProperty(screen, 'width', {
          get: () => fp.hardware.screens[0].width + Math.floor(Math.random() * 3 - 1),
          configurable: true
        });
        
        Object.defineProperty(screen, 'height', {
          get: () => fp.hardware.screens[0].height + Math.floor(Math.random() * 3 - 1),
          configurable: true
        });

        Object.defineProperty(screen, 'colorDepth', {
          get: () => fp.hardware.screens[0].colorDepth,
          configurable: true
        });

        console.log(`🥷 Advanced stealth measures applied successfully${platformName ? ` for ${platformName}` : ''}`);

      }, fingerprint, platform, platformConfig ? platformConfig.detectionPatterns : []);

      // Set realistic geolocation (disabled by default)
      await page.setGeolocation({ latitude: 0, longitude: 0, accuracy: 100 });

      this.logger.info(`✅ Advanced stealth measures applied for session ${sessionId}${platform ? ` (${platform})` : ''}`);
      
    } catch (error) {
      this.logger.error(`❌ Error applying stealth measures for session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Add human-like behavioral patterns to interactions
   */
  async addHumanBehavior(page, sessionId, task = '') {
    const patterns = this.behavioralPatterns;
    const platform = detectPlatform(task || page.url() || '');
    const platformConfig = getPlatformConfig(platform);
    
    // Use platform-specific delays if available
    const delays = platformConfig ? platformConfig.timing : {
      readingTime: { min: 2000, max: 8000 },
      scrollDelay: { min: 500, max: 2000 },
      clickDelay: { min: 100, max: 500 },
      typingDelay: { min: 50, max: 150 }
    };
    
    // Add random mouse movements
    await page.evaluateOnNewDocument((patterns) => {
      let lastMouseMove = Date.now();
      
      // Random mouse jitter
      setInterval(() => {
        if (Date.now() - lastMouseMove > 5000) { // If no movement for 5 seconds
          const x = Math.random() * window.innerWidth;
          const y = Math.random() * window.innerHeight;
          const jitterX = x + (Math.random() - 0.5) * patterns.mouseMovements.jitter.max;
          const jitterY = y + (Math.random() - 0.5) * patterns.mouseMovements.jitter.max;
          
          const event = new MouseEvent('mousemove', {
            clientX: jitterX,
            clientY: jitterY,
            bubbles: true,
            cancelable: true
          });
          
          document.dispatchEvent(event);
          lastMouseMove = Date.now();
        }
      }, Math.random() * 3000 + 2000); // Random interval 2-5 seconds

      // Track real mouse movements
      document.addEventListener('mousemove', () => {
        lastMouseMove = Date.now();
      });

      // Add random scroll behaviors
      let lastScroll = Date.now();
      setInterval(() => {
        if (Date.now() - lastScroll > 10000 && Math.random() < 0.1) { // 10% chance every 10 seconds
          const scrollAmount = Math.random() * patterns.scrolling.speed.max;
          window.scrollBy(0, Math.random() > 0.5 ? scrollAmount : -scrollAmount);
          lastScroll = Date.now();
        }
      }, 1000);

      document.addEventListener('scroll', () => {
        lastScroll = Date.now();
      });

    }, patterns);
  }

  /**
   * Clean up session fingerprint
   */
  cleanupSession(sessionId) {
    this.sessionFingerprints.delete(sessionId);
    this.logger.info(`🧹 Cleaned up stealth fingerprint for session ${sessionId}`);
  }

  /**
   * Get stealth statistics
   */
  getStealthStats() {
    return {
      activeSessions: this.sessionFingerprints.size,
      userAgentPoolSize: this.userAgentPool.length,
      hardwareProfilesCount: this.hardwareProfiles.length,
      totalFingerprintsGenerated: this.sessionFingerprints.size,
    };
  }
}

export default AdvancedStealthService;
