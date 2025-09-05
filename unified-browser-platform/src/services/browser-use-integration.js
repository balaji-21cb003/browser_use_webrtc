/**
 * Browser-Use Integration Service
 * Full integration of browser-use project capabilities with the unified platform
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { Logger } from "../utils/logger.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BrowserUseIntegrationService extends EventEmitter {
  constructor() {
    super();
    this.logger = new Logger("BrowserUseIntegration");
    this.activeAgents = new Map();
    this.projectRoot = path.resolve(__dirname, "../..");
    this.pythonPath = process.env.PYTHON_PATH || "python3"; // Will auto-detect during initialize()
    this.agentScriptPath = path.join(
      this.projectRoot,
      "python-agent",
      "browser_use_agent.py",
    );
    this.browserUseProjectPath = path.resolve(
      __dirname,
      "../../../browser_use_webrtc",
    );
    this.isInitialized = false;

    // Downloads folder setup
    this.downloadsPath = path.join(this.projectRoot, "downloads");
    this.ensureDownloadsFolder();

    // Token cost tracking
    this.tokenUsage = new Map(); // Track token usage per execution
    this.totalTokenCost = 0;
    this.tokenUsageHistory = [];

    // Task tracking
    this.activeTasks = new Map(); // Track active tasks by taskId
    this.taskHistory = []; // Store completed tasks
    this.taskLogs = new Map(); // Store detailed logs for each task
    this.taskStdout = new Map(); // Store stdout for each task
    this.taskStderr = new Map(); // Store stderr for each task

    // Concurrent execution configuration
    this.concurrencyConfig = {
      maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5,
      taskQueueLimit: parseInt(process.env.TASK_QUEUE_LIMIT) || 20,
      enableConcurrentExecution:
        (process.env.ENABLE_CONCURRENT_EXECUTION === "true") !== false, // Default to true
    };

    // Task queue for handling concurrency limits
    this.taskQueue = [];
    this.runningTasks = new Set();

    // File upload tracking with automatic cleanup
    this.uploadedFiles = new Map(); // Track uploaded files per execution/session
    this.pendingDownloads = new Map(); // Track pending file downloads by executionId_sessionId
    this.fileTrackingTTL = 24 * 60 * 60 * 1000; // 24 hours TTL for file tracking

    // Set up event listeners for file tracking
    this.on("fileDownloaded", (event) => {
      if (event.uploadResult) {
        const key = `${event.executionId}_${event.sessionId}`;
        if (!this.uploadedFiles.has(key)) {
          this.uploadedFiles.set(key, []);
        }

        // Check for duplicates before adding (optimized check)
        const existingFiles = this.uploadedFiles.get(key);
        const isDuplicate = existingFiles.some(
          (file) =>
            file.fileName === event.fileName &&
            file.url === event.uploadResult.url,
        );

        if (!isDuplicate) {
          const fileEntry = {
            id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            fileName: event.fileName,
            url: event.uploadResult.url,
            size: event.uploadResult.size,
            provider: event.uploadResult.provider,
            uploadedAt: event.timestamp || new Date().toISOString(),
            localPath: event.filePath,
            createdAt: Date.now(), // Add timestamp for TTL cleanup
          };

          this.uploadedFiles.get(key).push(fileEntry);
          this.logger.info(
            `📁 File tracked: ${event.fileName} -> ${event.uploadResult.url}`,
          );

          // Schedule cleanup for this entry
          this.scheduleFileCleanup(key, fileEntry.id);
        } else {
          this.logger.info(`📁 Duplicate file ignored: ${event.fileName}`);
        }
      }
    });

    // Start periodic cleanup of old file tracking data
    this.startFileTrackingCleanup();

    // Error handling for critical events
    this.on("error", (error) => {
      this.logger.error("🚨 Critical error in BrowserUseIntegration:", error);
    });

    // Graceful shutdown cleanup
    process.on("SIGTERM", () => this.gracefulShutdown());
    process.on("SIGINT", () => this.gracefulShutdown());

    this.logger.info(
      "🔧 Concurrent execution configuration:",
      this.concurrencyConfig,
    );
  }

  async testPythonPath(pythonPath) {
    return new Promise((resolve) => {
      const testProcess = spawn(pythonPath, ["--version"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let error = "";

      testProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      testProcess.stderr.on("data", (data) => {
        error += data.toString();
      });

      testProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true, output: output.trim() });
        } else {
          resolve({ success: false, output: error.trim() });
        }
      });

      testProcess.on("error", () => {
        resolve({ success: false, output: "Failed to execute Python" });
      });
    });
  }

  async findPythonPath() {
    // Try multiple possible Python paths
    const possiblePythonPaths = [
      // Root venv (preferred)
      process.platform === "win32"
        ? path.join(this.projectRoot, "venv", "Scripts", "python.exe")
        : path.join(this.projectRoot, "venv", "bin", "python"),
      // Standard virtual environment paths
      process.platform === "win32"
        ? path.join(this.projectRoot, ".venv", "Scripts", "python.exe")
        : path.join(this.projectRoot, ".venv", "bin", "python"),
      // Project python-agent venv (fallback)
      process.platform === "win32"
        ? path.join(
            this.projectRoot,
            "python-agent",
            "venv",
            "Scripts",
            "python.exe",
          )
        : path.join(this.projectRoot, "python-agent", "venv", "bin", "python"),
      // System Python as fallback
      process.platform === "win32" ? "python.exe" : "python3",
      "python",
    ];

    // Find the first existing Python path
    for (const pythonPath of possiblePythonPaths) {
      try {
        // For system Python fallbacks, only test if they exist
        // For virtual environment paths, require them to exist
        if (pythonPath.includes("venv") || pythonPath.includes(".venv")) {
          // Virtual environment paths must exist
          if (!fs.existsSync(pythonPath)) {
            continue;
          }
        } else if (
          pythonPath.includes("python") &&
          !fs.existsSync(pythonPath)
        ) {
          // System Python paths should exist
          continue;
        }

        // Test if it's executable
        const testResult = await this.testPythonPath(pythonPath);
        if (testResult.success) {
          this.logger.info(
            `✅ Found Python at: ${pythonPath} (${testResult.output})`,
          );
          return pythonPath;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    this.logger.warn("⚠️ No Python found, using fallback: python3");
    return "python3"; // Fallback
  }

  async initialize() {
    this.logger.info("🚀 Initializing Browser-Use Integration Service...");

    try {
      // Auto-detect a working Python interpreter (prefer project venv)
      const detected = await this.findPythonPath();
      this.pythonPath = detected || this.pythonPath;
      this.logger.info(`🐍 Using Python: ${this.pythonPath}`);

      // Skip environment validation for now to avoid test_environment.py dependency
      this.logger.info(
        "⚠️ Skipping environment validation (test_environment.py not found)",
      );

      // Skip browser-use imports test for now
      this.logger.info(
        "⚠️ Skipping browser-use imports test (test_imports.py not found)",
      );

      this.isInitialized = true;
      this.logger.info(
        "✅ Browser-Use Integration Service initialized successfully",
      );

      return {
        success: true,
        message: "Browser-use integration ready",
        features: [
          "Full browser-use Agent integration",
          "Azure OpenAI LLM support",
          "Multi-provider LLM support (Azure, OpenAI, Google)",
          "Advanced browser automation",
          "Session management",
          "Real-time progress tracking",
        ],
      };
    } catch (error) {
      this.logger.error(
        "❌ Failed to initialize Browser-Use Integration:",
        error,
      );
      throw error;
    }
  }

  isHealthy() {
    return {
      initialized: this.isInitialized,
      active_agents: this.activeAgents.size,
      script_exists: fs.existsSync(this.agentScriptPath),
      python_exists: fs.existsSync(this.pythonPath),
      browser_use_project_exists: fs.existsSync(this.browserUseProjectPath),
      downloads_folder_exists: fs.existsSync(this.downloadsPath),
    };
  }

  /**
   * Ensure downloads folder exists
   */
  ensureDownloadsFolder() {
    try {
      if (!fs.existsSync(this.downloadsPath)) {
        fs.mkdirSync(this.downloadsPath, { recursive: true });
        this.logger.info(`📁 Created downloads folder: ${this.downloadsPath}`);
      } else {
        this.logger.info(`📁 Downloads folder exists: ${this.downloadsPath}`);
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to create downloads folder: ${error.message}`,
      );
    }
  }

  /**
   * Download file content to downloads folder
   */
  async downloadFile(fileName, content, sessionId = null) {
    try {
      // Ensure downloads folder exists
      this.ensureDownloadsFolder();

      // Sanitize filename by removing invalid characters for Windows/Unix
      const sanitizedFileName = fileName.replace(/[<>:"/\\|?*]/g, "_");

      // Add timestamp to avoid file conflicts
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const sessionPrefix = sessionId ? `${sessionId.slice(0, 8)}_` : "";
      const finalFileName = `${sessionPrefix}${timestamp}_${sanitizedFileName}`;
      const filePath = path.join(this.downloadsPath, finalFileName);

      // Write the file
      fs.writeFileSync(filePath, content, "utf8");

      this.logger.info(`📥 File downloaded: ${finalFileName}`);
      this.logger.info(`📂 Full path: ${filePath}`);

      return {
        success: true,
        fileName: finalFileName,
        filePath: filePath,
        relativePath: `downloads/${finalFileName}`,
        size: content.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `❌ Failed to download file ${fileName}: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
        fileName: fileName,
      };
    }
  }

  /**
   * Get list of downloaded files
   */
  getDownloadedFiles() {
    try {
      if (!fs.existsSync(this.downloadsPath)) {
        return [];
      }

      const files = fs.readdirSync(this.downloadsPath);
      return files
        .map((file) => {
          const filePath = path.join(this.downloadsPath, file);
          const stats = fs.statSync(filePath);
          return {
            fileName: file,
            filePath: filePath,
            relativePath: `downloads/${file}`,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt); // Most recent first
    } catch (error) {
      this.logger.error(`❌ Failed to get downloaded files: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute a task using the full browser-use agent
   * Automatically creates a live URL for the browser session
   */
  async executeTask(sessionId, task, options = {}) {
    // TESTING: Print statement for debugging
    console.log("🚀 [TESTING] executeTask called with:", {
      sessionId,
      task: task.substring(0, 100) + (task.length > 100 ? "..." : ""),
      options,
    });

    // Initialize on demand if not already initialized (lazy initialization)
    if (!this.isInitialized) {
      this.logger.info(
        "🔄 Initializing Browser-Use Integration Service on first use...",
      );
      await this.initialize();
    }

    // Python path is already set in constructor

    const {
      maxSteps = 15,
      browserContextId = null,
      timeout = 600000, // 10 minutes for complex tasks
      priority = "normal",
      llmProvider = "azure",
      useExistingBrowser = true, // New option to use existing streaming browser
      disableHighlighting = true, // NEW: Disable orange automation indicators
      llmConfig = null, // NEW: LLM configuration from API request
    } = options;

    this.logger.info(
      `🎯 Executing browser-use task for session ${sessionId}:`,
      {
        task: task.substring(0, 100) + (task.length > 100 ? "..." : ""),
        maxSteps,
        browserContextId,
        priority,
        llmProvider: llmConfig?.provider || llmProvider,
        useExistingBrowser,
        disableHighlighting, // NEW: Log highlighting setting
        llmConfigFromAPI: !!llmConfig, // Log if LLM config came from API
        hasApiKey: !!llmConfig?.apiKey,
      },
    );

    // Generate live URL for this session
    const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;
    this.logger.info(`🌐 Live URL generated: ${liveUrl}`);

    // AUTO-CREATE BROWSER SESSION: If we need to use existing browser but none exists, create one
    if (useExistingBrowser && options.browserService) {
      try {
        let browserSession = options.browserService.getSession(sessionId);
        if (!browserSession) {
          this.logger.info(
            `🚀 Auto-creating browser session for ${sessionId} since none exists`,
          );
          browserSession =
            await options.browserService.createSessionWithSeparateBrowser(
              sessionId,
              {
                headless: true, // Make it visible for streaming
                width: 1920,
                height: 1480, // Increased height for full browser capture
              },
            );
          this.logger.info(
            `✅ Auto-created browser session with CDP endpoint: ${browserSession.browserWSEndpoint}`,
          );

          // Start video streaming for the new session if io is available
          if (options.io) {
            this.logger.info(
              `🎬 Starting video streaming for newly created session ${sessionId}`,
            );
            await options.browserService.startVideoStreaming(
              sessionId,
              options.io,
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          `⚠️ Failed to auto-create browser session: ${error.message}`,
        );
      }
    }

    return new Promise((resolve, reject) => {
      // Check if this is a restart scenario
      const isRestart = options.isRestart && options.taskId;
      let executionId;

      if (isRestart) {
        // For restarts, generate a new executionId but preserve the task
        executionId = `browseruse_${sessionId}_${Date.now()}_restart`;
        this.logger.info(
          `🔄 Restarting task ${options.taskId} with new executionId: ${executionId}`,
        );
      } else {
        executionId = `browseruse_${sessionId}_${Date.now()}`;
      }

      const args = [this.agentScriptPath, task, maxSteps.toString(), sessionId]; // Pass sessionId as 4th argument

      // Add browser context if provided or if using existing browser
      let cdpEndpoint = browserContextId || options.cdpEndpoint;

      // IMPORTANT: If we need to use existing browser but don't have CDP endpoint, try to get it from browser service
      if (useExistingBrowser && !cdpEndpoint && options.browserService) {
        try {
          const browserSession = options.browserService.getSession(sessionId);
          if (browserSession && browserSession.browserWSEndpoint) {
            cdpEndpoint = browserSession.browserWSEndpoint;
            this.logger.info(
              `🔗 Retrieved CDP endpoint from browser service: ${cdpEndpoint}`,
            );
          } else {
            this.logger.warn(
              `⚠️ No browser session found for sessionId: ${sessionId}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to get browser session: ${error.message}`,
          );
        }
      }

      this.logger.info(`🔍 Debug CDP endpoint resolution:`, {
        browserContextId,
        optionsCdpEndpoint: options.cdpEndpoint,
        useExistingBrowser,
        finalCdpEndpoint: cdpEndpoint,
      });

      if (useExistingBrowser && cdpEndpoint) {
        this.logger.info(
          `🔗 Using existing browser CDP endpoint: ${cdpEndpoint}`,
        );
        args.push(cdpEndpoint);
      } else if (useExistingBrowser) {
        this.logger.warn(
          `⚠️ useExistingBrowser is true but no CDP endpoint found. options.cdpEndpoint: ${options.cdpEndpoint}`,
        );
        // Don't fail here, let the Python agent handle it gracefully
      }

      // Add disable highlighting flag if specified
      if (disableHighlighting) {
        args.push("--disable-highlighting");
        this.logger.info("🚫 Visual highlighting disabled");
      }

      // Comprehensive environment setup for browser-use
      const env = {
        ...process.env,

        // Azure OpenAI configuration - use API request values if available
        AZURE_OPENAI_API_KEY:
          llmConfig?.apiKey || process.env.AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_ENDPOINT:
          llmConfig?.endpoint || process.env.AZURE_OPENAI_ENDPOINT,
        AZURE_OPENAI_DEPLOYMENT_NAME:
          llmConfig?.deployment || process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        AZURE_OPENAI_API_VERSION:
          llmConfig?.apiVersion || process.env.AZURE_OPENAI_API_VERSION,

        // Alternative LLM providers - use API request values if available
        OPENAI_API_KEY:
          llmConfig?.provider === "openai"
            ? llmConfig?.apiKey
            : process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY:
          llmConfig?.provider === "google"
            ? llmConfig?.apiKey
            : process.env.GOOGLE_API_KEY,

        // LLM provider preference - use API request value if available
        LLM_PROVIDER: llmConfig?.provider || llmProvider,
        LLM_MODEL: llmConfig?.model || "gpt-4.1",

        // Browser configuration for automation
        BROWSER_HEADLESS: process.env.BROWSER_HEADLESS ,
        BROWSER_PORT: process.env.BROWSER_PORT || "9222",
        BROWSER_WIDTH: "1920",
        BROWSER_HEIGHT: "1480", // Increased height for full browser capture

        // Browser-use specific settings
        BROWSER_USE_TELEMETRY: "true",
        BROWSER_USE_LOG_LEVEL: "INFO",
        BROWSER_USE_SAVE_CONVERSATION: "false",
        BROWSER_USE_VISION_ENABLED: "true",

        // Token cost tracking
        BROWSER_USE_CALCULATE_COST: "true",

        // Python environment - prefer root venv
        PYTHONPATH:
          process.platform === "win32"
            ? `${path.join(this.projectRoot, "venv", "Lib", "site-packages")};${this.browserUseProjectPath}`
            : `${path.join(this.projectRoot, "venv", "lib", "python3.12", "site-packages")}:${this.browserUseProjectPath}`,
        PATH:
          process.platform === "win32"
            ? `${path.join(this.projectRoot, "venv", "Scripts")};${process.env.PATH}`
            : `${path.join(this.projectRoot, "venv", "bin")}:${process.env.PATH}`,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: "utf-8",
      };

      this.logger.info(`🐍 Spawning browser-use agent process:`, {
        python: this.pythonPath,
        script: this.agentScriptPath,
        args: args.slice(1), // Don't log the script path again
        cwd: this.projectRoot,
      });

      // TESTING: Print the exact command being executed
      console.log("🐍 [TESTING] Spawning Python process with command:", {
        pythonPath: this.pythonPath,
        args: args,
        cwd: this.projectRoot,
        envKeys: Object.keys(env).filter(
          (key) =>
            key.includes("AZURE") ||
            key.includes("OPENAI") ||
            key.includes("GOOGLE") ||
            key.includes("LLM") ||
            key.includes("PYTHON"),
        ),
      });

      // TESTING: Print LLM configuration details
      console.log("🔑 [TESTING] LLM Configuration passed to Python:", {
        provider: env.LLM_PROVIDER,
        model: env.LLM_MODEL,
        hasAzureKey: !!env.AZURE_OPENAI_API_KEY,
        hasOpenAIKey: !!env.OPENAI_API_KEY,
        hasGoogleKey: !!env.GOOGLE_API_KEY,
        azureEndpoint: env.AZURE_OPENAI_ENDPOINT,
        azureDeployment: env.AZURE_OPENAI_DEPLOYMENT_NAME,
        configSource: llmConfig ? "API_REQUEST" : "ENVIRONMENT_VARIABLES",
      });

      const agentProcess = spawn(this.pythonPath, args, {
        env,
        cwd: this.projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const executionStartTime = Date.now();

      // Store active agent process with metadata
      this.activeAgents.set(executionId, {
        process: agentProcess,
        sessionId,
        task,
        taskId: options.taskId, // Include taskId for task control
        startTime: executionStartTime,
        options,
        maxSteps,
        currentStep: 0,
      });

      // Update task info with executionId for process tracking
      if (options.taskId) {
        const taskInfo = this.activeTasks.get(options.taskId);
        if (taskInfo) {
          // Update the execution details for restart
          taskInfo.executionId = executionId;
          taskInfo.status = "running";
          if (isRestart) {
            taskInfo.restartedAt = new Date().toISOString();
            taskInfo.pausedByUser = false;
            taskInfo.pausedGracefully = false;
            this.logger.info(
              `� Task ${options.taskId} restarted with execution ${executionId}`,
            );
          } else {
            this.logger.info(
              `�🔗 Task ${options.taskId} linked to execution ${executionId}`,
            );
          }
        } else if (!isRestart) {
          // Only log error if this is not a restart (restart should have existing task info)
          this.logger.warn(`Task ${options.taskId} not found in activeTasks`);
        }
      }

      // Handle stdout data with enhanced parsing
      agentProcess.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;

        // Store stdout data in task storage
        if (!this.taskStdout.has(sessionId)) {
          this.taskStdout.set(sessionId, []);
        }
        this.taskStdout.get(sessionId).push({
          timestamp: new Date().toISOString(),
          data: chunk,
        });

        // TESTING: Print raw stdout data in real-time
        const lines = chunk
          .toString()
          .split("\n")
          .filter((line) => line.trim());
        lines.forEach((line) => {
          if (line.trim()) {
            // Format different types of agent output
            if (line.includes("INFO [Agent]")) {
              console.log(
                `🤖 [AGENT] ${line.replace("INFO [Agent]", "").trim()}`,
              );
            } else if (line.includes("WARNING")) {
              console.log(`⚠️ [AGENT] ${line.trim()}`);
            } else if (line.includes("ERROR")) {
              console.log(`❌ [AGENT] ${line.trim()}`);
            } else if (line.includes("Step")) {
              console.log(`📍 [AGENT] ${line.trim()}`);
            } else if (line.includes("ACTION")) {
              console.log(`🦾 [AGENT] ${line.trim()}`);
            } else if (line.includes("Eval:")) {
              console.log(`❔ [AGENT] ${line.trim()}`);
            } else if (line.includes("Next goal:")) {
              console.log(`🎯 [AGENT] ${line.trim()}`);
            } else {
              console.log(`🐍 [AGENT] ${line.trim()}`);
            }
          }
        });

        // Parse and emit different types of progress
        this.parseAndEmitProgress(chunk, executionId, sessionId);
      });

      // Handle stderr data
      agentProcess.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Store stderr data in task storage
        if (!this.taskStderr.has(sessionId)) {
          this.taskStderr.set(sessionId, []);
        }
        this.taskStderr.get(sessionId).push({
          timestamp: new Date().toISOString(),
          data: chunk,
        });

        // TESTING: Print raw stderr data
        console.log("❌ [TESTING] Python stderr chunk:", chunk.trim());

        // Log warnings and errors
        if (chunk.includes("WARNING") || chunk.includes("ERROR")) {
          this.logger.warn(`Agent stderr for ${executionId}:`, chunk.trim());
        }

        this.emit("taskProgress", {
          executionId,
          sessionId,
          type: "error",
          data: chunk.trim(),
          timestamp: new Date().toISOString(),
        });
      });

      // Handle process completion
      agentProcess.on("close", async (code) => {
        const executionTime = Date.now() - executionStartTime;
        const agentInfo = this.activeAgents.get(executionId);
        this.activeAgents.delete(executionId);

        // TESTING: Print process completion details
        console.log("🏁 [TESTING] Python process completed:", {
          code,
          executionTime: `${executionTime}ms`,
          sessionId,
          finalStep: agentInfo?.currentStep || 0,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
        });

        // Print final agent output summary
        console.log("📋 [AGENT SUMMARY] Final agent output:");
        const finalLines = stdout.split("\n").filter((line) => line.trim());
        finalLines.slice(-10).forEach((line) => {
          // Show last 10 lines
          if (line.trim()) {
            console.log(`   ${line.trim()}`);
          }
        });

        this.logger.info(`🏁 Browser-use agent completed for ${executionId}`, {
          code,
          executionTime: `${executionTime}ms`,
          sessionId,
          finalStep: agentInfo?.currentStep || 0,
        });

        if (code === 0) {
          try {
            this.logger.info(`🔍 Parsing agent result for ${executionId}`, {
              stdoutLength: stdout.length,
              hasJsonResult: stdout.includes("{") && stdout.includes("}"),
            });

            // Wait for all pending file downloads to complete before parsing result
            const downloadKey = `${executionId}_${sessionId}`;
            if (this.pendingDownloads.has(downloadKey)) {
              const pendingDownloads = this.pendingDownloads.get(downloadKey);
              if (pendingDownloads.length > 0) {
                this.logger.info(
                  `⏳ Waiting for ${pendingDownloads.length} pending file downloads to complete...`,
                );
                try {
                  await Promise.all(pendingDownloads);
                  this.logger.info(
                    `✅ All file downloads completed for ${executionId}`,
                  );
                } catch (downloadError) {
                  this.logger.warn(
                    `⚠️ Some file downloads failed for ${executionId}:`,
                    downloadError.message,
                  );
                }
                // Clean up pending downloads tracking
                this.pendingDownloads.delete(downloadKey);
              }
            }

            const result = this.parseAgentResult(
              stdout,
              executionId,
              sessionId,
              executionTime,
            );

            // Add live URL and streaming URL to the result
            const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;
            const streamingUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}/stream`;
            const websocketStreamingUrl = `${process.env.BASE_URL || "http://localhost:3000"}/stream/${sessionId}?sessionId=${sessionId}`;
            const enhancedResult = {
              ...result,
              live_url: liveUrl,
              streaming_url: streamingUrl,
              websocket_streaming_url: websocketStreamingUrl,
              live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
              streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
              websocket_streaming_embed: `<iframe src="${websocketStreamingUrl}" width="100%" height="600px"></iframe>`,
              message: `Task executed successfully! Browser is now available at: ${websocketStreamingUrl}`,
            };

            this.emit("taskCompleted", {
              executionId,
              sessionId,
              result: enhancedResult,
            });

            // Update task status to completed
            const taskInfo = this.findTaskByExecutionId(executionId);
            if (taskInfo) {
              taskInfo.status = "completed";
              taskInfo.completedAt = new Date().toISOString();
              taskInfo.result = enhancedResult;

              this.logger.info(
                `✅ Task ${taskInfo.taskId} marked as completed`,
                {
                  executionId,
                  sessionId,
                  status: taskInfo.status,
                },
              );
            }

            resolve(enhancedResult);
          } catch (parseError) {
            const errorResult = this.createErrorResult(
              `Failed to parse agent result: ${parseError.message}`,
              executionId,
              sessionId,
              executionTime,
              { stdout: stdout.substring(0, 2000) },
            );

            // Add live URL to error result as well
            const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;
            const enhancedErrorResult = {
              ...errorResult,
              live_url: liveUrl,
              live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
              message: `Task failed, but browser is still available at: ${liveUrl}`,
            };

            this.emit("taskFailed", {
              executionId,
              sessionId,
              error: enhancedErrorResult,
            });

            // Update task status to failed
            const taskInfo = this.findTaskByExecutionId(executionId);
            if (taskInfo) {
              taskInfo.status = "failed";
              taskInfo.completedAt = new Date().toISOString();
              taskInfo.result = enhancedErrorResult;

              this.logger.info(`❌ Task ${taskInfo.taskId} marked as failed`, {
                executionId,
                sessionId,
                status: taskInfo.status,
              });
            }

            reject(enhancedErrorResult);
          }
        } else {
          // Check if this task was paused by user (Windows graceful termination)
          const taskInfo = this.findTaskByExecutionId(executionId);

          if (
            taskInfo &&
            taskInfo.pausedByUser &&
            taskInfo.status === "paused"
          ) {
            // Task was paused by user, don't treat as failure
            this.logger.info(
              `⏸️ Process exited for paused task (expected on Windows): ${executionId}`,
            );

            // Don't call reject - this is expected behavior for pause
            return;
          }

          const errorResult = this.createErrorResult(
            `Agent process exited with code ${code}`,
            executionId,
            sessionId,
            executionTime,
            { stderr: stderr.substring(0, 2000), code },
          );

          // Add live URL to error result as well
          const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;
          const enhancedErrorResult = {
            ...errorResult,
            live_url: liveUrl,
            live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
            message: `Task failed, but browser is still available at: ${liveUrl}`,
          };

          this.emit("taskFailed", {
            executionId,
            sessionId,
            error: enhancedErrorResult,
          });

          // Update task status to failed
          const failedTaskInfo = this.findTaskByExecutionId(executionId);
          if (failedTaskInfo) {
            failedTaskInfo.status = "failed";
            failedTaskInfo.completedAt = new Date().toISOString();
            failedTaskInfo.result = enhancedErrorResult;

            this.logger.info(
              `❌ Task ${failedTaskInfo.taskId} marked as failed`,
              {
                executionId,
                sessionId,
                status: failedTaskInfo.status,
                exitCode: code,
              },
            );
          }

          reject(enhancedErrorResult);
        }
      });

      // Handle process errors
      agentProcess.on("error", (error) => {
        this.activeAgents.delete(executionId);

        const errorResult = this.createErrorResult(
          `Failed to start browser-use agent: ${error.message}`,
          executionId,
          sessionId,
          Date.now() - executionStartTime,
          { originalError: error.message },
        );

        // Add live URL to error result as well
        const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;
        const enhancedErrorResult = {
          ...errorResult,
          live_url: liveUrl,
          live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
          message: `Task failed, but browser is still available at: ${liveUrl}`,
        };

        this.logger.error(
          `❌ Browser-use agent process error for ${executionId}:`,
          error,
        );
        this.emit("taskFailed", {
          executionId,
          sessionId,
          error: enhancedErrorResult,
        });
        reject(enhancedErrorResult);
      });

      // Set execution timeout
      setTimeout(() => {
        if (this.activeAgents.has(executionId)) {
          this.logger.warn(
            `⏰ Browser-use agent timeout for ${executionId}, terminating...`,
          );
          this.terminateAgent(agentProcess, executionId);
        }
      }, timeout);
    });
  }

  /**
   * Parse agent output and emit appropriate progress events
   */
  parseAndEmitProgress(chunk, executionId, sessionId) {
    const lines = chunk.split("\n");

    // Get or create logs array for this execution
    if (!this.taskLogs.has(executionId)) {
      this.taskLogs.set(executionId, []);
    }
    const taskLogs = this.taskLogs.get(executionId);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      let eventType = "info";
      let eventData = { message: trimmedLine };

      // Parse different types of browser-use output
      if (trimmedLine.includes("📍 Step")) {
        eventType = "step";
        const stepMatch = trimmedLine.match(/📍 Step (\d+):/);
        if (stepMatch) {
          const stepNumber = parseInt(stepMatch[1]);
          if (this.activeAgents.has(executionId)) {
            this.activeAgents.get(executionId).currentStep = stepNumber;
          }

          // **ENHANCED: Add task ID and session ID to step logging**
          const enhancedStepMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;

          // Log the enhanced step message to console for better debugging
          console.log(`🔍 [AGENT] INFO ${enhancedStepMessage}`);

          eventData = {
            stepNumber,
            message: enhancedStepMessage,
            taskId: executionId,
            sessionId: sessionId,
            originalMessage: trimmedLine,
          };

          // Store step log
          taskLogs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: trimmedLine,
            type: "step",
            taskId: executionId,
            sessionId: sessionId,
            stepNumber: stepNumber,
          });
        }
      } else if (trimmedLine.includes("🦾 [ACTION")) {
        eventType = "action";
        const enhancedActionMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;
        console.log(`🔍 [AGENT] INFO ${enhancedActionMessage}`);
        eventData = {
          action: trimmedLine,
          message: enhancedActionMessage,
          taskId: executionId,
          sessionId: sessionId,
          originalMessage: trimmedLine,
        };

        // Store action log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "action",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (trimmedLine.includes("🎯 Next goal:")) {
        eventType = "goal";
        const enhancedGoalMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;
        console.log(`🔍 [AGENT] INFO ${enhancedGoalMessage}`);
        eventData = {
          goal: trimmedLine.replace("🎯 Next goal:", "").trim(),
          message: enhancedGoalMessage,
          taskId: executionId,
          sessionId: sessionId,
          originalMessage: trimmedLine,
        };

        // Store goal log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "goal",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (
        trimmedLine.includes("👍 Eval: Success") ||
        trimmedLine.includes("✅")
      ) {
        eventType = "success";
        const enhancedSuccessMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;
        console.log(`🔍 [AGENT] INFO ${enhancedSuccessMessage}`);
        eventData = {
          success: true,
          message: enhancedSuccessMessage,
          taskId: executionId,
          sessionId: sessionId,
          originalMessage: trimmedLine,
        };

        // Store success log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "success",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (
        trimmedLine.includes("⚠️ Eval: Failure") ||
        (trimmedLine.includes("❌") && !trimmedLine.includes("[TESTING]"))
      ) {
        eventType = "warning";
        const enhancedWarningMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;
        console.log(`🔍 [AGENT] INFO ${enhancedWarningMessage}`);
        eventData = {
          warning: true,
          message: enhancedWarningMessage,
          taskId: executionId,
          sessionId: sessionId,
          originalMessage: trimmedLine,
        };

        // Store warning log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: trimmedLine,
          type: "warning",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (trimmedLine.includes("🔗 Navigated to")) {
        eventType = "navigation";
        const enhancedNavMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;
        console.log(`🔍 [AGENT] INFO ${enhancedNavMessage}`);
        eventData = {
          navigation: true,
          message: enhancedNavMessage,
          taskId: executionId,
          sessionId: sessionId,
          originalMessage: trimmedLine,
        };

        // Store navigation log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "navigation",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (trimmedLine.includes("INFO") || trimmedLine.includes("🧠")) {
        eventType = "info";
        // Add task/session info to general INFO messages too
        const enhancedInfoMessage = `[TASK:${executionId}] [SESSION:${sessionId}] ${trimmedLine}`;
        eventData = {
          message: enhancedInfoMessage,
          taskId: executionId,
          sessionId: sessionId,
          originalMessage: trimmedLine,
        };

        // Store general info log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "info",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (trimmedLine.includes("💰 TOKEN_USAGE:")) {
        // Store token usage log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "token_usage",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (
        trimmedLine.includes("🖱️ Clicked") ||
        trimmedLine.includes("⌨️ Typed")
      ) {
        // Store interaction log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "interaction",
          taskId: executionId,
          sessionId: sessionId,
        });
      } else if (trimmedLine.includes("❔ Eval:")) {
        // Store evaluation log
        taskLogs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: trimmedLine,
          type: "evaluation",
          taskId: executionId,
          sessionId: sessionId,
        });
      }

      // **NEW: File Creation Detection and Auto-Download**
      this.detectAndDownloadFiles(trimmedLine, executionId, sessionId);

      this.emit("taskProgress", {
        executionId,
        sessionId,
        type: eventType,
        data: eventData,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Detect file creation in agent output and auto-download files
   */
  async detectAndDownloadFiles(logLine, executionId, sessionId) {
    try {
      // Patterns that indicate file creation
      const fileCreationPatterns = [
        /💾 Data written to file ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml)) successfully/i,
        /📄 Content saved to file ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /💾 Data written to file ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /File saved: ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /Created file: ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /Saved to: ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /Output written to ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
      ];

      // Content extraction patterns (for files that show content in logs)
      const contentPatterns = [
        /💾 Read from file ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /📄 File content for ([^.]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
      ];

      // Attachment patterns - these contain the full file path
      const attachmentPatterns = [
        /👉 Attachment :\s*([^\s\n\r]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /Attachment:\s*([^\s\n\r]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
        /📎 Attachment:\s*([^\s\n\r]+\.(csv|json|txt|md|xlsx|pdf|html|xml|yaml|yml))/i,
      ];

      // Check for attachments first (these contain full paths)
      for (const pattern of attachmentPatterns) {
        const match = logLine.match(pattern);
        if (match) {
          const fullPath = match[1];
          this.logger.info(
            `🔍 Detected attachment with full path: ${fullPath}`,
          );

          // Track pending download
          const downloadKey = `${executionId}_${sessionId}`;
          if (!this.pendingDownloads.has(downloadKey)) {
            this.pendingDownloads.set(downloadKey, []);
          }

          const downloadPromise = this.downloadFileFromFullPath(
            fullPath,
            executionId,
            sessionId,
          )
            .then(() => ({
              fileName:
                fullPath.split("/").pop() ||
                fullPath.split("\\").pop() ||
                fullPath,
              success: true,
            }))
            .catch((error) => ({
              fileName:
                fullPath.split("/").pop() ||
                fullPath.split("\\").pop() ||
                fullPath,
              success: false,
              error,
            }));

          downloadPromise.fileName =
            fullPath.split("/").pop() || fullPath.split("\\").pop() || fullPath;
          this.pendingDownloads.get(downloadKey).push(downloadPromise);
          break;
        }
      }

      for (const pattern of fileCreationPatterns) {
        const match = logLine.match(pattern);
        if (match) {
          const fileName = match[1];
          this.logger.info(`🔍 Detected file creation: ${fileName}`);

          // Try to read the file content from subsequent log lines
          await this.scheduleFileDownload(fileName, executionId, sessionId);
          break;
        }
      }

      // Also check for content extraction
      for (const pattern of contentPatterns) {
        const match = logLine.match(pattern);
        if (match) {
          const fileName = match[1];
          this.logger.info(`🔍 Detected file content available: ${fileName}`);

          // Schedule for content extraction
          await this.scheduleFileDownload(fileName, executionId, sessionId);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`❌ Error in file detection: ${error.message}`);
    }
  }

  /**
   * Schedule file download with retry mechanism
   */
  async scheduleFileDownload(fileName, executionId, sessionId) {
    // Track pending downloads per execution/session
    const downloadKey = `${executionId}_${sessionId}`;
    const individualKey = `${sessionId}_${fileName}`;

    // Avoid duplicate downloads
    if (this.pendingDownloads.has(downloadKey)) {
      const existingDownloads = this.pendingDownloads.get(downloadKey);
      if (existingDownloads.some((p) => p.fileName === fileName)) {
        return;
      }
    }

    // Initialize tracking for this execution/session
    if (!this.pendingDownloads.has(downloadKey)) {
      this.pendingDownloads.set(downloadKey, []);
    }

    // Create download promise
    const downloadPromise = new Promise(async (resolve) => {
      // Wait a bit for file to be fully written, then attempt download
      setTimeout(async () => {
        try {
          await this.attemptFileDownload(fileName, executionId, sessionId);
          resolve({ fileName, success: true });
        } catch (error) {
          this.logger.error(
            `❌ Failed to download ${fileName}: ${error.message}`,
          );
          resolve({ fileName, success: false, error });
        }
      }, 2000); // Wait 2 seconds for file to be written
    });

    // Add to tracking
    downloadPromise.fileName = fileName;
    this.pendingDownloads.get(downloadKey).push(downloadPromise);

    return downloadPromise;
  }

  /**
   * Attempt to download file from the agent's working directory
   */
  async attemptFileDownload(fileName, executionId, sessionId) {
    try {
      // Import required modules for ES module compatibility
      const osModule = await import("os");
      const fsModule = await import("fs");

      // Try different possible locations for the file
      const tempDir = process.env.TEMP || process.env.TMP || "/tmp";
      const userTempDir = path.join(
        osModule.homedir(),
        "AppData",
        "Local",
        "Temp",
      );

      const possiblePaths = [
        // Python agent working directory
        path.join(this.projectRoot, fileName),
        // Current working directory
        path.join(process.cwd(), fileName),
        // Project root
        path.join(this.projectRoot, "python-agent", fileName),
        // Downloads folder (in case it was already moved)
        path.join(this.downloadsPath, fileName),
        // System temp directory
        path.join(tempDir, fileName),
        // User temp directory (Windows)
        path.join(userTempDir, fileName),
        // Browser use agent temp directories (with wildcard search)
      ];

      // Add wildcard search for browser_use_agent_* directories in temp
      try {
        // Use dynamic import for glob since we're in ES module
        const { glob } = await import("glob");
        const tempBrowserUseDirs = await glob(
          path.join(userTempDir, "browser_use_agent_*").replace(/\\/g, "/"),
        );
        for (const tempDir of tempBrowserUseDirs) {
          possiblePaths.push(path.join(tempDir, fileName));
        }
      } catch (error) {
        // If glob not available, try manual search
        try {
          const tempFiles = fsModule.readdirSync(userTempDir);
          for (const dirName of tempFiles) {
            if (dirName.startsWith("browser_use_agent_")) {
              const tempDirPath = path.join(userTempDir, dirName);
              if (fsModule.statSync(tempDirPath).isDirectory()) {
                possiblePaths.push(path.join(tempDirPath, fileName));
              }
            }
          }
        } catch (searchError) {
          this.logger.warn(
            `Could not search temp directories: ${searchError.message}`,
          );
        }
      }

      let fileContent = null;
      let sourceFilePath = null;

      for (const filePath of possiblePaths) {
        try {
          if (fsModule.existsSync(filePath)) {
            fileContent = fsModule.readFileSync(filePath, "utf8");
            sourceFilePath = filePath;
            this.logger.info(`📁 Found file at: ${filePath}`);
            break;
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
      }

      if (fileContent !== null) {
        // Download the file to our downloads folder
        const downloadResult = await this.downloadFile(
          fileName,
          fileContent,
          sessionId,
        );

        if (downloadResult.success) {
          this.logger.info(`📥 Successfully downloaded: ${fileName}`);
          this.logger.info(`📂 Downloaded to: ${downloadResult.filePath}`);

          // Upload to file manager and get shareable URL - WAIT for completion
          const uploadResult = await this.uploadFileToFileManager(
            downloadResult.filePath,
            downloadResult.fileName,
            sessionId,
          );

          // File tracking is handled by the 'fileDownloaded' event listener
          if (uploadResult.success) {
            this.logger.info(
              `📋 File upload successful: ${fileName} -> ${uploadResult.url}`,
            );
            console.log(
              `📋 [FILE TRACKING] ${fileName} will be tracked via event listener`,
            );
          }

          // Emit download event with upload result (this now happens after tracking)
          this.emit("fileDownloaded", {
            executionId,
            sessionId,
            fileName: downloadResult.fileName,
            filePath: downloadResult.filePath,
            relativePath: downloadResult.relativePath,
            size: downloadResult.size,
            originalPath: sourceFilePath,
            timestamp: downloadResult.timestamp,
            uploadResult: uploadResult.success
              ? {
                  url: uploadResult.url,
                  size: uploadResult.size,
                  provider: uploadResult.provider,
                }
              : null,
            uploadError: uploadResult.success ? null : uploadResult.error,
          });

          // Log success for user visibility
          console.log(
            `📥 [FILE DOWNLOAD] ${downloadResult.fileName} saved to downloads folder`,
          );
          console.log(
            `📂 [FILE DOWNLOAD] Path: ${downloadResult.relativePath}`,
          );

          if (uploadResult.success) {
            console.log(
              `🌐 [FILE UPLOAD] ${downloadResult.fileName} uploaded: ${uploadResult.url}`,
            );
          } else {
            console.log(
              `❌ [FILE UPLOAD] Failed to upload ${downloadResult.fileName}: ${uploadResult.error}`,
            );
          }
        } else {
          this.logger.error(
            `❌ Failed to download ${fileName}: ${downloadResult.error}`,
          );
        }
      } else {
        this.logger.warn(
          `⚠️ Could not find file: ${fileName} in any expected location`,
        );
        this.logger.info(`🔍 Searched paths:`, possiblePaths);
      }
    } catch (error) {
      this.logger.error(
        `❌ Error downloading file ${fileName}: ${error.message}`,
      );
    }
  }

  /**
   * Upload file to external file manager and get shareable URL
   */
  async uploadFileToFileManager(filePath, fileName, sessionId) {
    try {
      // Import form-data dynamically since we're using ES modules
      const FormData = (await import("form-data")).default;
      const fetch = (await import("node-fetch")).default;

      const form = new FormData();

      // Create a readable stream from the file
      const fileStream = fs.createReadStream(filePath);
      form.append("file", fileStream, fileName);
      form.append("filepath", `browser_use_outputs/${sessionId}`);

      const response = await fetch(
        "https://vanijapp.adya.ai/api/v1/vanij/gateway/file_manager/internal/upload",
        {
          method: "POST",
          body: form,
          headers: form.getHeaders(),
        },
      );

      console.log("UPLOADED RESPONSE========", response);

      if (response.ok) {
        const result = await response.json();
        if (result.meta.status && result.data.url) {
          this.logger.info(`🌐 File uploaded successfully: ${result.data.url}`);

          // AUTO-CLEANUP: Delete local file after successful upload
          try {
            fs.unlinkSync(filePath);
            this.logger.info(`🗑️ Local file deleted after upload: ${fileName}`);
            console.log(
              `🗑️ [FILE CLEANUP] ${fileName} deleted from downloads folder after successful upload`,
            );
          } catch (deleteError) {
            this.logger.warn(
              `⚠️ Failed to delete local file after upload: ${deleteError.message}`,
            );
            console.log(
              `⚠️ [FILE CLEANUP] Failed to delete ${fileName}: ${deleteError.message}`,
            );
          }

          return {
            success: true,
            url: result.data.url,
            size: result.data.size,
            provider: result.data.provider,
          };
        } else {
          this.logger.error(
            `❌ Upload failed: ${result.meta.message || "Unknown error"}`,
          );
          return {
            success: false,
            error: result.meta.message || "Upload failed",
          };
        }
      } else {
        this.logger.error(
          `❌ Upload request failed: ${response.status} ${response.statusText}`,
        );
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
    } catch (error) {
      this.logger.error(`❌ Error uploading file: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Helper method to get basename without requiring path module
   */
  getBaseName(fullPath) {
    // Handle both Unix-style (/) and Windows-style (\) path separators
    const normalizedPath = fullPath.replace(/\\/g, "/");
    const baseName = normalizedPath.split("/").pop();
    return baseName || fullPath;
  }

  /**
   * Download file directly from full path (used for attachments)
   */
  async downloadFileFromFullPath(fullPath, executionId, sessionId) {
    try {
      const fileName = this.getBaseName(fullPath);
      const downloadKey = `${executionId}_${sessionId}`;

      // Track this download in the pending downloads Map
      if (!this.pendingDownloads.has(downloadKey)) {
        this.pendingDownloads.set(downloadKey, []);
      }

      try {
        // Import modules using dynamic import for ES module compatibility
        const fsModule = await import("fs");
        const pathModule = await import("path");

        // Check if file exists at the full path
        if (fsModule.existsSync(fullPath)) {
          const fileContent = fsModule.readFileSync(fullPath, "utf8");

          this.logger.info(`📁 Found attachment file at: ${fullPath}`);

          // Download the file to our downloads folder
          const downloadResult = await this.downloadFile(
            fileName,
            fileContent,
            sessionId,
          );

          if (downloadResult.success) {
            this.logger.info(
              `📥 Successfully downloaded attachment: ${fileName}`,
            );
            this.logger.info(`📂 Downloaded to: ${downloadResult.filePath}`);

            // Upload to file manager and get shareable URL - WAIT for completion
            const uploadResult = await this.uploadFileToFileManager(
              downloadResult.filePath,
              downloadResult.fileName,
              sessionId,
            );

            // Track uploaded file IMMEDIATELY for result inclusion
            if (uploadResult.success) {
              this.logger.info(
                `📋 File upload successful: ${fileName} -> ${uploadResult.url}`,
              );
              console.log(
                `📋 [FILE TRACKING] ${fileName} will be tracked via event listener`,
              );
            }

            // Emit download event with upload result (this now happens after tracking)
            this.emit("fileDownloaded", {
              executionId,
              sessionId,
              fileName: downloadResult.fileName,
              filePath: downloadResult.filePath,
              relativePath: downloadResult.relativePath,
              size: downloadResult.size,
              originalPath: fullPath,
              timestamp: downloadResult.timestamp,
              type: "attachment",
              uploadResult: uploadResult.success
                ? {
                    url: uploadResult.url,
                    size: uploadResult.size,
                    provider: uploadResult.provider,
                  }
                : null,
              uploadError: uploadResult.success ? null : uploadResult.error,
            });

            // Log success for user visibility
            console.log(
              `📥 [ATTACHMENT DOWNLOAD] ${downloadResult.fileName} saved to downloads folder`,
            );
            console.log(
              `📂 [ATTACHMENT DOWNLOAD] Path: ${downloadResult.relativePath}`,
            );

            if (uploadResult.success) {
              console.log(
                `🌐 [FILE UPLOAD] ${downloadResult.fileName} uploaded: ${uploadResult.url}`,
              );
            } else {
              console.log(
                `❌ [FILE UPLOAD] Failed to upload ${downloadResult.fileName}: ${uploadResult.error}`,
              );
            }
          } else {
            this.logger.error(
              `❌ Failed to download attachment ${fileName}: ${downloadResult.error}`,
            );
          }
        } else {
          this.logger.warn(`⚠️ Attachment file not found at: ${fullPath}`);
        }
      } catch (innerError) {
        this.logger.error(
          `❌ Error processing attachment ${fileName}: ${innerError.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Error downloading attachment from ${fullPath}: ${error.message}`,
      );
    }
  }

  /**
   * Parse the final result from agent output with enhanced file tracking
   */
  parseAgentResult(stdout, executionId, sessionId, executionTime) {
    const lines = stdout.trim().split("\n");
    let resultJson = "";

    // Find the JSON result (usually the last complete JSON object)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{") && line.endsWith("}")) {
        try {
          JSON.parse(line); // Validate JSON
          resultJson = line;
          break;
        } catch (e) {
          continue; // Not valid JSON, continue searching
        }
      }
    }

    // Parse token usage from the output
    const tokenUsage = this.parseTokenUsage(stdout, executionId);

    // Get uploaded files for this execution with enhanced tracking
    const uploadedFilesKey = `${executionId}_${sessionId}`;
    const uploadedFiles = this.uploadedFiles.get(uploadedFilesKey) || [];
    const outputFiles = uploadedFiles.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      url: file.url,
      size: file.size,
      uploadedAt: file.uploadedAt,
      provider: file.provider,
    }));

    // Enhanced debug logging for file tracking
    this.logger.info(`🔍 Parsing agent result for ${executionId}`, {
      stdoutLength: stdout.length,
      hasJsonResult: !!resultJson,
      uploadedFilesKey,
      uploadedFilesCount: uploadedFiles.length,
      outputFilesCount: outputFiles.length,
      uploadedFilesKeys: Array.from(this.uploadedFiles.keys()),
      fileTrackingStats: this.getFileTrackingStats(),
    });

    if (outputFiles.length > 0) {
      this.logger.info(
        `📋 Found ${outputFiles.length} output files for result:`,
        outputFiles.map((f) => ({
          fileName: f.fileName,
          url: f.url,
          size: f.size,
        })),
      );
    } else {
      this.logger.warn(
        `⚠️ No output files found for ${uploadedFilesKey}. Available keys:`,
        Array.from(this.uploadedFiles.keys()),
      );
    }

    if (resultJson) {
      const result = JSON.parse(resultJson);

      // Generate live URL for this session
      const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;

      // Enhance result with execution metadata, token usage, live URL, and output files
      return {
        ...result,
        execution_id: executionId,
        session_id: sessionId,
        execution_time_ms: executionTime,
        timestamp: new Date().toISOString(),
        agent_type: "browser-use-full",
        integration_version: "1.0.0",
        token_usage: tokenUsage,
        live_url: liveUrl,
        live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
        outputFiles: outputFiles,
      };
    } else {
      // If no JSON result found, but the process completed successfully (code 0),
      // create a success result based on the stdout content
      this.logger.warn(
        `No JSON result found in agent output for ${executionId}, creating success result from stdout`,
      );

      // Check if the task appears to have completed successfully based on stdout content
      const successIndicators = [
        "Task completed successfully",
        "Task finished",
        "✅",
        "Success",
        "Completed",
        "Finished",
      ];

      const hasSuccessIndicator = successIndicators.some((indicator) =>
        stdout.toLowerCase().includes(indicator.toLowerCase()),
      );

      // Generate live URL for this session
      const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;

      // Create a success result even without JSON
      return {
        success: true,
        message: hasSuccessIndicator
          ? "Task completed successfully (parsed from output)"
          : "Task completed (no JSON result found, but process exited successfully)",
        execution_id: executionId,
        session_id: sessionId,
        execution_time_ms: executionTime,
        timestamp: new Date().toISOString(),
        agent_type: "browser-use-full",
        integration_version: "1.0.0",
        token_usage: tokenUsage,
        live_url: liveUrl,
        live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
        stdout: stdout.substring(0, 1000), // Include first 1000 chars of stdout for debugging
        note: "Result created from successful process completion without JSON output",
        outputFiles: outputFiles,
      };
    }
  }

  /**
   * Create standardized error result
   */
  createErrorResult(
    errorMessage,
    executionId,
    sessionId,
    executionTime,
    additionalData = {},
  ) {
    // Generate live URL for this session (even if task failed, browser might still be available)
    const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;

    return {
      success: false,
      error: errorMessage,
      execution_id: executionId,
      session_id: sessionId,
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString(),
      agent_type: "browser-use-full",
      live_url: liveUrl,
      live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
      ...additionalData,
    };
  }

  /**
   * Gracefully terminate an agent process
   */
  terminateAgent(process, executionId) {
    process.kill("SIGTERM");

    // Force kill after 10 seconds
    setTimeout(() => {
      if (this.activeAgents.has(executionId)) {
        process.kill("SIGKILL");
        this.activeAgents.delete(executionId);
      }
    }, 10000);
  }

  /**
   * Get status of all active agents
   */
  getActiveAgents() {
    const agents = [];
    for (const [executionId, agentInfo] of this.activeAgents) {
      agents.push({
        execution_id: executionId,
        task_id: agentInfo.taskId, // Include taskId for task control
        session_id: agentInfo.sessionId,
        task:
          agentInfo.task.substring(0, 100) +
          (agentInfo.task.length > 100 ? "..." : ""),
        running_time_ms: Date.now() - agentInfo.startTime,
        current_step: agentInfo.currentStep,
        max_steps: agentInfo.maxSteps,
        pid: agentInfo.process.pid,
      });
    }
    return agents;
  }

  /**
   * Find agent by taskId
   */
  findAgentByTaskId(taskId) {
    return Array.from(this.activeAgents.values()).find(
      (agent) => agent.taskId === taskId,
    );
  }

  /**
   * Find task by executionId
   */
  findTaskByExecutionId(executionId) {
    for (const [taskId, taskInfo] of this.activeTasks.entries()) {
      if (taskInfo.executionId === executionId) {
        return taskInfo;
      }
    }
    return null;
  }

  /**
   * Stop a specific agent execution
   */
  async stopAgent(executionId) {
    const agentInfo = this.activeAgents.get(executionId);
    if (agentInfo) {
      this.logger.info(`🛑 Stopping browser-use agent: ${executionId}`);
      this.terminateAgent(agentInfo.process, executionId);
      return true;
    }
    return false;
  }

  /**
   * Stop all active agents
   */
  async stopAllAgents() {
    const stopPromises = [];
    for (const executionId of this.activeAgents.keys()) {
      stopPromises.push(this.stopAgent(executionId));
    }
    await Promise.all(stopPromises);
    this.logger.info("🛑 All browser-use agents stopped");
  }

  /**
   * Validate browser-use environment setup
   */
  async validateEnvironment() {
    return new Promise((resolve) => {
      const validateProcess = spawn(this.pythonPath, ["test_environment.py"], {
        env: {
          ...process.env,
          PYTHONPATH:
            process.platform === "win32"
              ? `${path.join(this.projectRoot, "venv", "Lib", "site-packages")};${this.browserUseProjectPath}`
              : `${path.join(this.projectRoot, "venv", "lib", "python3.12", "site-packages")}:${this.browserUseProjectPath}`,
          PATH:
            process.platform === "win32"
              ? `${path.join(this.projectRoot, "venv", "Scripts")};${process.env.PATH}`
              : `${path.join(this.projectRoot, "venv", "bin")}:${process.env.PATH}`,
          PYTHONIOENCODING: "utf-8",
        },
        cwd: this.projectRoot,
      });

      let output = "";

      validateProcess.stdout.on("data", (data) => (output += data.toString()));
      validateProcess.stderr.on("data", (data) => (output += data.toString()));

      validateProcess.on("close", (code) => {
        resolve({
          success: code === 0,
          output: output.trim(),
          environment_ready: code === 0,
        });
      });
    });
  }

  /**
   * Test browser-use imports specifically
   */
  async testBrowserUseImports() {
    return new Promise((resolve) => {
      const testProcess = spawn(this.pythonPath, ["test_imports.py"], {
        env: {
          ...process.env,
          PYTHONPATH:
            process.platform === "win32"
              ? `${path.join(this.projectRoot, "venv", "Lib", "site-packages")};${this.browserUseProjectPath}`
              : `${path.join(this.projectRoot, "venv", "lib", "python3.12", "site-packages")}:${this.browserUseProjectPath}`,
          PATH:
            process.platform === "win32"
              ? `${path.join(this.projectRoot, "venv", "Scripts")};${process.env.PATH}`
              : `${path.join(this.projectRoot, "venv", "bin")}:${process.env.PATH}`,
          PYTHONIOENCODING: "utf-8",
        },
        cwd: this.projectRoot,
      });

      let output = "";

      testProcess.stdout.on("data", (data) => (output += data.toString()));
      testProcess.stderr.on("data", (data) => (output += data.toString()));

      testProcess.on("close", (code) => {
        resolve({
          success: code === 0,
          output: output.trim(),
        });
      });
    });
  }

  /**
   * Parse token usage from agent output
   */
  parseTokenUsage(output, executionId) {
    const tokenUsage = {
      executionId,
      timestamp: new Date().toISOString(),
      model: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cost: 0,
      details: [],
    };

    // Parse token usage logs from browser-use output
    const lines = output.split("\n");
    let currentModel = null;
    let totalCost = 0;

    for (const line of lines) {
      // Parse model usage logs (format: 🧠 model_name | 🆕 tokens ($cost) | 📤 tokens ($cost))
      // Handle ANSI color codes: \033[96m, \033[93m, \033[92m, \033[94m, \033[0m
      const modelMatch = line.match(/🧠\s*(\S+)\s*\|\s*(.+)/);
      if (modelMatch) {
        // Clean up model name (remove ANSI codes)
        currentModel = modelMatch[1].replace(/\x1B\[[0-9;]*[mGK]/g, "");
        const details = modelMatch[2];

        // Parse input tokens (🆕 or 📥) with ANSI color codes
        const inputMatch = details.match(
          /[🆕📥]\s*([\d.]+[kMB]?)\s*\(?\$?([\d.]+)?\)?/,
        );
        if (inputMatch) {
          const tokens = this.parseTokenCount(inputMatch[1]);
          const cost = parseFloat(inputMatch[2] || 0);
          tokenUsage.promptTokens += tokens;
          totalCost += cost;

          tokenUsage.details.push({
            type: "input",
            model: currentModel,
            tokens,
            cost,
            raw: inputMatch[0],
          });
        }

        // Parse output tokens (📤) with ANSI color codes
        const outputMatch = details.match(
          /📤\s*([\d.]+[kMB]?)\s*\(?\$?([\d.]+)?\)?/,
        );
        if (outputMatch) {
          const tokens = this.parseTokenCount(outputMatch[1]);
          const cost = parseFloat(outputMatch[2] || 0);
          tokenUsage.completionTokens += tokens;
          totalCost += cost;

          tokenUsage.details.push({
            type: "output",
            model: currentModel,
            tokens,
            cost,
            raw: outputMatch[0],
          });
        }

        // Parse cached tokens (💾) with ANSI color codes
        const cachedMatch = details.match(
          /💾\s*([\d.]+[kMB]?)\s*\(?\$?([\d.]+)?\)?/,
        );
        if (cachedMatch) {
          const tokens = this.parseTokenCount(cachedMatch[1]);
          const cost = parseFloat(cachedMatch[2] || 0);
          totalCost += cost;

          tokenUsage.details.push({
            type: "cached",
            model: currentModel,
            tokens,
            cost,
            raw: cachedMatch[0],
          });
        }

        // Parse cache creation tokens (🔧) with ANSI color codes
        const creationMatch = details.match(
          /🔧\s*([\d.]+[kMB]?)\s*\(?\$?([\d.]+)?\)?/,
        );
        if (creationMatch) {
          const tokens = this.parseTokenCount(creationMatch[1]);
          const cost = parseFloat(creationMatch[2] || 0);
          totalCost += cost;

          tokenUsage.details.push({
            type: "cache_creation",
            model: currentModel,
            tokens,
            cost,
            raw: creationMatch[0],
          });
        }
      }

      // Parse cost summary logs
      const costMatch = line.match(/💲\s+Total Usage Summary.*?\$([\d.]+)/);
      if (costMatch) {
        totalCost = parseFloat(costMatch[1]);
      }

      // Parse simplified token usage format: 💰 TOKEN_USAGE: model | tokens | $cost
      const simpleTokenMatch = line.match(
        /💰 TOKEN_USAGE:\s+(\S+)\s+\|\s+(\d+)\s+tokens\s+\|\s+\$([\d.]+)/,
      );
      if (simpleTokenMatch) {
        const model = simpleTokenMatch[1];
        const tokens = parseInt(simpleTokenMatch[2]);
        const cost = parseFloat(simpleTokenMatch[3]);

        currentModel = model;
        tokenUsage.promptTokens = Math.floor(tokens * 0.7); // Estimate 70% prompt, 30% completion
        tokenUsage.completionTokens = Math.floor(tokens * 0.3);
        tokenUsage.totalTokens = tokens;
        totalCost = cost;

        tokenUsage.details.push({
          type: "simplified",
          model: model,
          tokens: tokens,
          cost: cost,
          raw: simpleTokenMatch[0],
        });
      }

      // Parse final token usage format: 💰 FINAL_TOKEN_USAGE: model | tokens | $cost
      const finalTokenMatch = line.match(
        /💰 FINAL_TOKEN_USAGE:\s+(\S+)\s+\|\s+(\d+)\s+tokens\s+\|\s+\$([\d.]+)/,
      );
      if (finalTokenMatch) {
        const model = finalTokenMatch[1];
        const tokens = parseInt(finalTokenMatch[2]);
        const cost = parseFloat(finalTokenMatch[3]);

        currentModel = model;
        tokenUsage.promptTokens = Math.floor(tokens * 0.7); // Estimate 70% prompt, 30% completion
        tokenUsage.completionTokens = Math.floor(tokens * 0.3);
        tokenUsage.totalTokens = tokens;
        totalCost = cost;

        tokenUsage.details.push({
          type: "final",
          model: model,
          tokens: tokens,
          cost: cost,
          raw: finalTokenMatch[0],
        });
      }
    }

    tokenUsage.model = currentModel;
    tokenUsage.totalTokens =
      tokenUsage.promptTokens + tokenUsage.completionTokens;
    tokenUsage.cost = totalCost;

    // Store token usage
    this.tokenUsage.set(executionId, tokenUsage);
    this.tokenUsageHistory.push(tokenUsage);
    this.totalTokenCost += totalCost;

    this.logger.info(`💰 Token usage for ${executionId}:`, {
      model: tokenUsage.model,
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      totalTokens: tokenUsage.totalTokens,
      cost: `$${totalCost.toFixed(4)}`,
    });

    return tokenUsage;
  }

  /**
   * Parse token count from string (e.g., "1.5k" -> 1500)
   */
  parseTokenCount(tokenStr) {
    if (!tokenStr) return 0;

    const num = parseFloat(tokenStr.replace(/[kMB]/g, ""));
    if (tokenStr.includes("B")) return Math.round(num * 1000000000);
    if (tokenStr.includes("M")) return Math.round(num * 1000000);
    if (tokenStr.includes("k")) return Math.round(num * 1000);
    return Math.round(num);
  }

  /**
   * Get token usage summary
   */
  getTokenUsageSummary() {
    const summary = {
      totalExecutions: this.tokenUsageHistory.length,
      totalCost: this.totalTokenCost,
      totalTokens: 0,
      byModel: {},
      recentUsage: this.tokenUsageHistory.slice(-10), // Last 10 executions
    };

    // Calculate totals and by-model breakdown
    for (const usage of this.tokenUsageHistory) {
      summary.totalTokens += usage.totalTokens;

      if (!summary.byModel[usage.model]) {
        summary.byModel[usage.model] = {
          executions: 0,
          totalTokens: 0,
          totalCost: 0,
          averageTokensPerExecution: 0,
        };
      }

      summary.byModel[usage.model].executions++;
      summary.byModel[usage.model].totalTokens += usage.totalTokens;
      summary.byModel[usage.model].totalCost += usage.cost;
    }

    // Calculate averages
    for (const model in summary.byModel) {
      const modelStats = summary.byModel[model];
      modelStats.averageTokensPerExecution =
        modelStats.totalTokens / modelStats.executions;
    }

    return summary;
  }

  /**
   * Get token usage for specific execution
   */
  getTokenUsage(executionId) {
    return this.tokenUsage.get(executionId) || null;
  }

  /**
   * Clear token usage history
   */
  clearTokenUsageHistory() {
    this.tokenUsage.clear();
    this.tokenUsageHistory = [];
    this.totalTokenCost = 0;
    this.logger.info("🗑️ Token usage history cleared");
  }

  /**
   * Clean up uploaded files data for completed tasks
   */
  cleanupUploadedFilesData(executionId, sessionId) {
    const key = `${executionId}_${sessionId}`;
    if (this.uploadedFiles.has(key)) {
      const files = this.uploadedFiles.get(key);
      this.logger.info(
        `🗑️ Cleaning up ${files.length} uploaded files for ${key}`,
      );
      this.uploadedFiles.delete(key);
    }
  }

  /**
   * Start periodic cleanup of old file tracking data
   */
  startFileTrackingCleanup() {
    // Run cleanup every hour
    this.fileCleanupInterval = setInterval(
      () => {
        this.cleanupExpiredFileTracking();
      },
      60 * 60 * 1000,
    ); // 1 hour

    this.logger.info("🔄 Started automatic file tracking cleanup (TTL: 24h)");
  }

  /**
   * Clean up expired file tracking entries
   */
  cleanupExpiredFileTracking() {
    const now = Date.now();
    let totalCleaned = 0;

    for (const [key, files] of this.uploadedFiles.entries()) {
      const validFiles = files.filter((file) => {
        const age = now - (file.createdAt || 0);
        return age < this.fileTrackingTTL;
      });

      const cleanedCount = files.length - validFiles.length;
      if (cleanedCount > 0) {
        if (validFiles.length === 0) {
          this.uploadedFiles.delete(key);
        } else {
          this.uploadedFiles.set(key, validFiles);
        }
        totalCleaned += cleanedCount;
      }
    }

    if (totalCleaned > 0) {
      this.logger.info(
        `🧹 Cleaned up ${totalCleaned} expired file tracking entries`,
      );
    }
  }

  /**
   * Schedule cleanup for a specific file entry
   */
  scheduleFileCleanup(key, fileId) {
    setTimeout(() => {
      if (this.uploadedFiles.has(key)) {
        const files = this.uploadedFiles.get(key);
        const filtered = files.filter((f) => f.id !== fileId);
        if (filtered.length === 0) {
          this.uploadedFiles.delete(key);
        } else {
          this.uploadedFiles.set(key, filtered);
        }
      }
    }, this.fileTrackingTTL);
  }

  /**
   * Get file tracking statistics
   */
  getFileTrackingStats() {
    let totalFiles = 0;
    let totalSessions = this.uploadedFiles.size;
    const now = Date.now();
    let expiredFiles = 0;

    for (const [key, files] of this.uploadedFiles.entries()) {
      totalFiles += files.length;
      expiredFiles += files.filter(
        (f) => now - (f.createdAt || 0) > this.fileTrackingTTL,
      ).length;
    }

    return {
      totalSessions,
      totalFiles,
      expiredFiles,
      memoryUsageKB: Math.round(
        JSON.stringify([...this.uploadedFiles]).length / 1024,
      ),
      oldestEntry: this.getOldestFileEntry(),
    };
  }

  /**
   * Get oldest file entry for monitoring
   */
  getOldestFileEntry() {
    let oldest = null;
    const now = Date.now();

    for (const [key, files] of this.uploadedFiles.entries()) {
      for (const file of files) {
        const age = now - (file.createdAt || now);
        if (!oldest || age > oldest.age) {
          oldest = { age, key, fileName: file.fileName };
        }
      }
    }

    return oldest
      ? {
          ...oldest,
          ageHours: Math.round(oldest.age / (60 * 60 * 1000)),
        }
      : null;
  }

  /**
   * Graceful shutdown cleanup
   */
  async gracefulShutdown() {
    this.logger.info("🔄 Starting graceful shutdown...");

    try {
      // Clear cleanup intervals
      if (this.fileCleanupInterval) {
        clearInterval(this.fileCleanupInterval);
      }

      // Stop all active agents
      await this.stopAllAgents();

      // Final cleanup of file tracking
      this.cleanupExpiredFileTracking();

      // Clear all tracking data
      this.uploadedFiles.clear();
      this.pendingDownloads.clear();

      if (this.uploadCache) {
        this.uploadCache.clear();
      }

      this.logger.info("✅ Graceful shutdown completed");
    } catch (error) {
      this.logger.error("❌ Error during graceful shutdown:", error);
    }
  }

  // ===== TASK TRACKING METHODS =====

  /**
   * Register task start
   */
  registerTaskStart(taskId, sessionId, task, maxDuration = 5 * 60 * 1000) {
    const taskInfo = {
      taskId,
      sessionId,
      task,
      status: "running",
      progress: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      error: null,
      timeoutId: null,
      maxDuration: maxDuration,
    };

    // Set up automatic timeout
    taskInfo.timeoutId = setTimeout(() => {
      this.logger.warn(
        `⏰ Task ${taskId} timed out after ${taskInfo.maxDuration}ms`,
      );
      this.registerTaskError(
        taskId,
        new Error(
          `Task timed out after ${taskInfo.maxDuration / 1000} seconds`,
        ),
      );
    }, taskInfo.maxDuration);

    this.activeTasks.set(taskId, taskInfo);
    this.logger.info(
      `📝 Task ${taskId} registered as started with ${taskInfo.maxDuration / 1000}s timeout`,
    );
  }

  /**
   * Register task completion
   */
  registerTaskComplete(taskId, result) {
    const taskInfo = this.activeTasks.get(taskId);
    if (taskInfo) {
      // Clear the timeout since task completed
      if (taskInfo.timeoutId) {
        clearTimeout(taskInfo.timeoutId);
        taskInfo.timeoutId = null;
      }

      taskInfo.status = "completed";
      taskInfo.progress = 100;
      taskInfo.completedAt = new Date().toISOString();

      // Get token usage for this specific task
      const tokenUsage = this.getTokenUsage(taskId);
      taskInfo.tokenUsage = tokenUsage;

      // Add token usage to result if it's an object
      if (result && typeof result === "object") {
        result.tokenUsage = tokenUsage;
        taskInfo.result = result;
      } else if (result) {
        // If result is a string, wrap it with token usage
        taskInfo.result = {
          output: result,
          tokenUsage: tokenUsage,
        };
      } else {
        taskInfo.result = { tokenUsage: tokenUsage };
      }

      // Keep in active tasks for a while, then move to history after timeout
      this.logger.info(`✅ Task ${taskId} registered as completed`);
      if (tokenUsage) {
        this.logger.info(
          `📊 Token usage for task ${taskId}: ${tokenUsage.totalTokens} tokens (${tokenUsage.inputTokens} input + ${tokenUsage.outputTokens} output)`,
        );
      }

      // Move to history after 5 minutes to allow status checks
      setTimeout(
        () => {
          const stillActive = this.activeTasks.get(taskId);
          if (stillActive) {
            this.taskHistory.push(stillActive);
            this.activeTasks.delete(taskId);
            this.logger.info(
              `📚 Task ${taskId} moved to history after completion`,
            );
          }
        },
        5 * 60 * 1000,
      ); // 5 minutes
    }
  }

  /**
   * Register task error
   */
  registerTaskError(taskId, error) {
    const taskInfo = this.activeTasks.get(taskId);
    if (taskInfo) {
      // Clear the timeout since task failed
      if (taskInfo.timeoutId) {
        clearTimeout(taskInfo.timeoutId);
        taskInfo.timeoutId = null;
      }

      taskInfo.status = "failed";
      taskInfo.completedAt = new Date().toISOString();

      // Get token usage for this specific task (even if it failed)
      const tokenUsage = this.getTokenUsage(taskId);
      taskInfo.tokenUsage = tokenUsage;

      // Add token usage to error object
      if (error && typeof error === "object") {
        error.tokenUsage = tokenUsage;
        taskInfo.error = error;
      } else {
        taskInfo.error = {
          message: error.message || error,
          tokenUsage: tokenUsage,
        };
      }

      // Keep in active tasks for a while, then move to history after timeout
      this.logger.error(
        `❌ Task ${taskId} registered as failed: ${error.message}`,
      );
      if (tokenUsage) {
        this.logger.info(
          `📊 Token usage for failed task ${taskId}: ${tokenUsage.totalTokens} tokens (${tokenUsage.inputTokens} input + ${tokenUsage.outputTokens} output)`,
        );
      }

      // Move to history after 10 minutes to allow status checks and debugging
      setTimeout(
        () => {
          const stillActive = this.activeTasks.get(taskId);
          if (stillActive) {
            this.taskHistory.push(stillActive);
            this.activeTasks.delete(taskId);
            this.logger.info(
              `📚 Task ${taskId} moved to history after failure`,
            );
          }
        },
        10 * 60 * 1000,
      ); // 10 minutes
    }
  }

  /**
   * Get task status by taskId
   */
  getTaskStatus(taskId) {
    // Check active tasks first
    const activeTask = this.activeTasks.get(taskId);
    if (activeTask) {
      // Check if there's an active agent for this task
      const agentInfo = this.findAgentByTaskId(taskId);
      const hasActiveProcess = agentInfo && agentInfo.process;

      return {
        ...activeTask,
        hasActiveProcess: hasActiveProcess,
        processPid: hasActiveProcess ? agentInfo.process.pid : null,
      };
    }

    // Check history
    return this.taskHistory.find((task) => task.taskId === taskId) || null;
  }

  /**
   * Get all active tasks
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Get task history
   */
  getTaskHistory(limit = 50) {
    return this.taskHistory.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Delete a specific task (remove from active tasks and history)
   */
  deleteTask(taskId) {
    const taskInfo = this.activeTasks.get(taskId);
    if (!taskInfo) {
      // Check if task exists in history
      const historyIndex = this.taskHistory.findIndex(
        (task) => task.taskId === taskId,
      );
      if (historyIndex === -1) {
        return { success: false, error: "Task not found" };
      }

      // Remove from history
      this.taskHistory.splice(historyIndex, 1);
      this.logger.info(`🗑️ Task ${taskId} deleted from history`);
      return { success: true, message: "Task deleted from history" };
    }

    // Task is active - stop it first, then delete
    this.logger.info(`🗑️ Deleting active task ${taskId}`);

    // Stop the task if it's running
    if (taskInfo.status === "running" || taskInfo.status === "paused") {
      const stopResult = this.stopTask(taskId);
      if (!stopResult.success) {
        this.logger.warn(
          `Failed to stop task ${taskId} before deletion: ${stopResult.error}`,
        );
      }
    }

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    // Remove from history if it exists there
    const historyIndex = this.taskHistory.findIndex(
      (task) => task.taskId === taskId,
    );
    if (historyIndex !== -1) {
      this.taskHistory.splice(historyIndex, 1);
    }

    // Remove from token usage tracking
    this.tokenUsage.delete(taskId);

    // Remove from log streams
    this.logStreams.delete(taskId);

    this.logger.info(`✅ Task ${taskId} deleted successfully`);
    return { success: true, message: "Task deleted successfully" };
  }

  /**
   * Delete all tasks (active and history)
   */
  deleteAllTasks() {
    const results = [];
    const activeTasks = Array.from(this.activeTasks.keys());
    const historyTasks = this.taskHistory.map((task) => task.taskId);

    this.logger.info(
      `🗑️ Deleting all tasks: ${activeTasks.length} active, ${historyTasks.length} in history`,
    );

    // Delete all active tasks
    for (const taskId of activeTasks) {
      const result = this.deleteTask(taskId);
      results.push({ taskId, ...result });
    }

    // Clear history
    this.taskHistory = [];

    // Clear token usage
    this.tokenUsage.clear();

    // Clear log streams
    this.logStreams.clear();

    this.logger.info(`✅ All tasks deleted: ${results.length} tasks processed`);
    return {
      success: true,
      message: `Deleted ${results.length} tasks`,
      results: results,
      count: results.length,
    };
  }

  /**
   * Update task progress
   */
  updateTaskProgress(taskId, progress, message = null) {
    const taskInfo = this.activeTasks.get(taskId);
    if (taskInfo) {
      taskInfo.progress = Math.min(100, Math.max(0, progress));
      if (message) {
        taskInfo.message = message;
      }
      this.logger.debug(`📊 Task ${taskId} progress: ${progress}%`);
    }
  }

  /**
   * Get logs for a specific task with enhanced detail
   */
  getTaskLogs(taskId) {
    const logs = [];

    // Get task info
    const taskInfo =
      this.activeTasks.get(taskId) ||
      this.taskHistory.find((task) => task.taskId === taskId);

    if (!taskInfo) {
      return logs;
    }

    const sessionId = taskInfo.sessionId;

    // Add task start log
    logs.push({
      timestamp: taskInfo.startedAt,
      level: "info",
      message: `Task started: ${taskInfo.task}`,
      type: "task_start",
      taskId: taskId,
      sessionId: sessionId,
    });

    // Add detailed progress logs from enhanced storage
    const taskLogs = this.taskLogs.get(sessionId);
    if (taskLogs && taskLogs.length > 0) {
      logs.push(...taskLogs);
    }

    // Add stdout logs with enhanced parsing
    const stdoutLogs = this.taskStdout.get(sessionId);
    if (stdoutLogs && stdoutLogs.length > 0) {
      stdoutLogs.forEach((entry) => {
        const lines = entry.data.split("\n").filter((line) => line.trim());
        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            let level = "info";
            let type = "stdout";

            // Determine log level and type based on content
            if (
              trimmedLine.includes("ERROR") ||
              trimmedLine.includes("Error")
            ) {
              level = "error";
              type = "error";
            } else if (
              trimmedLine.includes("WARNING") ||
              trimmedLine.includes("Warning")
            ) {
              level = "warning";
              type = "warning";
            } else if (
              trimmedLine.includes("Step") ||
              trimmedLine.includes("📍")
            ) {
              type = "step";
            } else if (
              trimmedLine.includes("ACTION") ||
              trimmedLine.includes("🦾")
            ) {
              type = "action";
            } else if (
              trimmedLine.includes("Next goal") ||
              trimmedLine.includes("🎯")
            ) {
              type = "goal";
            } else if (
              trimmedLine.includes("Eval:") ||
              trimmedLine.includes("❔")
            ) {
              type = "evaluation";
            }

            logs.push({
              timestamp: entry.timestamp,
              level: level,
              message: trimmedLine,
              type: type,
              taskId: taskId,
              sessionId: sessionId,
            });
          }
        });
      });
    }

    // Add stderr logs
    const stderrLogs = this.taskStderr.get(sessionId);
    if (stderrLogs && stderrLogs.length > 0) {
      stderrLogs.forEach((entry) => {
        const lines = entry.data.split("\n").filter((line) => line.trim());
        lines.forEach((line) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            logs.push({
              timestamp: entry.timestamp,
              level: "error",
              message: trimmedLine,
              type: "stderr",
              taskId: taskId,
              sessionId: sessionId,
            });
          }
        });
      });
    }

    // Add legacy progress logs if available
    if (taskInfo.progressLogs && taskInfo.progressLogs.length > 0) {
      logs.push(...taskInfo.progressLogs);
    }

    // Add completion/failure log
    if (taskInfo.completedAt) {
      logs.push({
        timestamp: taskInfo.completedAt,
        level: taskInfo.status === "completed" ? "info" : "error",
        message: `Task ${taskInfo.status}: ${taskInfo.result?.message || taskInfo.error?.message || "Unknown"}`,
        type: "task_completion",
        taskId: taskId,
        sessionId: sessionId,
        status: taskInfo.status,
      });
    }

    // Sort logs by timestamp
    logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return logs;
  }

  /**
   * Get real-time logs for a specific task (for WebSocket streaming)
   */
  getTaskLogsStream(taskId, callback) {
    const taskInfo = this.activeTasks.get(taskId);

    if (!taskInfo) {
      callback({
        error: "Task not found",
        taskId: taskId,
      });
      return;
    }

    // Set up real-time log streaming
    const logStream = {
      taskId: taskId,
      sessionId: taskInfo.sessionId,
      isActive: true,
      callback: callback,
      lastLogCount: 0,
    };

    // Store the log stream
    if (!this.logStreams) {
      this.logStreams = new Map();
    }
    this.logStreams.set(taskId, logStream);

    // Send initial logs
    const initialLogs = this.getTaskLogs(taskId);
    callback({
      success: true,
      taskId: taskId,
      logs: initialLogs,
      total: initialLogs.length,
      type: "initial",
    });

    // Set up periodic updates
    const updateInterval = setInterval(() => {
      const currentLogs = this.getTaskLogs(taskId);
      if (currentLogs.length > logStream.lastLogCount) {
        const newLogs = currentLogs.slice(logStream.lastLogCount);
        logStream.lastLogCount = currentLogs.length;

        callback({
          success: true,
          taskId: taskId,
          logs: newLogs,
          total: currentLogs.length,
          type: "update",
        });
      }
    }, 1000); // Update every second

    // Store interval for cleanup
    logStream.updateInterval = updateInterval;

    // Return cleanup function
    return () => {
      clearInterval(updateInterval);
      this.logStreams.delete(taskId);
    };
  }

  /**
   * Stop log streaming for a task
   */
  stopTaskLogStream(taskId) {
    if (this.logStreams && this.logStreams.has(taskId)) {
      const logStream = this.logStreams.get(taskId);
      if (logStream.updateInterval) {
        clearInterval(logStream.updateInterval);
      }
      this.logStreams.delete(taskId);
      return true;
    }
    return false;
  }

  /**
   * Stop a running task
   */
  stopTask(taskId) {
    const taskInfo = this.activeTasks.get(taskId);
    if (!taskInfo) {
      this.logger.warn(`Task ${taskId} not found in activeTasks`);
      return { success: false, error: "Task not found" };
    }

    this.logger.info(
      `🛑 Attempting to stop task ${taskId}, status: ${taskInfo.status}`,
    );

    // Check if task is already stopped/completed
    if (taskInfo.status === "completed" || taskInfo.status === "stopped") {
      return { success: true, message: "Task is already stopped/completed" };
    }

    // Find the agent process for this task by taskId
    const agentInfo = this.findAgentByTaskId(taskId);
    this.logger.info(`Agent info for task ${taskId}:`, {
      found: !!agentInfo,
      hasProcess: !!(agentInfo && agentInfo.process),
      processPid: agentInfo && agentInfo.process ? agentInfo.process.pid : null,
    });

    if (agentInfo && agentInfo.process) {
      try {
        // Kill the process
        agentInfo.process.kill("SIGTERM");
        this.logger.info(`🛑 Task ${taskId} stopped by user request`);

        // Mark task as stopped (don't use registerTaskError for user-requested stops)
        taskInfo.status = "stopped";
        taskInfo.stoppedAt = new Date().toISOString();
        taskInfo.stoppedReason = "User requested stop";

        return { success: true, message: "Task stopped successfully" };
      } catch (error) {
        this.logger.error(`Failed to stop task ${taskId}:`, error);
        return { success: false, error: error.message };
      }
    }

    // If no process found, just mark the task as stopped
    this.logger.warn(`No process found for task ${taskId}, marking as stopped`);
    taskInfo.status = "stopped";
    taskInfo.stoppedAt = new Date().toISOString();
    taskInfo.stoppedReason = "User requested stop (no active process)";

    return { success: true, message: "Task marked as stopped" };
  }

  /**
   * Pause a running task (Enhanced Windows-compatible implementation)
   */
  pauseTask(taskId) {
    const taskInfo = this.activeTasks.get(taskId);
    if (!taskInfo) {
      return { success: false, error: "Task not found" };
    }

    if (taskInfo.status === "paused") {
      return { success: false, error: "Task is already paused" };
    }

    if (taskInfo.status !== "running") {
      return { success: false, error: "Task is not running" };
    }

    // Find the agent process for this task by taskId
    const agentInfo = this.findAgentByTaskId(taskId);

    if (agentInfo && agentInfo.process) {
      try {
        // Cross-platform pause implementation
        if (process.platform === "win32") {
          // Windows: Use SIGTERM to terminate the process gracefully
          this.logger.info(
            `⏸️ Windows pause: Terminating process PID ${agentInfo.process.pid} gracefully`,
          );

          // Mark as paused BEFORE terminating to prevent cleanup
          taskInfo.status = "paused";
          taskInfo.pausedAt = new Date().toISOString();
          taskInfo.pausedProcessPid = agentInfo.process.pid;
          taskInfo.pausedGracefully = true;
          taskInfo.pausedByUser = true; // Flag to prevent cleanup on process exit

          // Now terminate the process
          agentInfo.process.kill("SIGTERM");

          this.logger.info(
            `⏸️ Task ${taskId} paused by terminating process gracefully on Windows`,
          );
          return {
            success: true,
            message: "Task paused successfully (process terminated gracefully)",
          };
        } else {
          // Unix/Linux: Use SIGSTOP to suspend process
          agentInfo.process.kill("SIGSTOP");

          taskInfo.status = "paused";
          taskInfo.pausedAt = new Date().toISOString();
          taskInfo.pausedProcess = agentInfo.process;

          this.logger.info(
            `⏸️ Task ${taskId} paused using SIGSTOP on Unix/Linux`,
          );
          return {
            success: true,
            message: "Task paused successfully (process suspended)",
          };
        }
      } catch (error) {
        this.logger.error(`Failed to pause task ${taskId}:`, error);
        return { success: false, error: error.message };
      }
    }

    // If no process found, just mark the task as paused
    this.logger.warn(`No process found for task ${taskId}, marking as paused`);
    taskInfo.status = "paused";
    taskInfo.pausedAt = new Date().toISOString();

    return {
      success: true,
      message: "Task marked as paused (no active process)",
    };
  }

  /**
   * Resume a paused task (Enhanced Windows-compatible implementation)
   */
  async resumeTask(taskId, browserService = null, io = null) {
    const taskInfo = this.activeTasks.get(taskId);
    if (!taskInfo) {
      return { success: false, error: "Task not found" };
    }

    // Debug logging for task status
    this.logger.info(
      `🔍 [DEBUG] Resume task ${taskId} - status: ${taskInfo.status}, pausedByUser: ${taskInfo.pausedByUser}, pausedGracefully: ${taskInfo.pausedGracefully}`,
    );

    // Allow resume for both paused and failed tasks that were paused by user
    if (
      taskInfo.status !== "paused" &&
      !(taskInfo.status === "failed" && taskInfo.pausedByUser)
    ) {
      return {
        success: false,
        error: `Task is not paused (current status: ${taskInfo.status})`,
      };
    }

    // For Windows, if process was terminated, we need to restart the task
    if (
      process.platform === "win32" &&
      (taskInfo.pausedGracefully || taskInfo.pausedByUser)
    ) {
      this.logger.info(
        `🔄 Windows resume: Restarting task ${taskId} from where it left off`,
      );

      try {
        // Get the session information for restarting
        const sessionId = taskInfo.sessionId;
        const originalTask = taskInfo.task;
        const originalOptions = taskInfo.options || {};

        // Check if browser session exists, if not create it
        if (browserService) {
          let browserSession = browserService.getSession(sessionId);

          if (!browserSession) {
            this.logger.info(
              `🔄 No browser session found for ${sessionId}, creating new one for restart`,
            );

            try {
              browserSession =
                await browserService.createSessionWithSeparateBrowser(
                  sessionId,
                  {
                    headless: false,
                    width: 1920,
                    height: 1480,
                  },
                );

              this.logger.info(
                `✅ Created new browser session for restart: ${browserSession.browserWSEndpoint}`,
              );

              // Start video streaming for the new session if io is available
              if (io) {
                await browserService.startVideoStreaming(sessionId, io);
                this.logger.info(
                  `🎬 Started video streaming for resumed session ${sessionId}`,
                );
              }
            } catch (createError) {
              this.logger.error(
                `❌ Failed to create new browser session for restart: ${createError.message}`,
              );
              return {
                success: false,
                error: `Failed to create browser session: ${createError.message}`,
              };
            }
          } else {
            this.logger.info(
              `✅ Browser session already exists for ${sessionId}, using existing session`,
            );
          }
        }

        // Mark task as running again
        taskInfo.status = "running";
        taskInfo.resumedAt = new Date().toISOString();
        taskInfo.pausedByUser = false;
        taskInfo.pausedGracefully = false;

        // Restart the execution with the same session and task parameters
        this.logger.info(
          `🔄 Restarting task ${taskId} with session ${sessionId}`,
        );

        // Use the existing executeTask method to restart
        this.executeTask(sessionId, originalTask, {
          ...originalOptions,
          browserService, // Pass the browser service for session management
          io, // Pass the io for streaming
          taskId: taskId, // Preserve the same task ID
          isRestart: true, // Flag to indicate this is a restart
        }).catch((error) => {
          this.logger.error(`Failed to restart task ${taskId}:`, error);
          this.registerTaskError(taskId, error.message || "Restart failed");
        });

        return {
          success: true,
          message: "Task resumed successfully (restarted on Windows)",
        };
      } catch (error) {
        this.logger.error(`Failed to restart task ${taskId}:`, error);
        taskInfo.status = "failed";
        taskInfo.error = `Restart failed: ${error.message}`;
        return {
          success: false,
          error: `Failed to restart task: ${error.message}`,
        };
      }
    }

    // Find the agent process for this task by taskId
    const agentInfo = this.findAgentByTaskId(taskId);

    if (agentInfo && agentInfo.process && process.platform !== "win32") {
      try {
        // Unix/Linux: Resume suspended process
        agentInfo.process.kill("SIGCONT");

        taskInfo.status = "running";
        taskInfo.resumedAt = new Date().toISOString();
        delete taskInfo.pausedProcess;

        this.logger.info(
          `▶️ Task ${taskId} resumed using SIGCONT on Unix/Linux`,
        );
        return {
          success: true,
          message: "Task resumed successfully (process resumed)",
        };
      } catch (error) {
        this.logger.error(`Failed to resume task ${taskId}:`, error);
        return { success: false, error: error.message };
      }
    }

    // Fallback: Just mark as running (for edge cases)
    this.logger.warn(
      `No resumable process found for task ${taskId}, marking as running`,
    );
    taskInfo.status = "running";
    taskInfo.resumedAt = new Date().toISOString();

    return {
      success: true,
      message: "Task marked as running (no active process to resume)",
    };
  }

  /**
   * Stop all running tasks
   */
  stopAllTasks() {
    const results = [];
    const activeTasks = Array.from(this.activeTasks.keys());

    for (const taskId of activeTasks) {
      const result = this.stopTask(taskId);
      results.push({ taskId, ...result });
    }

    this.logger.info(`🛑 Stopped ${results.length} tasks`);
    return { success: true, results, count: results.length };
  }

  /**
   * Pause all running tasks
   */
  pauseAllTasks() {
    const results = [];
    const runningTasks = Array.from(this.activeTasks.entries())
      .filter(([_, task]) => task.status === "running")
      .map(([taskId, _]) => taskId);

    for (const taskId of runningTasks) {
      const result = this.pauseTask(taskId);
      results.push({ taskId, ...result });
    }

    this.logger.info(`⏸️ Paused ${results.length} tasks`);
    return { success: true, results, count: results.length };
  }

  /**
   * Resume all paused tasks
   */
  resumeAllTasks() {
    const results = [];
    const pausedTasks = Array.from(this.activeTasks.entries())
      .filter(([_, task]) => task.status === "paused")
      .map(([taskId, _]) => taskId);

    for (const taskId of pausedTasks) {
      const result = this.resumeTask(taskId);
      results.push({ taskId, ...result });
    }

    this.logger.info(`▶️ Resumed ${results.length} tasks`);
    return { success: true, results, count: results.length };
  }

  /**
   * Execute task asynchronously in the background
   * This method is called by the routes to start task execution
   */
  async executeTaskAsync(sessionId, task, taskId, options, req) {
    try {
      console.log("============EXECUTING TASK", taskId);
      this.logger.info(
        `🚀 Starting task execution: ${taskId} (concurrent: ${this.concurrencyConfig.enableConcurrentExecution})`,
      );

      // Register task as started
      const taskInfo = {
        taskId,
        sessionId,
        task,
        status: "queued",
        progress: 0,
        startedAt: new Date().toISOString(),
        options,
        requestInfo: {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          timestamp: new Date().toISOString(),
        },
      };

      this.activeTasks.set(taskId, taskInfo);

      if (this.concurrencyConfig.enableConcurrentExecution) {
        // Concurrent execution mode
        return this.executeConcurrentTask(
          sessionId,
          task,
          taskId,
          options,
          taskInfo,
        );
      } else {
        // Sequential execution mode (original behavior)
        return this.executeSequentialTask(
          sessionId,
          task,
          taskId,
          options,
          taskInfo,
        );
      }
    } catch (error) {
      this.logger.error(`❌ Task ${taskId} execution failed:`, error);

      // Update task status
      const taskInfo = this.activeTasks.get(taskId);
      if (taskInfo) {
        taskInfo.status = "failed";
        taskInfo.error = error.message;
        taskInfo.failedAt = new Date().toISOString();
        taskInfo.progress = 0;
        this.taskHistory.push(taskInfo);
        this.activeTasks.delete(taskId);
      }

      throw error;
    }
  }

  // ============== NEW CONCURRENT EXECUTION METHODS ==============

  async executeConcurrentTask(sessionId, task, taskId, options, taskInfo) {
    // Check if we're at the concurrent task limit
    if (this.runningTasks.size >= this.concurrencyConfig.maxConcurrentTasks) {
      // Check if queue is full
      if (this.taskQueue.length >= this.concurrencyConfig.taskQueueLimit) {
        throw new Error(
          `Task queue is full (${this.concurrencyConfig.taskQueueLimit} tasks). Please try again later.`,
        );
      }

      // Add to queue
      this.logger.info(
        `⏳ Task ${taskId} queued (${this.runningTasks.size}/${this.concurrencyConfig.maxConcurrentTasks} slots busy)`,
      );
      taskInfo.status = "queued";

      return new Promise((resolve, reject) => {
        this.taskQueue.push({
          sessionId,
          task,
          taskId,
          options,
          taskInfo,
          resolve,
          reject,
        });
      });
    }

    // Execute immediately
    return this.executeTaskImmediately(
      sessionId,
      task,
      taskId,
      options,
      taskInfo,
    );
  }

  async executeSequentialTask(sessionId, task, taskId, options, taskInfo) {
    // Original sequential behavior - wait for task completion
    taskInfo.status = "started";

    const result = await this.executeTask(sessionId, task, {
      ...options,
      taskId,
      useExistingBrowser: true,
    });

    // Update task status
    if (taskInfo) {
      taskInfo.status = "completed";
      taskInfo.progress = 100;
      taskInfo.completedAt = new Date().toISOString();
      taskInfo.result = result;
      this.taskHistory.push(taskInfo);
      this.activeTasks.delete(taskId);
    }

    this.logger.info(`✅ Task ${taskId} completed successfully`);
    return result;
  }

  async executeTaskImmediately(sessionId, task, taskId, options, taskInfo) {
    this.runningTasks.add(taskId);
    taskInfo.status = "running";
    taskInfo.actualStartedAt = new Date().toISOString();

    this.logger.info(
      `🏃 Task ${taskId} started immediately (${this.runningTasks.size}/${this.concurrencyConfig.maxConcurrentTasks} running)`,
    );

    try {
      // Execute task without awaiting (fire and forget for concurrency)
      const taskPromise = this.executeTask(sessionId, task, {
        ...options,
        taskId,
        useExistingBrowser: true,
      });

      // Handle task completion asynchronously
      taskPromise
        .then((result) => {
          // Task completed successfully
          const currentTaskInfo = this.activeTasks.get(taskId);
          if (currentTaskInfo) {
            currentTaskInfo.status = "completed";
            currentTaskInfo.progress = 100;
            currentTaskInfo.completedAt = new Date().toISOString();
            currentTaskInfo.result = result;
            this.taskHistory.push(currentTaskInfo);
            this.activeTasks.delete(taskId);
          }

          this.logger.info(`✅ Task ${taskId} completed successfully`);
          this.onTaskCompleted(taskId);
        })
        .catch((error) => {
          // Task failed
          this.logger.error(`❌ Task ${taskId} execution failed:`, error);

          const currentTaskInfo = this.activeTasks.get(taskId);
          if (currentTaskInfo) {
            currentTaskInfo.status = "failed";
            currentTaskInfo.error = error.message;
            currentTaskInfo.failedAt = new Date().toISOString();
            currentTaskInfo.progress = 0;
            this.taskHistory.push(currentTaskInfo);
            this.activeTasks.delete(taskId);
          }

          this.onTaskCompleted(taskId);
        });

      // Return immediately with task info (don't wait for completion)
      return {
        success: true,
        taskId,
        sessionId,
        status: "running",
        message: "Task started successfully and running in background",
        concurrentExecution: true,
        runningTasks: this.runningTasks.size,
        queuedTasks: this.taskQueue.length,
      };
    } catch (error) {
      this.runningTasks.delete(taskId);
      this.onTaskCompleted(taskId);
      throw error;
    }
  }

  onTaskCompleted(taskId) {
    // Remove from running tasks
    this.runningTasks.delete(taskId);

    // Clean up task storage for completed task
    this.cleanupTaskStorage(taskId);

    // Check if there are queued tasks to start
    if (
      this.taskQueue.length > 0 &&
      this.runningTasks.size < this.concurrencyConfig.maxConcurrentTasks
    ) {
      const queuedTask = this.taskQueue.shift();
      this.logger.info(
        `🚀 Starting queued task ${queuedTask.taskId} (${this.runningTasks.size}/${this.concurrencyConfig.maxConcurrentTasks} slots)`,
      );

      // Execute the queued task
      this.executeTaskImmediately(
        queuedTask.sessionId,
        queuedTask.task,
        queuedTask.taskId,
        queuedTask.options,
        queuedTask.taskInfo,
      )
        .then(queuedTask.resolve)
        .catch(queuedTask.reject);
    }

    this.logger.debug(
      `📊 Concurrency status: ${this.runningTasks.size} running, ${this.taskQueue.length} queued`,
    );
  }

  /**
   * Clean up task storage for completed tasks
   */
  cleanupTaskStorage(taskId) {
    try {
      // Get task info to find sessionId
      const taskInfo =
        this.activeTasks.get(taskId) ||
        this.taskHistory.find((task) => task.taskId === taskId);

      if (taskInfo && taskInfo.sessionId) {
        const sessionId = taskInfo.sessionId;

        // Keep logs for a period of time before cleanup (e.g., 1 hour)
        // For now, we'll keep them until manually cleaned up
        // In a production environment, you might want to implement TTL cleanup

        this.logger.debug(
          `🧹 Task storage preserved for session ${sessionId} (taskId: ${taskId})`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cleanup task storage for ${taskId}:`,
        error.message,
      );
    }
  }

  /**
   * Get task information by taskId
   */
  getTaskInfo(taskId) {
    return (
      this.activeTasks.get(taskId) ||
      this.taskHistory.find((task) => task.taskId === taskId)
    );
  }

  // ============== END CONCURRENT EXECUTION METHODS ==============
}
