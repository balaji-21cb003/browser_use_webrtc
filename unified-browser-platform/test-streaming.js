#!/usr/bin/env node

/**
 * Quick test script to verify streaming is working
 * Run this after starting the server to test the streaming functionality
 */

import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000";

async function testStreaming() {
  console.log("🧪 Testing Browser-Use Streaming Setup");
  console.log("=====================================");

  try {
    // Test 1: Health check
    console.log("\n1. Testing health endpoint...");
    const healthResponse = await fetch(`${BASE_URL}/health`);
    const healthData = await healthResponse.json();
    console.log("✅ Health check:", healthData.status);

    // Test 2: Submit a simple task
    console.log("\n2. Submitting test task...");
    const taskResponse = await fetch(`${BASE_URL}/api/browser-use/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: "Navigate to google.com and take a screenshot",
        options: {
          maxSteps: 5,
          llmModel: "gpt-4",
        },
      }),
    });

    if (!taskResponse.ok) {
      throw new Error(
        `HTTP ${taskResponse.status}: ${taskResponse.statusText}`,
      );
    }

    const taskData = await taskResponse.json();
    console.log("✅ Task submitted successfully!");
    console.log("📋 Response:", {
      success: taskData.success,
      taskId: taskData.taskId,
      sessionId: taskData.sessionId,
      session_created: taskData.session_created,
      streaming_url: taskData.streaming_url,
      websocket_streaming_url: taskData.websocket_streaming_url,
    });

    console.log("\n🎯 Test completed! You can now visit:");
    console.log(`   Streaming URL: ${taskData.streaming_url}`);
    console.log(`   WebSocket URL: ${taskData.websocket_streaming_url}`);
    console.log("\n🔍 Check the server logs for streaming activity.");

    // Test 3: Check task status
    console.log("\n3. Checking task status...");
    setTimeout(async () => {
      try {
        const statusResponse = await fetch(
          `${BASE_URL}/api/browser-use/status/${taskData.taskId}`,
        );
        const statusData = await statusResponse.json();
        console.log("📊 Task status:", {
          taskId: statusData.taskId,
          status: statusData.status,
          progress: statusData.progress,
        });
      } catch (error) {
        console.log("⚠️ Failed to check task status:", error.message);
      }
    }, 3000);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error(
      "📋 Make sure the server is running on http://localhost:3000",
    );
  }
}

testStreaming();
