/**
 * Browser Streaming Service
 * Handles browser launching, streaming, and interaction
 */

import puppeteer from "puppeteer";
import { EventEmitter } from "events";
import os from "os";
import { Logger } from "../utils/logger.js";
import OptimizedTabDetection from "./optimized-tab-detection.js";
import AdvancedStealthService from "./advanced-stealth.js";
import ProxyRotationService from "./proxy-rotation.js";

export class BrowserStreamingService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.logger = new Logger("BrowserStreamingService");
    this.isInitialized = false;

    // Initialize optimized tab detection
    this.tabDetection = new OptimizedTabDetection(this.logger);

    // Initialize advanced stealth service
    this.stealthService = new AdvancedStealthService(this.logger);

    // Initialize proxy rotation service if enabled
    this.proxyService =
      process.env.ENABLE_PROXY_ROTATION === "true"
        ? new ProxyRotationService()
        : null;

    // Start periodic cache cleanup
    setInterval(() => {
      this.tabDetection.cleanupCache();
    }, 30000); // Clean every 30 seconds
  }

  async initialize() {
    this.logger.info("🔧 Initializing Browser Streaming Service...");

    // Initialize proxy service if enabled
    if (this.proxyService) {
      this.logger.info("🔄 Proxy rotation enabled");

      if (process.env.PROXY_TEST_ON_STARTUP === "true") {
        this.logger.info("🔍 Testing proxy connectivity...");
        await this.proxyService.validateAllProxies();
      }
    }

    // Start periodic mouse state cleanup to prevent stuck states
    setInterval(() => {
      this.cleanupMouseStates();
    }, 60000); // Clean every 60 seconds

    this.isInitialized = true;
    this.logger.info("✅ Browser Streaming Service initialized");
  }

  // Clean up mouse states for all sessions with improved error handling
  async cleanupMouseStates() {
    try {
      for (const [sessionId, session] of this.sessions) {
        if (
          session &&
          session.mouseButtonState &&
          session.mouseButtonState.size > 0
        ) {
          this.logger.debug(`🖱️ Cleaning mouse state for session ${sessionId}`);
          await this.resetMouseState(sessionId);
        }
      }
    } catch (error) {
      this.logger.debug(`Mouse state cleanup error: ${error.message}`);
    }
  }

  // Enhanced reset mouse state with better error recovery
  async resetMouseState(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.page) return;

    try {
      // Clear our tracking state first
      session.mouseButtonState.clear();

      // Try to release all mouse buttons with individual error handling
      const buttons = ["left", "right", "middle"];
      for (const button of buttons) {
        try {
          await session.page.mouse.up({ button });
        } catch (buttonError) {
          // Ignore individual button errors - they might not be pressed
          continue;
        }
      }

      this.logger.debug(
        `🖱️ Mouse state reset completed for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.debug(`Mouse state reset error: ${error.message}`);
    }
  }

  // Enhanced CDP session recovery and management
  async setupCDPSessionRecovery(page, sessionId) {
    try {
      // Set up CDP session monitoring
      const client = await page.target().createCDPSession();

      // Monitor CDP session health
      client.on("disconnected", async () => {
        this.logger.warn(
          `🔌 CDP session disconnected for ${sessionId}, attempting recovery...`,
        );
        await this.recoverCDPSession(sessionId);
      });

      // Set up page error monitoring
      page.on("error", async (error) => {
        if (error.message.includes("Session with given id not found")) {
          this.logger.warn(
            `🔄 CDP session lost for ${sessionId}, recovering...`,
          );
          await this.recoverCDPSession(sessionId);
        }
      });

      // Store CDP client reference
      const session = this.sessions.get(sessionId);
      if (session) {
        session.cdpClient = client;
      }

      this.logger.debug(`✅ CDP session recovery setup for ${sessionId}`);
    } catch (error) {
      this.logger.warn(
        `⚠️ Could not setup CDP recovery for ${sessionId}: ${error.message}`,
      );
    }
  }

  // Recover CDP session
  async recoverCDPSession(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session || !session.page) return;

      // Wait a bit before attempting recovery
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Try to create a new CDP session
      const newClient = await session.page.target().createCDPSession();
      session.cdpClient = newClient;

      // Re-apply stealth measures after recovery
      await this.stealthService.applyStealthMeasures(session.page, sessionId);

      this.logger.info(`✅ CDP session recovered for ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to recover CDP session for ${sessionId}: ${error.message}`,
      );
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  async createSessionWithSeparateBrowser(sessionId, options = {}) {
    try {
      this.logger.info(
        `🔗 Creating streaming session ${sessionId} with SEPARATE browser for parallel execution`,
      );

      // Get proxy for this session if rotation is enabled
      let currentProxy = null;
      if (this.proxyService) {
        currentProxy = this.proxyService.getNextProxy(sessionId);
        if (currentProxy) {
          this.logger.info(
            `🔄 Using proxy for session ${sessionId}: ${currentProxy.description} (${currentProxy.server})`,
          );
        }
      }

      // Create a NEW browser instance for this session to enable true parallelism
      // Use less restrictive configuration for better compatibility
      const isProduction = process.env.NODE_ENV === "production";
      const protocolTimeout =
        parseInt(process.env.BROWSER_PROTOCOL_TIMEOUT) || 120000;

      // Build browser args with proxy support
      const browserArgs = [
        "--remote-debugging-port=0", // Use random port

        // Enhanced stealth arguments for anti-detection
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",

        // Core anti-detection measures
        "--disable-blink-features=AutomationControlled",
        "--exclude-switches=enable-automation",
        "--disable-client-side-phishing-detection",
        "--disable-component-extensions-with-background-pages",
        "--disable-ipc-flooding-protection",
        "--enable-features=NetworkService,NetworkServiceLogging",
        "--force-color-profile=srgb",
        "--metrics-recording-only",
        "--no-crash-upload",
        "--no-report-upload",
        "--disable-breakpad",
        "--disable-domain-reliability",
        "--use-mock-keychain",

        // Enhanced stealth for social media platforms
        "--disable-features=VizDisplayCompositor,TranslateUI,BlinkGenPropertyTrees",
        "--disable-sync",
        "--disable-translate",
        "--disable-default-apps",
        "--disable-component-update",
        "--disable-extensions-file-access-check",
        "--disable-extensions-http-throttling",
        "--disable-field-trial-config",
        "--aggressive-cache-discard",
        "--disable-back-forward-cache",

        // Advanced automation detection bypassing
        "--disable-blink-features=AutomationControlled",
        "--exclude-switches=enable-automation",
        "--disable-automation",
        "--disable-logging",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--no-service-autorun",
        "--disable-client-side-phishing-detection",
        "--disable-component-extensions-with-background-pages",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-extensions-file-access-check",
        "--disable-hang-monitor",
        "--disable-plugins",
        "--disable-plugins-discovery",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--disable-translate",
        "--no-crash-upload",
        "--no-report-upload",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=VizDisplayCompositor",

        // Window and rendering optimizations with consistent sizing
        `--window-size=${options.width || parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) || 1920},${options.height || parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) || 1080}`,
        "--window-position=0,0",
        "--force-device-scale-factor=1",
        "--enable-webgl",
        "--enable-accelerated-2d-canvas",
        "--enable-gpu-rasterization",
        isProduction ? "--disable-gpu" : "--use-gl=desktop",

        // Performance and background optimizations
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-networking",
        "--disable-plugins-discovery",
        "--disable-preconnect",
        "--max_old_space_size=4096",

        // UI and user experience
        "--hide-scrollbars",
        "--mute-audio",
        "--disable-notifications",
        "--disable-desktop-notifications",
        "--disable-infobars",
        "--disable-popup-blocking",
        "--autoplay-policy=no-user-gesture-required",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-hang-monitor",
        "--disable-prompt-on-repost",
        "--disable-password-generation",
        "--disable-password-manager-reauthentication",

        // Network and security (balanced for compatibility)
        "--allow-running-insecure-content",
        "--disable-site-isolation-trials",

        // Linux-specific optimizations for server environments
        ...(os.platform() === "linux"
          ? [
              "--no-zygote",
              "--disable-gpu-sandbox",
              "--disable-software-rasterizer",
            ]
          : []),
      ];

      // Add proxy args if available
      if (currentProxy) {
        const proxyArgs = this.proxyService.getProxyArgs(currentProxy);
        browserArgs.push(...proxyArgs);
        this.logger.info(`🔗 Added proxy args: ${proxyArgs.join(" ")}`);
      }

      // Filter out empty args
      const filteredArgs = browserArgs.filter((arg) => arg !== "");

      const browser = await puppeteer.launch({
        headless: process.env.BROWSER_HEADLESS, // Allow non-headless in development
        executablePath: process.env.CHROME_PATH || undefined,
        timeout: parseInt(process.env.BROWSER_LAUNCH_TIMEOUT) || 120000,
        protocolTimeout: protocolTimeout,
        defaultViewport: {
          width:
            options.width ||
            parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) ||
            1920,
          height:
            options.height ||
            parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) ||
            1080,
          deviceScaleFactor: 1,
        },
        args: filteredArgs,
      });

      // Create a new page for this session
      const page = await browser.newPage();

      // Set up consistent page configuration for all tabs
      const standardViewport = {
        width:
          options.width ||
          parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) ||
          1920,
        height:
          options.height ||
          parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) ||
          1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      };

      await page.setViewport(standardViewport);

      // Apply advanced stealth measures using the stealth service
      this.logger.info(
        `🥷 Applying stealth mode for Instagram/LinkedIn compatibility...`,
      );

      // Extract URL from options or use default Instagram URL for stealth context
      const targetUrl = options.url || "https://instagram.com";
      const task = options.task || "social media automation";

      try {
        await this.stealthService.applyStealthMeasures(
          page,
          sessionId,
          targetUrl || task,
        );
        await this.stealthService.addHumanBehavior(
          page,
          sessionId,
          targetUrl || task,
        );

        // Set up CDP session recovery after stealth measures
        await this.setupCDPSessionRecovery(page, sessionId);

        this.logger.info(`✅ Advanced stealth mode applied successfully`);
      } catch (stealthError) {
        this.logger.warn(
          `⚠️ Stealth mode failed, falling back to basic measures:`,
          stealthError.message,
        );

        // Fallback to basic stealth if advanced fails
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        );

        // Set realistic headers that match a normal browser
        await page.setExtraHTTPHeaders({
          "Accept-Language": "en-US,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "max-age=0",
          "Sec-Ch-Ua":
            '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        });

        // Basic stealth measures
        await page.evaluateOnNewDocument(() => {
          // Remove webdriver property
          Object.defineProperty(navigator, "webdriver", {
            get: () => undefined,
          });

          // Override plugins array to look more realistic
          Object.defineProperty(navigator, "plugins", {
            get: () => [1, 2, 3, 4, 5],
          });

          // Override languages to be more realistic
          Object.defineProperty(navigator, "languages", {
            get: () => ["en-US", "en"],
          });

          // Make window.chrome look realistic
          if (!window.chrome) {
            window.chrome = {};
          }
          window.chrome.runtime = {
            onConnect: null,
            onMessage: null,
          };

          // Remove automation indicators
          const originalQuery = window.document.querySelector;
          window.document.querySelector = function (selector) {
            if (
              selector === "[automation-target]" ||
              selector === ".browser-use-target" ||
              selector === ".automation-highlight"
            ) {
              return null;
            }
            return originalQuery.call(document, selector);
          };
        });
      }

      // Navigate to initial page
      await page.goto("about:blank");

      // Set up CDP session for streaming with improved error handling and recovery
      let client;
      let maxRetries = 3;
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          client = await page.target().createCDPSession();
          this.logger.debug(
            `🔧 CDP session created for session ${sessionId} (attempt ${retry + 1})`,
          );

          // Enable CDP domains with timeout and error handling with extended timeouts for cloud servers
          const cdpTimeout = parseInt(process.env.CDP_TIMEOUT) || 120000;

          await Promise.race([
            Promise.all([
              client.send("Page.enable").catch((err) => {
                this.logger.warn(`Page.enable failed: ${err.message}`);
                return null; // Continue with other commands
              }),
              client.send("Runtime.enable").catch((err) => {
                this.logger.warn(`Runtime.enable failed: ${err.message}`);
                return null; // Continue with other commands
              }),
              client.send("DOM.enable").catch((err) => {
                this.logger.warn(`DOM.enable failed: ${err.message}`);
                return null; // Continue with other commands
              }),
              client
                .send("Target.setAutoAttach", {
                  autoAttach: true,
                  waitForDebuggerOnStart: false,
                  flatten: true,
                })
                .catch((err) => {
                  this.logger.debug(
                    `Target.setAutoAttach failed: ${err.message}`,
                  );
                  return null; // Non-critical, continue
                }),
            ]),
            new Promise((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(`CDP domain setup timeout after ${cdpTimeout}ms`),
                  ),
                cdpTimeout,
              ),
            ),
          ]);

          this.logger.debug(
            `🔧 All CDP domains enabled for session ${sessionId}`,
          );
          break; // Success, exit retry loop
        } catch (error) {
          this.logger.warn(
            `CDP setup attempt ${retry + 1} failed: ${error.message}`,
          );
          if (client) {
            try {
              await client.detach();
            } catch (detachError) {
              // Ignore detach errors
            }
          }
          if (retry === maxRetries - 1) {
            throw new Error(
              `Failed to setup CDP session after ${maxRetries} attempts: ${error.message}`,
            );
          }
          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (retry + 1)),
          );
        }
      }

      // Get the NEW browser's WebSocket endpoint
      const browserWSEndpoint = browser.wsEndpoint();

      const session = {
        id: sessionId,
        browser, // NEW browser instance for this session
        page,
        client,
        browserWSEndpoint, // For external CDP connections (browser-use)
        cdpPort: browserWSEndpoint.split(":").pop().split("/")[0], // Extract port from WSEndpoint
        streaming: false,
        streamCallback: null,
        viewport: standardViewport,
        createdAt: new Date(),
        lastActivity: new Date(),
        mouseButtonState: new Set(), // Track pressed mouse buttons
        usingCentralizedBrowser: false, // Flag to indicate this session uses its own browser
        // CDP session recovery
        cdpRetryCount: 0,
        lastCdpError: null,
        cdpRecoveryInProgress: false,
        // Tab management
        tabs: new Map(), // Track all tabs: Map<targetId, {page, title, url, isActive}>
        activeTabId: null, // Currently active tab ID
        lastTabSwitchTime: new Date(),
      };

      this.sessions.set(sessionId, session);

      // Set up viewport enforcement for all page navigations
      await this.setupViewportEnforcement(sessionId);

      // Initialize tab management
      await this.setupTabManagement(sessionId);

      this.logger.info(
        `✅ Streaming session created for ${sessionId} with SEPARATE browser for parallel execution`,
      );
      this.logger.info(`🔌 Session CDP Endpoint: ${browserWSEndpoint}`);

      return session;
    } catch (error) {
      this.logger.error(
        `❌ Failed to create streaming session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  // **NEW: CDP Session Recovery Method**
  async recoverCdpSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.cdpRecoveryInProgress) {
      return false;
    }

    try {
      session.cdpRecoveryInProgress = true;
      this.logger.info(
        `🔄 Attempting CDP session recovery for session ${sessionId}`,
      );

      // Increment retry count
      session.cdpRetryCount = (session.cdpRetryCount || 0) + 1;

      // Max 3 recovery attempts
      if (session.cdpRetryCount > 3) {
        this.logger.error(
          `❌ CDP recovery failed - max retries exceeded for session ${sessionId}`,
        );
        return false;
      }

      // Get current page reference
      const currentPage = session.page;
      if (!currentPage || currentPage.isClosed()) {
        this.logger.error(
          `❌ CDP recovery failed - page is closed for session ${sessionId}`,
        );
        return false;
      }

      // Detach old client if it exists
      if (session.client) {
        try {
          await session.client.detach();
        } catch (error) {
          // Ignore detach errors
          this.logger.debug(
            `Old CDP client detach completed for session ${sessionId}`,
          );
        }
      }

      // Create new CDP session
      const newClient = await currentPage.target().createCDPSession();

      // Re-enable domains
      await Promise.all([
        newClient.send("Page.enable"),
        newClient.send("Runtime.enable"),
        newClient.send("DOM.enable"),
        newClient
          .send("Target.setAutoAttach", {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true,
          })
          .catch(() => {
            // Non-critical
          }),
      ]);

      // Update session with new client
      session.client = newClient;
      session.lastCdpError = null;

      // If streaming was active, restart it
      if (session.streaming && session.streamCallback) {
        await this.restartStreamingWithNewClient(session, newClient);
      }

      this.logger.info(
        `✅ CDP session recovery successful for session ${sessionId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `❌ CDP session recovery failed for session ${sessionId}:`,
        error.message,
      );
      session.lastCdpError = error.message;
      return false;
    } finally {
      session.cdpRecoveryInProgress = false;
    }
  }

  // **NEW: Restart streaming with new CDP client**
  async restartStreamingWithNewClient(session, newClient) {
    try {
      this.logger.info(
        `🎬 Restarting streaming with new CDP client for session ${session.id}`,
      );

      // Start new screencast
      await newClient.send("Page.startScreencast", {
        format: "jpeg",
        quality: 95,
        maxWidth: Math.max(session.viewport.width, 1920),
        maxHeight: Math.max(session.viewport.height, 1080),
        everyNthFrame: 1,
      });

      // Handle screencast frames with the new client
      newClient.on("Page.screencastFrame", async (params) => {
        try {
          await newClient.send("Page.screencastFrameAck", {
            sessionId: params.sessionId,
          });

          if (session.streamCallback && session.streaming) {
            session.streamCallback(params.data);
          }
        } catch (error) {
          this.logger.error(
            `Error handling screencast frame after recovery:`,
            error.message,
          );
          // Don't throw, just log
        }
      });

      this.logger.info(
        `✅ Streaming restarted successfully for session ${session.id}`,
      );
    } catch (error) {
      this.logger.error(`❌ Failed to restart streaming:`, error.message);
      throw error;
    }
  }

  // **NEW: Get CDP endpoint with recovery support**
  getCdpEndpointWithRecovery(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if CDP session needs recovery
    if (session.lastCdpError && !session.cdpRecoveryInProgress) {
      // Trigger async recovery (don't wait for it)
      this.recoverCdpSession(sessionId).catch((error) => {
        this.logger.error(`Background CDP recovery failed: ${error.message}`);
      });
    }

    return session.browserWSEndpoint;
  }

  async launchBrowser(sessionId, options = {}) {
    try {
      this.logger.info(`🚀 Launching browser for session: ${sessionId}`);

      const defaultOptions = {
        headless: false, // SHOW BROWSER WINDOW - you can see automation!
        executablePath: process.env.CHROME_PATH || undefined,
        defaultViewport: {
          width:
            options.width ||
            parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) ||
            1920,
          height:
            options.height ||
            parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) ||
            1080,
          deviceScaleFactor: 1,
        },
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--disable-gpu",
          "--use-gl=swiftshader",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-extensions",
          "--disable-default-apps",
          "--disable-sync",
          "--disable-translate",
          "--disable-plugins",
          "--disable-notifications",
          "--disable-desktop-notifications",
          "--autoplay-policy=no-user-gesture-required",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-domain-reliability",
          "--disable-client-side-phishing-detection",
          "--start-maximized",
          "--disable-infobars",
          "--disable-popup-blocking",
          "--hide-scrollbars",
          "--mute-audio",
          `--window-size=${options.width || 1920},${options.height || 1200}`,
          "--window-position=0,0",
          "--force-device-scale-factor=1",
          "--disable-blink-features=AutomationControlled",
          "--exclude-switches=enable-automation",
        ],
        ignoreHTTPSErrors: true,
        devtools: false,
        timeout: 0, // Disable browser launch timeout
      };

      const browser = await puppeteer.launch({
        ...defaultOptions,
        ...options,
      });

      const page = await browser.newPage();

      // Set up page configuration
      await page.setViewport(defaultOptions.defaultViewport);
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      // Set extra headers to help with site compatibility
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });

      // Navigate to initial page - start with blank page to avoid network issues
      await page.goto("about:blank");

      // Set up CDP session for streaming
      const client = await page.target().createCDPSession();
      await client.send("Page.enable");
      await client.send("Runtime.enable");
      await client.send("DOM.enable");

      // Get browser WebSocket endpoint for external connections
      const browserWSEndpoint = browser.wsEndpoint();
      const cdpPort = browserWSEndpoint.match(/:(\d+)/)?.[1] || "9222";

      const session = {
        id: sessionId,
        browser,
        page,
        client,
        browserWSEndpoint, // For external CDP connections (browser-use)
        cdpPort,
        streaming: false,
        streamCallback: null,
        viewport: defaultOptions.defaultViewport,
        createdAt: new Date(),
        lastActivity: new Date(),
        mouseButtonState: new Set(), // Track pressed mouse buttons
      };

      this.sessions.set(sessionId, session);
      this.logger.info(
        `✅ Browser launched successfully for session: ${sessionId}`,
      );
      this.logger.info(`🔌 CDP WebSocket endpoint: ${browserWSEndpoint}`);

      return session;
    } catch (error) {
      this.logger.error(
        `❌ Failed to launch browser for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  async startStreaming(sessionId, callback) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.streaming) {
      this.logger.warn(`Session ${sessionId} already streaming`);
      return;
    }

    try {
      this.logger.info(`📹 Starting screencast for session: ${sessionId}`);

      session.streamCallback = callback;
      session.streaming = true;

      // Reset mouse button state to prevent stuck buttons
      session.mouseButtonState.clear();
      try {
        // Enhanced mouse state reset with individual button handling
        const buttons = ["left", "right", "middle"];
        for (const button of buttons) {
          try {
            await session.page.mouse.up({ button });
          } catch (buttonError) {
            // Individual button errors are expected if button isn't pressed
            continue;
          }
        }
        this.logger.debug(`🖱️ Mouse state reset for session ${sessionId}`);
      } catch (resetError) {
        // Ignore errors when resetting mouse state
        this.logger.debug(
          `Mouse state reset attempted for session ${sessionId}`,
        );
      }

      // Start screencast with higher quality settings
      this.logger.debug(
        `🎬 Sending Page.startScreencast for session ${sessionId}`,
      );
      try {
        const result = await session.client.send("Page.startScreencast", {
          format: "jpeg",
          quality: 95, // Increased from 80 to 95 for higher quality
          maxWidth: Math.max(session.viewport.width, 1920), // Ensure minimum resolution
          maxHeight: Math.max(session.viewport.height, 1080),
          everyNthFrame: 1, // Capture every frame for smooth streaming
        });
        this.logger.debug(
          `✅ Page.startScreencast sent successfully for session ${sessionId}, result:`,
          result,
        );

        // Add a small delay to ensure screencast is started
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Force a repaint to trigger screencast
        await session.page.evaluate(() => {
          document.body.style.backgroundColor = "white";
          window.scrollTo(0, 0);
        });
        this.logger.debug(
          `🔧 Forced repaint after screencast start for session ${sessionId}`,
        );
      } catch (error) {
        // **ENHANCED: Detect CDP session failures and attempt recovery**
        if (
          error.message.includes("Session with given id not found") ||
          error.message.includes("Target closed") ||
          error.message.includes("Session closed")
        ) {
          this.logger.warn(
            `🔄 CDP session lost for ${sessionId}, attempting recovery...`,
          );
          session.lastCdpError = error.message;

          const recovered = await this.recoverCdpSession(sessionId);
          if (recovered) {
            // Retry streaming with recovered session
            this.logger.info(
              `🔄 Retrying streaming after CDP recovery for ${sessionId}`,
            );
            return await this.startStreaming(sessionId, callback);
          }
        }

        this.logger.error(
          `❌ Failed to start screencast for session ${sessionId}:`,
          error,
        );
        throw error;
      }

      // Handle screencast frames with enhanced error recovery
      session.client.on("Page.screencastFrame", async (params) => {
        try {
          this.logger.debug(
            `📹 Received screencast frame for session ${sessionId}, size: ${params.data.length} chars`,
          );

          // Acknowledge the frame
          await session.client.send("Page.screencastFrameAck", {
            sessionId: params.sessionId,
          });

          // Send frame to callback
          if (session.streamCallback && session.streaming) {
            this.logger.debug(
              `📹 Calling streamCallback for session ${sessionId}`,
            );
            // The data is already base64 encoded, pass it directly
            session.streamCallback(params.data);
            this.logger.debug(
              `📹 Frame forwarded to callback for session ${sessionId}`,
            );
          } else {
            this.logger.warn(
              `📹 No callback or streaming disabled for session ${sessionId}`,
            );
          }
        } catch (error) {
          // **ENHANCED: Handle CDP errors in screencast frame processing**
          if (
            error.message.includes("Session with given id not found") ||
            error.message.includes("Target closed") ||
            error.message.includes("Session closed")
          ) {
            this.logger.warn(
              `🔄 CDP error in screencast frame for ${sessionId}: ${error.message}`,
            );
            session.lastCdpError = error.message;

            // Trigger recovery in background (don't block frame processing)
            this.recoverCdpSession(sessionId).catch((recoveryError) => {
              this.logger.error(
                `Background CDP recovery failed: ${recoveryError.message}`,
              );
            });
          } else {
            this.logger.error(
              `Error handling screencast frame for session ${sessionId}:`,
              error,
            );
          }
        }
      });

      this.logger.info(`✅ Screencast started for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to start streaming for session ${sessionId}:`,
        error,
      );
      session.streaming = false;
      throw error;
    }
  }

  async stopStreaming(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.streaming) {
      return;
    }

    try {
      this.logger.info(`🛑 Stopping screencast for session: ${sessionId}`);

      await session.client.send("Page.stopScreencast");
      session.streaming = false;
      session.streamCallback = null;

      this.logger.info(`✅ Screencast stopped for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to stop streaming for session ${sessionId}:`,
        error,
      );
    }
  }

  async navigate(sessionId, url) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      this.logger.info(`🌐 Navigating session ${sessionId} to: ${url}`);

      // Ensure URL has protocol
      if (!url.match(/^https?:\/\//)) {
        url = `https://${url}`;
      }

      await session.page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      session.lastActivity = new Date();
      this.logger.info(`✅ Navigation completed for session ${sessionId}`);
    } catch (error) {
      if (
        error.message.includes("Session closed") ||
        error.message.includes("Target closed") ||
        error.message.includes("Protocol error") ||
        error.message.includes("WebSocket connection closed") ||
        error.message.includes("ConnectionClosedError")
      ) {
        this.logger.warn(
          `Session ${sessionId} closed/disconnected during navigation: ${error.message}`,
        );
        throw new Error("Session closed or disconnected during navigation");
      }
      this.logger.error(
        `❌ Navigation failed for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  async handleMouseEvent(sessionId, event) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Session exists in SessionManager but streaming hasn't started yet (no browser created)
      // This is normal when user creates session but hasn't submitted a task yet
      this.logger.warn(
        `Mouse event for session ${sessionId} - streaming not started yet (waiting for task execution)`,
      );
      return {
        success: false,
        message: "Streaming not started - submit a task first",
      };
    }

    // Check if session is still valid and page is open
    if (!session.page || session.page.isClosed()) {
      this.logger.warn(
        `Mouse event for session ${sessionId} - page is closed or invalid`,
      );
      return {
        success: false,
        message: "Browser page is closed - please refresh the session",
      };
    }

    try {
      const { type, x, y, button = "left", deltaX, deltaY } = event;
      session.lastActivity = new Date();

      // Ensure mouseButtonState exists
      if (!session.mouseButtonState) {
        session.mouseButtonState = new Set();
      }

      switch (type) {
        case "click":
          // For click events, reset button state first and use click API
          try {
            // Clear any existing button state to prevent conflicts
            session.mouseButtonState.clear();
            await session.page.mouse.click(x, y, { button });
            this.logger.debug(
              `✅ Click executed successfully at (${x}, ${y}) with button ${button}`,
            );
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed") ||
              error.message.includes("Protocol error") ||
              error.message.includes("WebSocket connection closed") ||
              error.message.includes("ConnectionClosedError")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during click event: ${error.message}`,
              );
              return { success: false, message: "Session closed" };
            }
            // If click fails due to button state, try to reset and retry
            if (
              error.message.includes("already pressed") ||
              error.message.includes("is not pressed")
            ) {
              this.logger.warn(
                `Button ${button} state issue (${error.message}) - resetting state and retrying click`,
              );
              try {
                // Try to release all buttons first
                await session.page.mouse.up({ button: "left" });
                await session.page.mouse.up({ button: "right" });
                await session.page.mouse.up({ button: "middle" });
              } catch (resetError) {
                // Ignore reset errors
              }
              session.mouseButtonState.clear();
              // Small delay before retry
              await new Promise((resolve) => setTimeout(resolve, 100));
              // Retry the click
              await session.page.mouse.click(x, y, { button });
              this.logger.info(
                `✅ Click retry successful after state reset at (${x}, ${y}) with button ${button}`,
              );
            } else {
              throw error;
            }
          }
          break;
        case "mousedown":
          // Only press if not already pressed
          if (!session.mouseButtonState.has(button)) {
            try {
              await session.page.mouse.down({ button });
              session.mouseButtonState.add(button);
              this.logger.debug(
                `✅ Mouse down executed at (${x}, ${y}) with button ${button}`,
              );
            } catch (error) {
              if (
                error.message.includes("Session closed") ||
                error.message.includes("Target closed") ||
                error.message.includes("Protocol error") ||
                error.message.includes("WebSocket connection closed") ||
                error.message.includes("ConnectionClosedError")
              ) {
                this.logger.warn(
                  `Session ${sessionId} closed/disconnected during mousedown event: ${error.message}`,
                );
                return {
                  success: false,
                  message: "Session closed or disconnected",
                };
              }
              // If already pressed, try to reset state
              if (error.message.includes("already pressed")) {
                this.logger.warn(
                  `Button ${button} already pressed - updating state tracking`,
                );
                session.mouseButtonState.add(button);
              } else {
                throw error;
              }
            }
          } else {
            this.logger.debug(
              `Mouse button ${button} already tracked as pressed, skipping mousedown`,
            );
          }
          break;
        case "mouseup":
          // Enhanced mouseup handling with state recovery
          try {
            await session.page.mouse.up({ button });
            session.mouseButtonState.delete(button);
            this.logger.debug(
              `✅ Mouse up executed at (${x}, ${y}) with button ${button}`,
            );
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during mouseup event`,
              );
              return { success: false, message: "Session closed" };
            }
            // If button wasn't pressed, just remove from tracking
            if (
              error.message.includes("not pressed") ||
              error.message.includes("is not pressed")
            ) {
              this.logger.debug(
                `Button ${button} was not pressed, removing from tracking`,
              );
              session.mouseButtonState.delete(button);
              // Don't throw error for this case - it's recoverable
            } else {
              this.logger.error(
                `Mouseup error for ${button}: ${error.message}`,
              );
              // For other errors, clear the button state and continue
              session.mouseButtonState.delete(button);
            }
          }
          break;
        case "mousemove":
          try {
            await session.page.mouse.move(x, y);
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during mousemove event`,
              );
              return { success: false, message: "Session closed" };
            }
            throw error;
          }
          break;
        case "scroll":
          try {
            await session.page.mouse.wheel({
              deltaX: deltaX || 0,
              deltaY: deltaY || 0,
            });
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during scroll event`,
              );
              return { success: false, message: "Session closed" };
            }
            throw error;
          }
          break;
        default:
          this.logger.warn(`Unknown mouse event type: ${type}`);
      }

      // this.logger.debug(
      //   // `Mouse event processed: ${type} at (${x}, ${y}) for session ${sessionId}`,
      // );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `❌ Mouse event failed for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  async handleKeyboardEvent(sessionId, event) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      // Session exists in SessionManager but streaming hasn't started yet (no browser created)
      // This is normal when user creates session but hasn't submitted a task yet
      this.logger.warn(
        `Keyboard event for session ${sessionId} - streaming not started yet (waiting for task execution)`,
      );
      return {
        success: false,
        message: "Streaming not started - submit a task first",
      };
    }

    // Check if session is still valid and page is open
    if (!session.page || session.page.isClosed()) {
      this.logger.warn(
        `Keyboard event for session ${sessionId} - page is closed or invalid`,
      );
      return {
        success: false,
        message: "Browser page is closed - please refresh the session",
      };
    }

    try {
      const { type, key, text } = event;
      session.lastActivity = new Date();

      switch (type) {
        case "keydown":
          try {
            await session.page.keyboard.down(key);
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed") ||
              error.message.includes("Protocol error") ||
              error.message.includes("WebSocket connection closed") ||
              error.message.includes("ConnectionClosedError")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed/disconnected during keydown event: ${error.message}`,
              );
              return {
                success: false,
                message: "Session closed or disconnected",
              };
            }
            throw error;
          }
          break;
        case "keyup":
          try {
            await session.page.keyboard.up(key);
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed") ||
              error.message.includes("Protocol error") ||
              error.message.includes("WebSocket connection closed") ||
              error.message.includes("ConnectionClosedError")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed/disconnected during keyup event: ${error.message}`,
              );
              return {
                success: false,
                message: "Session closed or disconnected",
              };
            }
            throw error;
          }
          break;
        case "type":
          try {
            await session.page.keyboard.type(text);
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed") ||
              error.message.includes("Protocol error") ||
              error.message.includes("WebSocket connection closed") ||
              error.message.includes("ConnectionClosedError")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed/disconnected during type event: ${error.message}`,
              );
              return {
                success: false,
                message: "Session closed or disconnected",
              };
            }
            throw error;
          }
          break;
        case "press":
          try {
            await session.page.keyboard.press(key);
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed") ||
              error.message.includes("Protocol error") ||
              error.message.includes("WebSocket connection closed") ||
              error.message.includes("ConnectionClosedError")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed/disconnected during press event: ${error.message}`,
              );
              return {
                success: false,
                message: "Session closed or disconnected",
              };
            }
            throw error;
          }
          break;
        default:
          this.logger.warn(`Unknown keyboard event type: ${type}`);
      }

      this.logger.debug(
        `Keyboard event processed: ${type} (${key || text}) for session ${sessionId}`,
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `❌ Keyboard event failed for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  async getScreenshot(sessionId, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const screenshot = await session.page.screenshot({
        type: "png",
        fullPage: options.fullPage || false,
        quality: options.quality || 95, // Increased default quality from 80 to 95
        ...options,
      });

      session.lastActivity = new Date();
      return screenshot;
    } catch (error) {
      this.logger.error(
        `❌ Screenshot failed for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  async closeBrowser(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      this.logger.info(`🗑️ Closing browser for session: ${sessionId}`);

      if (session.streaming) {
        await this.stopStreaming(sessionId);
      }

      // Clean up tab activity monitor
      if (session.tabActivityMonitor) {
        clearTimeout(session.tabActivityMonitor);
        session.tabActivityMonitor = null;
      }

      // Reset mouse state
      if (session.mouseButtonState) {
        session.mouseButtonState.clear();
      }

      // Check if browser is still connected before closing
      if (session.browser && session.browser.connected) {
        await session.browser.close();
      }

      this.sessions.delete(sessionId);

      // Clean up stealth fingerprint
      this.stealthService.cleanupSession(sessionId);

      this.logger.info(`✅ Browser closed for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to close browser for session ${sessionId}:`,
        error,
      );
      this.sessions.delete(sessionId); // Remove anyway
    }
  }

  // New method to reset mouse state for a specific session
  async resetMouseState(sessionId) {
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        return { success: false, message: "Session not found" };
      }

      this.logger.info(`🖱️ Resetting mouse state for session ${sessionId}`);

      // Clear tracked button state
      if (session.mouseButtonState) {
        session.mouseButtonState.clear();
      } else {
        session.mouseButtonState = new Set();
      }

      // Force release all mouse buttons to clear any stuck state
      try {
        await session.page.mouse.up({ button: "left" });
        await session.page.mouse.up({ button: "right" });
        await session.page.mouse.up({ button: "middle" });
        this.logger.info(
          `✅ Mouse state reset successfully for session ${sessionId}`,
        );
        return { success: true, message: "Mouse state reset successfully" };
      } catch (error) {
        this.logger.debug(
          `Mouse reset attempted for session ${sessionId}: ${error.message}`,
        );
        return { success: true, message: "Mouse reset attempted" };
      }
    } catch (error) {
      this.logger.error(
        `Failed to reset mouse state for session ${sessionId}:`,
        error,
      );
      return { success: false, message: error.message };
    }
  }

  // New method to check and cleanup invalid sessions
  async cleanupInvalidSessions() {
    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && (session.page.isClosed() || !session.browser.connected)) {
        this.logger.info(`🧹 Cleaning up invalid session: ${sessionId}`);
        await this.closeBrowser(sessionId);
      }
    }
  }

  async cleanup() {
    this.logger.info("🧹 Cleaning up Browser Streaming Service...");

    const cleanupPromises = Array.from(this.sessions.keys()).map((sessionId) =>
      this.closeBrowser(sessionId),
    );

    await Promise.allSettled(cleanupPromises);
    this.sessions.clear();

    this.logger.info("✅ Browser Streaming Service cleaned up");
  }

  // Get health status including mouse states
  isHealthy() {
    try {
      return {
        initialized: this.isInitialized,
        sessionCount: this.sessions.size,
        mouseStatesActive: Array.from(this.sessions.values()).filter(
          (session) =>
            session.mouseButtonState && session.mouseButtonState.size > 0,
        ).length,
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  getActiveSessions() {
    return Array.from(this.sessions.keys());
  }

  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      streaming: session.streaming,
      viewport: session.viewport,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    };
  }

  // Video streaming functionality - Using CDP Screencast for single page streaming
  async startVideoStreaming(sessionId, io, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.streaming) {
      this.logger.warn(
        `⚠️ Session ${sessionId} already streaming - restarting streaming`,
      );
      // Force restart streaming by stopping first
      await this.stopStreaming(sessionId);
      session.streaming = false;
      session.streamCallback = null;
    }

    try {
      this.logger.info(
        `🎬 Starting CDP screencast for single page streaming - session ${sessionId}`,
      );
      session.streaming = true;
      session.streamCallback = (frame) => {
        // Convert binary frame data to base64 for the client
        const base64Frame = frame.toString("base64");
        // Send frame to connected clients via Socket.IO
        // this.logger.debug(`📹 Sending frame to client: ${frame.length} bytes`);
        io.to(sessionId).emit("video-frame", base64Frame);
      };

      // Start CDP screencast for single page streaming
      await this.startStreaming(sessionId, session.streamCallback);

      this.logger.info(
        `✅ CDP screencast started for session ${sessionId} - single page streaming`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Failed to start CDP screencast for session ${sessionId}:`,
        error,
      );
      session.streaming = false;
      throw error;
    }
  }

  // Simple CDP screencast streaming - single page only
  async stopVideoStreaming(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.streaming) {
      return;
    }

    try {
      this.logger.info(`🛑 Stopping CDP screencast for session ${sessionId}`);

      // Stop CDP screencast
      await this.stopStreaming(sessionId);

      session.streaming = false;
      session.streamCallback = null;

      this.logger.info(`✅ CDP screencast stopped for session ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to stop CDP screencast for session ${sessionId}:`,
        error,
      );
      // Force stop anyway
      session.streaming = false;
      session.streamCallback = null;
    }
  }

  // Method to check if video streaming is active
  isVideoStreaming(sessionId) {
    const session = this.sessions.get(sessionId);
    return session && session.streaming;
  }

  // 🚫 PROTECT BROWSER: Recreate page if it gets closed/crashed
  async recreatePage(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        this.logger.error(
          `❌ Session ${sessionId} not found for page recreation`,
        );
        return false;
      }

      this.logger.info(
        `🔄 Recreating browser page for session ${sessionId}...`,
      );

      // Close existing page if it exists
      if (session.page) {
        try {
          await session.page.close();
        } catch (error) {
          this.logger.warn(`⚠️ Error closing old page: ${error.message}`);
        }
      }

      // Create new page
      const newPage = await session.browser.newPage();

      // Configure the new page with consistent viewport
      await newPage.setViewport({
        width: parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) || 1920,
        height: parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) || 1080,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      });

      await newPage.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      // Set extra headers
      await newPage.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      });

      // Update session with new page
      session.page = newPage;

      // Re-protect the new page
      newPage.on("close", async () => {
        this.logger.warn(
          `🚫 Browser close attempt blocked for session ${sessionId}`,
        );
        await this.recreatePage(sessionId);
      });

      newPage.on("crash", async () => {
        this.logger.warn(`🚫 Browser crash detected for session ${sessionId}`);
        await this.recreatePage(sessionId);
      });

      newPage.on("disconnected", async () => {
        this.logger.warn(`🚫 Browser disconnected for session ${sessionId}`);
        await this.recreatePage(sessionId);
      });

      this.logger.info(
        `✅ Browser page recreated successfully for session ${sessionId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Failed to recreate browser page for session ${sessionId}:`,
        error,
      );
      return false;
    }
  }

  // ===== TAB MANAGEMENT METHODS =====

  /**
   * Set up tab management for a browser session
   * Monitors new tabs, switches streaming to active tab
   */
  async setupTabManagement(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      this.logger.info(`🗂️ Setting up tab management for session ${sessionId}`);

      // Register initial tab
      const targetId = session.page.target()._targetId;
      let initialTitle = "New Tab";
      try {
        initialTitle = (await session.page.title()) || "New Tab";
      } catch (titleError) {
        this.logger.debug(
          `Failed to get initial page title: ${titleError.message}`,
        );
      }

      session.tabs.set(targetId, {
        page: session.page,
        title: initialTitle,
        url: session.page.url(),
        isActive: true,
        createdAt: new Date(),
      });
      session.activeTabId = targetId;

      // Listen for new tabs/targets
      session.browser.on("targetcreated", async (target) => {
        if (target.type() === "page") {
          this.logger.info(
            `🆕 New tab created in session ${sessionId}: ${target.url()}`,
          );

          try {
            const newPage = await target.page();
            if (newPage) {
              const newTargetId = target._targetId;

              // 🔧 IMPORTANT: Set viewport for new tabs to match our configuration
              try {
                await newPage.setViewport({
                  width:
                    parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) ||
                    1920,
                  height:
                    parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) ||
                    1080,
                  deviceScaleFactor: 1,
                  isMobile: false,
                  hasTouch: false,
                });
                this.logger.debug(
                  `🖥️ Viewport set for new tab ${newTargetId}: ${parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) || 1920}x${parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) || 1080}`,
                );

                // 🔧 Apply comprehensive viewport enforcement for new tab
                await this.setupViewportEnforcement(newPage, session);
                this.logger.debug(
                  `🔧 Comprehensive viewport enforcement applied to new tab ${newTargetId}`,
                );
              } catch (viewportError) {
                this.logger.warn(
                  `⚠️ Failed to set viewport for new tab: ${viewportError.message}`,
                );
              }

              // Add to tabs registry
              let newTabTitle = "New Tab";
              try {
                newTabTitle = (await newPage.title()) || "New Tab";
              } catch (titleError) {
                this.logger.debug(
                  `Failed to get new tab title: ${titleError.message}`,
                );
              }

              session.tabs.set(newTargetId, {
                page: newPage,
                title: newTabTitle,
                url: newPage.url(),
                isActive: false,
                createdAt: new Date(),
                lastActiveAt: new Date(),
              });

              // IMMEDIATELY check if this is a real URL and switch to it
              const initialUrl = newPage.url();
              if (
                initialUrl &&
                initialUrl !== "about:blank" &&
                !initialUrl.startsWith("chrome-extension://") &&
                !initialUrl.startsWith("chrome://")
              ) {
                this.logger.info(
                  `🚀 IMMEDIATE switch to new tab with content ${newTargetId}: ${initialUrl}`,
                );
                await this.switchToTab(sessionId, newTargetId);
              }

              // Set up navigation listener for this new tab to detect when it becomes active
              newPage.on("framenavigated", async (frame) => {
                if (frame === newPage.mainFrame()) {
                  const currentUrl = newPage.url();
                  // Auto-switch to tabs that navigate to real URLs (not about:blank or chrome extensions)
                  if (
                    currentUrl &&
                    currentUrl !== "about:blank" &&
                    !currentUrl.startsWith("chrome-extension://") &&
                    !currentUrl.startsWith("chrome://")
                  ) {
                    // Update last active time
                    const tabInfo = session.tabs.get(newTargetId);
                    if (tabInfo) {
                      tabInfo.lastActiveAt = new Date();
                    }

                    this.logger.info(
                      `🔄 FORCE switch to navigated tab ${newTargetId}: ${currentUrl}`,
                    );
                    await this.switchToTab(sessionId, newTargetId);
                  }
                }
              });

              // Monitor when this tab is brought to front (indicating it's being used by automation)
              newPage.on("load", async () => {
                try {
                  // Check if this page is currently in front (active)
                  const browserContext = newPage.browser();
                  const allPages = await browserContext.pages();

                  // Find the most recently active page
                  for (const page of allPages) {
                    if (page === newPage && page.url() !== "about:blank") {
                      this.logger.info(
                        `🎯 Page loaded and potentially active: ${newTargetId} - ${page.url()}`,
                      );
                      // Switch streaming to this tab as it's likely being used
                      setTimeout(
                        () => this.switchToTab(sessionId, newTargetId),
                        100,
                      );
                      break;
                    }
                  }
                } catch (error) {
                  this.logger.error(
                    `Error checking page activity: ${error.message}`,
                  );
                }
              });

              // Track user interactions and focus changes on this tab
              newPage.on("domcontentloaded", async () => {
                try {
                  // Inject automation markers immediately for this page
                  await this.injectAutomationMarkers(newPage);
                } catch (error) {
                  // Ignore evaluation errors
                }
              });

              // Also inject markers immediately for existing pages
              try {
                await this.injectAutomationMarkers(newPage);
              } catch (error) {
                // Ignore evaluation errors
              }

              // Monitor page focus events
              newPage.on("focus", async () => {
                this.logger.info(`🎯 Page focused: ${newTargetId}`);
                const tabInfo = session.tabs.get(newTargetId);
                if (tabInfo) {
                  tabInfo.lastActiveAt = new Date();
                  await this.switchToTab(sessionId, newTargetId);
                }
              });

              // This section is now handled above - removing duplicate

              this.logger.info(
                `📑 Tab registry updated for session ${sessionId}, total tabs: ${session.tabs.size}`,
              );
            }
          } catch (error) {
            this.logger.warn(`Failed to handle new tab: ${error.message}`);
          }
        }
      });

      // Listen for tab changes/updates
      session.browser.on("targetchanged", async (target) => {
        if (target.type() === "page") {
          const targetId = target._targetId;
          const tabInfo = session.tabs.get(targetId);

          if (tabInfo) {
            try {
              // Update tab information
              const oldUrl = tabInfo.url;
              try {
                tabInfo.title = (await tabInfo.page.title()) || "Loading...";
              } catch (titleError) {
                this.logger.debug(
                  `Failed to get tab title: ${titleError.message}`,
                );
                tabInfo.title = "Loading...";
              }
              tabInfo.url = tabInfo.page.url();

              this.logger.debug(
                `📝 Tab updated: ${tabInfo.title} (${tabInfo.url})`,
              );

              // If URL changed significantly, this tab is likely being actively used
              if (
                oldUrl !== tabInfo.url &&
                tabInfo.url !== "about:blank" &&
                !tabInfo.url.startsWith("chrome://") &&
                !tabInfo.url.startsWith("chrome-extension://")
              ) {
                // Update the last active timestamp immediately
                tabInfo.lastActiveAt = new Date();

                // Check if this is a high-priority navigation
                const isHighPriority =
                  tabInfo.url.includes("docs.google.com") ||
                  tabInfo.url.includes("forms.gle") ||
                  tabInfo.url.includes("youtube.com") ||
                  tabInfo.url.includes("github.com") ||
                  (tabInfo.url.includes("google.com") &&
                    tabInfo.url.includes("form"));

                this.logger.info(
                  `🔍 Tab ${targetId} navigated: ${oldUrl} → ${tabInfo.url} - IMMEDIATE SWITCH${isHighPriority ? " (HIGH PRIORITY)" : ""}`,
                );

                // Immediately switch to this tab as it's clearly being used
                await this.switchToTab(sessionId, targetId);
              }

              // Emit tab update to connected clients
              if (session.streamCallback) {
                this.emit("tabsUpdated", {
                  sessionId,
                  tabs: this.getTabsList(sessionId),
                  activeTabId: session.activeTabId,
                });
              }
            } catch (error) {
              this.logger.warn(`Failed to update tab info: ${error.message}`);
            }
          }
        }
      });

      // Listen for tab closures
      session.browser.on("targetdestroyed", (target) => {
        if (target.type() === "page") {
          const targetId = target._targetId;
          this.logger.info(
            `❌ Tab closed in session ${sessionId}: ${targetId}`,
          );

          session.tabs.delete(targetId);

          // If the active tab was closed, switch to another tab
          if (session.activeTabId === targetId) {
            const remainingTabs = Array.from(session.tabs.keys());
            if (remainingTabs.length > 0) {
              this.switchToTab(sessionId, remainingTabs[0]);
            }
          }

          this.logger.info(
            `📑 Tab registry updated for session ${sessionId}, total tabs: ${session.tabs.size}`,
          );
        }
      });

      // Set up optimized active tab detection with adaptive polling
      const scheduleNextDetection = async () => {
        try {
          await this.optimizedBulletproofTabDetection(sessionId);
        } catch (error) {
          // Silently handle tab activity monitor errors
        }

        // Schedule next detection with adaptive interval
        const interval = this.tabDetection.getPollingInterval(sessionId);
        session.tabActivityMonitor = setTimeout(
          scheduleNextDetection,
          interval,
        );
      };

      // Start the adaptive polling
      scheduleNextDetection();

      this.logger.info(
        `✅ Tab management initialized for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to setup tab management: ${error.message}`);
    }
  }

  /**
   * **ENHANCED: Synchronize tab registry with actual browser state**
   * This ensures that the tab registry matches the actual tabs in the browser
   * with improved error handling and timeouts for cloud environments
   */
  async syncTabRegistry(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.browser) return;

    try {
      // Add timeout protection for cloud servers
      const syncTimeout = parseInt(process.env.TAB_SYNC_TIMEOUT) || 30000;

      const syncPromise = this._performTabSync(session, sessionId);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tab sync timeout after ${syncTimeout}ms`)),
          syncTimeout,
        ),
      );

      await Promise.race([syncPromise, timeoutPromise]);
    } catch (error) {
      this.logger.error(`Error syncing tab registry: ${error.message}`);
      // Fallback: minimal sync without page interactions
      await this._fallbackTabSync(session, sessionId);
    }
  }

  /**
   * Perform full tab synchronization
   */
  async _performTabSync(session, sessionId) {
    const pages = await session.browser.pages();
    const currentTabIds = new Set(session.tabs.keys());
    const actualTabIds = new Set();

    // Add/update tabs that exist in browser
    for (const page of pages) {
      try {
        const targetId = page.target()._targetId;
        actualTabIds.add(targetId);

        if (!session.tabs.has(targetId)) {
          // Try to get title/url with timeout and error handling
          let title, url;
          try {
            // Check if page has main frame before getting title
            if (page.mainFrame) {
              try {
                await page.mainFrame();
              } catch (frameError) {
                // Main frame not ready yet, use defaults
                title = "Loading...";
                url = "about:blank";
                this.logger.debug(
                  `Main frame not ready for tab ${targetId}: ${frameError.message}`,
                );
                // Create tab entry with default values and continue
                session.tabs.set(targetId, {
                  page: page,
                  title: title,
                  url: url,
                  isActive: false,
                  createdAt: new Date(),
                  lastActiveAt: new Date(),
                });
                continue;
              }
            }

            const pageInfoPromise = Promise.all([
              page.title().catch(() => "Loading..."),
              Promise.resolve(page.url() || "about:blank"),
            ]);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Page info timeout")), 3000),
            );

            [title, url] = await Promise.race([
              pageInfoPromise,
              timeoutPromise,
            ]);
          } catch (infoError) {
            title = "Loading...";
            url = page.url() || "about:blank";
            this.logger.debug(
              `Failed to get page info for tab ${targetId}: ${infoError.message}`,
            );
          }

          session.tabs.set(targetId, {
            page: page,
            title: title || "New Tab",
            url: url,
            isActive: false,
            createdAt: new Date(),
            lastActiveAt: new Date(),
          });

          this.logger.debug(`📑 Auto-registered tab ${targetId}: ${title}`);
        } else {
          // Update existing tab info (minimal update)
          const tabInfo = session.tabs.get(targetId);
          if (tabInfo) {
            tabInfo.page = page; // Update page reference
            try {
              // Quick update without blocking
              tabInfo.url = page.url();
              // Skip title update if it might block
            } catch (error) {
              // Keep old info if update fails
            }
          }
        }
      } catch (error) {
        // Skip problematic pages
        continue;
      }
    }

    // Remove tabs that no longer exist in browser
    for (const tabId of currentTabIds) {
      if (!actualTabIds.has(tabId)) {
        session.tabs.delete(tabId);
        this.logger.debug(`🗑️ Removed stale tab ${tabId} from registry`);
      }
    }
  }

  /**
   * Fallback tab sync that only updates essential information
   */
  async _fallbackTabSync(session, sessionId) {
    try {
      const pages = await session.browser.pages();

      // Simple fallback: just ensure we have page references
      for (const page of pages) {
        try {
          const targetId = page.target()._targetId;
          if (!session.tabs.has(targetId)) {
            session.tabs.set(targetId, {
              page: page,
              title: "Tab",
              url: page.url() || "about:blank",
              isActive: false,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            });
          } else {
            // Just update page reference
            const tabInfo = session.tabs.get(targetId);
            if (tabInfo) {
              tabInfo.page = page;
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      this.logger.debug(`Fallback tab sync failed: ${error.message}`);
    }
  }

  /**
   * Bulletproof tab detection using browser.targets() - scans all tabs directly
   */
  async bulletproofTabDetection(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.browser) return;

    // Skip automatic switching if manual override is active
    if (session.manualOverride && Date.now() - session.manualOverride < 3000) {
      const remainingTime = 3000 - (Date.now() - session.manualOverride);
      // this.logger.debug(
      //   `🎛️ Manual override active (${remainingTime}ms remaining), skipping automatic tab switching for session ${sessionId}`,
      // );
      return;
    } else if (session.manualOverride) {
      // Manual override expired - clear it
      delete session.manualOverride;
    }

    try {
      // **ENHANCED: Sync tab registry first to prevent ID mismatches**
      await this.syncTabRegistry(sessionId);

      // Get ALL targets from browser directly
      const allTargets = await session.browser.targets();
      const pageTargets = allTargets.filter(
        (target) => target.type() === "page",
      );

      let bestTarget = null;
      let bestScore = 0;
      let bestUrl = "";

      // First, sync our tabs registry with actual browser targets
      const currentTargetIds = new Set();

      for (const target of pageTargets) {
        try {
          const page = await target.page();
          if (!page) continue;

          const targetId = target._targetId;
          const url = page.url();
          let title = "Loading...";
          try {
            title = await page.title();
          } catch (titleError) {
            this.logger.debug(
              `Failed to get page title for target ${targetId}: ${titleError.message}`,
            );
          }

          // Track this target
          currentTargetIds.add(targetId);

          // Update/add to registry if missing
          if (!session.tabs.has(targetId)) {
            session.tabs.set(targetId, {
              page: page,
              title: title,
              url: url,
              isActive: false,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            });
            this.logger.info(
              `📝 SYNC: Added tab to registry: ${targetId} - ${title}`,
            );
          } else {
            // Update existing tab info
            const tabInfo = session.tabs.get(targetId);
            const urlChanged = tabInfo.url !== url;
            tabInfo.title = title;
            tabInfo.url = url;
            tabInfo.page = page;

            // If URL changed, update the last active time (this tab is being used)
            if (urlChanged && url !== "about:blank") {
              tabInfo.lastActiveAt = new Date();
            }
          }

          // Skip empty/system pages for scoring
          if (
            !url ||
            url === "about:blank" ||
            url.startsWith("chrome://") ||
            url.startsWith("chrome-extension://")
          ) {
            continue;
          }

          // Priority scoring
          let score = 100; // Base score

          // **ENHANCED: Detect active browser-use automation first (HIGHEST PRIORITY)**
          try {
            const automationActivity = await page.evaluate(() => {
              // Check for browser-use automation markers
              const hasAutomationMarker =
                window.browserUseActive ||
                window.automationInProgress ||
                document.querySelector("[data-browser-use]") ||
                document.querySelector("[automation-target]");

              // Check for recent DOM changes (automation often modifies DOM)
              const recentDomChanges = window.lastDomModification
                ? Date.now() - window.lastDomModification < 5000
                : false;

              // Check for recent click/input events
              const recentInteraction = window.lastInteractionTime
                ? Date.now() - window.lastInteractionTime < 10000
                : false;

              // Check for automation-specific classes or attributes
              const hasAutomationClasses =
                document.querySelector(
                  '.browser-use-target, .automation-highlight, [data-testid], [aria-label*="submit"], [type="submit"]',
                ) !== null;

              // Check for loading states that indicate form submission or navigation
              const isProcessing =
                document.querySelector(
                  '.loading, .spinner, [data-loading="true"], .btn-loading',
                ) !== null || document.readyState === "loading";

              // Check for active form interactions
              const hasActiveForm = document.querySelector("form") !== null;
              const hasFormInputs =
                document.querySelector("input, select, textarea") !== null;

              return {
                hasAutomationMarker,
                recentDomChanges,
                recentInteraction,
                hasAutomationClasses,
                isProcessing,
                hasActiveForm,
                hasFormInputs,
                lastActivity: window.lastInteractionTime || 0,
              };
            });

            // **AUTOMATION ACTIVITY BONUS - This fixes the tab detection issue**
            if (automationActivity.hasAutomationMarker) score += 5000; // Highest priority for automation markers
            if (automationActivity.recentDomChanges) score += 4000; // Very recent automation changes
            if (automationActivity.recentInteraction) score += 3500; // Recent clicks/inputs (this should catch RedBus automation)
            if (automationActivity.isProcessing) score += 3000; // Active form/navigation processing
            if (automationActivity.hasAutomationClasses) score += 2500; // Automation CSS markers
            if (automationActivity.hasActiveForm) score += 2000; // Page has forms (booking sites)
            if (automationActivity.hasFormInputs) score += 1500; // Page has input fields

            // Time-based activity scoring (most important for detecting active automation)
            const timeSinceActivity =
              Date.now() - automationActivity.lastActivity;
            if (timeSinceActivity < 2000)
              score += 4500; // Very recent (2 seconds) - likely active automation
            else if (timeSinceActivity < 5000)
              score += 3500; // Recent (5 seconds)
            else if (timeSinceActivity < 15000)
              score += 2000; // Somewhat recent (15 seconds)
            else if (timeSinceActivity < 30000) score += 1000; // Still relevant (30 seconds)

            // Log automation detection for debugging (with rate limiting)
            if (score > 2000) {
              const logKey = `${targetId}_automation_log`;
              const lastLog = this.lastAutomationLogs?.get(logKey);
              const now = Date.now();

              // Only log if it's the first time or been 5 seconds since last log
              if (!this.lastAutomationLogs) {
                this.lastAutomationLogs = new Map();
              }

              if (!lastLog || now - lastLog > 5000) {
                this.logger.info(
                  `🤖 AUTOMATION DETECTED in tab: ${title} (${url})`,
                  {
                    automationScore: score - 100, // Subtract base score
                    markers: automationActivity.hasAutomationMarker,
                    recentChanges: automationActivity.recentDomChanges,
                    recentInteraction: automationActivity.recentInteraction,
                    isProcessing: automationActivity.isProcessing,
                    timeSinceActivity: timeSinceActivity,
                  },
                );
                this.lastAutomationLogs.set(logKey, now);
              }
            }
          } catch (e) {
            // Ignore evaluation errors but log them for debugging
            if (
              e.message.includes("Execution context") ||
              e.message.includes("Target closed")
            ) {
              // Normal browser state errors - ignore silently
            } else {
              this.logger.debug(`Tab evaluation error for ${url}:`, e.message);
            }
          }

          // HIGHEST priority for YouTube and GitHub (but still lower than automation)
          if (url.includes("youtube.com")) score += 2000;
          if (url.includes("github.com")) score += 2000;

          // HIGH priority for Google services
          if (url.includes("docs.google.com")) score += 1800; // Google Docs/Forms/Sheets
          if (url.includes("forms.gle") || url.includes("form")) score += 1800; // Google Forms short URLs
          if (url.includes("google.com") && url.includes("search"))
            score += 800;

          // Bonus for search results pages
          if (url.includes("/results") || url.includes("/search")) score += 500;

          // CRITICAL: Aggressive bonus for specific target URLs mentioned in tasks
          if (this.isTargetUrl(url)) score += 3000; // Highest priority for exact target URLs

          // Bonus for recently navigated pages (enhanced with automation detection)
          const tabInfo = session.tabs.get(targetId);
          if (tabInfo && tabInfo.lastActiveAt) {
            const timeSinceUpdate = Date.now() - tabInfo.lastActiveAt.getTime();
            if (timeSinceUpdate < 5000)
              score += 2000; // Very recent activity (within 5 seconds)
            else if (timeSinceUpdate < 15000)
              score += 1000; // Recent activity
            else if (timeSinceUpdate < 30000) score += 500; // Moderately recent
          }

          // Force switch for forms and interactive pages (booking sites like RedBus)
          if (this.isInteractivePage(url)) score += 1500;

          // Debug scoring for important sites
          if (
            url.includes("docs.google.com") ||
            url.includes("forms.gle") ||
            url.includes("form")
          ) {
            this.logger.info(
              `🎯 GOOGLE FORMS detected: ${title} (${url}) - Score: ${score}`,
            );
          }

          // this.logger.debug(
          //   `🎯 Target scan: ${title} (${url}) - Score: ${score}`,
          // );

          if (score > bestScore) {
            bestScore = score;
            bestTarget = target;
            bestUrl = url;
          }
        } catch (error) {
          continue;
        }
      }

      // Remove tabs that no longer exist in the browser
      for (const [tabId] of session.tabs) {
        if (!currentTargetIds.has(tabId)) {
          session.tabs.delete(tabId);
          this.logger.info(
            `🗑️ SYNC: Removed closed tab from registry: ${tabId}`,
          );
        }
      }

      // Switch to best target if found and different from current
      if (bestTarget) {
        const targetId = bestTarget._targetId;

        if (targetId !== session.activeTabId) {
          // Check if this is a high-priority navigation that should switch immediately
          const isHighPriority = bestScore >= 1800; // Google Docs/Forms, YouTube, GitHub
          const shouldForceSwitch = isHighPriority && bestScore > 1000;

          if (shouldForceSwitch) {
            this.logger.info(
              `🚀 HIGH PRIORITY SWITCH: ${session.activeTabId} → ${targetId} (${bestUrl}) Score: ${bestScore}`,
            );
          }

          await this.switchToTab(sessionId, targetId, false); // isManual = false for automatic switches
        }
      }
    } catch (error) {
      this.logger.error(`Error in bulletproof tab detection: ${error.message}`);
    }
  }

  /**
   * Optimized bulletproof tab detection with smart caching and adaptive polling
   */
  async optimizedBulletproofTabDetection(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.browser) return;

    // Skip automatic switching if manual override is active
    if (session.manualOverride && Date.now() - session.manualOverride < 3000) {
      return;
    } else if (session.manualOverride) {
      delete session.manualOverride;
    }

    try {
      // **ENHANCED: Sync tab registry with browser state first**
      await this.syncTabRegistry(sessionId);

      // Use optimized detection service
      const result = await this.tabDetection.optimizedBulletproofDetection(
        session,
        sessionId,
      );

      if (result && result.page) {
        const targetId = result.page.target()._targetId;
        const currentUrl = result.page.url();

        // **ENHANCED: Ensure the tab is in the registry before switching**
        if (!session.tabs.has(targetId)) {
          try {
            let title = "New Tab";
            try {
              title = await result.page.title();
            } catch (titleError) {
              this.logger.debug(
                `Failed to get page title for new tab: ${titleError.message}`,
              );
            }
            session.tabs.set(targetId, {
              page: result.page,
              title: title || "New Tab",
              url: currentUrl,
              isActive: false,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            });
            this.logger.debug(`📑 Added tab ${targetId} to registry: ${title}`);
          } catch (error) {
            this.logger.warn(
              `⚠️ Could not add tab ${targetId} to registry: ${error.message}`,
            );
            return; // Skip switching if we can't register the tab
          }
        }

        // Switch to best tab if different from current
        if (targetId !== session.activeTabId) {
          const isHighPriority =
            result.confidence === "HIGH" || result.score >= 4000;

          if (isHighPriority) {
            this.logger.info(
              `🚀 OPTIMIZED SWITCH: ${session.activeTabId} → ${targetId} (${currentUrl}) Score: ${result.score} Method: ${result.method}`,
            );
          }

          await this.switchToTab(sessionId, targetId, false);
        }
      }
    } catch (error) {
      this.logger.error(`Error in optimized tab detection: ${error.message}`);
      // Fallback to original method if optimized fails
      await this.bulletproofTabDetection(sessionId);
    }
  }

  /**
   * Detect which tab is currently active based on recent activity and navigation
   */
  async detectActiveTab(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.tabs) return;

    try {
      let bestTab = null;
      let bestScore = -1;
      let mostRecentNavigationTab = null;
      let mostRecentNavigationTime = 0;

      // First pass: Find the most recently navigated tab
      for (const [tabId, tabInfo] of session.tabs) {
        try {
          if (!tabInfo.page || tabInfo.page.isClosed()) continue;

          const url = tabInfo.page.url();

          // Skip empty/system pages
          if (
            !url ||
            url === "about:blank" ||
            url.startsWith("chrome://") ||
            url.startsWith("chrome-extension://")
          ) {
            continue;
          }

          // Check for recent navigation/updates
          const lastUpdate = tabInfo.lastActiveAt
            ? tabInfo.lastActiveAt.getTime()
            : tabInfo.createdAt.getTime();

          if (lastUpdate > mostRecentNavigationTime) {
            mostRecentNavigationTime = lastUpdate;
            mostRecentNavigationTab = tabId;
          }

          // Priority-based scoring system
          let score = 0;

          // Base score for having real content
          score += 100;

          // High priority for target sites
          if (url.includes("youtube.com")) score += 1000;
          if (url.includes("github.com")) score += 1000;
          if (url.includes("docs.google.com")) score += 900; // Google Docs/Forms/Sheets
          if (url.includes("forms.gle") || url.includes("form")) score += 900; // Google Forms
          if (url.includes("google.com") && url.includes("search"))
            score += 500;

          // Bonus for recent activity
          const timeSinceActivity = Date.now() - lastUpdate;
          if (timeSinceActivity < 5000)
            score += 800; // Last 5 seconds
          else if (timeSinceActivity < 15000)
            score += 400; // Last 15 seconds
          else if (timeSinceActivity < 60000) score += 200; // Last minute

          // Penalty for being the current streaming tab (encourages switching)
          if (tabId === session.activeTabId) score -= 50;

          // Strong bonus if this tab is different from current and has real activity
          if (tabId !== session.activeTabId && timeSinceActivity < 10000) {
            score += 1500;
          }

          this.logger.debug(`Tab ${tabId}: ${url} - Score: ${score}`);

          if (score > bestScore) {
            bestScore = score;
            bestTab = tabId;
          }
        } catch (error) {
          continue;
        }
      }

      // Force switch to most recently navigated tab if it's significantly different
      const timeSinceLastNavigation = Date.now() - mostRecentNavigationTime;
      if (
        mostRecentNavigationTab &&
        mostRecentNavigationTab !== session.activeTabId &&
        timeSinceLastNavigation < 3000
      ) {
        // Last 3 seconds
        this.logger.info(
          `🚀 FORCE switching to recently navigated tab: ${session.activeTabId} → ${mostRecentNavigationTab}`,
        );
        await this.switchToTab(sessionId, mostRecentNavigationTab);
        return;
      }

      // Otherwise switch to best scoring tab
      if (bestTab && bestTab !== session.activeTabId && bestScore > 200) {
        this.logger.info(
          `🎯 Smart switching to best tab: ${session.activeTabId} → ${bestTab} (score: ${bestScore})`,
        );
        await this.switchToTab(sessionId, bestTab);
      }
    } catch (error) {
      this.logger.error(`Error detecting active tab: ${error.message}`);
    }
  }

  /**
   * Switch streaming to a specific tab
   */
  async switchToTab(sessionId, targetId, isManual = false) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.error(
        `❌ SWITCH TO TAB FAILED: Session ${sessionId} not found`,
      );
      return false;
    }

    try {
      // **NEW: Check for activity lock before switching (unless manual)**
      if (!isManual && this.tabDetection) {
        const activityLock = this.tabDetection.hasActivityLock(sessionId);
        if (activityLock && activityLock.tabId !== targetId) {
          // this.logger.info(`🔒 Activity lock prevents switch from ${activityLock.tabId.substring(0, 8)}... to ${targetId.substring(0, 8)}... (${activityLock.reason})`);
          return false;
        }
      }

      // Set manual override if this is a manual switch
      if (isManual) {
        session.manualOverride = Date.now();
        // **NEW: Clear any existing activity lock for manual switches**
        if (this.tabDetection) {
          this.tabDetection.clearActivityLock(sessionId);
        }
        // this.logger.info(
        //   `🎛️ [MANUAL SWITCH] User manually switching to tab ${targetId}, setting 3-second override`,
        // );
      }

      // this.logger.info(
      //   `🔄 [TAB SWITCH DEBUG] Starting tab switch to ${targetId} in session ${sessionId}`,
      // );
      // this.logger.info(
      //   `🔄 [TAB SWITCH DEBUG] Current active tab: ${session.activeTabId}`,
      // );
      // this.logger.info(
      //   `🔄 [TAB SWITCH DEBUG] Available tabs: ${Array.from(session.tabs.keys()).join(", ")}`,
      // );

      // **ENHANCED: Try to add tab to registry if not found**
      let tabInfo = session.tabs.get(targetId);
      if (!tabInfo) {
        try {
          const targets = await session.browser.targets();
          const target = targets.find((t) => t._targetId === targetId);
          if (target && target.type() === "page") {
            const page = await target.page();
            let title = "New Tab";
            try {
              title = (await page.title()) || "New Tab";
            } catch (titleError) {
              this.logger.debug(
                `Failed to get page title for tab recovery: ${titleError.message}`,
              );
            }
            tabInfo = {
              page: page,
              title: title,
              url: page.url(),
              isActive: false,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            };
            session.tabs.set(targetId, tabInfo);
            this.logger.info(
              `📝 Auto-registered missing tab ${targetId}: ${tabInfo.title}`,
            );
          }
        } catch (error) {
          this.logger.warn(`Failed to auto-register tab: ${error.message}`);
        }
      }

      if (!tabInfo) {
        this.logger.warn(
          `❌ Tab ${targetId} not found in session ${sessionId}`,
        );
        this.logger.warn(
          `Available tab IDs: ${Array.from(session.tabs.keys()).join(", ")}`,
        );
        return false;
      }

      // ALWAYS switch - bulletproof switching
      this.logger.info(
        `🔄 SWITCHING: ${session.activeTabId || "none"} → ${targetId} in session ${sessionId}: ${tabInfo.title}`,
      );

      // Mark all tabs as inactive
      session.tabs.forEach((tab) => {
        tab.isActive = false;
      });

      // Mark target tab as active
      tabInfo.isActive = true;
      session.activeTabId = targetId;
      session.lastTabSwitchTime = new Date();

      // Switch the primary page reference
      session.page = tabInfo.page;

      // this.logger.info(
      //   `🔄 [TAB SWITCH DEBUG] About to bring tab ${targetId} to front`,
      // );

      // Bring the tab to front
      await tabInfo.page.bringToFront();

      // this.logger.info(
      //   `🔄 [TAB SWITCH DEBUG] Tab brought to front successfully`,
      // );

      // If streaming is active, we need to restart the CDP client for the new page
      if (session.streaming) {
        // this.logger.info(
        //   `🔄 [TAB SWITCH DEBUG] Switching streaming to new tab`,
        // );
        await this.switchStreamingToTab(sessionId, targetId);
        // this.logger.info(
        //   `🔄 [TAB SWITCH DEBUG] Streaming switched successfully`,
        // );
      }

      // **NEW: Set activity lock for automation-heavy tabs**
      if (this.tabDetection && !isManual) {
        const url = tabInfo.url;
        if (url.includes("github.com") && url.includes("/search")) {
          this.tabDetection.setActivityLock(
            sessionId,
            targetId,
            "github_search_tab",
          );
        } else if (isManual) {
          this.tabDetection.setActivityLock(
            sessionId,
            targetId,
            "manual_switch",
          );
        }
      }

      // **ENHANCED: Inject automation markers immediately**
      await this.injectAutomationMarkers(tabInfo.page);

      // this.logger.info(
      //   `✅ Successfully switched to tab ${targetId}: ${tabInfo.title}`,
      // );

      // Emit tab switch event to connected clients
      this.emit("tabSwitched", {
        sessionId,
        activeTabId: targetId,
        tabInfo: {
          id: targetId,
          title: tabInfo.title,
          url: tabInfo.url,
          isActive: true,
        },
      });

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to switch to tab ${targetId}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Switch CDP streaming to a specific tab
   */
  async switchStreamingToTab(sessionId, targetId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      this.logger.info(
        `📹 Switching streaming to tab ${targetId} in session ${sessionId}`,
      );

      const tabInfo = session.tabs.get(targetId);
      if (!tabInfo) return;

      // Stop current streaming
      if (session.client && session.streaming) {
        try {
          await session.client.send("Page.stopScreencast");
        } catch (error) {
          this.logger.warn(
            `Failed to stop current screencast: ${error.message}`,
          );
        }
      }

      // Create new CDP client for the new tab with error handling
      let newClient;
      try {
        newClient = await tabInfo.page.target().createCDPSession();
        await Promise.all([
          newClient.send("Page.enable"),
          newClient.send("Runtime.enable"),
          newClient.send("DOM.enable"),
        ]);
      } catch (error) {
        if (
          error.message.includes("Session with given id not found") ||
          error.message.includes("Target closed")
        ) {
          this.logger.warn(
            `🔄 CDP error during tab switch for ${sessionId}: ${error.message}`,
          );
          // Try to recover the main session first
          const recovered = await this.recoverCdpSession(sessionId);
          if (recovered) {
            // Retry creating client for the tab
            newClient = await tabInfo.page.target().createCDPSession();
            await Promise.all([
              newClient.send("Page.enable"),
              newClient.send("Runtime.enable"),
              newClient.send("DOM.enable"),
            ]);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }

      // Replace the client
      session.client = newClient;
      session.page = tabInfo.page;

      // Restart screencast on the new tab
      if (session.streaming && session.streamCallback) {
        await newClient.send("Page.startScreencast", {
          format: "jpeg",
          quality: 95,
          maxWidth: session.viewport.width,
          maxHeight: session.viewport.height,
          everyNthFrame: 1,
        });

        // Handle screencast frames for the new tab
        newClient.on("Page.screencastFrame", async (params) => {
          try {
            await newClient.send("Page.screencastFrameAck", {
              sessionId: params.sessionId,
            });

            if (session.streamCallback && session.streaming) {
              session.streamCallback(params.data);
            }
          } catch (error) {
            this.logger.error(
              `Error handling screencast frame for tab ${targetId}:`,
              error,
            );
          }
        });

        // this.logger.info(`✅ Streaming switched to tab ${targetId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to switch streaming to tab ${targetId}: ${error.message}`,
      );
    }
  }

  /**
   * Get list of all tabs for a session
   */
  getTabsList(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.tabs.entries()).map(([targetId, tabInfo]) => ({
      id: targetId,
      title: tabInfo.title,
      url: tabInfo.url,
      isActive: tabInfo.isActive,
      createdAt: tabInfo.createdAt,
    }));
  }

  /**
   * Get active tab information
   */
  getActiveTab(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.activeTabId) return null;

    const activeTab = session.tabs.get(session.activeTabId);
    if (!activeTab) return null;

    return {
      id: session.activeTabId,
      title: activeTab.title,
      url: activeTab.url,
      isActive: true,
    };
  }

  /**
   * Check if tab URL matches target URL from task
   */
  isTargetUrl(tabUrl, targetUrl) {
    if (!tabUrl || !targetUrl) return false;

    // Exact match
    if (tabUrl === targetUrl) return true;

    // Clean URLs for comparison (remove trailing slashes, hash fragments)
    const cleanTabUrl = tabUrl.split("#")[0].replace(/\/$/, "");
    const cleanTargetUrl = targetUrl.split("#")[0].replace(/\/$/, "");

    if (cleanTabUrl === cleanTargetUrl) return true;

    // Check if target URL is a substring (for form URLs with parameters)
    if (
      cleanTabUrl.includes(cleanTargetUrl) ||
      cleanTargetUrl.includes(cleanTabUrl)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if tab is an interactive page (forms, login, etc.)
   */
  isInteractivePage(tabUrl, tabTitle = "") {
    if (!tabUrl) return false;

    const url = tabUrl.toLowerCase();
    const title = tabTitle.toLowerCase();

    // Google Forms and similar interactive content
    const interactivePatterns = [
      "docs.google.com/forms",
      "forms.google.com",
      "forms.gle",
      "login",
      "signin",
      "signup",
      "register",
      "checkout",
      "payment",
      "form",
      "survey",
      "questionnaire",
    ];

    for (const pattern of interactivePatterns) {
      if (url.includes(pattern) || title.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Inject automation markers into a page for better tab detection
   */
  async injectAutomationMarkers(page) {
    try {
      await page.evaluate(() => {
        if (!window._browserUse) {
          window._browserUse = {
            active: true,
            startTime: Date.now(),
            lastActivity: Date.now(),
          };
        }
      });

      await page.evaluateOnNewDocument(() => {
        if (!window._browserUse) {
          window._browserUse = {
            active: true,
            startTime: Date.now(),
            lastActivity: Date.now(),
          };
        }
      });
    } catch (error) {
      // Ignore injection errors (page might be closed, etc.)
    }
  }

  // **NEW: Get Browser WebSocket endpoint with auto-recovery**
  getBrowserWSEndpoint(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // **ENHANCED: Return CDP endpoint with auto-recovery support**
    return this.getCdpEndpointWithRecovery(sessionId);
  }

  // **NEW: Force CDP session recovery for external use**
  async forceCdpRecovery(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    this.logger.info(
      `🔄 Force CDP recovery requested for session ${sessionId}`,
    );
    const recovered = await this.recoverCdpSession(sessionId);

    if (recovered) {
      // Reset retry count on successful manual recovery
      session.cdpRetryCount = 0;
      return { success: true, message: "CDP session recovered successfully" };
    } else {
      return { success: false, message: "CDP session recovery failed" };
    }
  }

  // **NEW: Setup viewport enforcement for all page navigations**
  async setupViewportEnforcement(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.error(
        `Session ${sessionId} not found for viewport enforcement setup`,
      );
      return;
    }

    const { page, client } = session;
    const standardViewport = {
      width: parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_WIDTH) || 1920,
      height: parseInt(process.env.BROWSER_DEFAULT_VIEWPORT_HEIGHT) || 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    };

    try {
      // Set up page navigation listener to enforce viewport on every navigation
      page.on("framenavigated", async (frame) => {
        if (frame === page.mainFrame()) {
          try {
            // Force viewport reset on every main frame navigation
            await page.setViewport(standardViewport);
            this.logger.debug(
              `🔧 Viewport enforced to ${standardViewport.width}x${standardViewport.height} for session ${sessionId} after navigation to ${frame.url()}`,
            );
          } catch (error) {
            this.logger.debug(
              `Viewport enforcement failed for session ${sessionId}: ${error.message}`,
            );
          }
        }
      });

      // Also listen for page load events
      page.on("load", async () => {
        try {
          await page.setViewport(standardViewport);
          this.logger.debug(
            `🔧 Viewport enforced to ${standardViewport.width}x${standardViewport.height} for session ${sessionId} after page load`,
          );
        } catch (error) {
          this.logger.debug(
            `Viewport enforcement on load failed for session ${sessionId}: ${error.message}`,
          );
        }
      });

      // Add CDP-level viewport enforcement
      if (client) {
        try {
          await client.send("Emulation.setDeviceMetricsOverride", {
            width: standardViewport.width,
            height: standardViewport.height,
            deviceScaleFactor: standardViewport.deviceScaleFactor,
            mobile: standardViewport.isMobile,
            fitWindow: false,
            scale: 1.0,
            screenWidth: standardViewport.width,
            screenHeight: standardViewport.height,
          });
          this.logger.debug(
            `🔧 CDP viewport override set to ${standardViewport.width}x${standardViewport.height} for session ${sessionId}`,
          );
        } catch (error) {
          this.logger.debug(
            `CDP viewport override failed for session ${sessionId}: ${error.message}`,
          );
        }
      }

      this.logger.info(
        `✅ Viewport enforcement setup completed for session ${sessionId} (${standardViewport.width}x${standardViewport.height})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to setup viewport enforcement for session ${sessionId}: ${error.message}`,
      );
    }
  }
}
