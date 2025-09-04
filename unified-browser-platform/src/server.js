/**
 * Unified Browser Platform - Clean Main Server
 * Handles hosting, routing, and WebSocket setup only
 * All business logic is in separate service files
 */

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { RateLimiterMemory } from "rate-limiter-flexible";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Import services
import { BrowserStreamingService } from "./services/browser-streaming.js";
import { AgentService } from "./services/agent-service.js";
import { BrowserUseIntegrationService } from "./services/browser-use-integration.js";
import { SessionManager } from "./services/session-manager.js";
import { SecurityService } from "./services/security.js";

// Import routes
import {
  createBrowserUseRoutes,
  createBrowserRoutes,
  createAgentRoutes,
  createSessionRoutes,
  createLiveBrowserRoutes,
  createTokenRoutes,
} from "./routes/index.js";

// Import utilities
import { Logger } from "./utils/logger.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UnifiedBrowserPlatform {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(",") || [
          "http://localhost:3000",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

    this.port = process.env.PORT || 3000;
    this.logger = new Logger("UnifiedBrowserPlatform");

    // Initialize core services
    this.browserService = new BrowserStreamingService();
    this.agentService = new AgentService();
    this.browserUseService = new BrowserUseIntegrationService();
    this.sessionManager = new SessionManager();
    this.securityService = new SecurityService();

    this.setupMiddleware();
    // Don't setup routes here - wait for services to be initialized
    this.setupSocketHandlers();

    // Start periodic cleanup of invalid sessions
    this.startPeriodicCleanup();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || [
          "http://localhost:3000",
        ],
        credentials: true,
      }),
    );

    this.app.use(compression());
    this.app.use(morgan("combined"));
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Rate limiting
    const rateLimiter = new RateLimiterMemory({
      keyGenerator: (req) => req.ip,
      points: 100, // Number of points
      duration: 15 * 60, // Per 15 minutes
    });

    this.app.use("/api/", async (req, res, next) => {
      try {
        await rateLimiter.consume(req.ip);
        next();
      } catch (rejRes) {
        res.status(429).json({ error: "Too many requests" });
      }
    });

    // Static files
    this.app.use(express.static(path.join(__dirname, "../public")));

    // Serve Socket.IO client from node_modules
    this.app.use(
      "/socket.io/",
      express.static(
        path.join(__dirname, "../node_modules/socket.io/client-dist/"),
      ),
    );
  }

  getMouseStatesSummary() {
    try {
      const summary = {
        totalSessions: this.browserService.sessions.size,
        sessionsWithMouseState: 0,
        totalPressedButtons: 0,
      };

      for (const [sessionId, session] of this.browserService.sessions) {
        if (session.mouseButtonState && session.mouseButtonState.size > 0) {
          summary.sessionsWithMouseState++;
          summary.totalPressedButtons += session.mouseButtonState.size;
        }
      }

      return summary;
    } catch (error) {
      return { error: "Failed to get mouse states summary" };
    }
  }

  async setupRoutes() {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          browser: this.browserService.isHealthy(),
          agent: this.agentService.isHealthy(),
          browserUse: this.browserUseService.isHealthy(),
          sessions: this.sessionManager.getActiveSessionsCount(),
        },
        mouseStates: this.getMouseStatesSummary(),
      });
    });

    // API Routes - using the separated route files
    this.app.use(
      "/api/browser",
      createBrowserRoutes(
        this.browserService,
        this.sessionManager,
        this.logger,
      ),
    );
    this.app.use(
      "/api/agent",
      createAgentRoutes(
        this.browserService,
        this.browserUseService,
        this.agentService,
        this.logger,
      ),
    );

    this.app.use(
      "/api/browser-use",
      createBrowserUseRoutes(
        this.browserUseService,
        this.browserService,
        this.sessionManager, // Make sure this is passed correctly
        this.logger,
        this.io,
      ),
    );
    this.app.use(
      "/api/sessions",
      createSessionRoutes(this.sessionManager, this.logger),
    );
    this.app.use(
      "/api/tokens",
      createTokenRoutes(this.browserUseService, this.logger),
    );
    this.app.use(
      "/api/live",
      createLiveBrowserRoutes(this.browserService, this.logger),
    );

    // Main app route
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });

    // WebRTC streaming page
    this.app.get("/stream/:sessionId", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/webrtc-streaming.html"));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: "Route not found" });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      this.logger.error("Unhandled error:", err);
      res.status(500).json({ error: "Internal server error" });
    });
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      this.logger.info(
        `🔌 Socket.IO connection from ${socket.handshake.address}`,
      );
      this.logger.info(
        `🔗 Client connected: ${socket.id} from ${socket.handshake.address}`,
      );
      this.logger.info(`Connection details:`, {
        id: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers["user-agent"],
      });

      // Handle session joining
      socket.on("join-session", (data) => {
        try {
          // Handle both object and string formats
          let sessionId;
          if (typeof data === "string") {
            sessionId = data;
          } else if (data && data.sessionId) {
            sessionId = data.sessionId;
          } else {
            socket.emit("error", { message: "Invalid session data format" });
            return;
          }

          if (sessionId && this.sessionManager.getSession(sessionId)) {
            // Store session ID on socket for event handling
            socket.sessionId = sessionId;
            socket.join(sessionId);

            this.logger.info(
              `Client ${socket.id} joined session ${sessionId} (streaming will start when task is executed)`,
            );

            // Check if there's already a browser session streaming
            const browserSession = this.browserService.getSession(sessionId);
            if (browserSession && browserSession.streaming) {
              this.logger.info(
                `Client ${socket.id} joined session ${sessionId} - streaming already active`,
              );
              // Send initial session info with streaming active
              socket.emit("session-joined", {
                sessionId: sessionId,
                status: "connected",
                message: "Session joined - streaming active",
                streamingActive: true,
              });

              // Send initial frame immediately
              setTimeout(async () => {
                try {
                  if (browserSession.page) {
                    const screenshot = await browserSession.page.screenshot({
                      type: "jpeg",
                      quality: 90,
                      fullPage: false,
                    });
                    socket.emit("video-frame", screenshot.toString("base64"));
                  }
                } catch (error) {
                  this.logger.warn(
                    `Failed to send initial frame: ${error.message}`,
                  );
                }
              }, 100);
            } else {
              // Send initial session info
              socket.emit("session-joined", {
                sessionId: sessionId,
                status: "connected",
                message:
                  "Session joined - streaming will start when task is executed",
                streamingActive: false,
              });

              // Start video streaming if browser session exists
              if (
                browserSession &&
                !this.browserService.isVideoStreaming(sessionId)
              ) {
                this.logger.info(
                  `🎬 Starting video streaming for session ${sessionId}`,
                );
                this.browserService
                  .startVideoStreaming(sessionId, this.io)
                  .catch((error) => {
                    this.logger.error(
                      `Failed to start video streaming: ${error.message}`,
                    );
                  });
              }
            }

            // 🚫 PROTECT BROWSER FROM BEING CLOSED
            if (browserSession && browserSession.page) {
              // Prevent browser close events
              browserSession.page.on("close", async () => {
                this.logger.warn(
                  `🚫 Browser close attempt blocked for session ${sessionId}`,
                );
                // Recreate page if it gets closed
                try {
                  await this.browserService.recreatePage(sessionId);
                  this.logger.info(
                    `✅ Browser page recreated for session ${sessionId}`,
                  );
                } catch (error) {
                  this.logger.error(
                    `❌ Failed to recreate browser page: ${error.message}`,
                  );
                }
              });

              // Prevent page crashes
              browserSession.page.on("crash", async () => {
                this.logger.warn(
                  `🚫 Browser crash detected for session ${sessionId}`,
                );
                try {
                  await this.browserService.recreatePage(sessionId);
                  this.logger.info(
                    `✅ Browser page recovered from crash for session ${sessionId}`,
                  );
                } catch (error) {
                  this.logger.error(
                    `❌ Failed to recover from crash: ${error.message}`,
                  );
                }
              });

              // Prevent page disconnection
              browserSession.page.on("disconnected", async () => {
                this.logger.warn(
                  `🚫 Browser disconnected for session ${sessionId}`,
                );
                try {
                  await this.browserService.recreatePage(sessionId);
                  this.logger.info(
                    `✅ Browser page reconnected for session ${sessionId}`,
                  );
                } catch (error) {
                  this.logger.error(
                    `❌ Failed to reconnect browser: ${error.message}`,
                  );
                }
              });
            }
          } else {
            socket.emit("error", {
              message: "Invalid session ID",
              sessionId: sessionId,
            });
          }
        } catch (error) {
          this.logger.error("Error joining session:", error);
          socket.emit("error", {
            message: "Failed to join session",
            error: error.message,
          });
        }
      });

      // Handle session leaving
      socket.on("leave-session", (sessionId) => {
        try {
          socket.leave(sessionId);
          this.logger.info(`Client ${socket.id} left session ${sessionId}`);

          socket.emit("session-left", {
            sessionId: sessionId,
            status: "disconnected",
            message: "Successfully left session",
          });
        } catch (error) {
          this.logger.error("Error leaving session:", error);
        }
      });

      // Handle browser control commands
      socket.on("browser-control", async (data) => {
        try {
          const { sessionId, action, params } = data;
          const browserSession = this.browserService.getSession(sessionId);

          if (!browserSession) {
            socket.emit("browser-control-error", {
              error: "Session not found",
              sessionId: sessionId,
            });
            return;
          }

          let result;
          switch (action) {
            case "navigate":
              result = await browserSession.page.goto(
                params.url,
                params.options,
              );
              break;
            case "refresh":
              result = await browserSession.page.reload();
              break;
            case "back":
              result = await browserSession.page.goBack();
              break;
            case "forward":
              result = await browserSession.page.goForward();
              break;
            case "screenshot":
              result = await browserSession.page.screenshot(params.options);
              break;
            default:
              socket.emit("browser-control-error", {
                error: "Invalid action",
                action: action,
              });
              return;
          }

          socket.emit("browser-control-success", {
            action: action,
            result: result,
            sessionId: sessionId,
          });
        } catch (error) {
          this.logger.error("Browser control error:", error);
          socket.emit("browser-control-error", {
            error: error.message,
            action: data.action,
            sessionId: data.sessionId,
          });
        }
      });

      // Handle canvas stream requests (fallback for video frames)
      socket.on("request-canvas-stream", (data) => {
        try {
          const { sessionId } = data;
          this.logger.info(
            `🎨 Client requested canvas stream for session ${sessionId}`,
          );

          // Start video streaming if not already active
          const browserSession = this.browserService.getSession(sessionId);
          if (
            browserSession &&
            !this.browserService.isVideoStreaming(sessionId)
          ) {
            this.logger.info(
              `🎬 Starting video streaming for canvas fallback session ${sessionId}`,
            );
            this.browserService
              .startVideoStreaming(sessionId, this.io)
              .catch((error) => {
                this.logger.error(
                  `Failed to start video streaming: ${error.message}`,
                );
              });
          }

          socket.emit("canvas-stream-started", {
            sessionId: sessionId,
            message: "Canvas stream started",
          });
        } catch (error) {
          this.logger.error("Canvas stream request error:", error);
          socket.emit("error", {
            message: "Failed to start canvas stream",
            error: error.message,
          });
        }
      });

      // Handle frame requests for immediate display
      socket.on("request-frame", async (data) => {
        try {
          const { sessionId } = data;
          const targetSessionId = sessionId || socket.sessionId;

          if (!targetSessionId) {
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          // Get the browser session
          const browserSession =
            this.browserService.getSession(targetSessionId);
          if (!browserSession || !browserSession.page) {
            socket.emit("error", {
              message: "Browser session not found or not ready",
            });
            return;
          }

          // Take a screenshot and send it as a frame
          const screenshot = await browserSession.page.screenshot({
            type: "jpeg",
            quality: 90,
            fullPage: false,
          });

          socket.emit("video-frame", screenshot.toString("base64"));
          this.logger.debug(
            `📸 Sent frame to client ${socket.id} for session ${targetSessionId}`,
          );
        } catch (error) {
          this.logger.error("Failed to handle request-frame:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle WebRTC stream requests (for future WebRTC implementation)
      socket.on("request-webrtc-stream", (data) => {
        try {
          const { sessionId } = data;
          this.logger.info(
            `📡 Client requested WebRTC stream for session ${sessionId}`,
          );

          // For now, fall back to canvas streaming since we're using CDP screencast
          socket.emit("webrtc-fallback", {
            sessionId: sessionId,
            message: "WebRTC not available, using canvas fallback",
          });

          // Start canvas streaming instead
          const browserSession = this.browserService.getSession(sessionId);
          if (
            browserSession &&
            !this.browserService.isVideoStreaming(sessionId)
          ) {
            this.logger.info(
              `🎬 Starting canvas streaming for WebRTC fallback session ${sessionId}`,
            );
            this.browserService
              .startVideoStreaming(sessionId, this.io)
              .catch((error) => {
                this.logger.error(
                  `Failed to start video streaming: ${error.message}`,
                );
              });
          }
        } catch (error) {
          this.logger.error("WebRTC stream request error:", error);
          socket.emit("error", {
            message: "Failed to handle WebRTC request",
            error: error.message,
          });
        }
      });

      // Handle mouse events for user interactions
      socket.on("mouse-event", async (data) => {
        try {
          const { type, x, y, deltaX, deltaY, button, timestamp } = data;
          const sessionId =
            socket.sessionId || socket.rooms?.values().next()?.value;

          if (!sessionId) {
            this.logger.warn("Mouse event received without session ID");
            return;
          }

          // this.logger.info(
          //   `🖱️ Mouse event: ${type} at (${x}, ${y}) for session ${sessionId}`,
          // );

          // Get the browser session
          const browserSession = this.browserService.getSession(sessionId);
          if (!browserSession) {
            this.logger.warn(`No browser session found for ${sessionId}`);
            return;
          }

          // Execute the mouse action on the browser
          try {
            switch (type) {
              case "click":
                // Use proper Puppeteer mouse methods for coordinate-based clicking
                await browserSession.page.mouse.move(x, y);

                // Ensure mouse button is in up state before clicking to prevent "already pressed" errors
                try {
                  await browserSession.page.mouse.up({
                    button: button || "left",
                  });
                } catch (upError) {
                  // Ignore errors if button wasn't down - this is just a safety measure
                }

                await browserSession.page.mouse.down({
                  button: button || "left",
                });
                await browserSession.page.mouse.up({
                  button: button || "left",
                });
                break;
              case "mousedown":
                // Ensure button is up first to prevent "already pressed" errors
                try {
                  await browserSession.page.mouse.up({
                    button: button || "left",
                  });
                } catch (upError) {
                  // Ignore errors if button wasn't down
                }

                await browserSession.page.mouse.down({
                  button: button || "left",
                });
                break;
              case "mouseup":
                await browserSession.page.mouse.up({
                  button: button || "left",
                });
                break;
              case "mousemove":
                await browserSession.page.mouse.move(x, y);
                break;
              case "scroll":
                await browserSession.page.mouse.wheel({ deltaX, deltaY });
                break;
              default:
                this.logger.warn(`Unknown mouse event type: ${type}`);
            }

            // this.logger.info(
            //   `✅ Mouse event ${type} executed successfully at (${x}, ${y})`,
            // );
          } catch (error) {
            this.logger.error(
              `Failed to execute mouse event ${type}: ${error.message}`,
            );
          }
        } catch (error) {
          this.logger.error("Mouse event handling error:", error);
        }
      });

      // Handle keyboard events for user interactions
      socket.on("keyboard-event", async (data) => {
        try {
          const { type, key, text, timestamp } = data;
          const sessionId =
            socket.sessionId || socket.rooms?.values().next()?.value;

          if (!sessionId) {
            this.logger.warn("Keyboard event received without session ID");
            return;
          }

          // this.logger.info(
          //   `⌨️ Keyboard event: ${type} key: ${key} for session ${sessionId}`,
          // );

          // 🚫 BLOCK DANGEROUS KEYBOARD SHORTCUTS
          const dangerousKeys = [
            "F4",
            "Alt+F4",
            "Ctrl+W",
            "Ctrl+Shift+W",
            "Ctrl+Q",
            "Ctrl+Shift+Q",
            "Alt+Home",
            "Ctrl+Shift+Delete",
            "Ctrl+Shift+O",
            "Ctrl+Shift+P",
          ];

          if (dangerousKeys.includes(key)) {
            this.logger.warn(
              `🚫 Blocked dangerous keyboard shortcut: ${key} for session ${sessionId}`,
            );
            socket.emit("keyboard-blocked", {
              message: `Keyboard shortcut ${key} is blocked for security`,
              key: key,
              sessionId: sessionId,
            });
            return;
          }

          // Get the browser session
          const browserSession = this.browserService.getSession(sessionId);
          if (!browserSession) {
            this.logger.warn(`No browser session found for ${sessionId}`);
            return;
          }

          // Execute the keyboard action on the browser
          try {
            switch (type) {
              case "type":
                if (text) {
                  await browserSession.page.keyboard.type(text);
                }
                break;
              case "keydown":
                await browserSession.page.keyboard.down(key);
                break;
              case "keyup":
                await browserSession.page.keyboard.up(key);
                break;
              default:
                this.logger.warn(`Unknown keyboard event type: ${type}`);
            }

            // this.logger.info(`✅ Keyboard event ${type} executed successfully`);
          } catch (error) {
            this.logger.error(
              `Failed to execute keyboard event ${type}: ${error.message}`,
            );
          }
        } catch (error) {
          this.logger.error("Keyboard event handling error:", error);
        }
      });

      // ===== TAB MANAGEMENT HANDLERS =====

      // Get available tabs
      socket.on("get-available-tabs", async (data) => {
        try {
          const { sessionId } = data;
          const targetSessionId = sessionId || socket.sessionId;

          if (!targetSessionId) {
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          const tabs = this.browserService.getTabsList(targetSessionId);
          const activeTab = this.browserService.getActiveTab(targetSessionId);

          socket.emit("available-tabs", {
            sessionId: targetSessionId,
            tabs: tabs,
            activeTabId: activeTab?.id || null,
          });

          // this.logger.info(
          //   `📑 Sent ${tabs.length} available tabs to client ${socket.id} for session ${targetSessionId}`,
          // );
        } catch (error) {
          this.logger.error("Failed to get available tabs:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Switch to specific tab
      socket.on("switch-to-tab", async (data) => {
        try {
          // console.log(
          //   `📨 [TAB SWITCH SERVER] Received switch-to-tab request:`,
          //   data,
          // );

          const { sessionId, tabId } = data;
          const targetSessionId = sessionId || socket.sessionId;

          // console.log(
          //   `🔄 [TAB SWITCH SERVER] Target session: ${targetSessionId}, Tab ID: ${tabId}`,
          // );
          // console.log(
          //   `🔄 [TAB SWITCH SERVER] Socket session: ${socket.sessionId}`,
          // );

          if (!targetSessionId) {
            console.error(`❌ [TAB SWITCH SERVER] No session ID available`);
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          if (!tabId) {
            console.error(`❌ [TAB SWITCH SERVER] No tab ID provided`);
            socket.emit("error", { message: "No tab ID provided" });
            return;
          }

          console.log(
            `🔄 [TAB SWITCH SERVER] Calling browserService.switchToTab(${targetSessionId}, ${tabId}) with manual=true`,
          );

          const success = await this.browserService.switchToTab(
            targetSessionId,
            tabId,
            true, // isManual = true for user-initiated switches
          );

          console.log(`📊 [TAB SWITCH SERVER] Switch result: ${success}`);

          if (success) {
            const activeTab = this.browserService.getActiveTab(targetSessionId);
            console.log(
              `✅ [TAB SWITCH SERVER] Tab switch successful, active tab:`,
              activeTab,
            );

            // Send confirmation to the requesting client
            socket.emit("tab-switched", {
              sessionId: targetSessionId,
              tabId: tabId,
              message: "Tab switched successfully",
              activeTab: activeTab,
            });

            // Broadcast tab switch to all clients in the session
            this.io.to(targetSessionId).emit("tab-changed", {
              sessionId: targetSessionId,
              activeTabId: tabId,
              activeTab: activeTab,
            });

            // Send immediate frame from the new tab
            setTimeout(async () => {
              try {
                const browserSession =
                  this.browserService.getSession(targetSessionId);
                if (browserSession && browserSession.page) {
                  const screenshot = await browserSession.page.screenshot({
                    type: "jpeg",
                    quality: 90,
                    fullPage: false,
                  });
                  this.io
                    .to(targetSessionId)
                    .emit("video-frame", screenshot.toString("base64"));
                  console.log(
                    `📸 [TAB SWITCH SERVER] Sent new frame after tab switch`,
                  );
                }
              } catch (error) {
                this.logger.warn(
                  `Failed to send frame after tab switch: ${error.message}`,
                );
              }
            }, 200);

            // this.logger.info(
            //   `🔄 Tab switched to ${tabId} for session ${targetSessionId}`,
            // );
          } else {
            console.error(
              `❌ [TAB SWITCH SERVER] Failed to switch to tab ${tabId}`,
            );
            socket.emit("tab-switch-error", {
              message: "Failed to switch tab",
              tabId: tabId,
            });
          }
        } catch (error) {
          console.error(
            `❌ [TAB SWITCH SERVER] Exception during tab switch:`,
            error,
          );
          this.logger.error("Failed to switch tab:", error);
          socket.emit("tab-switch-error", {
            message: error.message,
            tabId: data.tabId,
          });
        }
      });

      // Get current tab info
      socket.on("get-active-tab", async (data) => {
        try {
          const { sessionId } = data;
          const targetSessionId = sessionId || socket.sessionId;

          if (!targetSessionId) {
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          const activeTab = this.browserService.getActiveTab(targetSessionId);

          socket.emit("active-tab-info", {
            sessionId: targetSessionId,
            activeTab: activeTab,
          });
        } catch (error) {
          this.logger.error("Failed to get active tab:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Handle disconnection
      socket.on("disconnect", (reason) => {
        this.logger.info(`Client ${socket.id} disconnected: ${reason}`);
      });
    });

    this.logger.info("🔗 WebSocket handlers ready");
  }

  startPeriodicCleanup() {
    // Clean up expired sessions every 5 minutes
    setInterval(
      async () => {
        try {
          // Use the existing cleanup method from SessionManager
          this.sessionManager.cleanupInactiveSessions();
          this.logger.debug("🧹 Periodic cleanup check completed");
        } catch (error) {
          this.logger.error("Failed to cleanup expired sessions:", error);
        }
      },
      5 * 60 * 1000,
    );
  }

  async start() {
    try {
      // Initialize services
      await this.browserService.initialize();
      await this.agentService.initialize();
      await this.browserUseService.initialize();
      await this.sessionManager.initialize();
      await this.securityService.initialize();

      // Setup routes after services are initialized
      await this.setupRoutes();

      // Start server
      this.server.listen(this.port, () => {
        this.logger.info(
          `🚀 Unified Browser Platform started on port ${this.port}`,
        );
        this.logger.info(`📱 Dashboard: http://localhost:${this.port}`);
        this.logger.info(`🔧 API: http://localhost:${this.port}/api`);
        this.logger.info(`💡 Health: http://localhost:${this.port}/health`);
        this.logger.info(`🔗 WebSocket: ws://localhost:${this.port}`);
      });
    } catch (error) {
      this.logger.error("Failed to start Unified Browser Platform:", error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      this.logger.info("🛑 Shutting down Unified Browser Platform...");

      // Stop services
      await this.sessionManager.cleanup();
      await this.browserService.cleanup();

      // Close server
      this.server.close(() => {
        this.logger.info("✅ Server closed successfully");
        process.exit(0);
      });
    } catch (error) {
      this.logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  const platform = new UnifiedBrowserPlatform();
  await platform.stop();
});

process.on("SIGTERM", async () => {
  const platform = new UnifiedBrowserPlatform();
  await platform.stop();
});

// Start the platform
const platform = new UnifiedBrowserPlatform();
platform.start().catch((error) => {
  console.error("Failed to start platform:", error);
  process.exit(1);
});

export default UnifiedBrowserPlatform;
