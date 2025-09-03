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

      const { task, options = {}, sessionId } = req.body;

      // Extract LLM configuration from options
      const llmConfig = extractLLMConfig(options);
      logger.info(`🔑 LLM configuration extracted:`, {
        provider: llmConfig.provider,
        model: llmConfig.model,
        hasApiKey: !!llmConfig.apiKey,
        apiKeyPrefix: llmConfig.apiKey
          ? `${llmConfig.apiKey.substring(0, 8)}...`
          : "none",
      });

      if (!task) {
        return res.status(400).json({ error: "task is required" });
      }

      // Generate task ID for tracking
      const taskId = uuidv4();

      let session;
      let sessionReused = false;

      // Check if sessionId is provided for session reuse
      if (sessionId) {
        console.log(
          `🔄 Attempting to reuse session ${sessionId} for task: ${task}`,
        );

        // Check if session exists
        const existingSession = sessionManager.getSession(sessionId);
        if (!existingSession) {
          return res.status(404).json({
            error: "Session not found",
            sessionId: sessionId,
            type: "session-not-found",
          });
        }

        // Check if session has a browser
        if (!existingSession.browser) {
          return res.status(400).json({
            error: "Session does not have an active browser",
            sessionId: sessionId,
            type: "session-no-browser",
          });
        }

        session = existingSession;
        sessionReused = true;
        console.log(`✅ Reusing existing session: ${session.id}`);
      } else {
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
        id: taskId,
        sessionId: session.id,
        session_reused: sessionReused,
        live_url: websocketStreamingUrl,
        message: sessionReused
          ? `Task started using existing session! Browser streaming available at: ${websocketStreamingUrl}`
          : `Task started! Browser streaming available at: ${websocketStreamingUrl}`,
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
            llmConfig: llmConfig, // Pass extracted LLM configuration
            browserService: browserService, // Pass browser service for CDP endpoint
            io: io, // Pass io instance for video streaming
            useExistingSession: sessionReused, // Flag to indicate session reuse
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

          // Only clean up session if it was newly created (not reused)
          if (!sessionReused) {
            // Task completed successfully - schedule session cleanup
            logger.info(
              `✅ Task ${taskId} completed successfully, scheduling session cleanup`,
            );

            // Get cleanup delay from environment (default 30 seconds for faster cleanup)
            const cleanupDelay =
              parseInt(process.env.SESSION_CLEANUP_DELAY) || 30 * 1000;

            // Check if force cleanup is enabled (default to true for better UX)
            const forceCleanup =
              process.env.FORCE_SESSION_CLEANUP !== "false" &&
              process.env.DISABLE_SESSION_CLEANUP !== "true";

            if (forceCleanup) {
              setTimeout(() => {
                logger.info(
                  `🧹 Scheduling session ${session.id} cleanup in ${cleanupDelay}ms after task completion`,
                );
                try {
                  sessionManager.closeSession(session.id);
                } catch (cleanupError) {
                  logger.error(
                    `❌ Failed to cleanup session ${session.id}:`,
                    cleanupError,
                  );
                }
              }, cleanupDelay);
            }
          } else {
            logger.info(
              `✅ Task ${taskId} completed successfully using existing session ${session.id} (no cleanup)`,
            );
          }
        })
        .catch((error) => {
          logger.error(`❌ Task ${taskId} execution failed:`, error);
        });
    } catch (error) {
      logger.error("Browser-use execution setup failed:", error);
      res.status(500).json({
        error: error.message,
        type: "browser-use-execution-error",
      });
    }
  });

  // Execute task using existing session - Session Reuse Feature
  router.post("/execute-with-session/:sessionId", async (req, res) => {
    try {
      // Check if services are ready
      if (!sessionManager.isInitialized) {
        return res.status(503).json({
          error:
            "Session Manager not ready yet. Please wait a moment and try again.",
          type: "service-not-ready",
        });
      }

      const { sessionId } = req.params;
      const { task, options = {} } = req.body;

      // Extract LLM configuration from options
      const llmConfig = extractLLMConfig(options);
      logger.info(`🔑 LLM configuration extracted:`, {
        provider: llmConfig.provider,
        model: llmConfig.model,
        hasApiKey: !!llmConfig.apiKey,
        apiKeyPrefix: llmConfig.apiKey
          ? `${llmConfig.apiKey.substring(0, 8)}...`
          : "none",
      });

      if (!task) {
        return res.status(400).json({ error: "task is required" });
      }

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      // Check if session exists
      const existingSession = sessionManager.getSession(sessionId);
      if (!existingSession) {
        return res.status(404).json({
          error: "Session not found",
          sessionId: sessionId,
          type: "session-not-found",
        });
      }

      // Check if session has a browser
      if (!existingSession.browser) {
        return res.status(400).json({
          error: "Session does not have an active browser",
          sessionId: sessionId,
          type: "session-no-browser",
        });
      }

      // Generate task ID for tracking
      const taskId = uuidv4();

      logger.info(
        `🔄 Reusing existing session ${sessionId} for new task: ${task}`,
      );

      // Generate URLs for the existing session
      const baseUrl =
        process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
      const liveUrl = `${baseUrl}/api/live/${sessionId}`;
      const streamingUrl = `${baseUrl}/stream/${sessionId}`;
      const websocketStreamingUrl = `${baseUrl}/stream/${sessionId}?sessionId=${sessionId}`;

      // Return streaming URLs immediately - don't wait for task completion
      res.json({
        success: true,
        id: taskId,
        sessionId: sessionId,
        session_reused: true,
        live_url: websocketStreamingUrl,
        message: `Task started using existing session! Browser streaming available at: ${websocketStreamingUrl}`,
      });

      console.log("============REUSING SESSION FOR NEW TASK============");

      // Execute task asynchronously using existing session
      browserUseService
        .executeTaskAsync(
          sessionId,
          task,
          taskId,
          {
            ...options,
            llmConfig: llmConfig,
            browserService: browserService,
            io: io,
            useExistingSession: true, // Flag to indicate session reuse
          },
          req,
        )
        .then((result) => {
          logger.info(
            `✅ Task ${taskId} completed successfully using existing session ${sessionId}`,
          );
          // Note: Do NOT clean up session since it might be reused for more tasks
        })
        .catch((error) => {
          logger.error(`❌ Task ${taskId} failed:`, error);
        });
    } catch (error) {
      logger.error(`❌ Session reuse error:`, error);
      res.status(500).json({
        error: error.message,
        type: "session-reuse-error",
      });
    }
  });

  // Get all active sessions - useful for session reuse
  router.get("/sessions", async (req, res) => {
    try {
      const sessions = sessionManager.getAllSessions();

      // Filter and format session information
      const activeSessions = Object.values(sessions)
        .filter(
          (session) =>
            session.status === "running" || session.status === "active",
        )
        .map((session) => ({
          id: session.id,
          status: session.status,
          description: session.description,
          created_at: session.createdAt,
          has_browser: !!session.browser,
          live_url: `${req.protocol}://${req.get("host")}/stream/${session.id}?sessionId=${session.id}`,
          current_url: session.browser?.currentUrl || "about:blank",
        }));

      res.json({
        success: true,
        sessions: activeSessions,
        total: activeSessions.length,
      });
    } catch (error) {
      logger.error(`❌ Error getting sessions:`, error);
      res.status(500).json({
        error: error.message,
        type: "sessions-error",
      });
    }
  });

  // Get specific session details
  router.get("/sessions/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({
          error: "Session not found",
          sessionId: sessionId,
          type: "session-not-found",
        });
      }

      // Get recent tasks for this session
      const activeTasks = browserUseService.getActiveTasks();
      const recentTasks = activeTasks
        .filter((task) => task.sessionId === sessionId)
        .map((task) => ({
          id: task.taskId,
          task: task.task,
          status: task.status,
          created_at: task.startedAt,
          completed_at: task.completedAt,
        }));

      res.json({
        success: true,
        session: {
          id: session.id,
          status: session.status,
          description: session.description,
          created_at: session.createdAt,
          has_browser: !!session.browser,
          live_url: `${req.protocol}://${req.get("host")}/stream/${session.id}?sessionId=${session.id}`,
          current_url: session.browser?.currentUrl || "about:blank",
          recent_tasks: recentTasks,
        },
      });
    } catch (error) {
      logger.error(`❌ Error getting session:`, error);
      res.status(500).json({
        error: error.message,
        type: "session-error",
      });
    }
  });

  // Get task status by taskId or sessionId - Simplified version
  router.get("/status/:identifier", async (req, res) => {
    try {
      const { identifier } = req.params;

      // Try to get status by taskId first, then by sessionId
      let taskStatus = browserUseService.getTaskStatus(identifier);
      console.log("taststatus=======", taskStatus);

      if (!taskStatus) {
        // Try to get by sessionId
        const activeTasks = browserUseService.getActiveTasks();
        taskStatus = activeTasks.find((task) => task.sessionId === identifier);
      }

      if (!taskStatus) {
        return res.status(404).json({
          status: "not_found",
        });
      }

      // Map internal status to API status format
      let apiStatus = taskStatus.status;
      switch (taskStatus.status) {
        case "queued":
          apiStatus = "created";
          break;
        case "completed":
          apiStatus = "finished";
          break;
        case "cancelled":
        case "stopped":
          apiStatus = "stopped";
          break;
        case "running":
          apiStatus = "running";
          break;
        case "paused":
          apiStatus = "paused";
          break;
        case "failed":
          apiStatus = "failed";
          break;
        default:
          apiStatus = "created";
      }

      // Return different status codes based on task status
      const statusCode = apiStatus === "failed" ? 201 : 200;

      res.status(statusCode).json({
        status: apiStatus,
      });
    } catch (error) {
      logger.error("Failed to get task status:", error);
      res.status(500).json({
        status: "error",
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
          id: taskId,
          task: "",
          live_url: "",
          output: `No task found with ID: ${taskId}`,
          status: "not_found",
          created_at: null,
          finished_at: null,
          steps: [],
          browser_data: {
            cookies: [],
          },
          user_uploaded_files: [],
          output_files: [],
          public_share_url: "",
          metadata: {
            error: "Task not found",
          },
        });
      }

      // Return result based on task status
      if (
        taskStatus.status === "running" ||
        taskStatus.status === "queued" ||
        taskStatus.status === "paused"
      ) {
        // Get current execution summary and logs for running tasks
        const currentExecutionSummary = await generateExecutionSummary(
          taskId,
          browserUseService,
        );

        // Get current logs for running task
        let currentLogs = browserUseService.getTaskLogs(taskId) || [];

        // Filter logs for meaningful steps
        currentLogs = currentLogs.filter((log) => {
          const message = log.message?.toLowerCase() || "";

          // Skip system/environment logs
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

          // Include browser actions and task progress
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

        return res.json({
          id: taskId,
          task: taskStatus.task || "",
          live_url: taskStatus.sessionId
            ? `${req.protocol}://${req.get("host")}/stream/${taskStatus.sessionId}?sessionId=${taskStatus.sessionId}`
            : "",
          output: `Task is still ${taskStatus.status}. Result not available yet.`,
          status: taskStatus.status,
          created_at: taskStatus.startedAt,
          finished_at: null,

          // Current steps from execution summary (live)
          steps: currentExecutionSummary.steps.map((step, index) => ({
            id: `${taskId}-step-${index}`,
            step: step.step,
            evaluation_previous_goal: step.action || "",
            next_goal:
              index < currentExecutionSummary.steps.length - 1
                ? currentExecutionSummary.steps[index + 1]?.action || ""
                : "In progress...",
            url: taskStatus.currentUrl || "",
          })),

          browser_data: {
            cookies: [],
          },
          user_uploaded_files: [],
          output_files: [],
          public_share_url: "",

          // Token usage for running task - extract from real data
          token_usage: extractTokenUsage(taskStatus),

          metadata: {
            sessionId: taskStatus.sessionId,
            progress: taskStatus.progress || 0,
            resultAvailable: false,
            currentStep: currentExecutionSummary.totalSteps,
            isLive: true,
            logs: currentLogs.map((log) => {
              let cleanMessage = log.message;

              // Remove timestamp prefixes
              cleanMessage = cleanMessage.replace(
                /^\[\d{4}-\d{2}-\d{2}.*?\]\s*/,
                "",
              );
              cleanMessage = cleanMessage.replace(/^\d{2}:\d{2}:\d{2}\s*/, "");

              // Remove action prefixes
              cleanMessage = cleanMessage.replace(/^Action:\s*/i, "");
              cleanMessage = cleanMessage.replace(/^Step \d+:\s*/i, "");

              // Remove emojis comprehensively
              cleanMessage = cleanMessage.replace(
                /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
                "",
              );
              cleanMessage = cleanMessage.replace(
                /[🔄🔑✅❌⏸️🧹🌐🗑️⏭️📍❔🎯🦾🔗⌨️🖱️📄👍💰🐍🚀📊📤🔍🧠📋🏁]/g,
                "",
              );
              cleanMessage = cleanMessage.trim();

              return {
                timestamp: log.timestamp,
                level: log.level,
                type: log.type || "action",
                message: cleanMessage,
                step: log.step || null,
                action: log.action || null,
              };
            }),
          },
        });
      }

      if (taskStatus.status === "failed") {
        return res.json({
          id: taskId,
          task: taskStatus.task || "",
          live_url: taskStatus.sessionId
            ? `${req.protocol}://${req.get("host")}/stream/${taskStatus.sessionId}?sessionId=${taskStatus.sessionId}`
            : "",
          output: taskStatus.error?.message || "Task failed",
          status: "failed",
          created_at: taskStatus.startedAt,
          finished_at: taskStatus.completedAt,
          steps: [],
          browser_data: {
            cookies: [],
          },
          user_uploaded_files: [],
          output_files: [],
          public_share_url: "",

          // Token usage for failed task
          token_usage: extractTokenUsage(taskStatus),

          metadata: {
            sessionId: taskStatus.sessionId,
            error: taskStatus.error,
            duration: taskStatus.completedAt
              ? new Date(taskStatus.completedAt) -
                new Date(taskStatus.startedAt)
              : null,
          },
        });
      }

      // Task completed successfully - format according to specified structure
      const executionSummary = await generateExecutionSummary(
        taskId,
        browserUseService,
      );

      // Get logs for this task and filter them
      let logs = browserUseService.getTaskLogs(taskId) || [];

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

      const response = {
        id: taskId,
        task: taskStatus.task || "",
        live_url: taskStatus.sessionId
          ? `${req.protocol}://${req.get("host")}/stream/${taskStatus.sessionId}?sessionId=${taskStatus.sessionId}`
          : "",
        output:
          taskStatus.result?.output ||
          taskStatus.result?.message ||
          "Task completed successfully",
        status: "completed",
        created_at: taskStatus.startedAt,
        finished_at: taskStatus.completedAt,

        // Steps from execution summary
        steps: executionSummary.steps.map((step, index) => ({
          id: `${taskId}-step-${index}`,
          step: step.step,
          evaluation_previous_goal: step.action || "",
          next_goal:
            index < executionSummary.steps.length - 1
              ? executionSummary.steps[index + 1]?.action || ""
              : "Task completed",
          url: taskStatus.result?.url || "",
        })),

        // Browser data (cookies, etc.)
        browser_data: {
          cookies: taskStatus.result?.cookies || [],
        },

        // File handling
        user_uploaded_files: taskStatus.result?.uploadedFiles || [],
        output_files: taskStatus.result?.outputFiles || [],

        // Sharing and metadata
        public_share_url: taskStatus.sessionId
          ? `${req.protocol}://${req.get("host")}/api/browser-use/session/${taskStatus.sessionId}/result`
          : "",

        // Token usage at top level - extract from result or status
        token_usage: extractTokenUsage(taskStatus),

        // Include logs in metadata
        metadata: {
          sessionId: taskStatus.sessionId,
          duration: taskStatus.completedAt
            ? new Date(taskStatus.completedAt) - new Date(taskStatus.startedAt)
            : null,
          durationHuman: taskStatus.completedAt
            ? formatDuration(
                new Date(taskStatus.completedAt) -
                  new Date(taskStatus.startedAt),
              )
            : null,
          logs: logs.map((log) => {
            // Clean up the message for better readability and remove emojis
            let cleanMessage = log.message;

            // Remove timestamp prefixes if present
            cleanMessage = cleanMessage.replace(
              /^\[\d{4}-\d{2}-\d{2}.*?\]\s*/,
              "",
            );
            cleanMessage = cleanMessage.replace(/^\d{2}:\d{2}:\d{2}\s*/, "");

            // Clean up technical prefixes
            cleanMessage = cleanMessage.replace(/^Action:\s*/i, "");
            cleanMessage = cleanMessage.replace(/^Step \d+:\s*/i, "");
            cleanMessage = cleanMessage.replace(/INFO\s+\[.*?\]\s+/g, "");
            cleanMessage = cleanMessage.replace(/\[TESTING\].*?:/g, "");
            cleanMessage = cleanMessage.replace(/\[\d+m/g, "");

            // Remove emojis and special characters comprehensively
            cleanMessage = cleanMessage.replace(
              /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
              "",
            );
            cleanMessage = cleanMessage.replace(
              /[🔄🔑✅❌⏸️🧹🌐🗑️⏭️📍❔🎯🦾🔗⌨️🖱️📄👍💰🐍🚀📊📤🔍🧠📋🏁]/g,
              "",
            );
            cleanMessage = cleanMessage.trim();

            // Make message more user-friendly
            if (cleanMessage.includes("Navigated to")) {
              const url = cleanMessage.match(/(https?:\/\/[^\s]+)/)?.[1];
              if (url) {
                const domain = url
                  .replace(/^https?:\/\//, "")
                  .replace(/\/.*$/, "");
                cleanMessage = `Navigated to ${domain}`;
              }
            } else if (
              cleanMessage.includes("Typed") &&
              cleanMessage.includes('"')
            ) {
              const text = cleanMessage.match(/"([^"]+)"/)?.[1];
              if (text) {
                cleanMessage = `Searched for "${text}"`;
              }
            } else if (cleanMessage.includes("Clicked element")) {
              cleanMessage = "Clicked page element";
            }

            // Skip overly technical or verbose messages
            if (cleanMessage.length > 150) {
              cleanMessage = cleanMessage.substring(0, 150) + "...";
            }

            return {
              timestamp: log.timestamp,
              level: log.level,
              type: log.type || "action",
              message: cleanMessage,
              step: log.step || null,
              action: log.action || null,
            };
          }),
          logsSummary: {
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
        },
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
 * Extract token usage information from task status and result
 */
function extractTokenUsage(taskStatus) {
  // First, try to get token usage from the task result
  if (taskStatus.result && taskStatus.result.token_usage) {
    const tokenData = taskStatus.result.token_usage;
    const totalTokens = tokenData.total_tokens || tokenData.totalTokens || 0;
    const promptTokens = tokenData.prompt_tokens || tokenData.promptTokens || 0;
    const completionTokens =
      tokenData.completion_tokens || tokenData.completionTokens || 0;
    let totalCost = parseFloat(
      tokenData.total_cost || tokenData.totalCost || 0,
    );

    // Calculate cost if not provided (GPT-4 pricing)
    if (totalCost === 0 && (promptTokens > 0 || completionTokens > 0)) {
      totalCost =
        (promptTokens / 1000) * 0.03 + (completionTokens / 1000) * 0.06;
    }

    return {
      total_tokens: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_cost: parseFloat(totalCost.toFixed(4)),
      model: tokenData.model || taskStatus.llmProvider || "gpt-4",
    };
  }

  // Try direct tokenUsage property
  if (taskStatus.tokenUsage) {
    const tokenData = taskStatus.tokenUsage;
    const totalTokens = tokenData.total_tokens || tokenData.totalTokens || 0;
    const promptTokens = tokenData.prompt_tokens || tokenData.promptTokens || 0;
    const completionTokens =
      tokenData.completion_tokens || tokenData.completionTokens || 0;
    let totalCost = parseFloat(
      tokenData.total_cost || tokenData.totalCost || 0,
    );

    // Calculate cost if not provided (GPT-4 pricing)
    if (totalCost === 0 && (promptTokens > 0 || completionTokens > 0)) {
      totalCost =
        (promptTokens / 1000) * 0.03 + (completionTokens / 1000) * 0.06;
    }

    return {
      total_tokens: totalTokens,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_cost: parseFloat(totalCost.toFixed(4)),
      model: tokenData.model || taskStatus.llmProvider || "gpt-4",
    };
  }

  // Try to extract from logs if available
  if (taskStatus.logs) {
    const tokenLogs = taskStatus.logs.filter(
      (log) =>
        log.message &&
        (log.message.includes("token") ||
          log.message.includes("cost") ||
          log.message.includes("usage")),
    );

    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalCost = 0;

    for (const log of tokenLogs) {
      const msg = log.message;

      // Extract token numbers from messages
      const totalMatch = msg.match(/total[_\s]*tokens?[:\s]*(\d+)/i);
      const promptMatch = msg.match(/prompt[_\s]*tokens?[:\s]*(\d+)/i);
      const completionMatch = msg.match(/completion[_\s]*tokens?[:\s]*(\d+)/i);
      const costMatch = msg.match(/cost[:\s]*\$?([0-9.]+)/i);

      if (totalMatch) totalTokens += parseInt(totalMatch[1]);
      if (promptMatch) promptTokens += parseInt(promptMatch[1]);
      if (completionMatch) completionTokens += parseInt(completionMatch[1]);
      if (costMatch) totalCost += parseFloat(costMatch[1]);
    }

    // Calculate cost if not found in logs but we have tokens
    if (totalCost === 0 && (promptTokens > 0 || completionTokens > 0)) {
      totalCost =
        (promptTokens / 1000) * 0.03 + (completionTokens / 1000) * 0.06;
    }

    if (totalTokens > 0 || promptTokens > 0 || completionTokens > 0) {
      return {
        total_tokens: totalTokens || promptTokens + completionTokens,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_cost: parseFloat(totalCost.toFixed(4)),
        model: taskStatus.llmProvider || "gpt-4",
      };
    }
  }

  // Return default structure with model info if available
  return {
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_cost: 0.0,
    model: taskStatus.llmProvider || "gpt-4",
  };
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

  // Extract clean, meaningful steps from logs
  const steps = [];
  let stepNumber = 1;

  // Define step patterns and their human-readable descriptions
  const stepPatterns = [
    {
      pattern: /navigated to.*youtube|go_to_url.*youtube/i,
      description: "Navigate to YouTube",
      type: "navigation",
    },
    {
      pattern: /typed.*mr.*beast|input.*mr.*beast|search.*mr.*beast/i,
      description: "Search for MrBeast videos",
      type: "search",
    },
    {
      pattern: /clicked.*search|search.*button/i,
      description: "Click search button",
      type: "interaction",
    },
    {
      pattern: /clicked.*video|video.*title|play.*video/i,
      description: "Select video to play",
      type: "interaction",
    },
    {
      pattern: /switch.*tab/i,
      description: "Switch to video tab",
      type: "navigation",
    },
    {
      pattern: /scrolled|scroll/i,
      description: "Scroll page",
      type: "interaction",
    },
    {
      pattern: /task.*completed|success.*video.*playing|video.*playing/i,
      description: "Video playback started successfully",
      type: "completion",
    },
  ];

  // Process logs to extract meaningful steps
  for (let i = 0; i < taskLogs.length; i++) {
    const log = taskLogs[i];
    const message = log.message || "";

    // Skip debug and testing messages
    if (message.includes("[TESTING]") || message.includes("DEBUG")) {
      continue;
    }

    // Check for meaningful actions
    for (const pattern of stepPatterns) {
      if (pattern.pattern.test(message)) {
        // Avoid duplicate consecutive steps
        const lastStep = steps[steps.length - 1];
        if (lastStep && lastStep.action === pattern.description) {
          continue;
        }

        steps.push({
          step: stepNumber++,
          action: pattern.description,
          timestamp: log.timestamp,
          type: pattern.type,
        });
        break;
      }
    }

    // Limit to reasonable number of steps
    if (steps.length >= 8) break;
  }

  // If no patterns matched, create basic steps from key events
  if (steps.length === 0) {
    const keyEvents = taskLogs
      .filter((log) => {
        const msg = (log.message || "").toLowerCase();
        return (
          !msg.includes("[testing]") &&
          !msg.includes("debug") &&
          (msg.includes("step") ||
            msg.includes("navigated") ||
            msg.includes("clicked") ||
            msg.includes("typed") ||
            msg.includes("completed"))
        );
      })
      .slice(0, 5);

    keyEvents.forEach((log, index) => {
      let description = log.message
        .replace(/INFO\s+\[.*?\]\s*/g, "")
        .replace(/\[[0-9;]+m/g, "")
        .replace(
          /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
          "",
        )
        .replace(
          /[🔄🔑✅❌⏸️🧹🌐🗑️⏭️📍❔🎯🦾🔗⌨️🖱️📄👍💰🐍🚀📊📤🔍🧠📋🏁]/g,
          "",
        )
        .trim();

      if (description.length > 60) {
        description = description.substring(0, 60) + "...";
      }

      steps.push({
        step: index + 1,
        action: description || `Action ${index + 1}`,
        timestamp: log.timestamp,
        type: "action",
      });
    });
  }

  return {
    totalSteps: steps.length,
    steps: steps,
    summary: `Task completed with ${steps.length} steps`,
  };
}

/**
 * Extract LLM configuration from API request options
 */
function extractLLMConfig(options) {
  const llmConfig = {
    provider: "azure", // default
    model: "gpt-4.1", // default
    apiKey: null,
    endpoint: null,
    deployment: null,
    apiVersion: null,
  };

  // Handle nested options structure
  const opts = options.options || options;

  // Extract provider preference
  if (opts.llmProvider) {
    llmConfig.provider = opts.llmProvider.toLowerCase();
  } else if (opts.provider) {
    llmConfig.provider = opts.provider.toLowerCase();
  }

  // Extract model
  if (opts.llmModel) {
    llmConfig.model = opts.llmModel;
  } else if (opts.model) {
    llmConfig.model = opts.model;
  }

  // Extract API credentials based on provider
  if (llmConfig.provider === "azure" || llmConfig.provider === "openai") {
    // Azure OpenAI or OpenAI
    llmConfig.apiKey =
      opts.apiKey || opts.openaiApiKey || opts.azureApiKey || opts.key;
    llmConfig.endpoint = opts.endpoint || opts.azureEndpoint;
    llmConfig.deployment =
      opts.deployment || opts.azureDeployment || llmConfig.model;
    llmConfig.apiVersion =
      opts.apiVersion || opts.azureApiVersion || "2024-08-01-preview";
  } else if (llmConfig.provider === "google") {
    // Google AI
    llmConfig.apiKey = opts.apiKey || opts.googleApiKey || opts.key;
  } else {
    // Generic/unknown provider
    llmConfig.apiKey = opts.apiKey || opts.key;
    llmConfig.endpoint = opts.endpoint;
  }

  return llmConfig;
}
