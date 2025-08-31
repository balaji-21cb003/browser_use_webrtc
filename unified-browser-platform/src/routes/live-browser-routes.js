import express from "express";

export function createLiveBrowserRoutes(browserService, logger) {
  const router = express.Router();

  // Live browser view - shows the actual browser content
  router.get("/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const browserSession = browserService.getSession(sessionId);

      if (!browserSession) {
        return res.status(404).json({
          error: "Browser session not found",
          sessionId: sessionId,
        });
      }

      // Return live browser information
      res.json({
        success: true,
        sessionId: sessionId,
        status: "active",
        browserInfo: {
          wsEndpoint: browserSession.browserWSEndpoint,
          isConnected: browserSession.isConnected,
          currentUrl: browserSession.currentUrl || "about:blank",
          lastActivity: browserSession.lastActivity,
        },
        live_url: `${req.protocol}://${req.get("host")}/api/live/${sessionId}`,
        streaming_url: `${req.protocol}://${req.get("host")}/stream/${sessionId}`,
        message: "Live browser session is active",
      });
    } catch (error) {
      logger.error("Failed to get live browser info:", error);
      res.status(500).json({
        error: error.message,
        type: "live-browser-info-error",
      });
    }
  });

  // Live browser streaming endpoint
  router.get("/:sessionId/stream", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const browserSession = browserService.getSession(sessionId);

      if (!browserSession) {
        return res.status(404).json({
          error: "Browser session not found",
          sessionId: sessionId,
        });
      }

      // Set headers for streaming
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Return streaming HTML page
      const streamingHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Live Browser Stream - Session ${sessionId}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { margin: 0; padding: 0; background: #000; }
        #stream-container { width: 100vw; height: 100vh; }
        #status { position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; }
        #controls { position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; }
        button { margin: 5px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div id="status">Session: ${sessionId} | Status: Connecting...</div>
    <div id="controls">
        <button onclick="refreshStream()">Refresh</button>
        <button onclick="fullscreen()">Fullscreen</button>
    </div>
    <div id="stream-container">
        <iframe id="stream-frame" src="/stream/${sessionId}?sessionId=${sessionId}" width="100%" height="100%" frameborder="0"></iframe>
    </div>
    
    <script>
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        function updateStatus(message) {
            document.getElementById('status').innerHTML = 'Session: ${sessionId} | Status: ' + message;
        }
        
        function refreshStream() {
            const frame = document.getElementById('stream-frame');
            frame.src = frame.src;
            updateStatus('Refreshing...');
        }
        
        function fullscreen() {
            const container = document.getElementById('stream-container');
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            } else if (container.msRequestFullscreen) {
                container.msRequestFullscreen();
            }
        }
        
        // Auto-refresh on connection issues
        window.addEventListener('error', function(e) {
            if (e.target.tagName === 'IFRAME') {
                reconnectAttempts++;
                if (reconnectAttempts <= maxReconnectAttempts) {
                    updateStatus('Connection lost, reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})');
                    setTimeout(refreshStream, 2000);
                } else {
                    updateStatus('Connection failed after ${maxReconnectAttempts} attempts');
                }
            }
        });
        
        // Update status when iframe loads
        document.getElementById('stream-frame').onload = function() {
            updateStatus('Connected');
            reconnectAttempts = 0;
        };
        
        updateStatus('Loading...');
    </script>
</body>
</html>`;

      res.send(streamingHtml);
    } catch (error) {
      logger.error("Failed to serve streaming page:", error);
      res.status(500).json({
        error: error.message,
        type: "streaming-page-error",
      });
    }
  });

  // Get browser session details
  router.get("/:sessionId/details", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const browserSession = browserService.getSession(sessionId);

      if (!browserSession) {
        return res.status(404).json({
          error: "Browser session not found",
          sessionId: sessionId,
        });
      }

      // Get detailed browser information
      const details = {
        sessionId: sessionId,
        browserInfo: {
          wsEndpoint: browserSession.browserWSEndpoint,
          isConnected: browserSession.isConnected,
          currentUrl: browserSession.currentUrl || "about:blank",
          lastActivity: browserSession.lastActivity,
          userAgent: browserSession.userAgent,
          viewport: browserSession.viewport,
        },
        streamingInfo: {
          isStreaming: browserSession.isStreaming,
          streamStartedAt: browserSession.streamStartedAt,
          frameCount: browserSession.frameCount || 0,
          lastFrameTime: browserSession.lastFrameTime,
        },
        performance: {
          memoryUsage: browserSession.memoryUsage,
          cpuUsage: browserSession.cpuUsage,
          networkActivity: browserSession.networkActivity,
        },
      };

      res.json({
        success: true,
        details: details,
      });
    } catch (error) {
      logger.error("Failed to get browser details:", error);
      res.status(500).json({
        error: error.message,
        type: "browser-details-error",
      });
    }
  });

  // Control browser actions
  router.post("/:sessionId/control", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { action, params = {} } = req.body;

      const browserSession = browserService.getSession(sessionId);
      if (!browserSession) {
        return res.status(404).json({
          error: "Browser session not found",
          sessionId: sessionId,
        });
      }

      let result;
      switch (action) {
        case "navigate":
          result = await browserSession.page.goto(params.url, params.options);
          break;
        case "refresh":
          result = await browserSession.page.reload();
          break;
        case "back":
          result = await browserSession.page.goBack();
          break;
        case "forward":
          result = await browserSession.page.goForward();
          break;
        case "screenshot":
          result = await browserSession.page.screenshot(params.options);
          break;
        case "evaluate":
          result = await browserSession.page.evaluate(params.script);
          break;
        default:
          return res.status(400).json({
            error: "Invalid action",
            validActions: [
              "navigate",
              "refresh",
              "back",
              "forward",
              "screenshot",
              "evaluate",
            ],
          });
      }

      res.json({
        success: true,
        action: action,
        result: result,
        message: `Action '${action}' executed successfully`,
      });
    } catch (error) {
      logger.error("Failed to execute browser control action:", error);
      res.status(500).json({
        error: error.message,
        type: "browser-control-error",
      });
    }
  });

  return router;
}
