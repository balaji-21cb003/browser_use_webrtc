import express from "express";

export function createTokenRoutes(browserUseService, logger) {
  const router = express.Router();

  // Get token usage for a specific task
  router.get("/usage/:taskId", async (req, res) => {
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

  // Get token usage summary
  router.get("/summary", async (req, res) => {
    try {
      const { period = "24h" } = req.query;
      const summary = browserUseService.getTokenUsageSummary(period);

      res.json({
        success: true,
        period: period,
        summary: summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get token usage summary:", error);
      res.status(500).json({
        error: error.message,
        type: "token-summary-error",
      });
    }
  });

  // Get token usage by model
  router.get("/by-model", async (req, res) => {
    try {
      const { period = "24h" } = req.query;
      const modelUsage = browserUseService.getTokenUsageByModel(period);

      res.json({
        success: true,
        period: period,
        modelUsage: modelUsage,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get token usage by model:", error);
      res.status(500).json({
        error: error.message,
        type: "model-usage-error",
      });
    }
  });

  // Get token usage by session
  router.get("/by-session/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const sessionUsage = browserUseService.getTokenUsageBySession(sessionId);

      if (!sessionUsage) {
        return res.status(404).json({
          error: "Session not found",
          sessionId: sessionId,
        });
      }

      res.json({
        success: true,
        sessionId: sessionId,
        tokenUsage: sessionUsage,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get session token usage:", error);
      res.status(500).json({
        error: error.message,
        type: "session-usage-error",
      });
    }
  });

  // Get cost analysis
  router.get("/cost-analysis", async (req, res) => {
    try {
      const { period = "24h" } = req.query;
      const costAnalysis = browserUseService.getCostAnalysis(period);

      res.json({
        success: true,
        period: period,
        costAnalysis: costAnalysis,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get cost analysis:", error);
      res.status(500).json({
        error: error.message,
        type: "cost-analysis-error",
      });
    }
  });

  // Get token usage trends
  router.get("/trends", async (req, res) => {
    try {
      const { period = "7d", interval = "1h" } = req.query;
      const trends = browserUseService.getTokenUsageTrends(period, interval);

      res.json({
        success: true,
        period: period,
        interval: interval,
        trends: trends,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get token usage trends:", error);
      res.status(500).json({
        error: error.message,
        type: "trends-error",
      });
    }
  });

  // Export token usage data
  router.get("/export", async (req, res) => {
    try {
      const { format = "json", period = "24h" } = req.query;
      const exportData = browserUseService.exportTokenUsageData(format, period);

      if (format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="token-usage-${period}.csv"`,
        );
        res.send(exportData);
      } else {
        res.json({
          success: true,
          format: format,
          period: period,
          data: exportData,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error("Failed to export token usage data:", error);
      res.status(500).json({
        error: error.message,
        type: "export-error",
      });
    }
  });

  return router;
}
