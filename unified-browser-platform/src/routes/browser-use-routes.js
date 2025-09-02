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
          timeout: parseInt(process.env.SESSION_TIMEOUT) || 30 * 60 * 1000, // Environment variable or 30 minutes
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
        .then((result) => {
          // Check if task was paused before scheduling cleanup
          const taskInfo = browserUseService.getTaskInfo(taskId);
          const isTaskPaused =
            taskInfo && (taskInfo.status === "paused" || taskInfo.pausedByUser);

          if (isTaskPaused) {
            logger.info(
              `⏸️ Task ${taskId} was paused, skipping session cleanup to allow resume`,
            );
            return; // Don't clean up session for paused tasks
          }

          // Task completed successfully - schedule session cleanup
          logger.info(
            `✅ Task ${taskId} completed successfully, scheduling session cleanup`,
          );

          // Get cleanup delay from environment (default 30 seconds for faster cleanup)
          const cleanupDelay =
            parseInt(process.env.SESSION_CLEANUP_DELAY) || 30 * 1000;

          // Check if force cleanup is enabled (default to true for better UX)
          const forceCleanup =
            process.env.FORCE_CLEANUP_ON_TASK_COMPLETE !== "false";

          if (forceCleanup) {
            logger.info(
              `🧹 Scheduling session ${session.id} cleanup in ${cleanupDelay}ms after task completion`,
            );

            setTimeout(async () => {
              try {
                // Close browser session
                if (browserService) {
                  logger.info(`🌐 Closing browser session ${session.id}`);
                  await browserService.closeBrowser(session.id);
                }

                // Destroy session in session manager
                logger.info(`🗑️ Destroying session ${session.id}`);
                await sessionManager.destroySession(session.id);

                // Notify connected clients via WebSocket
                if (io) {
                  io.to(session.id).emit("session-cleanup", {
                    sessionId: session.id,
                    reason: "task_completion",
                    message: `Session ${session.id} has been cleaned up after task completion. Please refresh to start a new session.`,
                  });
                }

                logger.info(
                  `✅ Session ${session.id} cleanup completed after task completion`,
                );
              } catch (cleanupError) {
                logger.error(
                  `❌ Error during session cleanup for ${session.id}:`,
                  cleanupError,
                );
              }
            }, cleanupDelay);
          } else {
            logger.info(
              `⏭️ Session ${session.id} cleanup skipped (FORCE_CLEANUP_ON_TASK_COMPLETE=false)`,
            );
          }
        })
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

  // Get task status by taskId or sessionId - Enhanced version
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
          success: false,
          error: "Task not found",
          identifier: identifier,
          message: `No task found with identifier: ${identifier}`,
        });
      }

      // Calculate duration
      const startTime = new Date(taskStatus.startedAt);
      const endTime = taskStatus.completedAt
        ? new Date(taskStatus.completedAt)
        : new Date();
      const duration = endTime - startTime;

      // Clean status response - just task status as requested
      const response = {
        success: true,
        taskId: taskStatus.taskId,
        status: taskStatus.status, // running, completed, failed, queued, paused
        progress: taskStatus.progress || 0,
        message: getStatusMessage(taskStatus),

        // Essential timing
        startedAt: taskStatus.startedAt,
        completedAt: taskStatus.completedAt,
        duration: formatDuration(duration),

        // Include error if failed
        error: taskStatus.status === "failed" ? taskStatus.error : null,
      };

      res.json(response);
    } catch (error) {
      logger.error("Failed to get task status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "status-check-error",
      });
    }
  });

  // Get task result by taskId - NEW dedicated result endpoint
  router.get("/result/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;

      // Get task status first to ensure task exists
      const taskStatus = browserUseService.getTaskStatus(taskId);
      if (!taskStatus) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
          taskId: taskId,
          message: `No task found with ID: ${taskId}`,
        });
      }

      // Return result based on task status
      if (
        taskStatus.status === "running" ||
        taskStatus.status === "queued" ||
        taskStatus.status === "paused"
      ) {
        return res.json({
          success: false,
          taskId: taskId,
          status: taskStatus.status,
          message: `Task is still ${taskStatus.status}. Result not available yet.`,
          progress: taskStatus.progress || 0,
          resultAvailable: false,
        });
      }

      if (taskStatus.status === "failed") {
        return res.json({
          success: false,
          taskId: taskId,
          status: taskStatus.status,
          message: "Task failed. Check error details.",
          error: taskStatus.error,
          resultAvailable: false,
          timing: {
            startedAt: taskStatus.startedAt,
            failedAt: taskStatus.completedAt,
            duration: taskStatus.completedAt
              ? new Date(taskStatus.completedAt) -
                new Date(taskStatus.startedAt)
              : null,
          },
        });
      }

      // Task completed successfully
      const response = {
        success: true,
        taskId: taskId,
        sessionId: taskStatus.sessionId,
        status: taskStatus.status,
        message: "Task completed successfully",
        resultAvailable: true,

        // Full result data
        result: taskStatus.result,

        // Enhanced step-by-step execution summary
        executionSummary: await generateExecutionSummary(
          taskId,
          browserUseService,
        ),

        // Timing information
        timing: {
          startedAt: taskStatus.startedAt,
          completedAt: taskStatus.completedAt,
          duration: taskStatus.completedAt
            ? new Date(taskStatus.completedAt) - new Date(taskStatus.startedAt)
            : null,
          durationHuman: taskStatus.completedAt
            ? formatDuration(
                new Date(taskStatus.completedAt) -
                  new Date(taskStatus.startedAt),
              )
            : null,
        },

        // Token usage details
        tokenUsage: taskStatus.tokenUsage,

        // Session URLs
        urls: taskStatus.sessionId
          ? {
              liveUrl: `${req.protocol}://${req.get("host")}/api/live/${taskStatus.sessionId}`,
              streamingUrl: `${req.protocol}://${req.get("host")}/stream/${taskStatus.sessionId}`,
              logsUrl: `${req.protocol}://${req.get("host")}/api/browser-use/logs/${taskStatus.taskId}`,
            }
          : null,
      };

      res.json(response);
    } catch (error) {
      logger.error("Failed to get task result:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "result-fetch-error",
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

  // Get logs for a specific task - Enhanced version
  router.get("/logs/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { format = "json", limit, level, since } = req.query;

      // Get task status first to ensure task exists
      const taskStatus = browserUseService.getTaskStatus(taskId);
      if (!taskStatus) {
        return res.status(404).json({
          success: false,
          error: "Task not found",
          taskId: taskId,
          message: `No task found with ID: ${taskId}`,
        });
      }

      // Get detailed logs and filter for browser task actions only
      let logs = browserUseService.getTaskLogs(taskId);

      // Filter to show only browser task actions - polished logs
      logs = logs.filter((log) => {
        const message = log.message?.toLowerCase() || "";

        // Skip all system/environment logs
        if (message.includes("env:") || message.includes("environment"))
          return false;
        if (message.includes("python") || message.includes("sys.executable"))
          return false;
        if (message.includes("PATH=") || message.includes("NODE_"))
          return false;
        if (message.includes("__pycache__") || message.includes(">>>"))
          return false;
        if (message.includes("raw output") || message.includes("subprocess"))
          return false;
        if (message.includes("traceback") || message.includes("exception"))
          return false;

        // Only include actual browser actions and task progress
        const isBrowserAction =
          message.includes("click") ||
          message.includes("type") ||
          message.includes("navigate") ||
          message.includes("scroll") ||
          message.includes("wait") ||
          message.includes("search") ||
          message.includes("find") ||
          message.includes("element") ||
          message.includes("page") ||
          message.includes("url");

        const isTaskProgress =
          message.includes("step") ||
          message.includes("goal") ||
          message.includes("action:") ||
          message.includes("completed") ||
          message.includes("started") ||
          message.includes("finished") ||
          message.includes("executing");

        const isImportantInfo =
          log.level === "error" ||
          log.level === "warning" ||
          log.type === "step" ||
          log.type === "action" ||
          log.type === "goal";

        return isBrowserAction || isTaskProgress || isImportantInfo;
      });

      // Apply filters if specified
      if (level) {
        logs = logs.filter((log) => log.level === level.toLowerCase());
      }

      if (since) {
        const sinceDate = new Date(since);
        logs = logs.filter((log) => new Date(log.timestamp) >= sinceDate);
      }

      if (limit) {
        const limitNum = parseInt(limit);
        logs = logs.slice(-limitNum); // Get the most recent logs
      }

      // Format logs based on requested format
      if (format === "text") {
        const textLogs = logs
          .map(
            (log) =>
              `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`,
          )
          .join("\n");

        res.setHeader("Content-Type", "text/plain");
        res.send(textLogs);
        return;
      }

      // Polished JSON format response - browser task logs only
      const response = {
        success: true,
        taskId: taskId,
        status: taskStatus.status,

        // Polished logs - only browser task actions
        logs: logs.map((log) => {
          // Clean up the message for better readability
          let cleanMessage = log.message;

          // Remove timestamp prefixes if present
          cleanMessage = cleanMessage.replace(
            /^\[\d{4}-\d{2}-\d{2}.*?\]\s*/,
            "",
          );
          cleanMessage = cleanMessage.replace(/^\d{2}:\d{2}:\d{2}\s*/, "");

          // Clean up action prefixes
          cleanMessage = cleanMessage.replace(/^Action:\s*/i, "");
          cleanMessage = cleanMessage.replace(/^Step \d+:\s*/i, "");

          return {
            timestamp: log.timestamp,
            level: log.level,
            type: log.type || "action",
            message: cleanMessage,
            step: log.step || null,
            action: log.action || null,
          };
        }),

        // Simple summary focused on browser actions
        summary: {
          totalActions: logs.length,
          browserActions: logs.filter((l) => {
            const msg = l.message?.toLowerCase() || "";
            return (
              msg.includes("click") ||
              msg.includes("type") ||
              msg.includes("navigate") ||
              msg.includes("scroll") ||
              msg.includes("wait") ||
              msg.includes("search")
            );
          }).length,
          steps: logs.filter((l) => l.type === "step").length,
          errors: logs.filter((l) => l.level === "error").length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error("Failed to get task logs:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "logs-error",
      });
    }
  });

  // Stop a running task
  router.post("/tasks/:taskId/stop", async (req, res) => {
    try {
      const { taskId } = req.params;
      const result = await browserUseService.stopTask(taskId);

      if (result.success) {
        res.json({
          success: true,
          taskId: taskId,
          message: result.message,
          stoppedAt: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          taskId: taskId,
        });
      }
    } catch (error) {
      logger.error("Failed to stop task:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "stop-task-error",
      });
    }
  });

  // Pause a running task
  router.post("/tasks/:taskId/pause", async (req, res) => {
    try {
      const { taskId } = req.params;
      const result = await browserUseService.pauseTask(taskId);

      if (result.success) {
        res.json({
          success: true,
          taskId: taskId,
          message: result.message,
          pausedAt: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          taskId: taskId,
        });
      }
    } catch (error) {
      logger.error("Failed to pause task:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "pause-task-error",
      });
    }
  });

  // Resume a paused task
  router.post("/tasks/:taskId/resume", async (req, res) => {
    try {
      const { taskId } = req.params;
      const result = await browserUseService.resumeTask(
        taskId,
        browserService,
        io,
      );

      if (result.success) {
        res.json({
          success: true,
          taskId: taskId,
          message: result.message,
          resumedAt: new Date().toISOString(),
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          taskId: taskId,
        });
      }
    } catch (error) {
      logger.error("Failed to resume task:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "resume-task-error",
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

  // New convenient endpoints for session-based operations

  // Get status by sessionId specifically
  router.get("/session/:sessionId/status", async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Find task by sessionId
      const activeTasks = browserUseService.getActiveTasks();
      const historyTasks = browserUseService.getTaskHistory();

      let taskStatus = activeTasks.find((task) => task.sessionId === sessionId);
      if (!taskStatus) {
        taskStatus = historyTasks.find((task) => task.sessionId === sessionId);
      }

      if (!taskStatus) {
        return res.status(404).json({
          success: false,
          error: "No task found for this session",
          sessionId: sessionId,
        });
      }

      // Use existing status endpoint logic
      req.params.identifier = taskStatus.taskId;
      return router.handle(req, res);
    } catch (error) {
      logger.error("Failed to get session status:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "session-status-error",
      });
    }
  });

  // Get logs by sessionId specifically
  router.get("/session/:sessionId/logs", async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Find task by sessionId
      const activeTasks = browserUseService.getActiveTasks();
      const historyTasks = browserUseService.getTaskHistory();

      let taskStatus = activeTasks.find((task) => task.sessionId === sessionId);
      if (!taskStatus) {
        taskStatus = historyTasks.find((task) => task.sessionId === sessionId);
      }

      if (!taskStatus) {
        return res.status(404).json({
          success: false,
          error: "No task found for this session",
          sessionId: sessionId,
        });
      }

      // Redirect to logs endpoint with taskId
      req.params.taskId = taskStatus.taskId;
      // Call the logs endpoint logic directly
      const { format = "json", limit, level, since } = req.query;

      let logs = browserUseService.getTaskLogs(taskStatus.taskId);

      // Apply filters (same logic as logs endpoint)
      if (level) {
        logs = logs.filter((log) => log.level === level.toLowerCase());
      }

      if (since) {
        const sinceDate = new Date(since);
        logs = logs.filter((log) => new Date(log.timestamp) >= sinceDate);
      }

      if (limit) {
        const limitNum = parseInt(limit);
        logs = logs.slice(-limitNum);
      }

      if (format === "text") {
        const textLogs = logs
          .map(
            (log) =>
              `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`,
          )
          .join("\n");

        res.setHeader("Content-Type", "text/plain");
        res.send(textLogs);
        return;
      }

      const response = {
        success: true,
        taskId: taskStatus.taskId,
        sessionId: sessionId,
        status: taskStatus.status,
        summary: {
          totalLogs: logs.length,
          byLevel: {
            info: logs.filter((l) => l.level === "info").length,
            warning: logs.filter((l) => l.level === "warning").length,
            error: logs.filter((l) => l.level === "error").length,
            debug: logs.filter((l) => l.level === "debug").length,
          },
        },
        logs: logs.map((log) => ({
          ...log,
          relativeTime:
            new Date(log.timestamp) - new Date(taskStatus.startedAt),
          formattedMessage: `[${log.level.toUpperCase()}] ${log.message}`,
        })),
      };

      res.json(response);
    } catch (error) {
      logger.error("Failed to get session logs:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "session-logs-error",
      });
    }
  });

  // Get result by sessionId specifically
  router.get("/session/:sessionId/result", async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Find task by sessionId
      const activeTasks = browserUseService.getActiveTasks();
      const historyTasks = browserUseService.getTaskHistory();

      let taskStatus = activeTasks.find((task) => task.sessionId === sessionId);
      if (!taskStatus) {
        taskStatus = historyTasks.find((task) => task.sessionId === sessionId);
      }

      if (!taskStatus) {
        return res.status(404).json({
          success: false,
          error: "No task found for this session",
          sessionId: sessionId,
        });
      }

      // Use result endpoint logic
      req.params.taskId = taskStatus.taskId;
      // Forward to result endpoint
      return router.handle(req, res);
    } catch (error) {
      logger.error("Failed to get session result:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        type: "session-result-error",
      });
    }
  });

  return router;
}

