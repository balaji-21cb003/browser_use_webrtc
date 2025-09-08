/**
 * Stealth Browser Manager
 * Comprehensive anti-detection system for browser automation
 */

import puppeteer from "puppeteer";
import { STEALTH_CONFIG } from "./stealth-config.js";
import { COMPLETE_STEALTH_SCRIPT } from "./navigator-stealth.js";
import { HumanMouseMovement } from "./human-mouse.js";
import { HumanTyping } from "./human-typing.js";
import { Logger } from "../../utils/logger.js";

export class StealthBrowserManager {
  constructor() {
    this.logger = new Logger("StealthBrowserManager");
    this.sessions = new Map();
    this.config = STEALTH_CONFIG;
    this.isInitialized = false;
  }

  /**
   * Initialize the stealth browser manager
   */
  async initialize() {
    try {
      this.logger.info("🕵️ Initializing Stealth Browser Manager...");

      // Validate configuration
      this.validateEnvironment();

      this.isInitialized = true;
      this.logger.info("✅ Stealth Browser Manager initialized successfully");
    } catch (error) {
      this.logger.error(
        "❌ Failed to initialize Stealth Browser Manager:",
        error,
      );
      throw error;
    }
  }

  /**
   * Validate cloud environment and stealth configuration
   */
  validateEnvironment() {
    const envConfig = this.config.getEnvironmentConfig();

    // Log current stealth configuration
    this.logger.info("🔧 Stealth Configuration:", {
      environment: process.env.NODE_ENV || "development",
      visibleBrowser: envConfig.VISIBLE_BROWSER,
      stealthEnabled: !envConfig.DISABLE_STEALTH,
      maxSessions: this.config.RESOURCE_LIMITS.MAX_CONCURRENT_SESSIONS,
      memoryLimit: this.config.RESOURCE_LIMITS.MEMORY_LIMIT_MB + "MB",
    });
  }

