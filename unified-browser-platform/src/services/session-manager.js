/**
 * Session Manager Service
 * Manages browser sessions and their lifecycle
 */

import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";
import { Logger } from "../utils/logger.js";

export class SessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this.logger = new Logger("SessionManager");
    this.isInitialized = false;
    this.cleanupInterval = null;
  }

  async initialize() {
    this.logger.info("📋 Initializing Session Manager...");

    // Start cleanup interval (configurable via environment)
    const cleanupInterval =
      parseInt(process.env.SESSION_CLEANUP_CHECK_INTERVAL) || 5 * 60 * 1000; // Default 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions();
    }, cleanupInterval);

    this.isInitialized = true;
    this.logger.info("✅ Session Manager initialized");
  }

  async createSession(options = {}) {
    const sessionId = uuidv4();

    const session = {
      id: sessionId,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: "created",
      browser: null,
      clients: new Set(),
      options: {
        timeout:
          options.timeout ||
          parseInt(process.env.SESSION_TIMEOUT) ||
          30 * 60 * 1000, // Environment variable or 30 minutes default
        autoClose: options.autoClose !== false, // default to auto-close
        width: options.width || 1280,
        height: options.height || 720,
        ...options,
      },
      metadata: {
        userAgent: options.userAgent,
        tags: options.tags || [],
        description: options.description,
      },
    };

    this.sessions.set(sessionId, session);

    this.logger.info(`📝 Created session: ${sessionId}`);
    this.emit("session-created", session);

    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      status: session.status,
      clientCount: session.clients.size,
      options: session.options,
      metadata: session.metadata,
    }));
  }

  addClient(sessionId, clientId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.clients.add(clientId);
    session.lastActivity = new Date();

    this.logger.info(`👤 Client ${clientId} added to session ${sessionId}`);
    this.emit("client-added", { sessionId, clientId });

    return session;
  }

  removeClient(sessionId, clientId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.clients.delete(clientId);
    session.lastActivity = new Date();

    this.logger.info(`👤 Client ${clientId} removed from session ${sessionId}`);
    this.emit("client-removed", { sessionId, clientId });

    // Auto-close session if no clients and auto-close is enabled
    if (session.clients.size === 0 && session.options.autoClose) {
      setTimeout(() => {
        // Double-check that no clients have reconnected
        const currentSession = this.sessions.get(sessionId);
        if (currentSession && currentSession.clients.size === 0) {
          this.destroySession(sessionId);
        }
      }, 30000); // 30 second grace period
    }

    return session;
  }

  updateActivity(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  updateStatus(sessionId, status) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      this.emit("session-status-changed", { sessionId, status });
    }
  }

  async destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    try {
      this.logger.info(`🗑️ Destroying session: ${sessionId}`);

      session.status = "destroying";
      this.emit("session-destroying", session);

      // Close browser if exists
      if (session.browser) {
        try {
          await session.browser.close();
        } catch (error) {
          this.logger.warn(
            `Error closing browser for session ${sessionId}:`,
            error,
          );
        }
      }

      // Notify all clients
      for (const clientId of session.clients) {
        this.emit("session-destroyed", { sessionId, clientId });
      }

      this.sessions.delete(sessionId);
      this.logger.info(`✅ Session destroyed: ${sessionId}`);

      return { success: true, message: "Session destroyed successfully" };
    } catch (error) {
      this.logger.error(`❌ Error destroying session ${sessionId}:`, error);
      // Remove session anyway to prevent memory leaks
      this.sessions.delete(sessionId);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete all sessions
   */
  async deleteAllSessions() {
    const sessionIds = Array.from(this.sessions.keys());
    const results = [];

    this.logger.info(`🗑️ Deleting all sessions: ${sessionIds.length} sessions`);

    for (const sessionId of sessionIds) {
      const result = await this.destroySession(sessionId);
      results.push({ sessionId, ...result });
    }

    this.logger.info(
      `✅ All sessions deleted: ${results.length} sessions processed`,
    );
    return {
      success: true,
      message: `Deleted ${results.length} sessions`,
      results: results,
      count: results.length,
    };
  }

  cleanupInactiveSessions() {
    const now = new Date();
    const sessionsToCleanup = [];

    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now - session.lastActivity;
      const timeout = session.options.timeout;

      if (inactiveTime > timeout && session.clients.size === 0) {
        sessionsToCleanup.push(sessionId);
      }
    }

    if (sessionsToCleanup.length > 0) {
      this.logger.info(
        `🧹 Cleaning up ${sessionsToCleanup.length} inactive sessions`,
      );

      for (const sessionId of sessionsToCleanup) {
        this.destroySession(sessionId);
      }
    }
  }

  getActiveSessionsCount() {
    return this.sessions.size;
  }

  getSessionStats() {
    const sessions = Array.from(this.sessions.values());

    return {
      total: sessions.length,
      active: sessions.filter((s) => s.clients.size > 0).length,
      inactive: sessions.filter((s) => s.clients.size === 0).length,
      statuses: {
        created: sessions.filter((s) => s.status === "created").length,
        running: sessions.filter((s) => s.status === "running").length,
        destroying: sessions.filter((s) => s.status === "destroying").length,
      },
      totalClients: sessions.reduce((sum, s) => sum + s.clients.size, 0),
    };
  }

  async cleanup() {
    this.logger.info("🧹 Cleaning up Session Manager...");

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Destroy all sessions
    const sessionIds = Array.from(this.sessions.keys());
    const destroyPromises = sessionIds.map((sessionId) =>
      this.destroySession(sessionId),
    );

    await Promise.allSettled(destroyPromises);
    this.sessions.clear();

    this.logger.info("✅ Session Manager cleaned up");
  }

  isHealthy() {
    return this.isInitialized;
  }
}

export default SessionManager;
