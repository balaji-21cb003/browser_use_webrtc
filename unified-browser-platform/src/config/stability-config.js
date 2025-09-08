/**
 * Stability Configuration
 * Enhanced error handling and resilience settings
 */

export const STABILITY_CONFIG = {
  // Error handling modes
  ERROR_HANDLING: {
    // Don't terminate on these types of errors
    IGNORED_PROTOCOL_ERRORS: [
      "Session closed",
      "Target closed", 
      "Connection closed",
      "Protocol error (Input.dispatchKeyEvent): Session closed",
      "Protocol error (Input.dispatchMouseEvent): Session closed",
      "Protocol error (Network.setUserAgentOverride): Target closed"
    ],
    
    // Log these as debug instead of error
    DEBUG_ONLY_ERRORS: [
      "blocked script execution in 'about:blank'",
      "sandboxed and the 'allow-scripts' permission is not set",
      "Cannot delete property 'weebdriver'",
      "Cannot redefine property"
    ],
    
    // Maximum retries for operations
    MAX_RETRIES: 3,
    
    // Retry delay (ms)
    RETRY_DELAY: 1000
  },
  
  // Session management
  SESSION_MANAGEMENT: {
    // Keep sessions alive even after automation tasks complete
    KEEP_SESSIONS_ALIVE: true,
    
    // Session timeout (ms) - 30 minutes
    SESSION_TIMEOUT: 30 * 60 * 1000,
    
    // Auto-cleanup interval (ms) - 5 minutes
    CLEANUP_INTERVAL: 5 * 60 * 1000
  },
  
  // Browser stability
  BROWSER_STABILITY: {
    // Don't terminate browser on detection events
    IGNORE_HARMLESS_DETECTIONS: true,
    
    // Maximum detection events before taking action
    DETECTION_THRESHOLD: 10,
    
    // Page recreation retry attempts
    PAGE_RECREATION_RETRIES: 3
  },
  
  // Server resilience
  SERVER_RESILIENCE: {
    // Don't shutdown server on errors
    PREVENT_SHUTDOWN_ON_ERRORS: true,
    
    // Handle uncaught exceptions
    HANDLE_UNCAUGHT_EXCEPTIONS: true,
    
    // Continue serving even with partial failures
    GRACEFUL_DEGRADATION: true
  }
};

export default STABILITY_CONFIG;
