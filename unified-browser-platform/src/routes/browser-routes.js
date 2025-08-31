import express from "express";

export function createBrowserRoutes(browserService, sessionManager, logger) {
  const router = express.Router();

  // Create new browser session
  router.post("/sessions", async (req, res) => {
    try {
      const { options = {} } = req.body;
      const session = await sessionManager.createSession(options);
      const sessionId = session.id;
      const browserSession =
        await browserService.createSessionWithSeparateBrowser(
          sessionId,
          options,
        );
      res.json({
        success: true,
        sessionId: sessionId,
        message: "Browser session created successfully",
      });
    } catch (error) {
      logger.error("Failed to create session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete browser session
  router.delete("/sessions/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await browserService.closeBrowser(sessionId);
      await sessionManager.removeSession(sessionId);
      res.json({
        success: true,
        message: "Session closed successfully",
      });
    } catch (error) {
      logger.error("Failed to close session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/launch", async (req, res) => {
    try {
      const { sessionId, options = {} } = req.body;

      // DON'T create browser here! Only create it when task is actually submitted
      // Just acknowledge the session is ready for tasks
      logger.info(
        `🚀 Session ${sessionId} ready for task execution (no browser created yet)`,
      );
      res.json({
        success: true,
        sessionId,
        message: "Session ready for tasks",
      });
    } catch (error) {
      logger.error("Failed to prepare session:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/navigate", async (req, res) => {
    try {
      const { sessionId, url } = req.body;

      // REMOVED: No centralized browser - each session has its own browser
      logger.info(
        `🔗 Navigation endpoint removed - use session-specific navigation instead`,
      );
      res.json({ success: true });
    } catch (error) {
      logger.error("Failed to navigate:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/screenshot/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const screenshot = await browserService.getScreenshot(sessionId);
      res.type("image/png").send(screenshot);
    } catch (error) {
      logger.error("Failed to get screenshot:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete("/close/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      await browserService.closeBrowser(sessionId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Failed to close browser:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Debug endpoint to see current sessions
  router.get("/debug/sessions", async (req, res) => {
    try {
      const sessions = Array.from(browserService.sessions.entries()).map(
        ([id, session]) => ({
          id,
          browserWSEndpoint: session.browserWSEndpoint,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          streaming: session.streaming,
        }),
      );
      res.json({
        success: true,
        sessionCount: browserService.sessions.size,
        sessions,
      });
    } catch (error) {
      logger.error("Failed to get debug info:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
