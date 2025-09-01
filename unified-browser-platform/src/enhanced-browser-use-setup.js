/**
 * Quick Session Cleanup Integration Example
 * Drop-in replacement for existing browser-use integration
 */

import { EnhancedBrowserUseIntegrationService } from "./services/enhanced-browser-use-integration.js";
import { createEnhancedBrowserUseRoutes } from "./routes/enhanced-browser-use-routes.js";

/**
 * Quick setup function - replaces your existing browser-use service initialization
 */
export async function setupEnhancedBrowserUse(
  browserService,
  sessionManager,
  logger,
  io,
) {
  // 1. Create enhanced service with automatic session cleanup
  const browserUseService = new EnhancedBrowserUseIntegrationService();

  // 2. Configure for automatic cleanup after task completion
  browserUseService.updateConfig({
    forceCleanupOnTaskComplete: true, // 🔥 KEY FIX: Auto-cleanup sessions after tasks
    sessionCleanupDelay: 2 * 60 * 1000, // 2 minutes delay (allows viewing results)
    sessionTimeout: 30 * 60 * 1000, // 30 minutes max session time
    maxSessionIdleTime: 10 * 60 * 1000, // 10 minutes idle timeout
    maxConcurrentSessions: 10, // Limit concurrent sessions
  });

  // 3. Initialize the service
  await browserUseService.initialize();

  // 4. Create enhanced routes with session management
  const routes = createEnhancedBrowserUseRoutes(
    browserUseService,
    browserService,
    sessionManager,
    logger,
    io,
  );

  // 5. Setup graceful shutdown
  const cleanup = async () => {
    logger.info("🧹 Cleaning up all browser-use sessions...");
    await browserUseService.cleanup();
  };

  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);

  logger.info(
    "✅ Enhanced browser-use service initialized with automatic session cleanup",
  );

  return {
    service: browserUseService,
    routes: routes,
    cleanup: cleanup,
  };
}

/**
 * Quick migration wrapper - maintains backward compatibility
 * Just replace your existing createBrowserUseRoutes call with this
 */
export function createBrowserUseRoutesWithCleanup(
  browserService,
  sessionManager,
  logger,
  io,
) {
  // Create enhanced service with cleanup
  const browserUseService = new EnhancedBrowserUseIntegrationService();

  // Configure for aggressive cleanup to solve the session accumulation issue
  browserUseService.updateConfig({
    forceCleanupOnTaskComplete: true, // 🔥 This solves the main issue
    sessionCleanupDelay: 1 * 60 * 1000, // 1 minute cleanup delay
    sessionTimeout: 20 * 60 * 1000, // 20 minutes max session time
    maxSessionIdleTime: 5 * 60 * 1000, // 5 minutes idle timeout
  });

  // Initialize (note: this is async, you might need to handle this in your app)
  browserUseService.initialize().catch((err) => {
    logger.error("Failed to initialize enhanced browser-use service:", err);
  });

  // Return enhanced routes
  return createEnhancedBrowserUseRoutes(
    browserUseService,
    browserService,
    sessionManager,
    logger,
    io,
  );
}

/**
 * Manual cleanup utility - call this to cleanup all sessions
 */
export async function cleanupAllBrowserUseSessions(browserUseService) {
  if (!browserUseService) {
    throw new Error("Browser-use service not provided");
  }

  const activeSessions = browserUseService.getActiveSessions();
  console.log(`🧹 Cleaning up ${activeSessions.length} active sessions...`);

  const cleanupPromises = activeSessions.map((session) =>
    browserUseService.forceCleanupSession(session.sessionId),
  );

  const results = await Promise.allSettled(cleanupPromises);

  const successful = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(
    `✅ Cleanup completed: ${successful} successful, ${failed} failed`,
  );

  return { total: activeSessions.length, successful, failed };
}

/**
 * Health check utility
 */
export function getBrowserUseHealth(browserUseService) {
  if (!browserUseService) {
    return { error: "Service not available" };
  }

  const health = browserUseService.isHealthy();
  const sessions = browserUseService.getActiveSessions();

  return {
    service_health: health,
    session_count: sessions.length,
    sessions_by_status: sessions.reduce((acc, session) => {
      acc[session.status] = (acc[session.status] || 0) + 1;
      return acc;
    }, {}),
    oldest_session_age_minutes:
      sessions.length > 0
        ? Math.round(Math.max(...sessions.map((s) => s.age)) / 60000)
        : 0,
    memory_efficient: sessions.length < 5, // Good if less than 5 active sessions
  };
}

/**
 * Configuration presets for different use cases
 */
export const SESSION_CLEANUP_PRESETS = {
  // Aggressive cleanup - solves resource accumulation quickly
  AGGRESSIVE: {
    forceCleanupOnTaskComplete: true,
    sessionCleanupDelay: 30 * 1000, // 30 seconds
    sessionTimeout: 15 * 60 * 1000, // 15 minutes
    maxSessionIdleTime: 3 * 60 * 1000, // 3 minutes
    maxConcurrentSessions: 5,
  },

  // Balanced - good for production
  BALANCED: {
    forceCleanupOnTaskComplete: true,
    sessionCleanupDelay: 2 * 60 * 1000, // 2 minutes
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    maxSessionIdleTime: 10 * 60 * 1000, // 10 minutes
    maxConcurrentSessions: 10,
  },

  // Conservative - minimal cleanup for debugging
  CONSERVATIVE: {
    forceCleanupOnTaskComplete: false, // Manual cleanup only
    sessionTimeout: 60 * 60 * 1000, // 1 hour
    maxSessionIdleTime: 30 * 60 * 1000, // 30 minutes
    maxConcurrentSessions: 20,
  },

  // Development - quick cleanup for testing
  DEVELOPMENT: {
    forceCleanupOnTaskComplete: true,
    sessionCleanupDelay: 10 * 1000, // 10 seconds
    sessionTimeout: 5 * 60 * 1000, // 5 minutes
    maxSessionIdleTime: 2 * 60 * 1000, // 2 minutes
    maxConcurrentSessions: 3,
  },
};

/**
 * Apply a configuration preset
 */
export function applyCleanupPreset(browserUseService, presetName) {
  const preset = SESSION_CLEANUP_PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown preset: ${presetName}. Available: ${Object.keys(SESSION_CLEANUP_PRESETS).join(", ")}`,
    );
  }

  browserUseService.updateConfig(preset);
  console.log(`✅ Applied ${presetName} cleanup preset`);
  return preset;
}

/**
 * Example usage in your app.js or server.js:
 *
 * import { setupEnhancedBrowserUse, SESSION_CLEANUP_PRESETS } from './enhanced-browser-use-setup.js';
 *
 * // Quick setup with automatic cleanup
 * const { service, routes, cleanup } = await setupEnhancedBrowserUse(
 *   browserService,
 *   sessionManager,
 *   logger,
 *   io
 * );
 *
 * // Apply aggressive cleanup preset to solve session accumulation quickly
 * service.updateConfig(SESSION_CLEANUP_PRESETS.AGGRESSIVE);
 *
 * // Use the routes
 * app.use('/api/browser-use', routes);
 *
 * // Manual cleanup if needed
 * setInterval(async () => {
 *   const health = getBrowserUseHealth(service);
 *   if (health.session_count > 10) {
 *     console.log('Too many sessions, cleaning up...');
 *     await cleanupAllBrowserUseSessions(service);
 *   }
 * }, 5 * 60 * 1000); // Check every 5 minutes
 */