// Helper functions for enhanced API responses

/**
 * Get human-readable status message
 */
function getStatusMessage(taskStatus) {
  switch (taskStatus.status) {
    case "running":
      return `Task is currently running (Step ${taskStatus.currentStep || 0})`;
    case "completed":
      return "Task completed successfully";
    case "failed":
      return `Task failed: ${taskStatus.error?.message || "Unknown error"}`;
    case "queued":
      return "Task is queued and waiting to start";
    case "paused":
      return "Task is paused";
    default:
      return `Task status: ${taskStatus.status}`;
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return "0ms";

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else if (seconds > 0) {
    return `${seconds}s`;
  } else {
    return `${milliseconds}ms`;
  }
}

/**
 * Generate polished execution summary from logs
 */
function generateExecutionSummary(taskId, service) {
  const taskLogs = service.getTaskLogs(taskId);

  if (!taskLogs || taskLogs.length === 0) {
    return {
      totalSteps: 0,
      steps: [],
      summary: "No execution steps recorded",
    };
  }

  // Filter and group meaningful action logs
  const actionLogs = taskLogs
    .filter((log) => {
      const message = (log.message || "").toLowerCase();
      // Include logs that indicate actual actions or progress
      return (
        message.includes("action:") ||
        message.includes("step") ||
        message.includes("clicking") ||
        message.includes("typing") ||
        message.includes("navigating") ||
        message.includes("searching") ||
        message.includes("waiting") ||
        message.includes("finding") ||
        message.includes("scrolling") ||
        message.includes("taking screenshot") ||
        message.includes("element") ||
        message.includes("browser action") ||
        message.includes("executing") ||
        message.includes("performing") ||
        (log.type === "progress" && message.length > 10)
      );
    })
    .slice(0, 20); // Limit to first 20 meaningful steps

  const steps = actionLogs.map((log, index) => {
    let cleanMessage = log.message;

    // Clean up common prefixes
    cleanMessage = cleanMessage
      .replace(/^\[.*?\]\s*/, "") // Remove timestamp prefixes
      .replace(/^(Action:|Step|Progress):\s*/i, "") // Remove action prefixes
      .replace(/^\d+\.\s*/, "") // Remove number prefixes
      .trim();

    // Capitalize first letter
    if (cleanMessage.length > 0) {
      cleanMessage =
        cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1);
    }

    return {
      step: index + 1,
      action: cleanMessage,
      timestamp: log.timestamp,
      type: log.type || "action",
    };
  });

  return {
    totalSteps: steps.length,
    steps: steps,
    summary: `Execution completed with ${steps.length} recorded steps`,
  };
}
