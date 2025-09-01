import express from "express";
import { v4 as uuidv4 } from "uuid";

// Smart imports for IntelliSense - no extra files needed!
import { BrowserUseIntegrationService } from "../services/browser-use-integration.js";
import { BrowserStreamingService } from "../services/browser-streaming.js";
import { Logger } from "../utils/logger.js";

export function createBrowserUseRoutes(
  browserUseService,
  browserService,
  sessionManager,
  logger,
  io,
) {
  const router = express.Router();

  // Validate required services
  if (!sessionManager) {
    throw new Error("SessionManager is required for browser-use routes");
  }
  if (!browserService) {
    throw new Error("BrowserService is required for browser-use routes");
  }
  if (!browserUseService) {
    throw new Error("BrowserUseService is required for browser-use routes");
  }

  // Execute task with full browser-use capabilities - returns streaming URLs immediately
  router.post("/execute", async (req, res) => {
    try {
      // Check if services are ready
      if (!sessionManager.isInitialized) {
        return res.status(503).json({
          error:
            "Session Manager not ready yet. Please wait a moment and try again.",
          type: "service-not-ready",
        });
      }

      const { task, options = {} } = req.body;

      if (!task) {
        return res.status(400).json({ error: "task is required" });
      }

      // Generate task ID for tracking
      const taskId = uuidv4();

      // Create a new session using the session manager
      console.log(`🔄 Creating new session for task: ${task}`);

      // Double-check that createSession method exists
      if (typeof sessionManager.createSession !== "function") {
        console.error("❌ sessionManager.createSession is not a function!");
        return res.status(500).json({
          error: "Session Manager service not properly initialized",
          type: "service-error",
        });
      }

      let session;
      try {
        // Create session using session manager
        session = await sessionManager.createSession({
          width: 1920,
          height: 1480, // Taller to capture full Chrome UI
          timeout: 30 * 60 * 1000, // 30 minutes
          autoClose: true,
          description: `Task: ${task}`,
        });

        console.log(`✅ Session created successfully: ${session.id}`);

        // Now create the browser session and bind it to the session manager session
        const browserSession =
          await browserService.createSessionWithSeparateBrowser(session.id, {
            headless: false, // Make it visible for streaming
            width: 1920,
            height: 1480, // Taller to capture full Chrome UI
          });

        console.log(`✅ Browser session created for session: ${session.id}`);

        // Link the browser session to the session manager session
        session.browser = browserSession;
        session.status = "running";
      } catch (sessionError) {
        console.error(`❌ Failed to create session:`, sessionError);
        return res.status(500).json({
          error: `Failed to create browser session: ${sessionError.message}`,
          type: "session-creation-error",
        });
      }

      // Generate URLs immediately - use BASE_URL if set, otherwise use request host
      const baseUrl =
        process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
      const liveUrl = `${baseUrl}/api/live/${session.id}`;
      const streamingUrl = `${baseUrl}/stream/${session.id}`;
      const websocketStreamingUrl = `${baseUrl}/stream/${session.id}?sessionId=${session.id}`;

      // Return streaming URLs immediately - don't wait for task completion
      res.json({
        success: true,
        taskId: taskId,
        sessionId: session.id,
        status: "started",
        session_created: true, // Always true since we create a new session
        live_url: liveUrl,
        streaming_url: streamingUrl,
        websocket_streaming_url: websocketStreamingUrl,
        live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
        streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
        websocket_streaming_embed: `<iframe src="${websocketStreamingUrl}" width="100%" height="600px"></iframe>`,
        message: `Task started! Browser streaming available at: ${websocketStreamingUrl}`,
      });

      console.log("============CREATING TASK");

      // Execute task asynchronously in the background
      // Pass browserService so the integration can get the CDP endpoint
      browserUseService
        .executeTaskAsync(
          session.id,
          task,
          taskId,
          {
            ...options,
            browserService: browserService, // Pass browser service for CDP endpoint
            io: io, // Pass io instance for video streaming
          },
          req,
        )
        .catch((error) => {
          logger.error(`Task ${taskId} execution failed:`, error);
        });
    } catch (error) {
      logger.error("Browser-use execution setup failed:", error);
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
      let taskStatus = browserUseService.getTaskStatus(identifier);

      if (!taskStatus) {
        // Try to get by sessionId
        const activeTasks = browserUseService.getActiveTasks();
        taskStatus = activeTasks.find((task) => task.sessionId === identifier);
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
      logger.error("Failed to get task status:", error);
      res.status(500).json({
        error: error.message,
        type: "status-check-error",
      });
    }
  });

  // Get all active tasks
  router.get("/tasks", async (req, res) => {
    try {
      const activeTasks = browserUseService.getActiveTasks();
      res.json({
        success: true,
        tasks: activeTasks,
        count: activeTasks.length,
      });
    } catch (error) {
      logger.error("Failed to get active tasks:", error);
      res.status(500).json({
        error: error.message,
        type: "tasks-list-error",
      });
    }
  });

  // Get task execution history
  router.get("/history", async (req, res) => {
    try {
      const { limit = 50 } = req.query;
      const history = browserUseService.getTaskHistory(parseInt(limit));
      res.json({
        success: true,
        tasks: history,
        count: history.length,
      });
    } catch (error) {
      logger.error("Failed to get task history:", error);
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
      const taskStatus = browserUseService.getTaskStatus(taskId);
      if (!taskStatus) {
        return res.status(404).json({
          error: "Task not found",
          taskId: taskId,
        });
      }

      // Get detailed token usage
      const tokenUsage = browserUseService.getTokenUsage(taskId);

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
      logger.error("Failed to get task token usage:", error);
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
      const taskStatus = browserUseService.getTaskStatus(taskId);
      if (!taskStatus) {
        return res.status(404).json({
          error: "Task not found",
          taskId: taskId,
        });
      }

      // Get detailed logs
      const logs = browserUseService.getTaskLogs(taskId);

      res.json({
        success: true,
        taskId: taskId,
        sessionId: taskStatus.sessionId,
        status: taskStatus.status,
        logs: logs,
        task: taskStatus.task,
        startedAt: taskStatus.startedAt,
        completedAt: taskStatus.completedAt,
        duration: taskStatus.completedAt
          ? new Date(taskStatus.completedAt) - new Date(taskStatus.startedAt)
          : Date.now() - new Date(taskStatus.startedAt),
      });
    } catch (error) {
      logger.error("Failed to get task logs:", error);
      res.status(500).json({
        error: error.message,
        type: "logs-error",
      });
    }
  });

  // Stop a running task
  router.post("/stop/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const stopped = await browserUseService.stopTask(taskId);

      if (stopped) {
        res.json({
          success: true,
          taskId: taskId,
          message: "Task stopped successfully",
        });
      } else {
        res.status(404).json({
          error: "Task not found or already stopped",
          taskId: taskId,
        });
      }
    } catch (error) {
      logger.error("Failed to stop task:", error);
      res.status(500).json({
        error: error.message,
        type: "stop-task-error",
      });
    }
  });

  // Cancel a pending task
  router.post("/cancel/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const cancelled = await browserUseService.cancelTask(taskId);

      if (cancelled) {
        res.json({
          success: true,
          taskId: taskId,
          message: "Task cancelled successfully",
        });
      } else {
        res.status(404).json({
          error: "Task not found or cannot be cancelled",
          taskId: taskId,
        });
      }
    } catch (error) {
      logger.error("Failed to cancel task:", error);
      res.status(500).json({
        error: error.message,
        type: "cancel-task-error",
      });
    }
  });

  // Get service health status
  router.get("/health", async (req, res) => {
    try {
      const health = browserUseService.isHealthy();
      res.json({
        success: true,
        health: health,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get health status:", error);
      res.status(500).json({
        error: error.message,
        type: "health-check-error",
      });
    }
  });

  return router;
}
