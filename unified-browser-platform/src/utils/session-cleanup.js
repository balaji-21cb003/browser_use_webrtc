/**
 * Session Cleanup Utility
 * Centralized session management and cleanup functionality
 */

import { Logger } from "../utils/logger.js";

export class SessionCleanupManager {
  constructor() {
    this.logger = new Logger("SessionCleanupManager");
    this.activeSessions = new Map(); // sessionId -> SessionInfo
    this.cleanupTimeouts = new Map(); // sessionId -> timeoutId
    this.cleanupCallbacks = new Map(); // sessionId -> cleanup function

    // Configuration from environment variables with fallback defaults
    this.config = {
      defaultSessionTimeout:
        parseInt(process.env.SESSION_TIMEOUT) || 30 * 60 * 1000, // 30 minutes
      defaultIdleTimeout:
        parseInt(process.env.SESSION_IDLE_TIMEOUT) || 10 * 60 * 1000, // 10 minutes
      cleanupDelay:
        parseInt(process.env.SESSION_CLEANUP_DELAY) || 2 * 60 * 1000, // 2 minutes delay after task completion
      cleanupCheckInterval:
        parseInt(process.env.SESSION_CLEANUP_CHECK_INTERVAL) || 60 * 1000, // 1 minute
      maxConcurrentSessions:
        parseInt(process.env.MAX_CONCURRENT_SESSIONS) ||
        parseInt(process.env.MAX_SESSIONS) ||
        10,
      forceCleanupOnTaskComplete:
        process.env.FORCE_CLEANUP_ON_TASK_COMPLETE === "true" || true,
    };

    this.logger.info("📝 Session cleanup configuration loaded:", {
      defaultSessionTimeout: `${this.config.defaultSessionTimeout / 60000} minutes`,
      defaultIdleTimeout: `${this.config.defaultIdleTimeout / 60000} minutes`,
      cleanupDelay: `${this.config.cleanupDelay / 60000} minutes`,
      cleanupCheckInterval: `${this.config.cleanupCheckInterval / 1000} seconds`,
      maxConcurrentSessions: this.config.maxConcurrentSessions,
      forceCleanupOnTaskComplete: this.config.forceCleanupOnTaskComplete,
    });

    // Start background cleanup
    this.startBackgroundCleanup();
  }

  /**
   * Register a new session with cleanup management
   */
  registerSession(sessionId, options = {}) {
    const sessionInfo = {
      sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: "active",
      type: options.type || "browser-use",
      taskId: options.taskId || null,
      metadata: options.metadata || {},
      cleanupScheduled: false,
      cleanupCallback: options.cleanupCallback || null,
      timeout: options.timeout || this.config.defaultSessionTimeout,
      idleTimeout: options.idleTimeout || this.config.defaultIdleTimeout,
    };

    this.activeSessions.set(sessionId, sessionInfo);

    // Set absolute timeout
    const timeoutId = setTimeout(() => {
      this.logger.warn(
        `⏰ Session ${sessionId} reached absolute timeout, cleaning up...`,
      );
      this.cleanupSession(sessionId, "absolute_timeout");
    }, sessionInfo.timeout);

    this.cleanupTimeouts.set(sessionId, timeoutId);

    // Register cleanup callback if provided
    if (
      options.cleanupCallback &&
      typeof options.cleanupCallback === "function"
    ) {
      this.cleanupCallbacks.set(sessionId, options.cleanupCallback);
    }

    this.logger.info(
      `📝 Session ${sessionId} registered for cleanup management`,
    );

    // Check if we're exceeding the session limit
    if (this.activeSessions.size > this.config.maxConcurrentSessions) {
      this.cleanupOldestSessions(1);
    }

    return sessionInfo;
  }

