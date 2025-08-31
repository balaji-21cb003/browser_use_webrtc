#!/usr/bin/env node

/**
 * Test script to verify browser sizing is working correctly
 */

import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000";

async function testBrowserSize() {
  console.log("🧪 Testing Browser Size Configuration");
  console.log("=====================================");

  try {
    // Test with a simple task that opens a website
    console.log("\n🎯 Testing browser window size...");

    const response = await fetch(`${BASE_URL}/api/browser-use/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "go to youtube.com and check the page layout",
        options: {
          llmModel: "gpt-4.1",
          maxSteps: 5,
        },
      }),
    });

    const data = await response.json();
    console.log("✅ Task started successfully");
    console.log("📱 Streaming URL:", data.streaming_url);
    console.log("🔗 WebSocket URL:", data.websocket_streaming_url);

    console.log("\n🔍 Open the streaming URL in your browser to verify:");
    console.log("   1. Browser automation opens in full 1920x1080 window");
    console.log("   2. YouTube interface is displayed properly (not cramped)");
    console.log("   3. All UI elements are clearly visible");

    return data;
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return null;
  }
}

// Run the test
testBrowserSize()
  .then((result) => {
    if (result) {
      console.log("\n✅ Browser size test completed!");
      console.log("   Check the streaming interface to verify proper sizing.");
    }
  })
  .catch((error) => {
    console.error("💥 Test error:", error);
  });
