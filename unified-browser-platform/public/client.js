/**
 * Unified Browser Platform - Client JavaScript
 * Handles UI interactions and WebSocket communication
 */

class UnifiedBrowserClient {
  constructor() {
    this.socket = null;
    this.currentSession = null;
    this.currentTask = null;
    this.frameCount = 0;
    this.isConnected = false;
    this.frameRequestInterval = null;

    this.initializeElements();
    this.setupEventListeners();
    this.setupCanvas();

    // Initialize form filling mode
    this.formFillingMode = false;

    // Auto-connect after a short delay
    setTimeout(() => {
      this.log("🚀 Platform ready", "success");
      this.connect();
    }, 1000);
  }

  initializeElements() {
    // Connection elements
    this.connectionStatus = document.getElementById("connectionStatus");
    this.connectBtn = document.getElementById("connectBtn");

    // Session elements
    this.createSessionBtn = document.getElementById("createSessionBtn");
    this.closeSessionBtn = document.getElementById("closeSessionBtn");
    this.switchSessionBtn = document.getElementById("switchSessionBtn");
    this.sessionCount = document.getElementById("sessionCount");
    this.frameCountEl = document.getElementById("frameCount");
    this.sessionItems = document.getElementById("sessionItems");

    // Browser elements
    this.urlInput = document.getElementById("urlInput");
    this.navigateBtn = document.getElementById("navigateBtn");
    this.refreshBtn = document.getElementById("refreshBtn");
    this.screenshotBtn = document.getElementById("screenshotBtn");
    this.addressBar = document.getElementById("addressBar");
    this.backBtn = document.getElementById("backBtn");
    this.forwardBtn = document.getElementById("forwardBtn");
    this.reloadBtn = document.getElementById("reloadBtn");

    // AI elements
    this.taskInput = document.getElementById("taskInput");
    this.modelSelect = document.getElementById("modelSelect");
    this.executeTaskBtn = document.getElementById("executeTaskBtn");
    this.cancelTaskBtn = document.getElementById("cancelTaskBtn");

    // Browser-use integration elements
    this.browserUseTaskInput = document.getElementById("browserUseTaskInput");
    this.browserUseMaxSteps = document.getElementById("browserUseMaxSteps");
    this.browserUseLLMProvider = document.getElementById(
      "browserUseLLMProvider",
    );
    this.executeBrowserUseBtn = document.getElementById("executeBrowserUseBtn");
    this.validateEnvironmentBtn = document.getElementById(
      "validateEnvironmentBtn",
    );
    this.taskStatus = document.getElementById("taskStatus");
    this.taskStatusText = document.getElementById("taskStatusText");
    this.taskProgress = document.getElementById("taskProgress");

    // Canvas and logs
    this.canvas = document.getElementById("browserCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.placeholder = document.getElementById("placeholder");
    this.logsContainer = document.getElementById("logsContainer");

    // Token usage elements
    this.refreshTokenUsageBtn = document.getElementById("refreshTokenUsageBtn");
    this.clearTokenHistoryBtn = document.getElementById("clearTokenHistoryBtn");
    this.totalTokenCost = document.getElementById("totalTokenCost");
    this.totalTokenCount = document.getElementById("totalTokenCount");
    this.totalExecutions = document.getElementById("totalExecutions");
    this.tokenUsageDetails = document.getElementById("tokenUsageDetails");
    this.tokenHistory = document.getElementById("tokenHistory");
  }

  setupEventListeners() {
    // Connection
    this.connectBtn.addEventListener("click", () => this.connect());

    // Session management
    this.createSessionBtn.addEventListener("click", () => this.createSession());
    this.closeSessionBtn.addEventListener("click", () => this.closeSession());
    this.switchSessionBtn.addEventListener("click", () =>
      this.showSessionSwitcher(),
    );

    // Browser controls
    this.navigateBtn.addEventListener("click", () => this.navigate());
    this.urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.navigate();
    });
    this.refreshBtn.addEventListener("click", () => this.refresh());
    this.screenshotBtn.addEventListener("click", () => this.takeScreenshot());

    // Toolbar buttons
    this.backBtn.addEventListener("click", () => this.goBack());
    this.forwardBtn.addEventListener("click", () => this.goForward());
    this.reloadBtn.addEventListener("click", () => this.refresh());

    // AI controls
    this.executeTaskBtn.addEventListener("click", () => this.executeTask());
    this.cancelTaskBtn.addEventListener("click", () => this.cancelTask());

