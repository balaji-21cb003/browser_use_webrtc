/**
 * Centralized Browser Manager - ONE BROWSER FOR EVERYTHING
 * This ensures only ONE Chrome browser is used for all operations:
 * - Streaming to iframe
 * - Browser-use automation
 * - All sessions share the same browser
 */

import puppeteer from "puppeteer";
import BROWSER_CONFIG from "../../browser-config.js";

class CentralizedBrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
    this.cdpEndpoint = null;
    this.isInitialized = false;
    this.logger = {
      info: console.log,
      warn: console.warn,
      error: console.error,
    };
  }

  /**
   * Initialize ONE browser that will be shared by everything
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger.info(
        "🔄 Browser already initialized, reusing existing browser"
      );
      return this.getConnectionInfo();
    }

    try {
      this.logger.info(
        "🚀 Starting CENTRALIZED browser (only one for everything)..."
      );

      // Build browser arguments based on configuration
      const baseArgs = [
        "--remote-debugging-port=9222",
        "--disable-web-security",
        "--disable-cors",
        "--disable-features=VizDisplayCompositor",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ];

      // Add window mode arguments
      if (BROWSER_CONFIG.WINDOW_MODE === "fullscreen") {
        baseArgs.push("--kiosk"); // True fullscreen (no UI)
      } else if (BROWSER_CONFIG.WINDOW_MODE === "maximized") {
        baseArgs.push("--start-maximized"); // Full window with UI
      } else if (BROWSER_CONFIG.WINDOW_MODE === "custom") {
        baseArgs.push(
          `--window-size=${BROWSER_CONFIG.CUSTOM_SIZE.width},${BROWSER_CONFIG.CUSTOM_SIZE.height}`
        );
      }

      // Add extra arguments
      baseArgs.push(...BROWSER_CONFIG.EXTRA_ARGS);

      // Launch ONE browser with remote debugging enabled
      const launchOptions = {
        headless: BROWSER_CONFIG.HEADLESS, // Use config to hide/show browser
        args: baseArgs,
        executablePath: BROWSER_CONFIG.CHROME_EXECUTABLE_PATH, // Always use system Chrome
        ignoreDefaultArgs: ['--disable-extensions'], // Allow extensions
        // Force use of system Chrome, ignore Puppeteer's bundled version
        product: 'chrome',
      };

      this.logger.info(`🔧 Using Chrome executable: ${BROWSER_CONFIG.CHROME_EXECUTABLE_PATH}`);

      this.browser = await puppeteer.launch(launchOptions);

      // Get the first page
      const pages = await this.browser.pages();
      this.page = pages[0] || (await this.browser.newPage());

      // Get CDP endpoint
      this.cdpEndpoint = this.browser.wsEndpoint();
      this.isInitialized = true;

      this.logger.info("✅ CENTRALIZED browser started successfully");
      this.logger.info(`🔌 CDP Endpoint: ${this.cdpEndpoint}`);

      return this.getConnectionInfo();
    } catch (error) {
      this.logger.error("❌ Failed to start centralized browser:", error);
      throw error;
    }
  }

  /**
   * Get connection information for other services
   */
  getConnectionInfo() {
    if (!this.isInitialized) {
      throw new Error("Browser not initialized");
    }

    return {
      cdpEndpoint: this.cdpEndpoint,
      browser: this.browser,
      page: this.page,
      wsEndpoint: this.cdpEndpoint,
    };
  }

  /**
   * Navigate to URL (used by streaming service)
   */
  async navigate(url) {
    if (!this.page) {
      throw new Error("Browser not initialized");
    }

    this.logger.info(`🔗 Navigating to: ${url}`);
    await this.page.goto(url);
  }

  /**
   * Get the main page for streaming
   */
  getPage() {
    return this.page;
  }

  /**
   * Check if browser is healthy
   */
  isHealthy() {
    try {
      return this.isInitialized && this.browser && this.browser.connected;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup - close the browser
   */
  async cleanup() {
    try {
      if (this.browser && this.browser.connected) {
        this.logger.info("🧹 Closing centralized browser...");
        await this.browser.close();
        this.logger.info("✅ Centralized browser closed");
      }
    } catch (error) {
      this.logger.warn("⚠️ Error closing browser:", error.message);
    } finally {
      this.browser = null;
      this.page = null;
      this.cdpEndpoint = null;
      this.isInitialized = false;
    }
  }
}

export default CentralizedBrowserManager;