  /**
   * Create stealth browser session with full anti-detection
   */
  async createStealthSession(sessionId, options = {}) {
    try {
      this.logger.info(`🚀 Creating stealth browser session: ${sessionId}`);

      // Phase 3: Random user agent selection
      const userAgent = this.config.getRandomUserAgent();

      // Phase 8: Random viewport size
      const viewport = this.config.getRandomViewport();

      // Phase 1: Enhanced browser arguments
      const launchArgs = [
        ...this.config.BROWSER_ARGS,
        `--window-size=${viewport.width},${viewport.height}`,
        `--user-agent=${userAgent}`,
        "--remote-debugging-port=0", // Let Chrome choose an available port
        // Additional args for streaming compatibility
        "--enable-features=VizDisplayCompositor",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI",
        "--run-all-compositor-stages-before-draw",
        "--disable-ipc-flooding-protection",
      ];

      // Environment-specific configuration
      const envConfig = this.config.getEnvironmentConfig();
      // For development, always use visible browser for better streaming compatibility
      const headless =
        options.headless !== undefined
          ? options.headless
          : envConfig.VISIBLE_BROWSER
            ? false
            : "new";

      this.logger.info(
        `🔧 Browser launch config: headless=${headless}, visible=${envConfig.VISIBLE_BROWSER}`,
      );

      // Launch browser with stealth configuration optimized for streaming
      const browser = await puppeteer.launch({
        headless: headless,
        args: launchArgs,
        defaultViewport: null, // Use window size instead
        devtools: false, // Disable devtools UI but keep CDP
        ignoreDefaultArgs: [
          "--enable-automation",
          "--enable-blink-features=AutomationControlled",
        ],
        // Use system Chrome for better stealth
        executablePath: process.env.CHROME_PATH || undefined,
      });

      // Create new context for session isolation (Phase 7)
      const context = await browser.createBrowserContext();
      const page = await context.newPage();

      // Phase 8: Set random viewport
      await page.setViewport(viewport);

      // Phase 9: Set random HTTP headers
      const headers = this.config.getRandomHeaders();
      await page.setExtraHTTPHeaders(headers);

      // Configure page for streaming compatibility
      await page.setCacheEnabled(false);
      await page.setJavaScriptEnabled(true);

      // Enable CDP Page domain for streaming
      const client = await page.target().createCDPSession();
      await client.send("Page.enable");
      await client.send("Runtime.enable");
      await client.send("DOM.enable");

      this.logger.info(
        `🎬 CDP domains enabled for streaming compatibility: ${sessionId}`,
      );

      // Phase 2: Inject stealth scripts
      await this.injectStealthScripts(page);

      // Initialize human behavior systems
      const humanMouse = new HumanMouseMovement();
      const humanTyping = new HumanTyping();

      // Phase 9: Request interception for header variation
      await this.setupRequestInterception(page);

      // Store session data
      const session = {
        id: sessionId,
        browser,
        context,
        page,
        userAgent,
        viewport,
        headers,
        humanMouse,
        humanTyping,
        createdAt: new Date(),
        lastActivity: new Date(),
        stealthEnabled: true,
        detectionCount: 0,
      };

      this.sessions.set(sessionId, session);

      // Set up detection monitoring
      this.setupDetectionMonitoring(session);

      this.logger.info(`✅ Stealth session created: ${sessionId}`, {
        userAgent: userAgent.substring(0, 50) + "...",
        viewport: `${viewport.width}x${viewport.height}`,
        headless: headless,
      });

      return session;
    } catch (error) {
      this.logger.error(
        `❌ Failed to create stealth session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Phase 2: Inject all stealth scripts into page
   */
  async injectStealthScripts(page) {
    try {
      // Inject on every page load/navigation
      await page.evaluateOnNewDocument(COMPLETE_STEALTH_SCRIPT);

      // Also inject immediately if page is already loaded
      await page.evaluate(COMPLETE_STEALTH_SCRIPT);

      this.logger.debug("🔒 Stealth scripts injected successfully");
    } catch (error) {
      this.logger.warn(
        "⚠️ Failed to inject some stealth scripts:",
        error.message,
      );
    }
  }

  /**
   * Phase 9: Setup request interception for header variation
   */
  async setupRequestInterception(page) {
    await page.setRequestInterception(true);

    page.on("request", (request) => {
      // Modify headers for each request
      const headers = {
        ...request.headers(),
        ...this.config.getRandomHeaders(),
      };

      // Remove automation indicators from headers
      delete headers["sec-ch-ua-automation"];
      delete headers["sec-ch-ua-platform-automation"];

      request.continue({ headers });
    });
  }

  /**
   * Phase 12: Setup detection monitoring and recovery
   */
  setupDetectionMonitoring(session) {
    const { page } = session;

    // Monitor for detection indicators
    page.on("response", async (response) => {
      const url = response.url();
      const status = response.status();

      // Check for detection indicators
      const isDetected = this.checkForDetection(url, status, response);

      if (isDetected) {
        await this.handleDetection(session, { url, status, response });
      }
    });

    // Monitor console for detection messages
    page.on("console", (message) => {
      const text = message.text().toLowerCase();
      
      // First check if it's an ignored/harmless warning
      const isIgnoredMessage = this.config.RECOVERY_CONFIG.IGNORED_INDICATORS?.some((indicator) =>
        text.includes(indicator.toLowerCase())
      );
      
      if (isIgnoredMessage) {
        this.logger.debug(`🔇 Ignored harmless warning: ${text}`);
        return;
      }
      
      // Only count real detection indicators
      const isDetectionMessage =
        this.config.RECOVERY_CONFIG.DETECTION_INDICATORS.some((indicator) =>
          text.includes(indicator),
        );

      if (isDetectionMessage) {
        this.handleDetection(session, { type: "console", message: text });
      }
    });
  }

  /**
   * Check if response indicates detection
   */
  checkForDetection(url, status, response) {
    // HTTP status based detection
    if (status === 403 || status === 429 || status === 503) {
      return true;
    }

    // URL pattern based detection
    const detectionPatterns = [
      "captcha",
      "recaptcha",
      "cloudflare",
      "challenge",
      "verification",
      "security-check",
      "bot-detection",
    ];

    return detectionPatterns.some((pattern) =>
      url.toLowerCase().includes(pattern),
    );
  }

  /**
   * Handle detection events with recovery actions
   */
  async handleDetection(session, detectionInfo) {
    session.detectionCount++;

    this.logger.warn(
      `🚨 Detection event #${session.detectionCount} for session ${session.id}:`,
      detectionInfo,
    );

    // Apply recovery actions based on detection count - increased tolerance
    if (session.detectionCount <= 10) {
      await this.applyRecoveryActions(session, detectionInfo);
    } else {
      this.logger.error(
        `🛑 Session ${session.id} detected too many times, terminating`,
      );
      await this.destroySession(session.id);
    }
  }

  /**
   * Apply recovery actions when detection is encountered
   */
  async applyRecoveryActions(session, detectionInfo) {
    const { page } = session;
    const actions = this.config.RECOVERY_CONFIG.RECOVERY_ACTIONS;

    try {
      // Check if page is still valid before applying actions
      if (page.isClosed && page.isClosed()) {
        this.logger.warn(`⚠️ Page already closed for session ${session.id}, skipping recovery actions`);
        return;
      }

      // Action 1: Rotate user agent (with error handling)
      try {
        const newUserAgent = this.config.getRandomUserAgent();
        await page.setUserAgent(newUserAgent);
        session.userAgent = newUserAgent;
      } catch (error) {
        this.logger.debug(`Failed to set user agent: ${error.message}`);
      }

      // Action 2: Change viewport (with error handling)
      try {
        const newViewport = this.config.getRandomViewport();
        await page.setViewport(newViewport);
        session.viewport = newViewport;
      } catch (error) {
        this.logger.debug(`Failed to set viewport: ${error.message}`);
      }

      // Action 3: Update headers (with error handling)
      try {
        const newHeaders = this.config.getRandomHeaders();
        await page.setExtraHTTPHeaders(newHeaders);
        session.headers = newHeaders;
      } catch (error) {
        this.logger.debug(`Failed to set headers: ${error.message}`);
      }

      // Action 4: Re-inject stealth scripts (with error handling)
      try {
        await this.injectStealthScripts(page);
      } catch (error) {
        this.logger.debug(`Failed to re-inject stealth scripts: ${error.message}`);
      }

      // Action 5: Add cooldown delay
      const cooldownDelay = this.config.RECOVERY_CONFIG.COOLDOWN_PERIODS.SHORT;
      await this.delay(cooldownDelay);

      this.logger.info(`🔄 Recovery actions applied for session ${session.id}`);
    } catch (error) {
      this.logger.warn(`⚠️ Some recovery actions failed for session ${session.id}: ${error.message}`);
      // Don't terminate session just because recovery partially failed
    }
  }

  /**
   * Get session with stealth features
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Navigate with stealth timing and behavior
   */
  async navigateStealthily(sessionId, url, options = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { page } = session;

    try {
      // Phase 6: Add realistic navigation delay
      const navDelay = this.config.ACTION_DELAYS.PAGE_LOAD_WAIT;
      const delay =
        navDelay.min + Math.random() * (navDelay.max - navDelay.min);

      this.logger.info(
        `🌐 Navigating stealthily to ${url} (delay: ${delay}ms)`,
      );

      // Navigate with timeout
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
        ...options,
      });

      // Wait for page to fully load
      await this.delay(delay);

      // Re-inject stealth scripts after navigation
      await this.injectStealthScripts(page);

      session.lastActivity = new Date();

      return true;
    } catch (error) {
      this.logger.error(
        `❌ Stealth navigation failed for ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Perform human-like click with stealth behavior
   */
  async clickStealthily(sessionId, selector, options = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { page, humanMouse } = session;

    try {
      // Wait for element to be available
      await page.waitForSelector(selector, { timeout: 10000 });

      // Get element position
      const element = await page.$(selector);
      const box = await element.boundingBox();

      if (!box) {
        throw new Error(`Element ${selector} not visible`);
      }

      // Calculate click position (slightly randomized)
      const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
      const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;

      // Phase 4: Human-like mouse movement and clicking
      await humanMouse.clickHuman(page, x, y, options);

      session.lastActivity = new Date();

      this.logger.debug(`🖱️ Stealth click performed on ${selector}`);

      return true;
    } catch (error) {
      this.logger.error(`❌ Stealth click failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Perform human-like typing with stealth behavior
   */
  async typeStealthily(sessionId, selector, text, options = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { page, humanTyping } = session;

    try {
      // Phase 5: Human-like typing behavior
      await humanTyping.typeIntoField(page, selector, text, options);

      session.lastActivity = new Date();

      this.logger.debug(`⌨️ Stealth typing performed on ${selector}`);

      return true;
    } catch (error) {
      this.logger.error(`❌ Stealth typing failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Take screenshot with stealth considerations
   */
  async takeStealthScreenshot(sessionId, options = {}) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const { page } = session;

    try {
      // Add small delay to ensure page is stable
      await this.delay(500);

      const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 95,
        fullPage: false,
        ...options,
      });

      session.lastActivity = new Date();

      return screenshot;
    } catch (error) {
      this.logger.error(
        `❌ Stealth screenshot failed for ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Close stealth session with cleanup
   */
  async destroySession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      this.logger.warn(`⚠️ Session ${sessionId} not found for destruction`);
      return false;
    }

    try {
      const { browser, context } = session;

      // Close context first
      if (context) {
        await context.close();
      }

      // Close browser
      if (browser) {
        await browser.close();
      }

      // Remove from sessions
      this.sessions.delete(sessionId);

      this.logger.info(`🗑️ Stealth session destroyed: ${sessionId}`);

      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to destroy session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Get health status of stealth manager
   */
  isHealthy() {
    return {
      initialized: this.isInitialized,
      activeSessions: this.sessions.size,
      maxSessions: this.config.RESOURCE_LIMITS.MAX_CONCURRENT_SESSIONS,
      healthySessionCount: Array.from(this.sessions.values()).filter(
        (session) => session.detectionCount < 3,
      ).length,
    };
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanup() {
    const now = new Date();
    const timeout = this.config.RESOURCE_LIMITS.SESSION_TIMEOUT_MS;

    for (const [sessionId, session] of this.sessions) {
      const age = now - session.lastActivity;

      if (age > timeout) {
        this.logger.info(`🧹 Cleaning up inactive session: ${sessionId}`);
        await this.destroySession(sessionId);
      }
    }
  }

  /**
   * Utility delay function
   */
  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default StealthBrowserManager;
