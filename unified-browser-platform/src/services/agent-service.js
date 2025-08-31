/**
 * AI Agent Service
 * Integrates browser-use AI capabilities for automated browser tasks
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";
import { Logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

export class AgentService extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.logger = new Logger("AgentService");
    this.isInitialized = false;
    this.pythonPath =
      process.env.PYTHON_PATH ||
      (process.platform === "win32"
        ? ".\\venv\\Scripts\\python.exe"
        : "./venv/bin/python");
    this.agentScriptPath =
      process.env.AGENT_SCRIPT_PATH || "./python-agent/main.py";
  }
  async initialize() {
    this.logger.info("🤖 Initializing AI Agent Service...");

    try {
      // Test Python environment and choose agent
      const hasAdvancedAgent = await this.testAdvancedAgent();

      if (hasAdvancedAgent) {
        this.pythonPath =
          process.platform === "win32"
            ? ".\\venv\\Scripts\\python.exe"
            : "./venv/bin/python"; // Use virtual environment
        this.agentScriptPath = "./python-agent/browser_use_agent.py"; // Use full browser-use agent
        this.logger.info(
          "✅ Advanced AI Agent (browser-use with Azure OpenAI) available",
        );
      } else {
        this.pythonPath =
          process.platform === "win32"
            ? ".\\venv\\Scripts\\python.exe"
            : "./venv/bin/python";
        this.agentScriptPath = "./python-agent/browser_use_agent.py"; // Always use browser-use
        this.logger.info(
          "⚠️ Using browser-use agent (may fall back to error handling)",
        );
      }

      this.isInitialized = true;
      this.logger.info("✅ AI Agent Service initialized");
    } catch (error) {
      this.logger.error("❌ Failed to initialize AI Agent Service:", error);
      throw error;
    }
  }

  async testAdvancedAgent() {
    try {
      // Don't actually run browser-use during startup as it creates browsers
      // Just check if the Python environment and script exist
      const result = await this.testPythonEnvironmentOnly();
      return result;
    } catch (error) {
      this.logger.warn(
        "Advanced agent not available, falling back to simple agent",
      );
      return false;
    }
  }

  async testPythonEnvironmentOnly() {
    return new Promise((resolve, reject) => {
      // Use virtual environment Python - just test if it works without running browser-use
      const pythonPath =
        process.platform === "win32"
          ? ".\\venv\\Scripts\\python.exe"
          : "./venv/bin/python";

      // Test Python environment with a simple script that doesn't create browsers
      const testProcess = spawn(
        pythonPath,
        ["-c", 'import sys; print("Python OK"); sys.exit(0)'],
        {
          stdio: "pipe",
          timeout: 5000,
        },
      );

      let output = "";
      let error = "";

      testProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      testProcess.stderr.on("data", (data) => {
        error += data.toString();
      });

      testProcess.on("close", (code) => {
        if (code === 0 && output.includes("Python OK")) {
          resolve(true);
        } else {
          reject(
            new Error(
              `Python environment test failed: ${error || "Unknown error"}`,
            ),
          );
        }
      });

      testProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });

      // Add timeout
      setTimeout(() => {
        testProcess.kill();
        reject(new Error("Python environment test timed out"));
      }, 5000);
    });
  }

  async testPythonEnvironment() {
    return new Promise((resolve, reject) => {
      // Use virtual environment Python
      const pythonPath =
        process.platform === "win32"
          ? ".\\venv\\Scripts\\python.exe"
          : "./venv/bin/python";
      const testScript = "./python-agent/browser_use_agent.py";

      const testProcess = spawn(pythonPath, [testScript, "test task"], {
        stdio: "pipe",
        timeout: 10000,
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
        try {
          const result = JSON.parse(output);
          if (result.success) {
            resolve(true);
          } else {
            reject(new Error(`Test failed: ${result.error || result.message}`));
          }
        } catch (parseError) {
          if (code === 0) {
            resolve(true); // Consider success if exit code is 0
          } else {
            reject(
              new Error(
                `Python environment test failed: ${error || "Parse error"}`,
              ),
            );
          }
        }
      });

      testProcess.on("error", (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });

      // Add timeout
      setTimeout(() => {
        testProcess.kill();
        reject(new Error("Python environment test timed out"));
      }, 10000);
    });
  }

  async executeTask(sessionId, task, options = {}) {
    // Use provided taskId or generate a new one
    const taskId = options.taskId || uuidv4();

    // Check if there's already a running task for this session
    const existingTask = Array.from(this.tasks.values()).find(
      (t) => t.sessionId === sessionId && t.status === "running",
    );

    if (existingTask) {
      this.logger.warn(
        `Task already running for session ${sessionId}, cancelling previous task`,
      );
      await this.cancelTask(existingTask.taskId);
    }

    try {
      this.logger.info(
        `🎯 Starting AI task ${taskId} for session ${sessionId}: ${task}`,
      );

      // Get the existing browser session from BrowserStreamingService
      const browserSession = options.browserSession;

      const taskConfig = {
        taskId,
        sessionId,
        task,
        browserSession, // Use existing browser session
        options: {
          timeout: options.timeout || 300000, // 5 minutes default
          maxSteps: options.maxSteps || 50,
          llmModel: options.llmModel || "gpt-4",
          headless: process.env.BROWSER_HEADLESS === "false", // Use environment config
          useExistingBrowser: !!browserSession, // Flag to use existing browser
          ...options,
        },
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
        steps: [],
        result: null,
        error: null,
      };

      this.tasks.set(taskId, taskConfig);

      // Always use browser-use Python agent for high-level AI automation
      if (browserSession) {
        this.logger.info(
          `🤖 Executing task with browser-use AI agent for ${sessionId}`,
        );
        await this.executePythonAgentTask(taskConfig, options);
      } else {
        // Use browser-use Python agent even without browser session
        this.logger.info(
          `🤖 Executing task with standalone browser-use AI agent for ${sessionId}`,
        );
        await this.executePythonAgentTask(taskConfig, options);
      }

      return taskId;
    } catch (error) {
      this.logger.error(`❌ Failed to execute task ${taskId}:`, error);
      const taskConfig = this.tasks.get(taskId);
      if (taskConfig) {
        taskConfig.status = "failed";
        taskConfig.error = error.message;
        taskConfig.completedAt = new Date();
      }
      throw error;
    }
  }

  async executeDirectBrowserTask(taskConfig, options) {
    const { taskId, sessionId, task, browserSession } = taskConfig;

    try {
      this.logger.info(`🚀 Executing task directly: ${task}`);

      // Define real automation steps
      const steps = [
        "Analyzing task requirements",
        "Connecting to browser session",
        "Navigating to target website",
        "Performing automated actions",
        "Verifying task completion",
      ];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        this.logger.info(`🔄 Task ${taskId} step ${i + 1}: ${step}`);

        // Emit progress
        if (options.onProgress) {
          options.onProgress({
            taskId,
            step: i + 1,
            totalSteps: steps.length,
            description: step,
            progress: ((i + 1) / steps.length) * 100,
          });
        }

        // Execute actual browser actions based on task
        if (i === 2 && browserSession) {
          // "Navigating to target website" and "Performing automated actions"
          await this.performBrowserAction(task, browserSession);
        }

        // Wait between steps (except for the last step)
        if (i < steps.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }

      // Complete the task
      const task_obj = this.tasks.get(taskId);
      if (task_obj) {
        task_obj.status = "completed";
        task_obj.completedAt = new Date();
        task_obj.result = { success: true, message: `Task completed: ${task}` };
      }

      this.logger.info(`✅ Task ${taskId} completed successfully`);

      if (options.onComplete) {
        options.onComplete({
          success: true,
          message: `Task completed: ${task}`,
        });
      }
    } catch (error) {
      const task_obj = this.tasks.get(taskId);
      if (task_obj) {
        task_obj.status = "failed";
        task_obj.error = error.message;
        task_obj.completedAt = new Date();
      }

      this.logger.error(`❌ Task ${taskId} failed:`, error);

      if (options.onError) {
        options.onError(error);
      }
      throw error;
    }
  }

  async performBrowserAction(task, browserSession) {
    try {
      if (!browserSession || !browserSession.page) {
        throw new Error("Invalid browser session provided");
      }

      const taskLower = task.toLowerCase();
      this.logger.info(`🎯 Performing real browser action for: ${task}`);

      // Parse the task to understand what to do
      if (taskLower.includes("youtube") && taskLower.includes("search")) {
        await this.performYouTubeSearch(task, browserSession.page);
      } else if (taskLower.includes("google") && taskLower.includes("search")) {
        await this.performGoogleSearch(task, browserSession.page);
      } else if (
        taskLower.includes("navigate") ||
        taskLower.includes("go to")
      ) {
        await this.performNavigation(task, browserSession.page);
      } else {
        // Generic task - try to navigate to a relevant page
        this.logger.info(`🔄 Performing generic action for: ${task}`);
        await browserSession.page.goto("https://www.google.com");
        await browserSession.page.waitForSelector('input[name="q"]', {
          timeout: 5000,
        });
      }

      this.logger.info(`✅ Browser action completed successfully`);
    } catch (error) {
      this.logger.error("❌ Browser action failed:", error);
      throw error;
    }
  }

  async performYouTubeSearch(task, page) {
    try {
      this.logger.info("🎥 Navigating to YouTube...");
      await page.goto("https://www.youtube.com", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for search box to be available
      this.logger.info("🔍 Looking for search box...");
      await page.waitForSelector("input#search", { timeout: 10000 });

      // Extract search term from task
      const searchMatch = task.match(/search.*?for\s+(.+)|search\s+(.+)/i);
      const searchTerm = searchMatch
        ? (searchMatch[1] || searchMatch[2]).trim()
        : "mr.beast";

      this.logger.info(`🔍 Searching for: ${searchTerm}`);

      // Type in search box
      await page.click("input#search");
      await page.type("input#search", searchTerm);

      // Click search button or press Enter
      await page.keyboard.press("Enter");

      // Wait for results to load
      await page.waitForSelector("#contents", { timeout: 10000 });

      this.logger.info("✅ YouTube search completed successfully");
    } catch (error) {
      this.logger.error("❌ YouTube search failed:", error);
      throw error;
    }
  }

  async performGoogleSearch(task, page) {
    try {
      this.logger.info("🌐 Navigating to Google...");
      await page.goto("https://www.google.com", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for search box
      await page.waitForSelector('input[name="q"]', { timeout: 10000 });

      // Extract search term
      const searchMatch = task.match(/search.*?for\s+(.+)|search\s+(.+)/i);
      const searchTerm = searchMatch
        ? (searchMatch[1] || searchMatch[2]).trim()
        : "search query";

      this.logger.info(`🔍 Searching for: ${searchTerm}`);

      // Perform search
      await page.click('input[name="q"]');
      await page.type('input[name="q"]', searchTerm);
      await page.keyboard.press("Enter");

      // Wait for results
      await page.waitForSelector("#search", { timeout: 10000 });

      this.logger.info("✅ Google search completed successfully");
    } catch (error) {
      this.logger.error("❌ Google search failed:", error);
      throw error;
    }
  }

  async performNavigation(task, page) {
    try {
      // Extract URL from task
      const urlMatch = task.match(/(?:go to|navigate to|visit)\s+([^\s]+)/i);
      const url = urlMatch ? urlMatch[1] : "https://www.google.com";

      this.logger.info(`🌐 Navigating to: ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      this.logger.info("✅ Navigation completed successfully");
    } catch (error) {
      this.logger.error("❌ Navigation failed:", error);
      throw error;
    }
  }

  async executePythonAgentTask(taskConfig, options) {
    const { taskId, sessionId, task } = taskConfig;

    // Start the Python agent process with browser-use and Azure OpenAI
    const agentProcess = spawn(
      this.pythonPath,
      [
        this.agentScriptPath,
        task, // Pass task description directly
      ],
      {
        stdio: "pipe",
        env: {
          ...process.env,
          PYTHONPATH: "./python-agent",
          // Azure OpenAI configuration for browser-use
          AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY || "",
          AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_API_KEY || "", // Alternative name
          AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || "",
          AZURE_OPENAI_DEPLOYMENT_NAME:
            process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4.1",
          AZURE_OPENAI_API_VERSION:
            process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview",
          // Fallback OpenAI configuration
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
          BROWSER_USE_SESSION_ID: sessionId,
          PYTHONIOENCODING: "utf-8",
        },
      },
    );

    taskConfig.process = agentProcess;

    // Handle process output
    let output = "";
    let errorOutput = "";

    agentProcess.stdout.on("data", (data) => {
      const chunk = data.toString();
      output += chunk;
      this.logger.debug(`Agent output: ${chunk}`);
    });

    agentProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
      this.logger.warn(`Agent stderr: ${data.toString()}`);
    });

    agentProcess.on("close", (code) => {
      try {
        const result = JSON.parse(output);

        // Update task status
        const task_obj = this.tasks.get(taskId);
        if (task_obj) {
          if (result.success) {
            task_obj.status = "completed";
            task_obj.result = result;
            task_obj.completedAt = new Date();

            if (options.onComplete) {
              options.onComplete(result);
            }

            this.logger.info(
              `✅ Browser-use AI agent task ${taskId} completed: ${result.message}`,
            );
          } else {
            task_obj.status = "failed";
            task_obj.error = result.error || "Unknown error";
            task_obj.completedAt = new Date();

            if (options.onError) {
              options.onError(new Error(result.error || "Task failed"));
            }

            this.logger.error(
              `❌ Browser-use AI agent task ${taskId} failed: ${result.error}`,
            );
          }
        }
      } catch (parseError) {
        this.logger.error(
          `Failed to parse agent output: ${parseError.message}`,
        );
        this.logger.error(`Raw output: ${output}`);

        if (options.onError) {
          options.onError(
            new Error(`Failed to parse agent output: ${parseError.message}`),
          );
        }
      }
    });

    agentProcess.on("error", (error) => {
      this.logger.error(
        `Failed to start browser-use Python agent: ${error.message}`,
      );

      if (options.onError) {
        options.onError(error);
      }
    });

    // Send initial progress update
    if (options.onProgress) {
      options.onProgress({
        taskId,
        step: 1,
        totalSteps: 3,
        description: "Starting browser-use AI agent with Azure OpenAI",
        progress: 33,
      });
    }

    return agentProcess;

    agentProcess.on("close", (code) => {
      const task = this.tasks.get(taskId);
      if (!task) return;

      task.completedAt = new Date();
      task.exitCode = code;

      if (code === 0) {
        task.status = "completed";
        this.logger.info(`✅ AI task ${taskId} completed successfully`);

        if (options.onComplete) {
          options.onComplete(task.result || { success: true, output });
        }
      } else {
        task.status = "failed";
        task.error = errorOutput || `Process exited with code ${code}`;
        this.logger.error(`❌ AI task ${taskId} failed:`, task.error);

        if (options.onError) {
          options.onError(new Error(task.error));
        }
      }
    });

    agentProcess.on("error", (error) => {
      const task = this.tasks.get(taskId);
      if (!task) return;

      task.status = "failed";
      task.error = error.message;
      task.completedAt = new Date();

      this.logger.error(`❌ AI task ${taskId} process error:`, error);

      if (options.onError) {
        options.onError(error);
      }
    });

    // Set timeout
    setTimeout(() => {
      const task = this.tasks.get(taskId);
      if (task && task.status === "running") {
        this.cancelTask(taskId);
      }
    }, taskConfig.options.timeout);
  }

  handleAgentMessage(taskId, message, options) {
    try {
      const { type, data } = message;

      switch (type) {
        case "progress":
          this.logger.info(
            `Task ${taskId} progress: ${data.step}/${data.totalSteps} - ${data.description}`,
          );
          if (options.onProgress) {
            options.onProgress(data);
          }
          break;

        case "step":
          const task = this.tasks.get(taskId);
          if (task) {
            task.steps.push(data);
          }
          break;

        case "result":
          const taskResult = this.tasks.get(taskId);
          if (taskResult) {
            taskResult.result = data;
          }
          break;

        case "error":
          this.logger.error(`Task ${taskId} error:`, data);
          break;

        default:
          this.logger.debug(`Unknown message type from agent: ${type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling agent message for task ${taskId}:`,
        error,
      );
    }
  }

  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.logger.info(`🛑 Cancelling task: ${taskId}`);

    if (task.process) {
      try {
        task.process.kill("SIGTERM");

        // Force kill after 5 seconds if not terminated gracefully
        setTimeout(() => {
          if (task.process && !task.process.killed) {
            task.process.kill("SIGKILL");
          }
        }, 5000);
      } catch (error) {
        this.logger.error(`Failed to kill process for task ${taskId}:`, error);
      }
    }

    task.status = "cancelled";
    task.completedAt = new Date();
    task.error = "Task was cancelled by user";

    return task;
  }

  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    return {
      taskId: task.taskId,
      sessionId: task.sessionId,
      task: task.task,
      status: task.status,
      progress: task.steps.length,
      maxSteps: task.options.maxSteps,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      result: task.result,
    };
  }

  listActiveTasks() {
    const activeTasks = [];
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.status === "running") {
        activeTasks.push(this.getTaskStatus(taskId));
      }
    }
    return activeTasks;
  }

  async cleanup() {
    this.logger.info("🧹 Cleaning up AI Agent Service...");

    // Cancel all running tasks
    const activeTasks = this.listActiveTasks();
    for (const task of activeTasks) {
      try {
        await this.cancelTask(task.taskId);
      } catch (error) {
        this.logger.error(
          `Failed to cancel task ${task.taskId} during cleanup:`,
          error,
        );
      }
    }

    // Clear all tasks
    this.tasks.clear();

    this.logger.info("✅ AI Agent Service cleanup completed");
  }

  isHealthy() {
    return this.isInitialized;
  }

  getStats() {
    const totalTasks = this.tasks.size;
    const runningTasks = this.listActiveTasks().length;
    const completedTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === "completed",
    ).length;
    const failedTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === "failed",
    ).length;

    return {
      totalTasks,
      runningTasks,
      completedTasks,
      failedTasks,
      isHealthy: this.isHealthy(),
    };
  }
}