  /**
   * Update session activity timestamp
   */
  updateActivity(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.logger.debug(`🔄 Session ${sessionId} activity updated`);
    }
  }

  /**
   * Mark session for cleanup (with delay)
   */
  scheduleCleanup(sessionId, reason = "manual", delay = null) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(
        `⚠️ Cannot schedule cleanup for unknown session: ${sessionId}`,
      );
      return false;
    }

    if (session.cleanupScheduled) {
      this.logger.debug(`⏰ Session ${sessionId} cleanup already scheduled`);
      return true;
    }

    const cleanupDelay = delay || this.config.cleanupDelay;
    session.cleanupScheduled = true;
    session.cleanupReason = reason;

    this.logger.info(
      `⏰ Scheduling cleanup for session ${sessionId} in ${cleanupDelay}ms (reason: ${reason})`,
    );

    const cleanupTimeout = setTimeout(() => {
      this.cleanupSession(sessionId, reason);
    }, cleanupDelay);

    // Store the cleanup timeout (separate from the absolute timeout)
    const existingTimeout = this.cleanupTimeouts.get(`${sessionId}_cleanup`);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    this.cleanupTimeouts.set(`${sessionId}_cleanup`, cleanupTimeout);

    return true;
  }

  /**
   * Immediately cleanup a session
   */
  async cleanupSession(sessionId, reason = "manual") {
    this.logger.info(
      `🧹 Starting cleanup for session ${sessionId} (reason: ${reason})`,
    );

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      this.logger.warn(`⚠️ Session ${sessionId} not found for cleanup`);
      return false;
    }

    // Update session status
    session.status = "cleaning_up";
    session.cleanupStartedAt = new Date();
    session.cleanupReason = reason;

    try {
      // Call the registered cleanup callback if available
      const cleanupCallback = this.cleanupCallbacks.get(sessionId);
      if (cleanupCallback && typeof cleanupCallback === "function") {
        this.logger.info(
          `🔧 Executing cleanup callback for session ${sessionId}`,
        );
        await cleanupCallback(sessionId, reason);
      }

      // Clear all timeouts for this session
      const absoluteTimeout = this.cleanupTimeouts.get(sessionId);
      if (absoluteTimeout) {
        clearTimeout(absoluteTimeout);
        this.cleanupTimeouts.delete(sessionId);
      }

      const cleanupTimeout = this.cleanupTimeouts.get(`${sessionId}_cleanup`);
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        this.cleanupTimeouts.delete(`${sessionId}_cleanup`);
      }

      // Remove from active sessions
      this.activeSessions.delete(sessionId);
      this.cleanupCallbacks.delete(sessionId);

      // Update session status (keep in memory briefly for debugging)
      session.status = "cleaned_up";
      session.cleanupCompletedAt = new Date();

      this.logger.info(
        `✅ Session ${sessionId} cleanup completed successfully`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Error during session cleanup for ${sessionId}:`,
        error,
      );

      // Force cleanup even if there were errors
      this.activeSessions.delete(sessionId);
      this.cleanupCallbacks.delete(sessionId);
      this.cleanupTimeouts.delete(sessionId);
      this.cleanupTimeouts.delete(`${sessionId}_cleanup`);

      return false;
    }
  }

  /**
   * Start background cleanup process
   */
  startBackgroundCleanup() {
    this.cleanupInterval = setInterval(() => {
      this.performBackgroundCleanup();
    }, this.config.cleanupCheckInterval);

    this.logger.info("🧹 Background session cleanup started");
  }

  /**
   * Perform background cleanup checks
   */
  performBackgroundCleanup() {
    const now = Date.now();
    const sessionsToCleanup = [];

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (session.status !== "active") continue;

      const age = now - session.createdAt.getTime();
      const idleTime = now - session.lastActivity.getTime();

      // Check for idle timeout
      if (idleTime > session.idleTimeout) {
        sessionsToCleanup.push({ sessionId, reason: "idle_timeout", idleTime });
      }
      // Check for absolute timeout (backup check)
      else if (age > session.timeout) {
        sessionsToCleanup.push({ sessionId, reason: "absolute_timeout", age });
      }
    }

    // Cleanup sessions that exceeded limits
    for (const { sessionId, reason, idleTime, age } of sessionsToCleanup) {
      if (reason === "idle_timeout") {
        this.logger.warn(
          `⏰ Session ${sessionId} idle for ${Math.round(idleTime / 60000)} minutes, cleaning up...`,
        );
      } else {
        this.logger.warn(
          `⏰ Session ${sessionId} age ${Math.round(age / 60000)} minutes exceeded, cleaning up...`,
        );
      }
      this.cleanupSession(sessionId, reason);
    }

    // Log stats periodically
    if (this.activeSessions.size > 0) {
      this.logger.debug(`📊 Active sessions: ${this.activeSessions.size}`);
    }
  }

  /**
   * Cleanup oldest sessions when limit exceeded
   */
  async cleanupOldestSessions(count) {
    const sessions = Array.from(this.activeSessions.entries())
      .filter(([_, session]) => session.status === "active")
      .sort(([_, a], [__, b]) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, count);

    for (const [sessionId, _] of sessions) {
      this.logger.info(
        `🧹 Cleaning up oldest session due to capacity limit: ${sessionId}`,
      );
      await this.cleanupSession(sessionId, "capacity_limit");
    }
  }

  /**
   * Get session information
   */
  getSessionInfo(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();
    return {
      ...session,
      age: now - session.createdAt.getTime(),
      idleTime: now - session.lastActivity.getTime(),
      timeUntilTimeout: session.timeout - (now - session.createdAt.getTime()),
      timeUntilIdleTimeout:
        session.idleTimeout - (now - session.lastActivity.getTime()),
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.keys())
      .map((sessionId) => this.getSessionInfo(sessionId))
      .filter(Boolean);
  }

  /**
   * Get session statistics
   */
  getStats() {
    const sessions = this.getActiveSessions();

    return {
      total_sessions: sessions.length,
      by_status: sessions.reduce((acc, session) => {
        acc[session.status] = (acc[session.status] || 0) + 1;
        return acc;
      }, {}),
      by_type: sessions.reduce((acc, session) => {
        acc[session.type] = (acc[session.type] || 0) + 1;
        return acc;
      }, {}),
      oldest_session_age_minutes:
        sessions.length > 0
          ? Math.round(Math.max(...sessions.map((s) => s.age)) / 60000)
          : 0,
      sessions_near_timeout: sessions.filter(
        (s) => s.timeUntilTimeout < 5 * 60 * 1000,
      ).length, // < 5 minutes
      sessions_near_idle_timeout: sessions.filter(
        (s) => s.timeUntilIdleTimeout < 2 * 60 * 1000,
      ).length, // < 2 minutes
    };
  }

  /**
   * Force cleanup all sessions
   */
  async cleanupAllSessions(reason = "force_cleanup") {
    this.logger.warn(`🧹 Force cleanup all sessions (reason: ${reason})`);

    const sessionIds = Array.from(this.activeSessions.keys());
    const cleanupPromises = sessionIds.map((sessionId) =>
      this.cleanupSession(sessionId, reason),
    );

    const results = await Promise.allSettled(cleanupPromises);

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    this.logger.info(
      `✅ Cleanup all completed: ${successful} successful, ${failed} failed`,
    );

    return {
      total: sessionIds.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    const oldConfig = { ...this.config };
    Object.assign(this.config, newConfig);

    this.logger.info("📝 Session cleanup configuration updated", {
      old: oldConfig,
      new: this.config,
    });

    return this.config;
  }

  /**
   * Shutdown cleanup manager
   */
  async shutdown() {
    this.logger.info("🛑 Shutting down session cleanup manager...");

    // Stop background cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all timeouts
    for (const timeoutId of this.cleanupTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.cleanupTimeouts.clear();

    // Cleanup all remaining sessions
    await this.cleanupAllSessions("service_shutdown");

    this.logger.info("✅ Session cleanup manager shutdown complete");
  }

  /**
   * Health check
   */
  isHealthy() {
    return {
      active: !!this.cleanupInterval,
      active_sessions: this.activeSessions.size,
      pending_timeouts: this.cleanupTimeouts.size,
      config: this.config,
      stats: this.getStats(),
    };
  }
}

/**
 * Create a cleanup callback for browser-use sessions
 */
export function createBrowserUseCleanupCallback(browserService, io, logger) {
  return async function (sessionId, reason) {
    logger.info(
      `🧹 Browser-use cleanup callback for session ${sessionId} (reason: ${reason})`,
    );

    try {
      // 1. Close browser session
      if (browserService) {
        try {
          logger.info(`🌐 Closing browser session ${sessionId}`);
          await browserService.closeBrowser(sessionId);
        } catch (error) {
          logger.warn(
            `Failed to close browser session ${sessionId}: ${error.message}`,
          );
        }
      }

      // 2. Notify connected clients
      if (io) {
        try {
          logger.info(
            `📹 Notifying clients about session cleanup: ${sessionId}`,
          );
          io.to(sessionId).emit("session-cleanup", {
            sessionId,
            reason,
            message: `Session ${sessionId} has been cleaned up due to: ${reason}. Please refresh to start a new session.`,
          });
        } catch (error) {
          logger.warn(
            `Failed to notify clients about cleanup: ${error.message}`,
          );
        }
      }

      logger.info(
        `✅ Browser-use cleanup callback completed for session ${sessionId}`,
      );
    } catch (error) {
      logger.error(
        `❌ Error in browser-use cleanup callback for session ${sessionId}:`,
        error,
      );
      throw error;
    }
  };
}

export default SessionCleanupManager;
