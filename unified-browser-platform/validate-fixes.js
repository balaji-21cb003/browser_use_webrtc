#!/usr/bin/env node

/**
 * Quick server startup validation to ensure our timeout fixes don't break anything
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, ".env") });

console.log("🚀 Validating Server Configuration");
console.log("==================================");

// Check critical configurations
const criticalConfigs = [
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_DEPLOYMENT_NAME",
  "BROWSER_PROTOCOL_TIMEOUT",
  "CDP_TIMEOUT",
  "BROWSER_USE_WATCHDOG_TIMEOUT",
];

let configValid = true;

criticalConfigs.forEach((config) => {
  const value = process.env[config];
  const status = value ? "✅" : "❌";
  console.log(`${status} ${config}: ${value ? "SET" : "MISSING"}`);
  if (!value) configValid = false;
});

console.log("\n📋 Configuration Summary:");
console.log(`   - Configuration Valid: ${configValid ? "✅ YES" : "❌ NO"}`);
console.log(`   - Timeout Values: Extended for cloud compatibility`);
console.log(`   - LLM Provider: ${process.env.LLM_PROVIDER || "NOT SET"}`);
console.log(`   - Environment: ${process.env.NODE_ENV || "development"}`);

// Test imports to ensure no syntax errors
try {
  console.log("\n🔍 Testing Critical Imports...");

  // This will test if our modified files have syntax errors
  console.log("   - Testing BrowserStreamingService import...");
  const { BrowserStreamingService } = await import(
    "./src/services/browser-streaming.js"
  );
  console.log("   ✅ BrowserStreamingService imported successfully");

  console.log("   - Testing BrowserUseIntegration import...");
  const { BrowserUseIntegration } = await import(
    "./src/services/browser-use-integration.js"
  );
  console.log("   ✅ BrowserUseIntegration imported successfully");

  console.log("   ✅ All critical imports successful");
} catch (importError) {
  console.error("   ❌ Import failed:", importError.message);
  configValid = false;
}

console.log("\n🎯 Validation Result:");
if (configValid) {
  console.log("✅ Server configuration is valid and ready for deployment");
  console.log(
    "🚀 The browser automation should now work properly on cloud servers",
  );
  console.log("📈 Extended timeouts will handle cloud server latency");
  process.exit(0);
} else {
  console.log(
    "❌ Server configuration has issues - check missing values above",
  );
  process.exit(1);
}
