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

    // Token cost tracking
    this.tokenUsage = new Map(); // Track token usage per execution
    this.totalTokenCost = 0;
    this.tokenUsageHistory = [];

    // Task tracking
    this.activeTasks = new Map(); // Track active tasks by taskId
    this.taskHistory = []; // Store completed tasks
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
    };
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
    } = options;

    this.logger.info(
      `🎯 Executing browser-use task for session ${sessionId}:`,
      {
        task: task.substring(0, 100) + (task.length > 100 ? "..." : ""),
        maxSteps,
        browserContextId,
        priority,
        llmProvider,
        useExistingBrowser,
        disableHighlighting, // NEW: Log highlighting setting
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
                headless: false, // Make it visible for streaming
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
      const executionId = `browseruse_${sessionId}_${Date.now()}`;
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

        // Azure OpenAI configuration
        AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY,
        AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
        AZURE_OPENAI_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION,

        // Alternative LLM providers
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,

        // LLM provider preference
        LLM_PROVIDER: llmProvider,

        // Browser configuration for automation
        BROWSER_HEADLESS: process.env.BROWSER_HEADLESS || "false",
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

      // Handle stdout data with enhanced parsing
      agentProcess.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;

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
      agentProcess.on("close", (code) => {
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
            reject(enhancedErrorResult);
          }
        } else {
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
          eventData = { stepNumber, message: trimmedLine };
        }
      } else if (trimmedLine.includes("🦾 [ACTION")) {
        eventType = "action";
        eventData = { action: trimmedLine, message: trimmedLine };
      } else if (trimmedLine.includes("🎯 Next goal:")) {
        eventType = "goal";
        eventData = {
          goal: trimmedLine.replace("🎯 Next goal:", "").trim(),
          message: trimmedLine,
        };
      } else if (
        trimmedLine.includes("👍 Eval: Success") ||
        trimmedLine.includes("✅")
      ) {
        eventType = "success";
        eventData = { success: true, message: trimmedLine };
      } else if (
        trimmedLine.includes("⚠️ Eval: Failure") ||
        trimmedLine.includes("❌")
      ) {
        eventType = "warning";
        eventData = { warning: true, message: trimmedLine };
      } else if (trimmedLine.includes("🔗 Navigated to")) {
        eventType = "navigation";
        eventData = { navigation: true, message: trimmedLine };
      } else if (trimmedLine.includes("INFO") || trimmedLine.includes("🧠")) {
        eventType = "info";
      }

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
   * Parse the final result from agent output
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

    if (resultJson) {
      const result = JSON.parse(resultJson);

      // Generate live URL for this session
      const liveUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/live/${sessionId}`;

      // Enhance result with execution metadata, token usage, and live URL
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
   * Get logs for a specific task
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

    // Add task start log
    logs.push({
      timestamp: taskInfo.startedAt,
      level: "info",
      message: `Task started: ${taskInfo.task}`,
      type: "task_start",
      taskId: taskId,
      sessionId: taskInfo.sessionId,
    });

    // Add progress logs if available
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
        sessionId: taskInfo.sessionId,
        status: taskInfo.status,
      });
    }

    // Add stdout/stderr logs if available
    const agentInfo = Array.from(this.activeAgents.values()).find(
      (agent) => agent.taskId === taskId,
    );

    if (agentInfo) {
      // Parse stdout for meaningful log entries
      if (agentInfo.stdout) {
        const stdoutLines = agentInfo.stdout.split("\n");
        stdoutLines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (
            trimmedLine &&
            !trimmedLine.includes("INFO") &&
            !trimmedLine.includes("DEBUG")
          ) {
            logs.push({
              timestamp: new Date(
                taskInfo.startedAt.getTime() + index * 1000,
              ).toISOString(),
              level: "info",
              message: trimmedLine,
              type: "stdout",
              taskId: taskId,
              sessionId: taskInfo.sessionId,
            });
          }
        });
      }

      // Parse stderr for error logs
      if (agentInfo.stderr) {
        const stderrLines = agentInfo.stderr.split("\n");
        stderrLines.forEach((line, index) => {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            logs.push({
              timestamp: new Date(
                taskInfo.startedAt.getTime() + index * 1000,
              ).toISOString(),
              level: "error",
              message: trimmedLine,
              type: "stderr",
              taskId: taskId,
              sessionId: taskInfo.sessionId,
            });
          }
        });
      }
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

        // Register task as stopped
        this.registerTaskError(taskId, {
          message: "Task stopped by user request",
          type: "user_stopped",
          stoppedAt: new Date().toISOString(),
        });

        return { success: true, message: "Task stopped successfully" };
      } catch (error) {
        this.logger.error(`Failed to stop task ${taskId}:`, error);
        return { success: false, error: error.message };
      }
    }

    // If no process found, just mark the task as stopped
    this.logger.warn(`No process found for task ${taskId}, marking as stopped`);
    this.registerTaskError(taskId, {
      message: "Task stopped by user request (no process found)",
      type: "user_stopped",
      stoppedAt: new Date().toISOString(),
    });

    return { success: true, message: "Task marked as stopped" };
  }

  /**
   * Pause a running task
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
        // Send SIGSTOP to pause the process
        agentInfo.process.kill("SIGSTOP");

        // Update task status
        taskInfo.status = "paused";
        taskInfo.pausedAt = new Date().toISOString();

        this.logger.info(`⏸️ Task ${taskId} paused by user request`);
        return { success: true, message: "Task paused successfully" };
      } catch (error) {
        this.logger.error(`Failed to pause task ${taskId}:`, error);
        return { success: false, error: error.message };
      }
    }

    // If no process found, just mark the task as paused
    this.logger.warn(`No process found for task ${taskId}, marking as paused`);
    taskInfo.status = "paused";
    taskInfo.pausedAt = new Date().toISOString();

    return { success: true, message: "Task marked as paused" };
  }

  /**
   * Resume a paused task
   */
  resumeTask(taskId) {
    const taskInfo = this.activeTasks.get(taskId);
    if (!taskInfo) {
      return { success: false, error: "Task not found" };
    }

    if (taskInfo.status !== "paused") {
      return { success: false, error: "Task is not paused" };
    }

    // Find the agent process for this task by taskId
    const agentInfo = this.findAgentByTaskId(taskId);

    if (agentInfo && agentInfo.process) {
      try {
        // Send SIGCONT to resume the process
        agentInfo.process.kill("SIGCONT");

        // Update task status
        taskInfo.status = "running";
        taskInfo.resumedAt = new Date().toISOString();

        this.logger.info(`▶️ Task ${taskId} resumed by user request`);
        return { success: true, message: "Task resumed successfully" };
      } catch (error) {
        this.logger.error(`Failed to resume task ${taskId}:`, error);
        return { success: false, error: error.message };
      }
    }

    // If no process found, just mark the task as running
    this.logger.warn(`No process found for task ${taskId}, marking as running`);
    taskInfo.status = "running";
    taskInfo.resumedAt = new Date().toISOString();

    return { success: true, message: "Task marked as running" };
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
      this.logger.info(`🚀 Starting background task execution: ${taskId}`);

      // Register task as started
      this.activeTasks.set(taskId, {
        taskId,
        sessionId,
        task,
        status: "started",
        progress: 0,
        startedAt: new Date().toISOString(),
        options,
        requestInfo: {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          timestamp: new Date().toISOString(),
        },
      });

      // Execute the task using the existing executeTask method
      const result = await this.executeTask(sessionId, task, {
        ...options,
        taskId,
        useExistingBrowser: true,
      });

      // Update task status
      const taskInfo = this.activeTasks.get(taskId);
      if (taskInfo) {
        taskInfo.status = "completed";
        taskInfo.progress = 100;
        taskInfo.completedAt = new Date().toISOString();
        taskInfo.result = result;
      }

      // Move to history
      if (taskInfo) {
        this.taskHistory.push(taskInfo);
        this.activeTasks.delete(taskId);
      }

      this.logger.info(`✅ Task ${taskId} completed successfully`);
      return result;
    } catch (error) {
      this.logger.error(`❌ Task ${taskId} execution failed:`, error);

      // Update task status
      const taskInfo = this.activeTasks.get(taskId);
      if (taskInfo) {
        taskInfo.status = "failed";
        taskInfo.error = error.message;
        taskInfo.failedAt = new Date().toISOString();
        taskInfo.progress = 0;
      }

      // Move to history even if failed
      if (taskInfo) {
        this.taskHistory.push(taskInfo);
        this.activeTasks.delete(taskId);
      }

      throw error;
    }
  }
}
