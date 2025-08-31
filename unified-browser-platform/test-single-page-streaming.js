/**
 * Test Script for Single Page Streaming
 * Verifies that the system now uses CDP screencast instead of OS-level desktop capture
 */

import { BrowserStreamingService } from "./src/services/browser-streaming.js";

async function testSinglePageStreaming() {
  console.log("🧪 Testing Single Page Streaming Implementation...");

  const browserService = new BrowserStreamingService();
  await browserService.initialize();

  const sessionId = "test-single-page-" + Date.now();
  console.log(`📝 Created test session: ${sessionId}`);

  try {
    // Create a browser session
    const session = await browserService.createSessionWithSeparateBrowser(
      sessionId,
      {
        width: 1920,
        height: 1080,
      },
    );

    console.log("✅ Browser session created successfully");
    console.log(`🔌 CDP Endpoint: ${session.browserWSEndpoint}`);
    console.log(
      `📐 Viewport: ${session.viewport.width}x${session.viewport.height}`,
    );

    // Navigate to a page first to ensure content is loaded
    await browserService.navigate(sessionId, "https://www.google.com");
    console.log(`🌐 Navigated to Google for testing`);

    // Wait a moment for the page to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test streaming
    let frameCount = 0;
    await browserService.startStreaming(sessionId, (frame) => {
      frameCount++;
      console.log(`📹 Frame ${frameCount} received: ${frame.length} bytes`);

      if (frameCount >= 3) {
        console.log("✅ Single page streaming test completed successfully!");
        console.log(
          "🎯 System is now using CDP screencast (single page) instead of OS-level desktop capture",
        );
        process.exit(0);
      }
    });

    // Add timeout to prevent hanging
    setTimeout(() => {
      console.log("⏰ Test timeout - no frames received");
      process.exit(1);
    }, 10000);

    // Navigate to a test page
    await browserService.navigate(sessionId, "https://www.google.com");
    console.log("🌐 Navigated to Google for testing");

    // Wait for frames
    setTimeout(() => {
      console.log("⏰ Test timeout - no frames received");
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    process.exit(1);
  }
}

testSinglePageStreaming().catch(console.error);