    // Browser-use controls
    if (this.executeBrowserUseBtn) {
      this.executeBrowserUseBtn.addEventListener("click", () =>
        this.executeBrowserUseTask(),
      );
    }
    if (this.validateEnvironmentBtn) {
      this.validateEnvironmentBtn.addEventListener("click", () =>
        this.validateBrowserUseEnvironment(),
      );
    }
    if (this.browserUseTaskInput) {
      this.browserUseTaskInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.executeBrowserUseTask();
      });
    }

    // Token usage controls
    if (this.refreshTokenUsageBtn) {
      this.refreshTokenUsageBtn.addEventListener("click", () =>
        this.refreshTokenUsage(),
      );
    }
    if (this.clearTokenHistoryBtn) {
      this.clearTokenHistoryBtn.addEventListener("click", () =>
        this.clearTokenHistory(),
      );
    }

    // Mouse events with improved precision
    let isDragging = false;
    let lastMousePosition = { x: 0, y: 0 };
    let dragStartPosition = { x: 0, y: 0 };

    this.canvas.addEventListener("mousedown", (e) => {
      if (!this.currentSession) return;

      isDragging = true;
      const coords = this.getScaledCoordinates(e);
      dragStartPosition = { x: coords.x, y: coords.y };
      lastMousePosition = { x: coords.x, y: coords.y };

      // Determine which mouse button was pressed
      const button =
        e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      this.sendMouseEvent("mousedown", coords.x, coords.y, 0, 0, button);
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.currentSession) return;

      const coords = this.getScaledCoordinates(e);

      // Only send mousemove events if we're dragging or if coordinates changed significantly
      if (
        isDragging ||
        Math.abs(coords.x - lastMousePosition.x) > 2 ||
        Math.abs(coords.y - lastMousePosition.y) > 2
      ) {
        this.sendMouseEvent("mousemove", coords.x, coords.y);
        lastMousePosition = { x: coords.x, y: coords.y };
      }
    });

    this.canvas.addEventListener("mouseup", (e) => {
      if (!this.currentSession) return;

      const coords = this.getScaledCoordinates(e);
      const button =
        e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";

      this.sendMouseEvent("mouseup", coords.x, coords.y, 0, 0, button);

      // If it was a short drag, treat it as a click
      const dragDistance = Math.sqrt(
        Math.pow(coords.x - dragStartPosition.x, 2) +
          Math.pow(coords.y - dragStartPosition.y, 2),
      );

      if (dragDistance < 5) {
        this.sendMouseEvent("click", coords.x, coords.y);
      }

      isDragging = false;
    });

    this.canvas.addEventListener("click", (e) => {
      if (!this.currentSession || isDragging) return;
      const coords = this.getScaledCoordinates(e);
      this.sendMouseEvent("click", coords.x, coords.y);
    });

    this.canvas.addEventListener("wheel", (e) => {
      if (!this.currentSession) return;
      e.preventDefault();

      const coords = this.getScaledCoordinates(e);
      // Normalize scroll deltas for better cross-browser compatibility
      const deltaX = e.deltaX || 0;
      const deltaY = e.deltaY || 0;

      this.sendMouseEvent("scroll", coords.x, coords.y, deltaX, deltaY);
    });

    // Prevent context menu on right click
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Keyboard events
    window.addEventListener("keydown", (e) => {
      if (!this.currentSession) return;

      // Don't interfere with input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      // Handle special keys and shortcuts
      if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        this.sendKeyboardEvent("keydown", e.key);
        return;
      }

      // Handle regular text input
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.sendKeyboardEvent("type", "", e.key);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (!this.currentSession) return;

      // Don't interfere with input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      // Handle special keys
      if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        this.sendKeyboardEvent("keyup", e.key);
      }
    });
  }

  setupCanvas() {
    this.img = new Image();
    this.img.onload = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);
    };

    // Add visual feedback for interactions
    this.interactionFeedback = {
      lastClick: null,
      clickTimeout: null,
    };
  }

  setupEventListeners() {
    // Connection
    this.connectBtn.addEventListener("click", () => this.connect());

    // Session management
    this.createSessionBtn.addEventListener("click", () => this.createSession());
    this.closeSessionBtn.addEventListener("click", () => this.closeSession());

    // Browser controls
    this.navigateBtn.addEventListener("click", () => this.navigate());
    this.urlInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") this.navigate();
    });
    this.refreshBtn.addEventListener("click", () => this.refresh());
    this.screenshotBtn.addEventListener("click", () => this.takeScreenshot());

    // Toolbar buttons
    this.backBtn.addEventListener("click", () => this.goBack());
    this.forwardBtn.addEventListener("click", () => this.goForward());
    this.reloadBtn.addEventListener("click", () => this.refresh());

    // AI controls
    this.executeTaskBtn.addEventListener("click", () => this.executeTask());
    this.cancelTaskBtn.addEventListener("click", () => this.cancelTask());

    // Browser-use controls
    if (this.executeBrowserUseBtn) {
      this.executeBrowserUseBtn.addEventListener("click", () =>
        this.executeBrowserUseTask(),
      );
    }

    if (this.validateEnvironmentBtn) {
      this.validateEnvironmentBtn.addEventListener("click", () =>
        this.validateEnvironment(),
      );
    }

    if (this.browserUseTaskInput) {
      this.browserUseTaskInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.executeBrowserUseTask();
      });
    }

    // Token usage controls
    if (this.refreshTokenUsageBtn) {
      this.refreshTokenUsageBtn.addEventListener("click", () =>
        this.refreshTokenUsage(),
      );
    }
    if (this.clearTokenHistoryBtn) {
      this.clearTokenHistoryBtn.addEventListener("click", () =>
        this.clearTokenHistory(),
      );
    }

    // Mouse events with improved precision
    let isDragging = false;
    let lastMousePosition = { x: 0, y: 0 };
    let dragStartPosition = { x: 0, y: 0 };

    this.canvas.addEventListener("mousedown", (e) => {
      if (!this.currentSession) return;

      isDragging = true;
      const coords = this.getScaledCoordinates(e);
      dragStartPosition = { x: coords.x, y: coords.y };
      lastMousePosition = { x: coords.x, y: coords.y };

      // Determine which mouse button was pressed
      const button =
        e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";
      this.sendMouseEvent("mousedown", coords.x, coords.y, 0, 0, button);
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.currentSession) return;

      const coords = this.getScaledCoordinates(e);

      // Only send mousemove events if we're dragging or if coordinates changed significantly
      if (
        isDragging ||
        Math.abs(coords.x - lastMousePosition.x) > 2 ||
        Math.abs(coords.y - lastMousePosition.y) > 2
      ) {
        this.sendMouseEvent("mousemove", coords.x, coords.y);
        lastMousePosition = { x: coords.x, y: coords.y };
      }
    });

    this.canvas.addEventListener("mouseup", (e) => {
      if (!this.currentSession) return;

      const coords = this.getScaledCoordinates(e);
      const button =
        e.button === 0 ? "left" : e.button === 2 ? "right" : "middle";

      this.sendMouseEvent("mouseup", coords.x, coords.y, 0, 0, button);

      // If it was a short drag, treat it as a click
      const dragDistance = Math.sqrt(
        Math.pow(coords.x - dragStartPosition.x, 2) +
          Math.pow(coords.y - dragStartPosition.y, 2),
      );

      if (dragDistance < 5) {
        this.sendMouseEvent("click", coords.x, coords.y);
      }

      isDragging = false;
    });

    this.canvas.addEventListener("click", (e) => {
      if (!this.currentSession || isDragging) return;
      const coords = this.getScaledCoordinates(e);
      this.sendMouseEvent("click", coords.x, coords.y);
    });

    this.canvas.addEventListener("wheel", (e) => {
      if (!this.currentSession) return;
      e.preventDefault();

      const coords = this.getScaledCoordinates(e);
      // Normalize scroll deltas for better cross-browser compatibility
      const deltaX = e.deltaX || 0;
      const deltaY = e.deltaY || 0;

      this.sendMouseEvent("scroll", coords.x, coords.y, deltaX, deltaY);
    });

    // Prevent context menu on right click
    this.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Keyboard events
    window.addEventListener("keydown", (e) => {
      if (!this.currentSession) return;

      // Don't interfere with input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      // Handle special keys and shortcuts
      if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        this.sendKeyboardEvent("keydown", e.key);
        return;
      }

      // Handle regular text input
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.sendKeyboardEvent("type", "", e.key);
      }
    });

    window.addEventListener("keyup", (e) => {
      if (!this.currentSession) return;

      // Don't interfere with input fields
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      // Handle special keys
      if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        this.sendKeyboardEvent("keyup", e.key);
      }
    });
  }

  getScaledCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();

    // Get the actual displayed image dimensions
    const imgAspectRatio = this.img.naturalWidth / this.img.naturalHeight;
    const canvasAspectRatio = rect.width / rect.height;

    let displayWidth, displayHeight, offsetX, offsetY;

    if (imgAspectRatio > canvasAspectRatio) {
      // Image is wider than canvas - fit to width
      displayWidth = rect.width;
      displayHeight = rect.width / imgAspectRatio;
      offsetX = 0;
      offsetY = (rect.height - displayHeight) / 2;
    } else {
      // Image is taller than canvas - fit to height
      displayHeight = rect.height;
      displayWidth = rect.height * imgAspectRatio;
      offsetX = (rect.width - displayWidth) / 2;
      offsetY = 0;
    }

    // Calculate coordinates relative to the displayed image
    const relativeX = (e.clientX - rect.left - offsetX) / displayWidth;
    const relativeY = (e.clientY - rect.top - offsetY) / displayHeight;

    // Convert to actual browser coordinates
    const x = Math.round(relativeX * this.img.naturalWidth);
    const y = Math.round(relativeY * this.img.naturalHeight);

    return {
      x: Math.max(0, Math.min(this.img.naturalWidth - 1, x)),
      y: Math.max(0, Math.min(this.img.naturalHeight - 1, y)),
    };
  }

  connect() {
    if (this.isConnected || (this.socket && this.socket.connected)) {
      this.log("Already connected", "info");
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.log("Connecting to server...", "info");
    this.updateConnectionStatus("connecting");

    try {
      this.socket = io({
        timeout: 20000,
        forceNew: false, // Don't force new connection
        transports: ["polling", "websocket"], // Allow both transports
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on("connect", () => {
        this.isConnected = true;
        this.updateConnectionStatus("connected");
        this.connectBtn.textContent = "Disconnect";
        this.log("✅ Connected to server", "success");
      });

      this.socket.on("connect_error", (error) => {
        this.log(`❌ Connection error: ${error.message}`, "error");
        this.updateConnectionStatus("disconnected");
        // Let Socket.IO handle reconnection automatically
      });

      this.socket.on("disconnect", (reason) => {
        this.isConnected = false;
        this.updateConnectionStatus("disconnected");
        this.connectBtn.textContent = "Connect";
        this.log(`⚠️ Disconnected from server: ${reason}`, "warning");
        this.resetSession();
        // Let Socket.IO handle reconnection automatically
      });
    } catch (error) {
      this.log(`❌ Failed to initialize socket: ${error.message}`, "error");
      this.updateConnectionStatus("disconnected");
    }

    this.socket.on("video-frame", (frameData) => {
      this.frameCount++;
      this.frameCountEl.textContent = this.frameCount;

      this.log(`📹 Video frame received: ${this.frameCount}`, "info");
      this.log(`📹 Frame data type: ${typeof frameData}`, "debug");
      this.log(
        `📹 Frame data keys: ${frameData ? Object.keys(frameData) : "null"}`,
        "debug",
      );

      // Handle different frame data formats
      let base64Data;
      if (typeof frameData === "string") {
        // Direct base64 string
        base64Data = frameData;
        this.log(
          `📹 Using direct string data (length: ${frameData.length})`,
          "debug",
        );
      } else if (frameData && frameData.data) {
        // Object with data property
        base64Data = frameData.data;
        this.log(
          `📹 Using object.data (length: ${frameData.data.length})`,
          "debug",
        );
      } else {
        this.log("❌ Invalid frame data format", "error");
        this.log(
          `📹 Frame data: ${JSON.stringify(frameData).substring(0, 200)}...`,
          "debug",
        );
        return;
      }

      // Update the image source
      this.img.src = "data:image/jpeg;base64," + base64Data;
      this.placeholder.style.display = "none";

      this.log(`✅ Frame ${this.frameCount} displayed successfully`, "debug");
    });

    this.socket.on("session-joined", (data) => {
      this.log(`Joined session: ${data.sessionId}`, "success");
      this.enableSessionControls();
    });

    this.socket.on("navigation-complete", (data) => {
      this.addressBar.value = data.url;
      this.log(`Navigated to: ${data.url}`, "info");
    });

    this.socket.on("agent-task-started", (data) => {
      this.currentTask = data.taskId;
      this.updateTaskStatus("running", "Task started...");
      this.executeTaskBtn.disabled = true;
      this.cancelTaskBtn.disabled = false;
      this.log(`AI task started: ${data.taskId}`, "info");
    });

    this.socket.on("agent-progress", (data) => {
      const { progress } = data;
      if (progress) {
        const progressPercent = progress.progress || 0;
        const description = progress.description || "Processing...";
        const stepInfo =
          progress.step && progress.totalSteps
            ? `Step ${progress.step}/${progress.totalSteps}`
            : "";

        this.updateTaskProgress(progressPercent);
        this.updateTaskStatus("running", `${stepInfo}: ${description}`);
        this.log(`Task progress: ${description}`, "info");
      }
    });

    this.socket.on("agent-complete", (data) => {
      this.updateTaskStatus("completed", "Task completed successfully!");
      this.updateTaskProgress(100);
      this.executeTaskBtn.disabled = false;
      this.cancelTaskBtn.disabled = true;
      this.currentTask = null;
      this.log("AI task completed", "success");
    });

    this.socket.on("agent-error", (data) => {
      this.updateTaskStatus("error", `Task failed: ${data.error}`);
      this.executeTaskBtn.disabled = false;
      this.cancelTaskBtn.disabled = true;
      this.currentTask = null;
      this.log(`AI task error: ${data.error}`, "error");
    });

    this.socket.on("error", (data) => {
      this.log(`Error: ${data.message}`, "error");
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.resetSession();
  }

  async createSession() {
    if (!this.isConnected) {
      this.log("Please connect first", "warning");
      return;
    }

    try {
      this.log("Creating new session...", "info");

      const response = await fetch("/api/browser/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          options: {
            width: 1280,
            height: 720,
            headless: false, // Force non-headless for streaming
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        this.currentSession = data.sessionId; // Fixed: use sessionId not session.id

        this.log(`Session created: ${this.currentSession}`, "success");
        this.log(
          `🔗 Starting streaming for session: ${this.currentSession}`,
          "info",
        );

        // Join the session
        this.socket.emit("join-session", { sessionId: this.currentSession });

        this.updateSessionCount();

        // Enable form filling mode by default for better user experience
        this.enableFormFilling();
        this.log(
          "Form filling mode enabled - you can now type directly into the browser",
          "info",
        );

        // Update session list after creating new session
        this.updateSessionList();

        // Start streaming after a short delay to ensure session is ready
        setTimeout(() => {
          this.startStreaming();
        }, 1000);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      this.log(`Failed to create session: ${error.message}`, "error");
    }
  }

  async updateSessionList() {
    try {
      const response = await fetch("/api/sessions");
      if (response.ok) {
        const sessions = await response.json();
        this.displaySessionList(sessions);
      }
    } catch (error) {
      this.log(`Failed to get session list: ${error.message}`, "error");
    }
  }

  displaySessionList(sessions) {
    if (!sessions || sessions.length === 0) {
      this.sessionItems.innerHTML =
        '<div class="no-sessions">No active sessions</div>';
      return;
    }

    this.sessionItems.innerHTML = sessions
      .map(
        (session) => `
      <div class="session-item ${session.id === this.currentSession ? "active" : ""}" 
           onclick="window.client.switchToSession('${session.id}')">
        <div class="session-id">${session.id.substring(0, 8)}...</div>
        <div class="session-info">
          Created: ${new Date(session.createdAt).toLocaleTimeString()}
          ${session.id === this.currentSession ? " (Current)" : ""}
        </div>
      </div>
    `,
      )
      .join("");
  }

  async switchToSession(sessionId) {
    if (sessionId === this.currentSession) {
      return; // Already on this session
    }

    try {
      this.log(`Switching to session: ${sessionId}`, "info");

      // Stop current streaming
      if (this.currentSession) {
        this.socket.emit("stop-streaming", this.currentSession);
      }

      // Switch to new session
      this.currentSession = sessionId;
      this.updateSessionUI(true);
      this.startStreaming();
      this.updateSessionList();

      this.log(`Switched to session: ${sessionId}`, "success");
    } catch (error) {
      this.log(`Failed to switch session: ${error.message}`, "error");
    }
  }

  showSessionSwitcher() {
    this.updateSessionList();
  }

  async updateSessionCount() {
    try {
      const response = await fetch("/api/sessions");
      if (response.ok) {
        const sessions = await response.json();
        this.sessionCount.textContent = sessions.length;
      }
    } catch (error) {
      this.log(`Failed to update session count: ${error.message}`, "error");
    }
  }

  async closeSession() {
    if (!this.currentSession) return;

    try {
      await fetch(`/api/sessions/${this.currentSession}`, {
        method: "DELETE",
      });

      this.resetSession();
      this.updateSessionList();
      this.updateSessionCount();
      this.log("Session closed", "info");
    } catch (error) {
      this.log(`Failed to close session: ${error.message}`, "error");
    }
  }

  navigate() {
    if (!this.currentSession) {
      this.log("No active session", "warning");
      return;
    }

    const url = this.urlInput.value.trim();
    if (!url) return;

    this.socket.emit("navigation-event", { url });
    this.log(`Navigating to: ${url}`, "info");
  }

  refresh() {
    if (!this.currentSession) return;
    this.sendKeyboardEvent("press", "F5");
    this.log("Refreshing page", "info");
  }

  goBack() {
    if (!this.currentSession) return;
    this.sendKeyboardEvent("press", "Alt+ArrowLeft");
  }

  goForward() {
    if (!this.currentSession) return;
    this.sendKeyboardEvent("press", "Alt+ArrowRight");
  }

  async takeScreenshot() {
    if (!this.currentSession) return;

    try {
      const response = await fetch(
        `/api/browser/screenshot/${this.currentSession}`,
      );
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot-${Date.now()}.png`;
      a.click();

      URL.revokeObjectURL(url);
      this.log("Screenshot saved", "success");
    } catch (error) {
      this.log(`Screenshot failed: ${error.message}`, "error");
    }
  }

  executeTask() {
    if (!this.currentSession) {
      this.log("No active session", "warning");
      return;
    }

    const task = this.taskInput.value.trim();
    if (!task) {
      this.log("Please enter a task", "warning");
      return;
    }

    const options = {
      llmModel: this.modelSelect.value,
      maxSteps: 50,
      timeout: 300000,
      sessionId: this.currentSession, // Include sessionId for consistency
    };

    this.socket.emit("agent-task", {
      task,
      options,
      sessionId: this.currentSession,
    });
    this.log(`Executing task: ${task}`, "info");
  }

  cancelTask() {
    if (!this.currentTask) return;

    this.socket.emit("cancel-task", { taskId: this.currentTask });
    this.updateTaskStatus("cancelled", "Task cancelled");
    this.executeTaskBtn.disabled = false;
    this.cancelTaskBtn.disabled = true;
    this.currentTask = null;
    this.log("Task cancelled", "warning");
  }

  sendMouseEvent(type, x, y, deltaX = 0, deltaY = 0, button = "left") {
    if (!this.socket || !this.currentSession) return;

    // Validate coordinates
    if (x < 0 || y < 0 || isNaN(x) || isNaN(y)) {
      console.warn("Invalid mouse coordinates:", { x, y });
      return;
    }

    // Add error handling for session closed
    this.socket.emit(
      "mouse-event",
      {
        type,
        x: Math.round(x),
        y: Math.round(y),
        deltaX: Math.round(deltaX),
        deltaY: Math.round(deltaY),
        button,
        timestamp: Date.now(),
      },
      (response) => {
        if (response && !response.success) {
          this.log(`Mouse event failed: ${response.message}`, "error");
          if (
            response.message.includes("Session closed") ||
            response.message.includes("page is closed")
          ) {
            this.log(
              "Session appears to be closed. Please refresh the page.",
              "warning",
            );
            this.resetSession();
          }
        }
      },
    );
  }

  sendKeyboardEvent(type, key, text = "") {
    if (!this.socket || !this.currentSession) return;

    // Validate input
    if (type === "type" && text.length === 0) {
      console.warn("Empty text for type event");
      return;
    }

    // Add error handling for session closed
    this.socket.emit(
      "keyboard-event",
      {
        type,
        key,
        text,
        timestamp: Date.now(),
      },
      (response) => {
        if (response && !response.success) {
          this.log(`Keyboard event failed: ${response.message}`, "error");
          if (
            response.message.includes("Session closed") ||
            response.message.includes("page is closed")
          ) {
            this.log(
              "Session appears to be closed. Please refresh the page.",
              "warning",
            );
            this.resetSession();
          }
        }
      },
    );
  }

  // New method to handle keyboard input for form filling
  handleKeyboardInput(e) {
    if (!this.currentSession) return;

    // Handle special keys and shortcuts (always send these)
    if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault();
      this.sendKeyboardEvent("keydown", e.key);
      return;
    }

    // Handle regular text input - send to browser for form filling
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // For form filling, we want to send keyboard events to the browser
      // regardless of whether the user is typing in our UI input fields
      e.preventDefault();
      this.sendKeyboardEvent("type", "", e.key);
    }
  }

  // Updated keyboard event handler that works for form filling
  handleKeyboardEvent(e) {
    if (!this.currentSession) return;

    // If form filling mode is enabled, always send keyboard events to browser
    if (this.formFillingMode) {
      this.handleKeyboardInput(e);
      return;
    }

    // Otherwise, only send events when not typing in our UI input fields
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    this.handleKeyboardInput(e);
  }

  // Simple keyboard event handler that always works for form filling
  handleSimpleKeyboardEvent(e) {
    if (!this.currentSession) return;

    // Handle special keys and shortcuts (always send these)
    if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault();
      this.sendKeyboardEvent("keydown", e.key);
      return;
    }

    // Handle regular text input - send to browser for form filling
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // For form filling, we want to send keyboard events to the browser
      e.preventDefault();
      this.sendKeyboardEvent("type", "", e.key);
    }
  }

  // Method to enable/disable keyboard input for form filling
  enableFormFilling() {
    this.log(
      "Form filling mode enabled - keyboard input will be sent to browser",
      "info",
    );
    this.formFillingMode = true;
  }

  disableFormFilling() {
    this.log("Form filling mode disabled", "info");
    this.formFillingMode = false;
  }

  toggleFormFilling() {
    if (this.formFillingMode) {
      this.disableFormFilling();
      if (this.formFillingBtn) {
        this.formFillingBtn.textContent = "📝 Enable Form Filling";
        this.formFillingBtn.classList.remove("active");
      }
      if (this.formFillingStatus) {
        this.formFillingStatus.style.display = "none";
      }
    } else {
      this.enableFormFilling();
      if (this.formFillingBtn) {
        this.formFillingBtn.textContent = "🛑 Disable Form Filling";
        this.formFillingBtn.classList.add("active");
      }
      if (this.formFillingStatus) {
        this.formFillingStatus.style.display = "flex";
      }
    }
  }

  updateConnectionStatus(status) {
    this.connectionStatus.className = `status-indicator ${status}`;
  }

  enableSessionControls() {
    this.createSessionBtn.disabled = true;
    this.closeSessionBtn.disabled = false;
    this.navigateBtn.disabled = false;
    this.refreshBtn.disabled = false;
    this.screenshotBtn.disabled = false;
    this.executeTaskBtn.disabled = false;
  }

  resetSession() {
    this.currentSession = null;
    this.currentTask = null;
    this.frameCount = 0;

    // Reset UI
    this.createSessionBtn.disabled = false;
    this.closeSessionBtn.disabled = true;
    this.navigateBtn.disabled = true;
    this.refreshBtn.disabled = true;
    this.screenshotBtn.disabled = true;
    this.executeTaskBtn.disabled = true;
    this.cancelTaskBtn.disabled = true;

    this.sessionCount.textContent = "0";
    this.frameCountEl.textContent = "0";
    this.addressBar.value = "";
    this.placeholder.style.display = "block";

    this.taskStatus.style.display = "none";
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  updateTaskStatus(status, text) {
    this.taskStatus.style.display = "block";
    this.taskStatusText.textContent = text;
    this.taskStatus.className = `task-status ${status}`;
  }

  updateTaskProgress(percentage) {
    this.taskProgress.style.width = `${percentage}%`;
  }

  log(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;

    this.logsContainer.appendChild(logEntry);
    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;

    // Keep only last 100 log entries
    while (this.logsContainer.children.length > 100) {
      this.logsContainer.removeChild(this.logsContainer.firstChild);
    }
  }

  // Browser-use integration methods
  async executeBrowserUseTask() {
    if (!this.currentSession) {
      this.log("No active session", "warning");
      return;
    }

    const task = this.browserUseTaskInput?.value.trim();
    if (!task) {
      this.log("Please enter a browser-use task", "warning");
      return;
    }

    const maxSteps = this.browserUseMaxSteps?.value || 15;
    const llmProvider = this.browserUseLLMProvider?.value || "azure";

    const options = {
      maxSteps: parseInt(maxSteps),
      llmProvider: llmProvider,
      browserContextId: this.currentSession,
      timeout: 600000, // 10 minutes for complex tasks
    };

    try {
      this.log(`🤖 Executing browser-use task: ${task}`, "info");
      this.updateTaskStatus("running", "Starting browser-use agent...");

      if (this.executeBrowserUseBtn) {
        this.executeBrowserUseBtn.disabled = true;
        this.executeBrowserUseBtn.textContent = "Running...";
      }

      const response = await fetch("/api/browser-use/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: this.currentSession,
          task: task,
          options: options,
        }),
      });

      const result = await response.json();

      if (result.success) {
        this.updateTaskStatus(
          "completed",
          "Browser-use task completed successfully!",
        );
        this.log(
          `✅ Browser-use task completed: ${result.result.final_result || "Success"}`,
          "success",
        );

        if (result.result.steps_executed) {
          this.log(
            `📊 Steps executed: ${result.result.steps_executed}`,
            "info",
          );
        }
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      this.updateTaskStatus(
        "error",
        `Browser-use task failed: ${error.message}`,
      );
      this.log(`❌ Browser-use task failed: ${error.message}`, "error");
    } finally {
      if (this.executeBrowserUseBtn) {
        this.executeBrowserUseBtn.disabled = false;
        this.executeBrowserUseBtn.textContent = "Execute Task";
      }
    }
  }

  async validateBrowserUseEnvironment() {
    try {
      this.log("🔍 Validating browser-use environment...", "info");

      const response = await fetch("/api/browser-use/validate");
      const result = await response.json();

      if (result.success) {
        this.log("✅ Browser-use environment validation successful", "success");
        if (result.output) {
          this.log(`Environment details: ${result.output}`, "info");
        }
      } else {
        this.log(`❌ Environment validation failed: ${result.output}`, "error");
      }
    } catch (error) {
      this.log(`❌ Environment validation error: ${error.message}`, "error");
    }
  }

  // Token usage methods
  async refreshTokenUsage() {
    try {
      this.log("💰 Refreshing token usage...", "info");

      const response = await fetch("/api/tokens/summary");
      const result = await response.json();

      if (result.success) {
        this.updateTokenUsageDisplay(result.summary);
        this.log("✅ Token usage refreshed", "success");
      } else {
        this.log(`❌ Failed to refresh token usage: ${result.error}`, "error");
      }
    } catch (error) {
      this.log(`❌ Token usage refresh error: ${error.message}`, "error");
    }
  }

  async clearTokenHistory() {
    try {
      this.log("🗑️ Clearing token history...", "info");

      const response = await fetch("/api/tokens/history", {
        method: "DELETE",
      });
      const result = await response.json();

      if (result.success) {
        this.updateTokenUsageDisplay({
          totalExecutions: 0,
          totalCost: 0,
          totalTokens: 0,
          byModel: {},
          recentUsage: [],
        });
        this.log("✅ Token history cleared", "success");
      } else {
        this.log(`❌ Failed to clear token history: ${result.error}`, "error");
      }
    } catch (error) {
      this.log(`❌ Clear token history error: ${error.message}`, "error");
    }
  }

  updateTokenUsageDisplay(summary) {
    // Update summary stats
    if (this.totalTokenCost) {
      this.totalTokenCost.textContent = `$${summary.totalCost.toFixed(4)}`;
    }
    if (this.totalTokenCount) {
      this.totalTokenCount.textContent = summary.totalTokens.toLocaleString();
    }
    if (this.totalExecutions) {
      this.totalExecutions.textContent = summary.totalExecutions;
    }

    // Update detailed history
    if (this.tokenHistory && summary.recentUsage.length > 0) {
      this.tokenHistory.innerHTML = summary.recentUsage
        .map(
          (usage) => `
        <div class="token-usage-entry">
          <div class="token-usage-header">
            <span class="token-model">${usage.model || "Unknown"}</span>
            <span class="token-cost">$${usage.cost.toFixed(4)}</span>
          </div>
          <div class="token-usage-details">
            <span>📥 ${usage.promptTokens.toLocaleString()} tokens</span>
            <span>📤 ${usage.completionTokens.toLocaleString()} tokens</span>
            <span>📊 ${usage.totalTokens.toLocaleString()} total</span>
          </div>
          <div class="token-usage-time">
            ${new Date(usage.timestamp).toLocaleString()}
          </div>
        </div>
      `,
        )
        .join("");

      this.tokenUsageDetails.style.display = "block";
    } else if (this.tokenUsageDetails) {
      this.tokenUsageDetails.style.display = "none";
    }
  }

  // Auto-refresh token usage after task completion
  async onTaskCompleted() {
    // Refresh token usage after task completion
    await this.refreshTokenUsage();
  }

  // Start streaming for the current session
  startStreaming() {
    if (!this.currentSession || !this.socket) {
      this.log("No active session or connection", "warning");
      return;
    }

    try {
      this.log(
        `📹 Starting streaming for session: ${this.currentSession}`,
        "info",
      );

      // Join the session room for real-time updates
      this.socket.emit("join-session", { sessionId: this.currentSession });
      this.log(`🔗 Sent join-session for: ${this.currentSession}`, "debug");

      // Request initial frame
      this.socket.emit("request-frame", { sessionId: this.currentSession });
      this.log(
        `📸 Requested initial frame for: ${this.currentSession}`,
        "debug",
      );

      // Set up periodic frame requests for smooth streaming
      if (this.frameRequestInterval) {
        clearInterval(this.frameRequestInterval);
      }

      this.frameRequestInterval = setInterval(() => {
        if (this.socket && this.socket.connected && this.currentSession) {
          this.socket.emit("request-frame", { sessionId: this.currentSession });
          this.log(`📸 Requested frame for: ${this.currentSession}`, "debug");
        }
      }, 1000); // Request frame every second for smooth streaming

      this.log("✅ Streaming started", "success");
    } catch (error) {
      this.log(`❌ Failed to start streaming: ${error.message}`, "error");
    }
  }

  // Stop streaming
  stopStreaming() {
    if (this.frameRequestInterval) {
      clearInterval(this.frameRequestInterval);
      this.frameRequestInterval = null;
    }

    if (this.socket && this.currentSession) {
      this.socket.emit("stop-streaming", { sessionId: this.currentSession });
    }

    this.log("🛑 Streaming stopped", "info");
  }
}

// Initialize the client when the page loads
document.addEventListener("DOMContentLoaded", () => {
  window.client = new UnifiedBrowserClient();
});
