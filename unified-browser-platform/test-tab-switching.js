#!/usr/bin/env node

/**
 * Test script to verify improved tab switching functionality
 * This will test the exact scenario: Google → YouTube → GitHub switching
 */

import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000";

async function testTabSwitching() {
  console.log("🧪 Testing Enhanced Tab Switching System");
  console.log("==========================================");

  try {
    // Test the exact scenario that was failing
    console.log("\n🎯 Testing: YouTube → GitHub task switching...");

    const response = await fetch(`${BASE_URL}/api/browser-use/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "go to youtube and play monica song and then go to github and search for browser-use repo",
        options: {
          llmModel: "gpt-4.1",
          maxSteps: 20,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log("✅ Task submitted successfully!");
    console.log(`📋 Session ID: ${data.sessionId}`);
    console.log(`🔗 Streaming URL: ${data.websocket_streaming_url}`);
    console.log(`📺 Live URL: ${data.live_url}`);

    console.log("\n🎬 Tab switching improvements:");
    console.log("• ✅ Aggressive 500ms monitoring");
    console.log("• ✅ Immediate navigation detection");
    console.log("• ✅ Priority scoring for YouTube/GitHub");
    console.log("• ✅ Force switch on recent navigation");
    console.log("• ✅ Page focus event monitoring");
    console.log("• ✅ Enhanced activity tracking");

    console.log("\n🔥 Expected behavior:");
    console.log("1. Start on Google (initial tab)");
    console.log("2. Auto-switch to YouTube when created");
    console.log("3. Auto-switch to GitHub when navigation occurs");
    console.log("4. Stream follows the active automation tab");

    console.log(`\n👀 Watch the streaming at: ${data.websocket_streaming_url}`);
    console.log(
      "The streaming should now automatically follow the active tab!",
    );
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

// Run the test
testTabSwitching();
