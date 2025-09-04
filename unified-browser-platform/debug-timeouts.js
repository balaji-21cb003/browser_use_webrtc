#!/usr/bin/env node

/**
 * Debug script to verify timeout configurations are being loaded correctly
 * Run this from the browser_use directory to verify environment variables
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, ".env") });

console.log("🔍 Debugging Timeout Configurations");
console.log("=====================================");

// Check .env file loading
console.log("📁 Environment File Status:");
console.log(`   - Current Working Directory: ${process.cwd()}`);
console.log(`   - .env file path: ${resolve(__dirname, ".env")}`);

// Check timeout environment variables
console.log("\n⏰ Timeout Environment Variables:");
const timeoutVars = [
  "BROWSER_PROTOCOL_TIMEOUT",
  "CDP_TIMEOUT",
  "TAB_SYNC_TIMEOUT",
  "BROWSER_USE_WATCHDOG_TIMEOUT",
  "BROWSER_USE_EVENT_TIMEOUT",
];

timeoutVars.forEach((varName) => {
  const value = process.env[varName];
  console.log(`   - ${varName}: ${value || "NOT SET"}`);
});

// Check browser configuration
console.log("\n🌐 Browser Configuration:");
const browserVars = [
  "BROWSER_HEADLESS",
  "BROWSER_PORT",
  "BROWSER_WIDTH",
  "BROWSER_HEIGHT",
];

browserVars.forEach((varName) => {
  const value = process.env[varName];
  console.log(`   - ${varName}: ${value || "NOT SET"}`);
});

// Check LLM configuration
console.log("\n🤖 LLM Configuration:");
const llmVars = [
  "LLM_PROVIDER",
  "LLM_MODEL",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_DEPLOYMENT_NAME",
];

llmVars.forEach((varName) => {
  const value = process.env[varName];
  const displayValue = varName.includes("KEY")
    ? value
      ? "***SET***"
      : "NOT SET"
    : value || "NOT SET";
  console.log(`   - ${varName}: ${displayValue}`);
});

// Test timeout parsing
console.log("\n🧮 Timeout Value Parsing:");
timeoutVars.forEach((varName) => {
  const value = process.env[varName];
  if (value) {
    const parsed = parseInt(value);
    const seconds = parsed / 1000;
    console.log(`   - ${varName}: ${value}ms = ${seconds}s`);
  }
});

console.log("\n✅ Debug complete - check values above");
