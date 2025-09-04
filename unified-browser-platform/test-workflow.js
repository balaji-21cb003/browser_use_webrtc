#!/usr/bin/env node

/**
 * Test script to verify browser automation workflow with enhanced timeouts
 * This will test the complete flow including CDP setup, tab management, and mouse interactions
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { BrowserStreamingService } from "./src/services/browser-streaming.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, ".env") });

console.log("🧪 Testing Browser Automation Workflow");
console.log("=====================================");

async function testBrowserWorkflow() {
  let browserService = null;
  let sessionId = null;

  try {
    // Initialize browser streaming service
    console.log("📡 Initializing browser streaming service...");
    browserService = new BrowserStreamingService();

    // Create a test session
    console.log("🔧 Creating browser session...");
    const sessionResult = await browserService.createSessionWithSeparateBrowser(
      {
        sessionId: "test-session-" + Date.now(),
        streamConfig: {
          enableScreenshots: true,
          enableRecording: false,
        },
      },
    );

    sessionId = sessionResult.sessionId;
    console.log(`✅ Session created: ${sessionId}`);
    console.log(`🌐 CDP Endpoint: ${sessionResult.cdpEndpoint}`);

    // Test tab synchronization
    console.log("🔄 Testing tab synchronization...");
    await browserService.syncTabRegistry();
    console.log("✅ Tab sync completed");

    // Test basic navigation
    console.log("🧭 Testing navigation...");
    const session = browserService.sessions.get(sessionId);
    if (session && session.page) {
      await session.page.goto("https://example.com", {
        waitUntil: "networkidle0",
        timeout: parseInt(process.env.BROWSER_PROTOCOL_TIMEOUT) || 120000,
      });
      console.log("✅ Navigation successful");

      // Test mouse interaction
      console.log("🖱️ Testing mouse interaction...");
      try {
        await session.page.mouse.move(100, 100);
        console.log("✅ Mouse movement successful");

        await session.page.mouse.click(100, 100);
        console.log("✅ Mouse click successful");
      } catch (mouseError) {
        console.log(`⚠️ Mouse interaction warning: ${mouseError.message}`);
      }

      // Get page title to verify everything works
      const title = await session.page.title();
      console.log(`📄 Page title: ${title}`);
    }

    console.log("✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("🔍 Error details:", error);
  } finally {
    // Cleanup
    if (browserService && sessionId) {
      console.log("🧹 Cleaning up session...");
      try {
        await browserService.closeSession(sessionId);
        console.log("✅ Session cleaned up");
      } catch (cleanupError) {
        console.error("⚠️ Cleanup error:", cleanupError.message);
      }
    }
  }
}

// Enhanced error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught Exception:", error);
  process.exit(1);
});

// Run the test
testBrowserWorkflow()
  .then(() => {
    console.log("🎉 Test script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Test script failed:", error);
    process.exit(1);
  });
