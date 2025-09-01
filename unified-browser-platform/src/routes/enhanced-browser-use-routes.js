/**
 * Enhanced Browser-Use Routes with Session Management
 * Handles automatic session cleanup and lifecycle management
 */

import express from "express";
import { v4 as uuidv4 } from "uuid";

export function createEnhancedBrowserUseRoutes(
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

  // Enhanced execute endpoint with automatic session management
  router.post("/execute", async (req, res) => {
    let session = null;
    let taskId = null;

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
      taskId = uuidv4();

      logger.info(`🚀 Starting enhanced task execution: ${taskId}`);

      // Create a new session using the session manager
      try {
        session = await sessionManager.createSession({
          width: 1920,
          height: 1480,
          timeout: 30 * 60 * 1000, // 30 minutes
          autoClose: true,
          description: `Task: ${task}`,
          taskId: taskId, // Link task to session
        });

        logger.info(`✅ Session created successfully: ${session.id}`);

        // Create browser session and bind it to the session manager session
        const browserSession =
          await browserService.createSessionWithSeparateBrowser(session.id, {
            headless: false,
            width: 1920,
            height: 1480,
          });

        logger.info(`✅ Browser session created for session: ${session.id}`);

        // Link the browser session to the session manager session
        session.browser = browserSession;
        session.status = "running";

        // Register session with enhanced browser-use service for lifecycle management
        browserUseService.registerSession(session.id, {
          taskId: taskId,
          browserService: browserService,
          io: io,
          createdBy: req.ip,
          userAgent: req.get("User-Agent"),
        });
      } catch (sessionError) {
        logger.error(`❌ Failed to create session:`, sessionError);
        return res.status(500).json({
          error: `Failed to create browser session: ${sessionError.message}`,
          type: "session-creation-error",
        });
      }

      // Generate URLs immediately
      const baseUrl =
        process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
      const liveUrl = `${baseUrl}/api/live/${session.id}`;
      const streamingUrl = `${baseUrl}/stream/${session.id}`;
      const websocketStreamingUrl = `${baseUrl}/stream/${session.id}?sessionId=${session.id}`;

      // Return streaming URLs immediately with session lifecycle info
      const response = {
        success: true,
        taskId: taskId,
        sessionId: session.id,
        status: "started",
        session_created: true,
        live_url: liveUrl,
        streaming_url: streamingUrl,
        websocket_streaming_url: websocketStreamingUrl,
        live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
        streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
        websocket_streaming_embed: `<iframe src="${websocketStreamingUrl}" width="100%" height="600px"></iframe>`,
        message: `Task started! Browser streaming available at: ${websocketStreamingUrl}`,
        session_management: {
          auto_cleanup_enabled:
            browserUseService.config.forceCleanupOnTaskComplete,
          cleanup_delay_seconds: Math.round(
            browserUseService.config.sessionCleanupDelay / 1000,
          ),
          session_timeout_minutes: Math.round(
            browserUseService.config.sessionTimeout / 60000,
          ),
          idle_timeout_minutes: Math.round(
            browserUseService.config.maxSessionIdleTime / 60000,
          ),
        },
        cleanup_endpoints: {
          force_cleanup: `${baseUrl}/api/browser-use/sessions/${session.id}/cleanup`,
          session_status: `${baseUrl}/api/browser-use/sessions/${session.id}/status`,
        },
      };

      res.json(response);

      logger.info(
        `📤 Response sent for task ${taskId}, starting background execution...`,
      );

      // Execute task asynchronously in the background with enhanced session management
      browserUseService
        .executeTaskAsync(
          session.id,
          task,
          taskId,
          {
            ...options,
            browserService: browserService,
            io: io,
          },
          req,
        )
        .catch((error) => {
          logger.error(`❌ Task ${taskId} execution failed:`, error);

          // Ensure cleanup happens even on error
          setTimeout(() => {
            browserUseService.cleanupSession(
              session.id,
              "task_execution_error",
            );
          }, 5000); // 5 second delay
        });
    } catch (error) {
      logger.error("❌ Browser-use execution setup failed:", error);

      // Cleanup session if it was created but execution failed
      if (session) {
        try {
          await browserUseService.cleanupSession(session.id, "setup_failed");
        } catch (cleanupError) {
          logger.error(
            "❌ Failed to cleanup session after setup error:",
            cleanupError,
          );
        }
      }

      res.status(500).json({
        error: error.message,
        type: "browser-use-execution-error",
        taskId: taskId,
      });
    }
  });

  // Session management endpoints

  // Get session status and lifecycle information
  router.get("/sessions/:sessionId/status", async (req, res) => {
    try {
      const { sessionId } = req.params;

      const sessionInfo = browserUseService.getSessionInfo(sessionId);
      if (!sessionInfo) {
        return res.status(404).json({
          error: "Session not found",
          sessionId: sessionId,
        });
      }

      // Get task status if available
      let taskStatus = null;
      if (sessionInfo.taskId) {
        taskStatus = browserUseService.getTaskStatus(sessionInfo.taskId);
      }

      res.json({
        success: true,
        sessionId: sessionId,
        session: sessionInfo,
        task: taskStatus,
        lifecycle: {
          age_ms: sessionInfo.age,
          idle_time_ms: sessionInfo.idleTime,
          will_cleanup_at: sessionInfo.cleanupScheduled
            ? new Date(
                sessionInfo.lastActivity.getTime() +
                  browserUseService.config.sessionCleanupDelay,
              ).toISOString()
            : null,
        },
      });
    } catch (error) {
      logger.error("❌ Failed to get session status:", error);
      res.status(500).json({
        error: error.message,
        type: "session-status-error",
      });
    }
  });

  // Force cleanup a specific session
  router.post("/sessions/:sessionId/cleanup", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { reason = "manual_api_call" } = req.body;

      logger.info(`🔨 API cleanup request for session ${sessionId}`);

      const sessionInfo = browserUseService.getSessionInfo(sessionId);
      if (!sessionInfo) {
        return res.status(404).json({
          error: "Session not found",
          sessionId: sessionId,
        });
      }

      await browserUseService.forceCleanupSession(sessionId);

      res.json({
        success: true,
        sessionId: sessionId,
        message: "Session cleanup completed",
        cleaned_up_at: new Date().toISOString(),
        reason: reason,
      });
    } catch (error) {
      logger.error("❌ Failed to cleanup session:", error);
      res.status(500).json({
        error: error.message,
        type: "session-cleanup-error",
      });
    }
  });

  // Get all active sessions
  router.get("/sessions", async (req, res) => {
    try {
      const activeSessions = browserUseService.getActiveSessions();

      res.json({
        success: true,
        sessions: activeSessions,
        count: activeSessions.length,
        summary: {
          total_sessions: activeSessions.length,
          by_status: activeSessions.reduce((acc, session) => {
            acc[session.status] = (acc[session.status] || 0) + 1;
            return acc;
          }, {}),
          oldest_session_age_minutes:
            activeSessions.length > 0
              ? Math.round(
                  Math.max(...activeSessions.map((s) => s.age)) / 60000,
                )
              : 0,
        },
      });
    } catch (error) {
      logger.error("❌ Failed to get sessions:", error);
      res.status(500).json({
        error: error.message,
        type: "sessions-list-error",
      });
    }
  });

  // Cleanup all sessions (admin endpoint)
  router.post("/sessions/cleanup-all", async (req, res) => {
    try {
      const { confirm = false } = req.body;

      if (!confirm) {
        return res.status(400).json({
          error:
            'This action requires confirmation. Send {"confirm": true} in the request body.',
          warning:
            "This will cleanup ALL active sessions and stop all running tasks.",
        });
      }

      logger.warn("🧹 CLEANUP ALL sessions requested via API");

      const activeSessions = browserUseService.getActiveSessions();
      const cleanupPromises = activeSessions.map((session) =>
        browserUseService.forceCleanupSession(session.sessionId),
      );

      await Promise.allSettled(cleanupPromises);

      res.json({
        success: true,
        message: "All sessions cleanup initiated",
        cleaned_sessions_count: activeSessions.length,
        cleaned_up_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("❌ Failed to cleanup all sessions:", error);
      res.status(500).json({
        error: error.message,
        type: "cleanup-all-error",
      });
    }
  });

  // Task management endpoints (enhanced)

  // Get task status by taskId or sessionId
  router.get("/status/:identifier", async (req, res) => {
    try {
      const { identifier } = req.params;

      let taskStatus = browserUseService.getTaskStatus(identifier);

      if (!taskStatus) {
        const activeTasks = browserUseService.getActiveTasks();
        taskStatus = activeTasks.find((task) => task.sessionId === identifier);
      }

      if (!taskStatus) {
        return res.status(404).json({
          error: "Task not found",
          identifier: identifier,
        });
      }

      // Get session info if available
      let sessionInfo = null;
      if (taskStatus.sessionId) {
        sessionInfo = browserUseService.getSessionInfo(taskStatus.sessionId);
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
        session: sessionInfo,
      });
    } catch (error) {
      logger.error("Failed to get task status:", error);
      res.status(500).json({
        error: error.message,
        type: "status-check-error",
      });
    }
  });

  // Get all active tasks with session information
  router.get("/tasks", async (req, res) => {
    try {
      const activeTasks = browserUseService.getActiveTasks();

      // Enhance tasks with session information
      const enhancedTasks = activeTasks.map((task) => {
        const sessionInfo = browserUseService.getSessionInfo(task.sessionId);
        return {
          ...task,
          session: sessionInfo,
        };
      });

      res.json({
        success: true,
        tasks: enhancedTasks,
        count: enhancedTasks.length,
        summary: {
          by_status: enhancedTasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
          }, {}),
          with_active_sessions: enhancedTasks.filter(
            (task) => task.session?.status === "active",
          ).length,
        },
      });
    } catch (error) {
      logger.error("Failed to get active tasks:", error);
      res.status(500).json({
        error: error.message,
        type: "tasks-list-error",
      });
    }
  });

  // Stop a running task (also triggers session cleanup)
  router.post("/stop/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { cleanup_session = true } = req.body;

      // Get task info first
      const taskStatus = browserUseService.getTaskStatus(taskId);
      if (!taskStatus) {
        return res.status(404).json({
          error: "Task not found",
          taskId: taskId,
        });
      }

      const stopped = await browserUseService.stopTask(taskId);

      let cleanupResult = null;
      if (stopped && cleanup_session && taskStatus.sessionId) {
        try {
          await browserUseService.cleanupSession(
            taskStatus.sessionId,
            "task_stopped",
          );
          cleanupResult = { success: true, sessionId: taskStatus.sessionId };
        } catch (cleanupError) {
          cleanupResult = {
            success: false,
            error: cleanupError.message,
            sessionId: taskStatus.sessionId,
          };
        }
      }

      if (stopped) {
        res.json({
          success: true,
          taskId: taskId,
          message: "Task stopped successfully",
          session_cleanup: cleanupResult,
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

  // Get service health status with session management info
  router.get("/health", async (req, res) => {
    try {
      const health = browserUseService.isHealthy();
      const activeSessions = browserUseService.getActiveSessions();

      res.json({
        success: true,
        health: health,
        session_management: {
          active_sessions: activeSessions.length,
          cleanup_active: health.cleanup_active,
          config: health.config,
          oldest_session_age_minutes:
            activeSessions.length > 0
              ? Math.round(
                  Math.max(...activeSessions.map((s) => s.age)) / 60000,
                )
              : 0,
        },
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

  // Configuration endpoint
  router.get("/config", async (req, res) => {
    try {
      res.json({
        success: true,
        config: browserUseService.config,
        description: {
          sessionTimeout: "Maximum session lifetime in milliseconds",
          maxConcurrentSessions:
            "Maximum number of concurrent sessions allowed",
          cleanupInterval: "Background cleanup interval in milliseconds",
          maxSessionIdleTime: "Session idle timeout in milliseconds",
          forceCleanupOnTaskComplete:
            "Automatically cleanup session after task completion",
          sessionCleanupDelay:
            "Delay before cleanup after task completion in milliseconds",
        },
      });
    } catch (error) {
      logger.error("Failed to get config:", error);
      res.status(500).json({
        error: error.message,
        type: "config-error",
      });
    }
  });

  // Update configuration endpoint (admin)
  router.post("/config", async (req, res) => {
    try {
      const { config } = req.body;

      if (!config || typeof config !== "object") {
        return res.status(400).json({
          error: "Config object is required",
        });
      }

      // Validate config values
      const allowedKeys = [
        "sessionTimeout",
        "maxConcurrentSessions",
        "cleanupInterval",
        "maxSessionIdleTime",
        "forceCleanupOnTaskComplete",
        "sessionCleanupDelay",
      ];

      const updates = {};
      for (const [key, value] of Object.entries(config)) {
        if (allowedKeys.includes(key)) {
          updates[key] = value;
        }
      }

      // Apply updates
      Object.assign(browserUseService.config, updates);

      logger.info("📝 Configuration updated:", updates);

      res.json({
        success: true,
        message: "Configuration updated successfully",
        updated_config: browserUseService.config,
        applied_updates: updates,
      });
    } catch (error) {
      logger.error("Failed to update config:", error);
      res.status(500).json({
        error: error.message,
        type: "config-update-error",
      });
    }
  });

  // Include original endpoints for backward compatibility
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

  router.get("/tokens/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const taskStatus = browserUseService.getTaskStatus(taskId);

      if (!taskStatus) {
        return res.status(404).json({
          error: "Task not found",
          taskId: taskId,
        });
      }

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

  return router;
}
