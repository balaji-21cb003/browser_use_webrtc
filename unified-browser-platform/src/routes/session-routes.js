import express from "express";

export function createSessionRoutes(sessionManager, logger) {
  const router = express.Router();

  // Create new session
  router.post("/create", async (req, res) => {
    try {
      const { options = {} } = req.body;
      const session = await sessionManager.createSession(options);
      res.json({
        success: true,
        sessionId: session.id,
        message: "Session created successfully",
        session: session,
      });
    } catch (error) {
      logger.error("Failed to create session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get session by ID
  router.get("/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = sessionManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({
        success: true,
        session: session,
      });
    } catch (error) {
      logger.error("Failed to get session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all active sessions
  router.get("/", async (req, res) => {
    try {
      const sessions = sessionManager.getAllSessions();
      res.json({
        success: true,
        sessions: sessions,
        count: sessions.length,
      });
    } catch (error) {
      logger.error("Failed to get sessions:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update session
  router.put("/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { updates } = req.body;

      const updated = await sessionManager.updateSession(sessionId, updates);

      if (!updated) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({
        success: true,
        message: "Session updated successfully",
        session: updated,
      });
    } catch (error) {
      logger.error("Failed to update session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete session
  router.delete("/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const removed = await sessionManager.removeSession(sessionId);

      if (!removed) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({
        success: true,
        message: "Session removed successfully",
      });
    } catch (error) {
      logger.error("Failed to remove session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get session statistics
  router.get("/stats/overview", async (req, res) => {
    try {
      const stats = sessionManager.getSessionStats();
      res.json({
        success: true,
        stats: stats,
      });
    } catch (error) {
      logger.error("Failed to get session stats:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Clean up expired sessions
  router.post("/cleanup", async (req, res) => {
    try {
      sessionManager.cleanupInactiveSessions();
      res.json({
        success: true,
        message: "Cleanup completed",
      });
    } catch (error) {
      logger.error("Failed to cleanup sessions:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
