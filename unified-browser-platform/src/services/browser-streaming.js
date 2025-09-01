/**
 * Browser Streaming Service
 * Handles browser launching, streaming, and interaction
 */

import puppeteer from "puppeteer";
import { EventEmitter } from "events";
import { Logger } from "../utils/logger.js";

export class BrowserStreamingService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.logger = new Logger("BrowserStreamingService");
    this.isInitialized = false;
  }

  async initialize() {
    this.logger.info("🔧 Initializing Browser Streaming Service...");
    this.isInitialized = true;
    this.logger.info("✅ Browser Streaming Service initialized");
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  async createSessionWithSeparateBrowser(sessionId, options = {}) {
    try {
      this.logger.info(
        `🔗 Creating streaming session ${sessionId} with SEPARATE browser for parallel execution`,
      );

      // Create a NEW browser instance for this session to enable true parallelism
      // Force non-headless for CDP screencast to work properly
      const forceHeadless = false;
      const browser = await puppeteer.launch({
        headless: true, // HIDE BROWSER WINDOW - automation still works!
        executablePath: process.env.CHROME_PATH || undefined,
        defaultViewport: {
          width: options.width || 1920,
          height: options.height || 1200, // Increased from 1080 to 1200 for better content viewing
          deviceScaleFactor: 1,
        },
        args: [
          "--remote-debugging-port=0", // Use random port
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--disable-gpu",
          "--use-gl=swiftshader",
          // "--headless=new", // Removed for CDP screencast to work
          "--hide-scrollbars",
          "--mute-audio",
          `--window-size=${options.width || 1920},${options.height || 1200}`,
          "--window-position=0,0",
          "--force-device-scale-factor=1",
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
          "--disable-blink-features=AutomationControlled",
          "--exclude-switches=enable-automation",
        ],
      });

      // Create a new page for this session
      const page = await browser.newPage();

      // Set up page configuration
      const defaultViewport = {
        width: options.width || 1920,
        height: options.height || 1080,
        deviceScaleFactor: 1,
      };

      await page.setViewport(defaultViewport);
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      );

      // Set extra headers to help with site compatibility
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });

      // Navigate to initial page
      await page.goto("about:blank");

      // Set up CDP session for streaming - using exact same setup as old implementation
      const client = await page.target().createCDPSession();
      this.logger.debug(`🔧 CDP session created for session ${sessionId}`);

      await client.send("Page.enable");
      this.logger.debug(`🔧 Page.enable sent for session ${sessionId}`);

      await client.send("Runtime.enable");
      this.logger.debug(`🔧 Runtime.enable sent for session ${sessionId}`);

      await client.send("DOM.enable");
      this.logger.debug(`🔧 DOM.enable sent for session ${sessionId}`);

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
        viewport: defaultViewport,
        createdAt: new Date(),
        lastActivity: new Date(),
        mouseButtonState: new Set(), // Track pressed mouse buttons
        usingCentralizedBrowser: false, // Flag to indicate this session uses its own browser
        // Tab management
        tabs: new Map(), // Track all tabs: Map<targetId, {page, title, url, isActive}>
        activeTabId: null, // Currently active tab ID
        lastTabSwitchTime: new Date(),
      };

      this.sessions.set(sessionId, session);

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

  async launchBrowser(sessionId, options = {}) {
    try {
      this.logger.info(`🚀 Launching browser for session: ${sessionId}`);

      const defaultOptions = {
        headless: true, // HIDE BROWSER WINDOW - automation still works!
        executablePath: process.env.CHROME_PATH || undefined,
        defaultViewport: {
          width: options.width || 1920,
          height: options.height || 1200, // Increased for better content viewing
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
        this.logger.error(
          `❌ Failed to start screencast for session ${sessionId}:`,
          error,
        );
        throw error;
      }

      // Handle screencast frames
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
          this.logger.error(
            `Error handling screencast frame for session ${sessionId}:`,
            error,
          );
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
          // For click, we don't need to track state
          try {
            await session.page.mouse.click(x, y, { button });
          } catch (error) {
            if (
              error.message.includes("Session closed") ||
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during click event`,
              );
              return { success: false, message: "Session closed" };
            }
            throw error;
          }
          break;
        case "mousedown":
          // Only press if not already pressed
          if (!session.mouseButtonState.has(button)) {
            try {
              await session.page.mouse.down({ button });
              session.mouseButtonState.add(button);
            } catch (error) {
              if (
                error.message.includes("Session closed") ||
                error.message.includes("Target closed")
              ) {
                this.logger.warn(
                  `Session ${sessionId} closed during mousedown event`,
                );
                return { success: false, message: "Session closed" };
              }
              // If already pressed, just add to our tracking
              session.mouseButtonState.add(button);
            }
          }
          break;
        case "mouseup":
          // Only release if we think it's pressed
          if (session.mouseButtonState.has(button)) {
            try {
              await session.page.mouse.up({ button });
              session.mouseButtonState.delete(button);
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
              // If not pressed, just remove from our tracking
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
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during keydown event`,
              );
              return { success: false, message: "Session closed" };
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
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during keyup event`,
              );
              return { success: false, message: "Session closed" };
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
              error.message.includes("Target closed")
            ) {
              this.logger.warn(`Session ${sessionId} closed during type event`);
              return { success: false, message: "Session closed" };
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
              error.message.includes("Target closed")
            ) {
              this.logger.warn(
                `Session ${sessionId} closed during press event`,
              );
              return { success: false, message: "Session closed" };
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
        clearInterval(session.tabActivityMonitor);
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

      this.logger.info(`✅ Browser closed for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(
        `❌ Failed to close browser for session ${sessionId}:`,
        error,
      );
      this.sessions.delete(sessionId); // Remove anyway
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

  isHealthy() {
    return this.isInitialized;
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

      // Configure the new page
      await newPage.setViewport({
        width: 1920,
        height: 1500,
        deviceScaleFactor: 1,
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
      session.tabs.set(targetId, {
        page: session.page,
        title: (await session.page.title()) || "New Tab",
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

              // Add to tabs registry
              session.tabs.set(newTargetId, {
                page: newPage,
                title: (await newPage.title()) || "New Tab",
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
                  // Add comprehensive activity tracking
                  await newPage.evaluateOnNewDocument(() => {
                    let activityCount = 0;
                    const events = [
                      "click",
                      "keydown",
                      "scroll",
                      "mousemove",
                      "focus",
                      "mousedown",
                    ];
                    events.forEach((eventType) => {
                      document.addEventListener(
                        eventType,
                        () => {
                          activityCount++;
                          window._tabActivity = activityCount;
                          window._lastActivity = Date.now();
                        },
                        { passive: true },
                      );
                    });

                    // Track page visibility changes
                    document.addEventListener("visibilitychange", () => {
                      if (!document.hidden) {
                        window._tabActivity = (window._tabActivity || 0) + 10;
                        window._lastActivity = Date.now();
                      }
                    });
                  });
                } catch (error) {
                  // Ignore evaluation errors
                }
              });

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
              tabInfo.title = (await tabInfo.page.title()) || "Loading...";
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

      // Set up bulletproof active tab detection using browser.targets()
      session.tabActivityMonitor = setInterval(async () => {
        try {
          await this.bulletproofTabDetection(sessionId);
        } catch (error) {
          // Silently handle tab activity monitor errors
        }
      }, 500); // Check every 500ms for faster response

      this.logger.info(
        `✅ Tab management initialized for session ${sessionId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to setup tab management: ${error.message}`);
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
          const title = await page.title();

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

          // HIGHEST priority for YouTube and GitHub
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

          // Bonus for recently navigated pages
          const tabInfo = session.tabs.get(targetId);
          if (tabInfo && tabInfo.lastActiveAt) {
            const timeSinceUpdate = Date.now() - tabInfo.lastActiveAt.getTime();
            if (timeSinceUpdate < 5000)
              score += 2000; // Very recent activity (within 5 seconds)
            else if (timeSinceUpdate < 15000)
              score += 1000; // Recent activity
            else if (timeSinceUpdate < 30000) score += 500; // Moderately recent
          }

          // Force switch for forms and interactive pages
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
      // Set manual override if this is a manual switch
      if (isManual) {
        session.manualOverride = Date.now();
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

      const tabInfo = session.tabs.get(targetId);
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

      // If tab not in registry, add it from browser targets
      if (!session.tabs.has(targetId)) {
        try {
          const targets = await session.browser.targets();
          const target = targets.find((t) => t._targetId === targetId);
          if (target && target.type() === "page") {
            const page = await target.page();
            session.tabs.set(targetId, {
              page: page,
              title: (await page.title()) || "New Tab",
              url: page.url(),
              isActive: false,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            });
            this.logger.info(
              `📝 Added missing tab ${targetId} to registry: ${page.url()}`,
            );
          }
        } catch (error) {
          this.logger.warn(`Failed to add tab to registry: ${error.message}`);
        }
      }

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

      // Create new CDP client for the new tab
      const newClient = await tabInfo.page.target().createCDPSession();
      await newClient.send("Page.enable");
      await newClient.send("Runtime.enable");
      await newClient.send("DOM.enable");

      // Replace the client
      session.client = newClient;
      session.page = tabInfo.page;

      // Restart screencast on the new tab
      if (session.streaming && session.streamCallback) {
        await newClient.send("Page.startScreencast", {
          format: "jpeg",
          quality: 80,
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
}
