/**
 * Unified Browser Platform - Main Server
 * Combines browser-use AI automation with real-time WebRTC streaming
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
import fetch from "node-fetch";

import { BrowserStreamingService } from "./services/browser-streaming.js";
import { AgentService } from "./services/agent-service.js";
import { BrowserUseIntegrationService } from "./services/browser-use-integration.js";
import { SessionManager } from "./services/session-manager.js";
import { SecurityService } from "./services/security.js";
// REMOVED: No centralized browser needed for per-session architecture
// import CentralizedBrowserManager from "./services/centralized-browser-manager.js";
import { Logger } from "./utils/logger.js";
import { v4 as uuidv4 } from "uuid";

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

    // REMOVED: No centralized browser needed - each session gets its own browser instance
    // this.centralizedBrowser = new CentralizedBrowserManager();

    // Core services - each session creates its own browser instance for true parallelism
    this.browserService = new BrowserStreamingService();
    this.agentService = new AgentService();
    this.browserUseService = new BrowserUseIntegrationService(); // Full browser-use integration
    this.sessionManager = new SessionManager();
    this.securityService = new SecurityService();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();

    // Start periodic cleanup of invalid sessions
    this.startPeriodicCleanup();
  }

  setupMiddleware() {
    // Completely disable Helmet for HTTP-only server to prevent HTTPS forcing
    // this.app.use(helmet()); // COMMENTED OUT - causes HTTPS upgrade issues

    // Manual CORS setup without Helmetc
    this.app.use(
      cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || [
          "http://localhost:3000",
        ],
        credentials: true,
      }),
    );

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

  setupRoutes() {
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
      });
    });

    // API Routes
    this.app.use("/api/browser", this.createBrowserRoutes());
    this.app.use("/api/agent", this.createAgentRoutes());
    this.app.use("/api/browser-use", this.createBrowserUseRoutes()); // Full browser-use integration
    this.app.use("/api/sessions", this.createSessionRoutes());
    this.app.use("/api/tokens", this.createTokenRoutes()); // Token usage tracking
    this.app.use("/api/live", this.createLiveBrowserRoutes()); // Live browser URL endpoint

    // Main app route
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname, "../public/index.html"));
    });

    // WebRTC streaming page - EXACTLY like index.html with WebRTC + CDP
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

  createBrowserRoutes() {
    const router = express.Router();

    // Create new browser session
    router.post("/sessions", async (req, res) => {
      try {
        const { options = {} } = req.body;
        const session = await this.sessionManager.createSession(options);
        const sessionId = session.id;
        const browserSession = await this.browserService.launchBrowser(
          sessionId,
          options,
        );
        res.json({
          success: true,
          sessionId: sessionId,
          message: "Browser session created successfully",
        });
      } catch (error) {
        this.logger.error("Failed to create session:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete browser session
    router.delete("/sessions/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        await this.browserService.closeBrowser(sessionId);
        await this.sessionManager.removeSession(sessionId);
        res.json({
          success: true,
          message: "Session closed successfully",
        });
      } catch (error) {
        this.logger.error("Failed to close session:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post("/launch", async (req, res) => {
      try {
        const { sessionId, options = {} } = req.body;

        // DON'T create browser here! Only create it when task is actually submitted
        // Just acknowledge the session is ready for tasks
        this.logger.info(
          `� Session ${sessionId} ready for task execution (no browser created yet)`,
        );
        res.json({
          success: true,
          sessionId,
          message: "Session ready for tasks",
        });
      } catch (error) {
        this.logger.error("Failed to prepare session:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post("/navigate", async (req, res) => {
      try {
        const { sessionId, url } = req.body;

        // REMOVED: No centralized browser - each session has its own browser
        this.logger.info(
          `🔗 Navigation endpoint removed - use session-specific navigation instead`,
        );
        res.json({ success: true });
      } catch (error) {
        this.logger.error("Failed to navigate:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.get("/screenshot/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const screenshot = await this.browserService.getScreenshot(sessionId);
        res.type("image/png").send(screenshot);
      } catch (error) {
        this.logger.error("Failed to get screenshot:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.delete("/close/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        await this.browserService.closeBrowser(sessionId);
        res.json({ success: true });
      } catch (error) {
        this.logger.error("Failed to close browser:", error);
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  createAgentRoutes() {
    const router = express.Router();

    router.post("/task", async (req, res) => {
      try {
        const { sessionId, task, options = {} } = req.body;

        // REMOVED: No need to initialize centralized browser - each session gets its own browser
        this.logger.info(
          "🚀 Using per-session browser instances for true parallel execution",
        );

        // Create streaming session using SEPARATE browser for parallel execution
        let browserSession = this.browserService.getSession(sessionId);
        if (!browserSession) {
          this.logger.info(
            "🔗 Creating streaming session with SEPARATE browser for parallel execution",
          );
          browserSession =
            await this.browserService.createSessionWithSeparateBrowser(
              sessionId,
              { width: 1920, height: 1480 }, // Increased height for full browser capture
            );

          // Start streaming for this session
          await this.browserService.startStreaming(sessionId, (frame) => {
            this.io.to(sessionId).emit("video-frame", frame);
            // this.logger.debug(
            //   `📹 Frame sent to session ${sessionId}, size: ${frame.length} bytes`
            // );
          });
          this.logger.info(`📺 Streaming started for session ${sessionId}`);
        }

        // Use the session's own browser CDP endpoint for true parallel execution
        options.cdpEndpoint = browserSession.browserWSEndpoint;
        options.useExistingBrowser = true;
        this.logger.info(
          `🔗 Using session browser for task: ${browserSession.browserWSEndpoint}`,
        );

        // Use browser-use service if available, otherwise fall back to basic agent
        if (this.browserUseService.isHealthy().initialized) {
          const result = await this.browserUseService.executeTask(
            sessionId,
            task,
            options,
          );

          // Generate live URL and streaming URL for this session
          const liveUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}`;
          const streamingUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}/stream`;

          res.json({
            success: true,
            result,
            provider: "browser-use-full",
            live_url: liveUrl,
            streaming_url: streamingUrl,
            live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
            streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
            message: `Task executed successfully! Browser is now available at: ${streamingUrl}`,
          });
        } else {
          const result = await this.agentService.executeTask(
            sessionId,
            task,
            options,
          );

          // Ensure browser navigates to a page if it's still on about:blank
          const browserSession = this.browserService.getSession(sessionId);
          if (browserSession && browserSession.page) {
            try {
              const currentUrl = await browserSession.page.url();
              if (currentUrl === "about:blank") {
                this.logger.info(
                  `🔄 Browser is on about:blank, navigating to Google for session ${sessionId}`,
                );
                await browserSession.page.goto("https://www.google.com", {
                  waitUntil: "networkidle0",
                  timeout: 10000,
                });
                this.logger.info(
                  `✅ Browser navigated to Google for session ${sessionId}`,
                );
              }
            } catch (navError) {
              this.logger.warn(
                `⚠️ Failed to navigate browser for session ${sessionId}:`,
                navError.message,
              );
            }
          }

          // Generate live URL and streaming URL for this session
          const liveUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}`;
          const streamingUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}/stream`;

          res.json({
            success: true,
            result,
            provider: "basic-agent",
            live_url: liveUrl,
            streaming_url: streamingUrl,
            live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
            streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
            message: `Task executed successfully! Browser is now available at: ${streamingUrl}`,
          });
        }
      } catch (error) {
        this.logger.error("Failed to execute task:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.get("/status", async (req, res) => {
      try {
        const activeAgents = this.browserUseService.getActiveAgents();
        const basicAgents = this.agentService.getActiveAgents
          ? this.agentService.getActiveAgents()
          : [];
        res.json({
          browserUseAgents: activeAgents,
          basicAgents: basicAgents,
          total: activeAgents.length + basicAgents.length,
        });
      } catch (error) {
        this.logger.error("Failed to get agent status:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.post("/stop/:executionId", async (req, res) => {
      try {
        const { executionId } = req.params;
        const stopped =
          (await this.browserUseService.stopAgent(executionId)) ||
          (this.agentService.stopAgent
            ? await this.agentService.stopAgent(executionId)
            : false);
        res.json({ success: stopped });
      } catch (error) {
        this.logger.error("Failed to stop agent:", error);
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  createBrowserUseRoutes() {
    const router = express.Router();

    // Execute task with full browser-use capabilities - IMMEDIATE RESPONSE
    router.post("/execute", async (req, res) => {
      try {
        const { sessionId, task, options = {} } = req.body;

        if (!sessionId || !task) {
          return res
            .status(400)
            .json({ error: "sessionId and task are required" });
        }

        // Generate task ID for tracking
        const taskId = uuidv4();

        // Generate URLs immediately - use BASE_URL if set, otherwise use request host
        const baseUrl =
          process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
        const liveUrl = `${baseUrl}/api/live/${sessionId}`;
        const streamingUrl = `${baseUrl}/stream/${sessionId}`;
        const websocketStreamingUrl = `${baseUrl}/stream/${sessionId}?sessionId=${sessionId}`;

        // Return streaming URLs immediately - don't wait for task completion
        res.json({
          success: true,
          taskId: taskId,
          sessionId: sessionId,
          status: "started",
          live_url: liveUrl,
          streaming_url: streamingUrl,
          websocket_streaming_url: websocketStreamingUrl,
          live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
          streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
          websocket_streaming_embed: `<iframe src="${websocketStreamingUrl}" width="100%" height="600px"></iframe>`,
          message: `Task started! Browser streaming available at: ${websocketStreamingUrl}`,
        });

        // Execute task asynchronously in the background
        this.executeTaskAsync(sessionId, task, taskId, options, req).catch(
          (error) => {
            this.logger.error(`Task ${taskId} execution failed:`, error);
          },
        );
      } catch (error) {
        this.logger.error("Browser-use execution setup failed:", error);
        res.status(500).json({
          error: error.message,
          type: "browser-use-execution-error",
        });
      }
    });

    // Get task status by taskId or sessionId
    router.get("/status/:identifier", async (req, res) => {
      try {
        const { identifier } = req.params;

        // Try to get status by taskId first, then by sessionId
        let taskStatus = this.browserUseService.getTaskStatus(identifier);

        if (!taskStatus) {
          // Try to get by sessionId
          const activeTasks = this.browserUseService.getActiveTasks();
          taskStatus = activeTasks.find(
            (task) => task.sessionId === identifier,
          );
        }

        if (!taskStatus) {
          return res.status(404).json({
            error: "Task not found",
            identifier: identifier,
          });
        }

        res.json({
          success: true,
          taskId: taskStatus.taskId,
          sessionId: taskStatus.sessionId,
          status: taskStatus.status,
          progress: taskStatus.progress,
          result: taskStatus.result,
          error: taskStatus.error,
          tokenUsage: taskStatus.tokenUsage,
          startedAt: taskStatus.startedAt,
          completedAt: taskStatus.completedAt,
          duration: taskStatus.completedAt
            ? new Date(taskStatus.completedAt) - new Date(taskStatus.startedAt)
            : Date.now() - new Date(taskStatus.startedAt),
        });
      } catch (error) {
        this.logger.error("Failed to get task status:", error);
        res.status(500).json({
          error: error.message,
          type: "status-check-error",
        });
      }
    });

    // Get all active tasks
    router.get("/tasks", async (req, res) => {
      try {
        const activeTasks = this.browserUseService.getActiveTasks();
        res.json({
          success: true,
          tasks: activeTasks,
          count: activeTasks.length,
        });
      } catch (error) {
        this.logger.error("Failed to get active tasks:", error);
        res.status(500).json({
          error: error.message,
          type: "tasks-list-error",
        });
      }
    });

    // Get task history
    router.get("/history", async (req, res) => {
      try {
        const { limit = 50 } = req.query;
        const history = this.browserUseService.getTaskHistory(parseInt(limit));
        res.json({
          success: true,
          tasks: history,
          count: history.length,
        });
      } catch (error) {
        this.logger.error("Failed to get task history:", error);
        res.status(500).json({
          error: error.message,
          type: "history-error",
        });
      }
    });

    // Get token usage for a specific task
    router.get("/tokens/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;

        // Get task status first to ensure task exists
        const taskStatus = this.browserUseService.getTaskStatus(taskId);
        if (!taskStatus) {
          return res.status(404).json({
            error: "Task not found",
            taskId: taskId,
          });
        }

        // Get detailed token usage
        const tokenUsage = this.browserUseService.getTokenUsage(taskId);

        res.json({
          success: true,
          taskId: taskId,
          sessionId: taskStatus.sessionId,
          status: taskStatus.status,
          tokenUsage: tokenUsage,
          task: taskStatus.task,
          startedAt: taskStatus.startedAt,
          completedAt: taskStatus.completedAt,
          duration: taskStatus.completedAt
            ? new Date(taskStatus.completedAt) - new Date(taskStatus.startedAt)
            : Date.now() - new Date(taskStatus.startedAt),
        });
      } catch (error) {
        this.logger.error("Failed to get task token usage:", error);
        res.status(500).json({
          error: error.message,
          type: "token-usage-error",
        });
      }
    });

    // Get logs for a specific task
    router.get("/logs/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;

        // Get task status first to ensure task exists
        const taskStatus = this.browserUseService.getTaskStatus(taskId);
        if (!taskStatus) {
          return res.status(404).json({
            error: "Task not found",
            taskId: taskId,
          });
        }

        // Get task logs
        const logs = this.browserUseService.getTaskLogs(taskId);

        res.json({
          success: true,
          taskId: taskId,
          sessionId: taskStatus.sessionId,
          status: taskStatus.status,
          logs: logs,
          total: logs.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("Failed to get task logs:", error);
        res.status(500).json({
          error: error.message,
          type: "logs-error",
        });
      }
    });

    // Get environment validation status
    router.get("/validate", async (req, res) => {
      try {
        const validation = await this.browserUseService.validateEnvironment();
        res.json(validation);
      } catch (error) {
        this.logger.error("Environment validation failed:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get active browser-use agents
    router.get("/agents", async (req, res) => {
      try {
        const agents = this.browserUseService.getActiveAgents();
        res.json({ agents, count: agents.length });
      } catch (error) {
        this.logger.error("Failed to get browser-use agents:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop specific agent
    router.post("/agents/:executionId/stop", async (req, res) => {
      try {
        const { executionId } = req.params;
        const stopped = await this.browserUseService.stopAgent(executionId);
        res.json({ success: stopped, executionId });
      } catch (error) {
        this.logger.error("Failed to stop browser-use agent:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop all agents
    router.post("/agents/stop-all", async (req, res) => {
      try {
        await this.browserUseService.stopAllAgents();
        res.json({ success: true, message: "All browser-use agents stopped" });
      } catch (error) {
        this.logger.error("Failed to stop all browser-use agents:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get service health
    router.get("/health", async (req, res) => {
      try {
        const health = this.browserUseService.isHealthy();
        res.json(health);
      } catch (error) {
        this.logger.error("Browser-use health check failed:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop a specific task
    router.post("/tasks/:taskId/stop", async (req, res) => {
      try {
        const { taskId } = req.params;
        const result = this.browserUseService.stopTask(taskId);
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to stop task:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Pause a specific task
    router.post("/tasks/:taskId/pause", async (req, res) => {
      try {
        const { taskId } = req.params;
        const result = this.browserUseService.pauseTask(taskId);
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to pause task:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Resume a specific task
    router.post("/tasks/:taskId/resume", async (req, res) => {
      try {
        const { taskId } = req.params;
        const result = this.browserUseService.resumeTask(taskId);
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to resume task:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Stop all tasks
    router.post("/tasks/stop-all", async (req, res) => {
      try {
        const result = this.browserUseService.stopAllTasks();
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to stop all tasks:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Pause all tasks
    router.post("/tasks/pause-all", async (req, res) => {
      try {
        const result = this.browserUseService.pauseAllTasks();
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to pause all tasks:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Resume all tasks
    router.post("/tasks/resume-all", async (req, res) => {
      try {
        const result = this.browserUseService.resumeAllTasks();
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to resume all tasks:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete a specific task
    router.delete("/tasks/:taskId", async (req, res) => {
      try {
        const { taskId } = req.params;
        const result = this.browserUseService.deleteTask(taskId);
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to delete task:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete all tasks
    router.delete("/tasks", async (req, res) => {
      try {
        const result = this.browserUseService.deleteAllTasks();
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to delete all tasks:", error);
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  // Execute task asynchronously in the background
  async executeTaskAsync(sessionId, task, taskId, options, req) {
    try {
      this.logger.info(`🚀 Starting background task execution: ${taskId}`);

      // Register task as started immediately
      this.browserUseService.registerTaskStart(taskId, sessionId, task);

      // REMOVED: No need to initialize centralized browser - each session gets its own browser
      this.logger.info(
        "🚀 Using per-session browser instances for true parallel execution",
      );

      // Create streaming session using SEPARATE browser for parallel execution
      let browserSession = this.browserService.getSession(sessionId);
      if (!browserSession) {
        this.logger.info(
          "🔗 Creating streaming session with SEPARATE browser for parallel execution",
        );
        browserSession =
          await this.browserService.createSessionWithSeparateBrowser(
            sessionId,
            { width: 1920, height: 1480 }, // Increased height for full browser capture
          );

        // Start streaming for this session
        await this.browserService.startStreaming(sessionId, (frame) => {
          this.io.to(sessionId).emit("video-frame", frame);
          // this.logger.debug(
          //   `📹 Frame sent to session ${sessionId}, size: ${frame.length} bytes`
          // );
        });
        this.logger.info(`📺 Streaming started for session ${sessionId}`);
      }

      // Use the session's own browser CDP endpoint for true parallel execution
      options.cdpEndpoint = browserSession.browserWSEndpoint;
      options.useExistingBrowser = true;
      options.taskId = taskId;

      this.logger.info(
        `🔗 Using session browser CDP endpoint: ${browserSession.browserWSEndpoint}`,
      );

      // Update progress to indicate browser is ready
      this.browserUseService.updateTaskProgress(
        taskId,
        10,
        "Browser initialized and ready",
      );

      // Execute the task with better error handling
      let result;
      try {
        result = await this.browserUseService.executeTask(
          sessionId,
          task,
          options,
        );

        // Register task as completed
        this.browserUseService.registerTaskComplete(taskId, result);
        this.logger.info(`✅ Task ${taskId} completed successfully`);
      } catch (taskError) {
        // Task execution failed, but browser session is still available
        const errorMessage = taskError.message || taskError.toString();
        this.logger.error(`❌ Task ${taskId} execution failed:`, taskError);

        // Create a more informative error message
        const enhancedError = {
          message: `Task failed: ${errorMessage}`,
          details: taskError.stack || errorMessage,
          browserAvailable: true,
          streamingUrl: `${req.protocol}://${req.get("host")}/stream/${sessionId}?sessionId=${sessionId}`,
          liveUrl: `${req.protocol}://${req.get("host")}/api/live/${sessionId}`,
        };

        this.browserUseService.registerTaskError(taskId, enhancedError);
      }
    } catch (error) {
      // Critical error - browser setup failed
      this.logger.error(`❌ Critical error in task ${taskId}:`, error);

      const criticalError = {
        message: `Critical error: ${error.message || error.toString()}`,
        details: error.stack || error.toString(),
        browserAvailable: false,
        type: "critical_error",
      };

      this.browserUseService.registerTaskError(taskId, criticalError);
    }
  }

  createSessionRoutes() {
    const router = express.Router();

    router.post("/create", async (req, res) => {
      try {
        const { options = {} } = req.body;
        const session = await this.sessionManager.createSession(options);
        res.json({
          success: true,
          sessionId: session.id,
          session: session,
        });
      } catch (error) {
        this.logger.error("Failed to create session:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.get("/list", (req, res) => {
      try {
        const sessions = this.sessionManager.listSessions();
        res.json({ sessions });
      } catch (error) {
        this.logger.error("Failed to list sessions:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get all sessions (alias for /list)
    router.get("/", (req, res) => {
      try {
        const sessions = this.sessionManager.listSessions();
        res.json(sessions);
      } catch (error) {
        this.logger.error("Failed to list sessions:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.get("/:sessionId", (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }
        res.json({ session });
      } catch (error) {
        this.logger.error("Failed to get session:", error);
        res.status(500).json({ error: error.message });
      }
    });

    router.delete("/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const result = await this.sessionManager.destroySession(sessionId);
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to destroy session:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Delete all sessions
    router.delete("/", async (req, res) => {
      try {
        const result = await this.sessionManager.deleteAllSessions();
        res.json(result);
      } catch (error) {
        this.logger.error("Failed to delete all sessions:", error);
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  createTokenRoutes() {
    const router = express.Router();

    // Get token usage summary
    router.get("/summary", async (req, res) => {
      try {
        const summary = this.browserUseService.getTokenUsageSummary();
        res.json({
          success: true,
          summary,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("Failed to get token usage summary:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get token usage for specific execution
    router.get("/usage/:executionId", async (req, res) => {
      try {
        const { executionId } = req.params;
        const usage = this.browserUseService.getTokenUsage(executionId);

        if (!usage) {
          return res.status(404).json({
            error: "Token usage not found for this execution",
          });
        }

        res.json({
          success: true,
          usage,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("Failed to get token usage:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get recent token usage history
    router.get("/history", async (req, res) => {
      try {
        const { limit = 20 } = req.query;
        const history = this.browserUseService.tokenUsageHistory
          .slice(-parseInt(limit))
          .reverse(); // Most recent first

        res.json({
          success: true,
          history,
          count: history.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("Failed to get token usage history:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Clear token usage history
    router.delete("/history", async (req, res) => {
      try {
        this.browserUseService.clearTokenUsageHistory();
        res.json({
          success: true,
          message: "Token usage history cleared",
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        this.logger.error("Failed to clear token usage history:", error);
        res.status(500).json({ error: error.message });
      }
    });

    return router;
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      this.logger.info(
        `🔗 Client connected: ${socket.id} from ${socket.handshake.address}`,
      );

      // Log connection details
      this.logger.info(
        `Connection details: ${JSON.stringify({
          id: socket.id,
          transport: socket.conn.transport.name,
          remoteAddress: socket.handshake.address,
          userAgent: socket.handshake.headers["user-agent"],
        })}`,
      );

      // Session management
      socket.on("join-session", async (data) => {
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

          const session = this.sessionManager.getSession(sessionId);

          if (!session) {
            socket.emit("error", { message: "Session not found" });
            return;
          }

          socket.join(sessionId);
          socket.sessionId = sessionId;

          // Check if there's already a browser session streaming
          const browserSession = this.browserService.getSession(sessionId);
          if (browserSession && browserSession.streaming) {
            this.logger.info(
              `Client ${socket.id} joined session ${sessionId} - streaming already active`,
            );
            // Request an initial frame for immediate display
            socket.emit("session-joined", {
              sessionId,
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
            // Just acknowledge that the client joined the session room
            socket.emit("session-joined", {
              sessionId,
              message: "Session joined - submit a task to start streaming",
              streamingActive: false,
            });
            this.logger.info(
              `Client ${socket.id} joined session ${sessionId} (streaming will start when task is executed)`,
            );
          }
        } catch (error) {
          this.logger.error("Failed to join session:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Test event handler for debugging client connectivity
      socket.on("test-event", (data) => {
        try {
          this.logger.info(
            `🧪 Test event received from client ${socket.id}:`,
            data,
          );
          socket.emit("test-event-response", {
            success: true,
            message: "Test event received successfully",
            clientId: socket.id,
            sessionId: socket.sessionId,
            timestamp: Date.now(),
          });
        } catch (error) {
          this.logger.error("Failed to handle test event:", error);
          socket.emit("test-event-response", {
            success: false,
            message: error.message,
          });
        }
      });

      // Handle request for fresh frame
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

          // Take a screenshot and send it as a frame (use JPEG for better performance like index.html)
          const screenshot = await browserSession.page.screenshot({
            type: "jpeg",
            quality: 90,
            fullPage: false,
          });

          const frameData = {
            sessionId: targetSessionId,
            data: screenshot.toString("base64"),
            timestamp: Date.now(),
          };

          socket.emit("video-frame", frameData);
          this.logger.debug(
            `📸 Sent frame to client ${socket.id} for session ${targetSessionId}`,
          );
        } catch (error) {
          this.logger.error("Failed to handle request-frame:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Tab management endpoints
      socket.on("get-available-tabs", async (data) => {
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
          if (!browserSession || !browserSession.browser) {
            socket.emit("error", {
              message: "Browser session not found or not ready",
            });
            return;
          }

          // Get all pages/tabs from the browser
          const pages = await browserSession.browser.pages();
          const tabs = pages.map((page, index) => ({
            id: page.target()._targetId || `tab-${index}`,
            title: page.title() || `Tab ${index + 1}`,
            url: page.url(),
            index: index,
            isActive: page === browserSession.page,
          }));

          socket.emit("available-tabs", {
            sessionId: targetSessionId,
            tabs: tabs,
            currentTabId:
              browserSession.page?.target()._targetId || tabs[0]?.id,
          });

          this.logger.info(
            `📑 Sent ${tabs.length} available tabs to client ${socket.id} for session ${targetSessionId}`,
          );
        } catch (error) {
          this.logger.error("Failed to get available tabs:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("switch-to-tab", async (data) => {
        try {
          const { sessionId, tabId } = data;
          const targetSessionId = sessionId || socket.sessionId;

          if (!targetSessionId) {
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          // Get the browser session
          const browserSession =
            this.browserService.getSession(targetSessionId);
          if (!browserSession || !browserSession.browser) {
            socket.emit("error", {
              message: "Browser session not found or not ready",
            });
            return;
          }

          // Get all pages and find the target tab
          const pages = await browserSession.browser.pages();
          const targetPage = pages.find(
            (page) =>
              page.target()._targetId === tabId ||
              page.url() === tabId ||
              page.title() === tabId,
          );

          if (!targetPage) {
            socket.emit("tab-switch-error", {
              message: "Target tab not found",
              tabId: tabId,
              previousTabId: browserSession.page?.target()._targetId,
            });
            return;
          }

          // Switch to the target page
          browserSession.page = targetPage;

          // Bring the page to front
          await targetPage.bringToFront();

          // Wait a moment for the page to be fully active
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Take a screenshot from the new tab
          const screenshot = await targetPage.screenshot({
            type: "jpeg",
            quality: 90,
            fullPage: false,
          });

          // Send confirmation and new frame
          socket.emit("tab-switched", {
            sessionId: targetSessionId,
            tabId: tabId,
            message: "Tab switched successfully",
          });

          // Send the new frame to all clients in the session
          this.io
            .to(targetSessionId)
            .emit("video-frame", screenshot.toString("base64"));

          this.logger.info(
            `🔄 Tab switched to ${tabId} for session ${targetSessionId}`,
          );
        } catch (error) {
          this.logger.error("Failed to switch tab:", error);
          socket.emit("tab-switch-error", {
            message: error.message,
            tabId: data.tabId,
            previousTabId: null,
          });
        }
      });

      socket.on("request-tab-frame", async (data) => {
        try {
          const { sessionId, tabId } = data;
          const targetSessionId = sessionId || socket.sessionId;

          if (!targetSessionId) {
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          // Get the browser session
          const browserSession =
            this.browserService.getSession(targetSessionId);
          if (!browserSession || !browserSession.browser) {
            socket.emit("error", {
              message: "Browser session not found or not ready",
            });
            return;
          }

          // Find the specific tab if tabId is provided
          let targetPage = browserSession.page;
          if (tabId) {
            const pages = await browserSession.browser.pages();
            targetPage = pages.find(
              (page) =>
                page.target()._targetId === tabId ||
                page.url() === tabId ||
                page.title() === tabId,
            );
          }

          if (!targetPage) {
            socket.emit("error", { message: "Target tab not found" });
            return;
          }

          // Take a screenshot from the target tab
          const screenshot = await targetPage.screenshot({
            type: "jpeg",
            quality: 90,
            fullPage: false,
          });

          // Send the frame with tab information
          socket.emit("tab-frame-updated", {
            sessionId: targetSessionId,
            tabId: tabId || targetPage.target()._targetId,
            frameData: screenshot.toString("base64"),
            timestamp: Date.now(),
          });

          this.logger.debug(
            `📸 Sent tab frame to client ${socket.id} for session ${targetSessionId}, tab ${tabId}`,
          );
        } catch (error) {
          this.logger.error("Failed to get tab frame:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Browser interaction events
      socket.on("mouse-event", async (data, callback) => {
        try {
          if (!socket.sessionId) {
            if (callback)
              callback({ success: false, message: "No session ID" });
            return;
          }
          const result = await this.browserService.handleMouseEvent(
            socket.sessionId,
            data,
          );
          if (callback) callback(result || { success: true });
        } catch (error) {
          this.logger.error("Mouse event error:", error);
          if (callback) callback({ success: false, message: error.message });
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("keyboard-event", async (data, callback) => {
        try {
          if (!socket.sessionId) {
            if (callback)
              callback({ success: false, message: "No session ID" });
            return;
          }
          const result = await this.browserService.handleKeyboardEvent(
            socket.sessionId,
            data,
          );
          if (callback) callback(result || { success: true });
        } catch (error) {
          this.logger.error("Keyboard event error:", error);
          if (callback) callback({ success: false, message: error.message });
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("navigation-event", async (data) => {
        try {
          if (!socket.sessionId) return;
          await this.browserService.navigate(socket.sessionId, data.url);
          socket.emit("navigation-complete", { url: data.url });
        } catch (error) {
          this.logger.error("Navigation error:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // AI Agent events
      socket.on("agent-task", async (data) => {
        try {
          const { task, options, sessionId } = data;

          // Use sessionId from data if socket.sessionId is not set, or prefer explicit sessionId
          const targetSessionId = sessionId || socket.sessionId;

          if (!targetSessionId) {
            socket.emit("error", { message: "No session ID available" });
            return;
          }

          // Set socket.sessionId if it wasn't already set
          if (!socket.sessionId && sessionId) {
            socket.sessionId = sessionId;
            socket.join(sessionId);
          }

          // REMOVED: No need to initialize centralized browser - each session gets its own browser
          this.logger.info(
            "🚀 Using per-session browser instances for true parallel execution via WebSocket",
          );

          // Create streaming session using SEPARATE browser for parallel execution
          let browserSession = this.browserService.getSession(targetSessionId);
          if (!browserSession) {
            this.logger.info(
              "🔗 Creating streaming session with SEPARATE browser for parallel execution",
            );
            browserSession =
              await this.browserService.createSessionWithSeparateBrowser(
                targetSessionId,
                { width: 1920, height: 1480 }, // Increased height for full browser capture
              );

            // Start streaming for this session with WebSocket callback
            await this.browserService.startStreaming(
              targetSessionId,
              (frameData) => {
                this.io.to(targetSessionId).emit("video-frame", frameData);
              },
            );
          }

          // Generate taskId upfront so it's available in callbacks
          const taskId = uuidv4();

          // Use browser-use integration for consistency with HTTP endpoints
          await this.browserUseService.executeTask(targetSessionId, task, {
            ...options,
            taskId: taskId,
            cdpEndpoint: browserSession.browserWSEndpoint, // Use session's own CDP endpoint
            useExistingBrowser: true,
            onProgress: (progress) => {
              socket.emit("task-progress", { taskId, progress });
            },
            onComplete: (result) => {
              socket.emit("agent-complete", { taskId, result });
            },
            onError: (error) => {
              socket.emit("agent-error", { taskId, error: error.message });
            },
          });

          socket.emit("agent-task-started", { taskId });
        } catch (error) {
          this.logger.error("Agent task error:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Task logs streaming
      socket.on("start-task-logs", (data) => {
        try {
          const { taskId } = data;

          if (!taskId) {
            socket.emit("error", { message: "Task ID is required" });
            return;
          }

          // Start log streaming for this task
          const cleanup = this.browserUseService.getTaskLogsStream(
            taskId,
            (logData) => {
              socket.emit("task-logs", logData);
            },
          );

          // Store cleanup function for this socket
          if (!socket.logStreams) {
            socket.logStreams = new Map();
          }
          socket.logStreams.set(taskId, cleanup);

          socket.emit("task-logs-started", { taskId });
        } catch (error) {
          this.logger.error("Failed to start task logs:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Stop task logs streaming
      socket.on("stop-task-logs", (data) => {
        try {
          const { taskId } = data;

          if (!taskId) {
            socket.emit("error", { message: "Task ID is required" });
            return;
          }

          // Stop log streaming
          const stopped = this.browserUseService.stopTaskLogStream(taskId);

          // Clean up socket reference
          if (socket.logStreams && socket.logStreams.has(taskId)) {
            const cleanup = socket.logStreams.get(taskId);
            if (cleanup) {
              cleanup();
            }
            socket.logStreams.delete(taskId);
          }

          socket.emit("task-logs-stopped", { taskId, stopped });
        } catch (error) {
          this.logger.error("Failed to stop task logs:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Task control events
      socket.on("stop-task", (data) => {
        try {
          const { taskId } = data;

          if (!taskId) {
            socket.emit("error", { message: "Task ID is required" });
            return;
          }

          const result = this.browserUseService.stopTask(taskId);
          socket.emit("task-stopped", { taskId, ...result });
        } catch (error) {
          this.logger.error("Failed to stop task:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("pause-task", (data) => {
        try {
          const { taskId } = data;

          if (!taskId) {
            socket.emit("error", { message: "Task ID is required" });
            return;
          }

          const result = this.browserUseService.pauseTask(taskId);
          socket.emit("task-paused", { taskId, ...result });
        } catch (error) {
          this.logger.error("Failed to pause task:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("resume-task", (data) => {
        try {
          const { taskId } = data;

          if (!taskId) {
            socket.emit("error", { message: "Task ID is required" });
            return;
          }

          const result = this.browserUseService.resumeTask(taskId);
          socket.emit("task-resumed", { taskId, ...result });
        } catch (error) {
          this.logger.error("Failed to resume task:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("stop-all-tasks", () => {
        try {
          const result = this.browserUseService.stopAllTasks();
          socket.emit("all-tasks-stopped", result);
        } catch (error) {
          this.logger.error("Failed to stop all tasks:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("pause-all-tasks", () => {
        try {
          const result = this.browserUseService.pauseAllTasks();
          socket.emit("all-tasks-paused", result);
        } catch (error) {
          this.logger.error("Failed to pause all tasks:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("resume-all-tasks", () => {
        try {
          const result = this.browserUseService.resumeAllTasks();
          socket.emit("all-tasks-resumed", result);
        } catch (error) {
          this.logger.error("Failed to resume all tasks:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Task delete events
      socket.on("delete-task", (data) => {
        try {
          const { taskId } = data;

          if (!taskId) {
            socket.emit("error", { message: "Task ID is required" });
            return;
          }

          const result = this.browserUseService.deleteTask(taskId);
          socket.emit("task-deleted", result);
        } catch (error) {
          this.logger.error("Failed to delete task:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("delete-all-tasks", () => {
        try {
          const result = this.browserUseService.deleteAllTasks();
          socket.emit("all-tasks-deleted", result);
        } catch (error) {
          this.logger.error("Failed to delete all tasks:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Session delete events
      socket.on("delete-session", async (data) => {
        try {
          const { sessionId } = data;

          if (!sessionId) {
            socket.emit("error", { message: "Session ID is required" });
            return;
          }

          const result = await this.sessionManager.destroySession(sessionId);
          socket.emit("session-deleted", result);
        } catch (error) {
          this.logger.error("Failed to delete session:", error);
          socket.emit("error", { message: error.message });
        }
      });

      socket.on("delete-all-sessions", async () => {
        try {
          const result = await this.sessionManager.deleteAllSessions();
          socket.emit("all-sessions-deleted", result);
        } catch (error) {
          this.logger.error("Failed to delete all sessions:", error);
          socket.emit("error", { message: error.message });
        }
      });

      // Disconnect handling
      socket.on("disconnect", async () => {
        this.logger.info(`Client disconnected: ${socket.id}`);

        // Clean up log streams
        if (socket.logStreams) {
          socket.logStreams.forEach((cleanup, taskId) => {
            if (cleanup) {
              cleanup();
            }
            this.browserUseService.stopTaskLogStream(taskId);
          });
          socket.logStreams.clear();
        }

        if (socket.sessionId) {
          await this.browserService.stopStreaming(socket.sessionId);

          // Check if this was the last client for this session
          const room = this.io.sockets.adapter.rooms.get(socket.sessionId);
          if (!room || room.size === 0) {
            // Consider closing the browser session after a timeout
            setTimeout(async () => {
              const stillActive = this.io.sockets.adapter.rooms.get(
                socket.sessionId,
              );
              if (!stillActive || stillActive.size === 0) {
                await this.sessionManager.destroySession(socket.sessionId);
              }
            }, 30000); // 30 second grace period
          }
        }
      });
    });
  }

  async start() {
    try {
      // STEP 1: Initialize services (NO browser created yet)
      await this.browserService.initialize();
      await this.agentService.initialize();

      // SKIP browser-use initialization during startup - it will be initialized on first use
      // This prevents any premature browser creation during server startup
      this.logger.info(
        "⏭️ Browser-Use Integration Service will be initialized on first use",
      );
      this.browserUseService.isInitialized = false; // Mark as not initialized

      await this.sessionManager.initialize();

      // Initialize security service - make it optional if it fails
      try {
        await this.securityService.initialize();
        this.logger.info("🔒 Security Service initialized");
      } catch (error) {
        this.logger.warn(
          "⚠️ Security Service failed to initialize:",
          error.message,
        );
        this.logger.info("🔄 Continuing without advanced security features");
      }

      // Add Socket.IO middleware for debugging (only log successful connections)
      this.io.use((socket, next) => {
        // Only log once per connection, not for every handshake attempt
        if (!socket.handshake.headers["x-socket-io-logged"]) {
          this.logger.info(
            `🔌 Socket.IO connection from ${socket.handshake.address}`,
          );
          socket.handshake.headers["x-socket-io-logged"] = "true";
        }
        next();
      });

      // Socket handlers already set up in constructor
      this.logger.info("🔗 WebSocket handlers ready");

      this.server.listen(this.port, () => {
        this.logger.info(
          `🚀 Unified Browser Platform started on port ${this.port}`,
        );
        this.logger.info(`📱 Dashboard: http://localhost:${this.port}`);
        this.logger.info(`🔧 API: http://localhost:${this.port}/api`);
        this.logger.info(`💡 Health: http://localhost:${this.port}/health`);
        this.logger.info(`🔗 WebSocket: ws://localhost:${this.port}`);
      });

      // Start periodic cleanup of invalid sessions
      this.startPeriodicCleanup();

      // Graceful shutdown
      process.on("SIGTERM", () => this.shutdown());
      process.on("SIGINT", () => this.shutdown());
    } catch (error) {
      this.logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  startPeriodicCleanup() {
    // Clean up invalid sessions every 30 seconds
    setInterval(async () => {
      try {
        await this.browserService.cleanupInvalidSessions();
      } catch (error) {
        this.logger.error("Error during periodic cleanup:", error);
      }
    }, 30000); // 30 seconds
  }

  createLiveBrowserRoutes() {
    const router = express.Router();

    // Live URL endpoint - serves live browser content
    router.get("/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;

        // Check if session exists in session manager
        const sessionRecord = this.sessionManager.getSession(sessionId);
        if (!sessionRecord) {
          return res.status(404).json({
            error: "Session not found",
            message: "Session not found in session manager",
          });
        }

        let session = this.browserService.getSession(sessionId);

        if (!session || !session.page) {
          return res.status(404).json({
            error: "Browser session not found",
            message:
              "Browser session not found or not active. Please navigate to a URL first to create the browser session.",
          });
        }

        // Get current page information
        const currentUrl = await session.page.url();
        const pageTitle = await session.page.title();

        // Get the page HTML
        const html = await session.page.content();

        // Create enhanced HTML with streaming capabilities
        const enhancedHtml = this.createStreamingHTML(
          html,
          sessionId,
          currentUrl,
          pageTitle,
        );

        // Set headers for live content
        res.set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        });

        res.send(enhancedHtml);
      } catch (error) {
        this.logger.error("Failed to get live browser content:", error);
        res.status(500).json({
          error: "Failed to get browser content",
          details: error.message,
        });
      }
    });

    // Enhanced streaming live URL endpoint
    router.get("/:sessionId/stream", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.browserService.getSession(sessionId);

        if (!session || !session.page) {
          return res.status(404).json({
            error: "Session not found",
            message: "Browser session not found or not active",
          });
        }

        // Get current page information
        const currentUrl = await session.page.url();
        const pageTitle = await session.page.title();

        // Get the page HTML
        const html = await session.page.content();

        // Create enhanced HTML with streaming capabilities
        const enhancedHtml = this.createStreamingHTML(
          html,
          sessionId,
          currentUrl,
          pageTitle,
        );

        // Set headers for live content
        res.set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        });

        res.send(enhancedHtml);
      } catch (error) {
        this.logger.error("Failed to get streaming browser content:", error);
        res.status(500).json({
          error: "Failed to get browser content",
          details: error.message,
        });
      }
    });

    // Resource proxy endpoint - serves page resources (CSS, JS, images)
    router.get("/:sessionId/resources/*", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const resourcePath = req.params[0]; // The wildcard part

        const session = this.browserService.getSession(sessionId);
        if (!session || !session.page) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Get the original URL of the resource
        const currentUrl = await session.page.url();
        const baseUrl = new URL(currentUrl);
        const resourceUrl = new URL(resourcePath, baseUrl.origin);

        // Fetch the resource from the original site
        const response = await fetch(resourceUrl.toString());

        if (!response.ok) {
          return res.status(404).json({ error: "Resource not found" });
        }

        // Get content type and content
        const contentType =
          response.headers.get("content-type") || "application/octet-stream";
        const content = await response.buffer();

        // Set headers
        res.set({
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
          "X-Original-URL": resourceUrl.toString(),
        });

        res.send(content);
      } catch (error) {
        this.logger.error("Failed to proxy resource:", error);
        res.status(500).json({ error: "Failed to proxy resource" });
      }
    });

    // Navigation endpoint - navigate to a specific URL
    router.post("/:sessionId/navigate", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { url } = req.body;

        if (!url) {
          return res.status(400).json({ error: "URL is required" });
        }

        // Check if session exists in session manager
        const sessionRecord = this.sessionManager.getSession(sessionId);
        if (!sessionRecord) {
          return res.status(404).json({ error: "Session not found" });
        }

        // Check if browser session exists, if not create one
        let session = this.browserService.getSession(sessionId);
        if (!session || !session.page) {
          this.logger.info(
            `🚀 Creating browser session for ${sessionId} for navigation`,
          );

          // REMOVED: No need to initialize centralized browser - each session gets its own browser

          // Create browser session
          session = await this.browserService.createSessionWithSeparateBrowser(
            sessionId,
            { width: 1920, height: 1480 }, // Increased height for full browser capture
          );

          this.logger.info(`✅ Browser session created for ${sessionId}`);
        }

        this.logger.info(`🌐 Navigating session ${sessionId} to: ${url}`);

        // Ensure URL has protocol
        let targetUrl = url;
        if (!url.match(/^https?:\/\//)) {
          targetUrl = `https://${url}`;
        }

        await session.page.goto(targetUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        const currentUrl = await session.page.url();
        const pageTitle = await session.page.title();

        res.json({
          success: true,
          message: "Navigation completed",
          url: currentUrl,
          title: pageTitle,
        });
      } catch (error) {
        this.logger.error("Failed to navigate:", error);
        res
          .status(500)
          .json({ error: "Navigation failed", details: error.message });
      }
    });

    // Interaction endpoint - handles user interactions
    router.post("/:sessionId/interact", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { type, x, y, text, key, button = "left" } = req.body;

        const session = this.browserService.getSession(sessionId);
        if (!session || !session.page) {
          return res.status(404).json({ error: "Session not found" });
        }

        let result = { success: true, message: "Interaction completed" };

        switch (type) {
          case "click":
            await session.page.mouse.click(x, y, { button });
            break;
          case "type":
            await session.page.keyboard.type(text);
            break;
          case "press":
            await session.page.keyboard.press(key);
            break;
          case "scroll":
            await session.page.mouse.wheel(0, y);
            break;
          default:
            return res.status(400).json({ error: "Invalid interaction type" });
        }

        res.json(result);
      } catch (error) {
        this.logger.error("Failed to handle interaction:", error);
        res
          .status(500)
          .json({ error: "Interaction failed", details: error.message });
      }
    });

    return router;
  }

  createInteractiveHTML(originalHtml, sessionId, currentUrl, pageTitle) {
    // Create a wrapper HTML that includes interaction capabilities
    const interactiveHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle} - Live Browser</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        .browser-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 10px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
        }
        .browser-header .url-info {
            flex: 1;
            margin: 0 20px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .browser-header .controls {
            display: flex;
            gap: 10px;
        }
        .browser-header button {
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .browser-header button:hover {
            background: rgba(255,255,255,0.3);
        }
        .browser-content {
            position: relative;
            width: 100%;
            height: calc(100vh - 50px);
            overflow: hidden;
        }
        .browser-content iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        .interaction-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
        }
        .interaction-overlay.active {
            pointer-events: all;
        }
        .status-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 5px 10px;
            font-size: 12px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="browser-header">
        <div class="url-info">
            <strong>Live Browser:</strong> ${pageTitle}
            <br>
            <small>${currentUrl}</small>
        </div>
        <div class="controls">
            <button onclick="toggleInteraction()">Toggle Interaction</button>
            <button onclick="refreshPage()">Refresh</button>
            <button onclick="showInfo()">Info</button>
        </div>
    </div>
    
    <div class="browser-content">
        <div class="interaction-overlay" id="interactionOverlay"></div>
        <iframe id="browserFrame" srcdoc="${originalHtml.replace(/"/g, "&quot;")}"></iframe>
    </div>

    <div class="status-bar" id="statusBar">
        Ready - Click "Toggle Interaction" to enable user interactions
    </div>

    <script>
        const sessionId = '${sessionId}';
        const apiBase = '/api/live/' + sessionId;
        let interactionEnabled = false;

        function updateStatus(message) {
            document.getElementById('statusBar').textContent = message;
        }

        function toggleInteraction() {
            interactionEnabled = !interactionEnabled;
            const overlay = document.getElementById('interactionOverlay');
            overlay.classList.toggle('active', interactionEnabled);
            updateStatus(interactionEnabled ? 'Interaction enabled - Click and type to interact' : 'Interaction disabled');
        }

        function refreshPage() {
            window.location.reload();
        }

        function showInfo() {
            alert('Live Browser Session:\\n\\nSession ID: ' + sessionId + '\\nCurrent URL: ' + '${currentUrl}' + '\\n\\nUse "Toggle Interaction" to enable mouse and keyboard interactions with the page.');
        }

        // Handle interactions
        document.getElementById('interactionOverlay').addEventListener('click', async function(e) {
            if (!interactionEnabled) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            try {
                const response = await fetch(apiBase + '/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'click',
                        x: x,
                        y: y,
                        button: e.button === 2 ? 'right' : 'left'
                    })
                });
                
                if (response.ok) {
                    updateStatus('Click registered at (' + x + ', ' + y + ')');
                    // Refresh the page to show changes
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    updateStatus('Click failed');
                }
            } catch (error) {
                updateStatus('Error: ' + error.message);
            }
        });

        // Handle keyboard events
        document.addEventListener('keydown', async function(e) {
            if (!interactionEnabled) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            try {
                const response = await fetch(apiBase + '/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'press',
                        key: e.key
                    })
                });
                
                if (response.ok) {
                    updateStatus('Key pressed: ' + e.key);
                    // Refresh the page to show changes
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    updateStatus('Key press failed');
                }
            } catch (error) {
                updateStatus('Error: ' + error.message);
            }
        });

        // Prevent context menu
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });

        // Auto-refresh every 30 seconds to keep content fresh
        setInterval(() => {
            if (!interactionEnabled) {
                window.location.reload();
            }
        }, 30000);
    </script>
</body>
</html>`;

    return interactiveHtml;
  }

  createStreamingHTML(originalHtml, sessionId, currentUrl, pageTitle) {
    // Create a wrapper HTML optimized for streaming with auto-refresh
    const streamingHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle} - Streaming Browser</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }
        .streaming-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 13px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .streaming-header .url-info {
            flex: 1;
            margin: 0 16px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .streaming-header .controls {
            display: flex;
            gap: 8px;
        }
        .streaming-header button {
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            transition: background 0.2s;
        }
        .streaming-header button:hover {
            background: rgba(255,255,255,0.3);
        }
        .streaming-header button.active {
            background: rgba(255,255,255,0.4);
            border-color: rgba(255,255,255,0.6);
        }
        .streaming-content {
            position: relative;
            width: 100%;
            height: calc(100vh - 40px);
            overflow: hidden;
            background: white;
        }
        .streaming-content iframe {
            width: 100%;
            height: 100%;
            border: none;
            background: white;
        }
        .interaction-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
            background: transparent;
        }
        .interaction-overlay.active {
            pointer-events: all;
            cursor: crosshair;
        }
        .status-bar {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 4px 8px;
            font-size: 11px;
            text-align: center;
            z-index: 2000;
        }
        .refresh-indicator {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 3000;
            display: none;
        }
        .loading-spinner {
            display: inline-block;
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s ease-in-out infinite;
            margin-right: 6px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="streaming-header">
        <div class="url-info">
            <strong>🔄 Streaming Browser:</strong> ${pageTitle}
            <br>
            <small>${currentUrl}</small>
        </div>
        <div class="controls">
            <button id="interactionBtn" onclick="toggleInteraction()">Enable Interaction</button>
            <button onclick="refreshNow()">Refresh Now</button>
            <button onclick="showInfo()">Info</button>
        </div>
    </div>
    
    <div class="streaming-content">
        <div class="interaction-overlay" id="interactionOverlay"></div>
        <iframe id="browserFrame" srcdoc="${originalHtml.replace(/"/g, "&quot;")}"></iframe>
    </div>

    <div class="status-bar" id="statusBar">
        🔄 Auto-refresh enabled - Page will refresh every 5 seconds
    </div>

    <div class="refresh-indicator" id="refreshIndicator">
        <span class="loading-spinner"></span>Refreshing content...
    </div>

    <script>
        const sessionId = '${sessionId}';
        const apiBase = '/api/live/' + sessionId;
        let interactionEnabled = false;
        let autoRefreshInterval;
        let refreshTimeout;

        function updateStatus(message) {
            document.getElementById('statusBar').textContent = message;
        }

        function showRefreshIndicator() {
            document.getElementById('refreshIndicator').style.display = 'block';
        }

        function hideRefreshIndicator() {
            document.getElementById('refreshIndicator').style.display = 'none';
        }

        function toggleInteraction() {
            interactionEnabled = !interactionEnabled;
            const overlay = document.getElementById('interactionOverlay');
            const btn = document.getElementById('interactionBtn');
            
            overlay.classList.toggle('active', interactionEnabled);
            btn.classList.toggle('active', interactionEnabled);
            btn.textContent = interactionEnabled ? 'Disable Interaction' : 'Enable Interaction';
            
            updateStatus(interactionEnabled ? 
                '🖱️ Interaction enabled - Click and type to interact' : 
                '🔄 Auto-refresh enabled - Page will refresh every 5 seconds'
            );
        }

        function refreshNow() {
            showRefreshIndicator();
            setTimeout(() => {
                window.location.reload();
            }, 500);
        }

        function showInfo() {
            alert('Streaming Browser Session:\\n\\nSession ID: ' + sessionId + '\\nCurrent URL: ' + '${currentUrl}' + '\\n\\nFeatures:\\n• Auto-refresh every 5 seconds\\n• Interactive mode for clicks and typing\\n• Real-time browser content\\n\\nUse "Enable Interaction" to interact with the page.');
        }

        // Handle interactions
        document.getElementById('interactionOverlay').addEventListener('click', async function(e) {
            if (!interactionEnabled) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            try {
                updateStatus('🖱️ Clicking at (' + x + ', ' + y + ')...');
                
                const response = await fetch(apiBase + '/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'click',
                        x: x,
                        y: y,
                        button: e.button === 2 ? 'right' : 'left'
                    })
                });
                
                if (response.ok) {
                    updateStatus('✅ Click registered - Refreshing in 1 second...');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    updateStatus('❌ Click failed');
                }
            } catch (error) {
                updateStatus('❌ Error: ' + error.message);
            }
        });

        // Handle keyboard events
        document.addEventListener('keydown', async function(e) {
            if (!interactionEnabled) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            try {
                updateStatus('⌨️ Typing: ' + e.key);
                
                const response = await fetch(apiBase + '/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'press',
                        key: e.key
                    })
                });
                
                if (response.ok) {
                    updateStatus('✅ Key pressed - Refreshing in 1 second...');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    updateStatus('❌ Key press failed');
                }
            } catch (error) {
                updateStatus('❌ Error: ' + error.message);
            }
        });

        // Prevent context menu
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });

        // Auto-refresh functionality
        function startAutoRefresh() {
            if (autoRefreshInterval) clearInterval(autoRefreshInterval);
            
            autoRefreshInterval = setInterval(() => {
                if (!interactionEnabled) {
                    showRefreshIndicator();
                    setTimeout(() => window.location.reload(), 500);
                }
            }, 5000); // Refresh every 5 seconds
        }

        function stopAutoRefresh() {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        }

        // Start auto-refresh on page load
        startAutoRefresh();

        // Cleanup on page unload
        window.addEventListener('beforeunload', function() {
            stopAutoRefresh();
        });
    </script>
</body>
</html>`;

    return streamingHtml;
  }

  async shutdown() {
    this.logger.info("🛑 Shutting down Unified Browser Platform...");

    try {
      // Close all browser sessions
      await this.sessionManager.cleanup();
      await this.browserService.cleanup();
      await this.agentService.cleanup();

      // REMOVED: No centralized browser to cleanup - each session manages its own browser

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

// Start the platform
const platform = new UnifiedBrowserPlatform();
platform.start().catch(console.error);

export default UnifiedBrowserPlatform;
