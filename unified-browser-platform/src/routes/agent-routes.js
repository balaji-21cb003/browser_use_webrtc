import express from "express";

export function createAgentRoutes(
  browserService,
  browserUseService,
  agentService,
  logger,
) {
  const router = express.Router();

  router.post("/task", async (req, res) => {
    try {
      const { sessionId, task, options = {} } = req.body;

      // REMOVED: No need to initialize centralized browser - each session gets its own browser
      logger.info(
        "🚀 Using per-session browser instances for true parallel execution",
      );

      // Create streaming session using SEPARATE browser for parallel execution
      let browserSession = browserService.getSession(sessionId);
      if (!browserSession) {
        logger.info(
          "🔗 Creating streaming session with SEPARATE browser for parallel execution",
        );
        browserSession = await browserService.createSessionWithSeparateBrowser(
          sessionId,
          { width: 1920, height: 1480 }, // Increased height for full browser capture
        );

        // Start streaming for this session
        await browserService.startStreaming(sessionId, (frame) => {
          // This will be handled by the main server's socket.io instance
          logger.debug(
            `📹 Frame captured for session ${sessionId}, size: ${frame.length} bytes`,
          );
        });
        logger.info(`📺 Streaming started for session ${sessionId}`);
      }

      // Use the session's own browser CDP endpoint for true parallel execution
      options.cdpEndpoint = browserSession.browserWSEndpoint;
      options.useExistingBrowser = true;
      logger.info(
        `🔗 Using session browser for task: ${browserSession.browserWSEndpoint}`,
      );

      // Use browser-use service if available, otherwise fall back to basic agent
      if (browserUseService.isHealthy().initialized) {
        const result = await browserUseService.executeTask(
          sessionId,
          task,
          options,
        );

        // Generate live URL and streaming URL for this session
        const liveUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}`;
        const streamingUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}/stream`;

        res.json({
          success: true,
          result,
          provider: "browser-use-full",
          live_url: liveUrl,
          streaming_url: streamingUrl,
          live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
          streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
          message: `Task executed successfully! Browser is now available at: ${streamingUrl}`,
        });
      } else {
        const result = await agentService.executeTask(sessionId, task, options);

        // Ensure browser navigates to a page if it's still on about:blank
        const browserSession = browserService.getSession(sessionId);
        if (browserSession && browserSession.page) {
          try {
            const currentUrl = await browserSession.page.url();
            if (currentUrl === "about:blank") {
              logger.info(
                `🔄 Browser is on about:blank, navigating to Google for session ${sessionId}`,
              );
              await browserSession.page.goto("https://www.google.com", {
                waitUntil: "networkidle0",
                timeout: 10000,
              });
              logger.info(
                `✅ Browser navigated to Google for session ${sessionId}`,
              );
            }
          } catch (navError) {
            logger.warn(
              `⚠️ Failed to navigate browser for session ${sessionId}:`,
              navError.message,
            );
          }
        }

        // Generate live URL and streaming URL for this session
        const liveUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}`;
        const streamingUrl = `${req.protocol}://${req.get("host")}/api/live/${sessionId}/stream`;

        res.json({
          success: true,
          result,
          provider: "basic-agent",
          live_url: liveUrl,
          streaming_url: streamingUrl,
          live_url_embed: `<iframe src="${liveUrl}" width="100%" height="600px"></iframe>`,
          streaming_url_embed: `<iframe src="${streamingUrl}" width="100%" height="600px"></iframe>`,
          message: `Task executed successfully! Browser is now available at: ${streamingUrl}`,
        });
      }
    } catch (error) {
      logger.error("Failed to execute task:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/status", async (req, res) => {
    try {
      const activeAgents = browserUseService.getActiveAgents();
      const basicAgents = agentService.getActiveAgents
        ? agentService.getActiveAgents()
        : [];
      res.json({
        browserUseAgents: activeAgents,
        basicAgents: basicAgents,
        total: activeAgents.length + basicAgents.length,
      });
    } catch (error) {
      logger.error("Failed to get agent status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/stop/:executionId", async (req, res) => {
    try {
      const { executionId } = req.params;
      const stopped =
        (await browserUseService.stopAgent(executionId)) ||
        (agentService.stopAgent
          ? await agentService.stopAgent(executionId)
          : false);
      res.json({ success: stopped });
    } catch (error) {
      logger.error("Failed to stop agent:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
