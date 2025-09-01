/**
 * Optimized Tab Detection Service
 *
 * Enhances the current activity-based approach with performance optimizations
 * while maintaining robust automation detection capabilities.
 */

class OptimizedTabDetection {
  constructor(logger) {
    this.logger = logger;
    this.automationCache = new Map(); // Cache automation markers
    this.sessionStates = new Map(); // Track session activity levels

    // **NEW: Activity lock mechanism**
    this.activityLocks = new Map(); // sessionId -> { tabId, lockUntil, reason }
    this.lockDuration = 8000; // 8 seconds lock for active automation

    // Set up periodic cleanup
    setInterval(() => this.cleanupCache(), 30000);
  }

  /**
   * Set an activity lock on a tab to prevent switches during automation
   */
  setActivityLock(sessionId, tabId, reason = "automation") {
    const lockUntil = Date.now() + this.lockDuration;
    this.activityLocks.set(sessionId, {
      tabId,
      lockUntil,
      reason,
      timestamp: Date.now(),
    });

    // this.logger.info(`🔒 Activity lock set for session ${sessionId}, tab ${tabId.substring(0, 8)}... (${reason}) until ${new Date(lockUntil).toISOString()}`);
  }

  /**
   * Check if a session has an active activity lock
   */
  hasActivityLock(sessionId) {
    const lock = this.activityLocks.get(sessionId);
    if (!lock) return false;

    if (Date.now() > lock.lockUntil) {
      this.activityLocks.delete(sessionId);
      return false;
    }

    return lock;
  }

  /**
   * Clear activity lock for a session
   */
  clearActivityLock(sessionId) {
    if (this.activityLocks.has(sessionId)) {
      // this.logger.info(`🔓 Activity lock cleared for session ${sessionId}`);
      this.activityLocks.delete(sessionId);
    }
  }

  /**
   * Smart polling - adaptive detection frequency based on session activity
   */
  getPollingInterval(sessionId) {
    const sessionState = this.sessionStates.get(sessionId);

    if (!sessionState) {
      return 1000; // Default 1 second for new sessions
    }

    // Adaptive polling based on activity level
    if (sessionState.highActivity) {
      return 300; // Very fast polling during active automation
    } else if (sessionState.mediumActivity) {
      return 800; // Medium polling for moderate activity
    } else {
      return 2000; // Slow polling for idle sessions
    }
  }

  /**
   * Update session activity state for smart polling
   */
  updateSessionActivity(sessionId, automationScore, hasRecentActivity) {
    const state = {
      lastUpdate: Date.now(),
      highActivity: automationScore > 4000 || hasRecentActivity < 2000,
      mediumActivity: automationScore > 2000 || hasRecentActivity < 10000,
      consecutiveHighScores: 0,
    };

    // Track consecutive high activity for stability
    const prevState = this.sessionStates.get(sessionId);
    if (prevState && state.highActivity) {
      state.consecutiveHighScores = prevState.consecutiveHighScores + 1;
    }

    this.sessionStates.set(sessionId, state);
  }

  /**
   * Cached automation detection - avoid repeated page evaluation
   */
  async getCachedAutomationActivity(page, targetId) {
    const cacheKey = `${targetId}_automation`;
    const cached = this.automationCache.get(cacheKey);

    // Use cache if less than 1 second old and high confidence
    if (
      cached &&
      Date.now() - cached.timestamp < 1000 &&
      cached.confidence === "HIGH"
    ) {
      return cached.data;
    }

    // Evaluate page for automation markers
    try {
      const automationActivity = await page.evaluate(() => {
        const hasAutomationMarker =
          window.browserUseActive ||
          window.automationInProgress ||
          document.querySelector("[data-browser-use]");

        const recentInteraction = window.lastInteractionTime
          ? Date.now() - window.lastInteractionTime
          : Infinity;

        const recentDomChanges = window.lastDomModification
          ? Date.now() - window.lastDomModification
          : Infinity;

        const isProcessing =
          document.querySelector(
            '.loading, .spinner, [data-loading="true"]',
          ) !== null;
        const hasActiveForm = document.querySelector("form") !== null;

        // **ENHANCED: Detect our new automation markers**
        const formActivity = window.formActivity || false;
        const searchActivity = window.searchActivity || false;
        const lastSearchTime = window.lastSearchTime || 0;

        // **ENHANCED: Better activity detection**
        const automationInProgress = window.automationInProgress || false;
        const browserUseActive = window.browserUseActive || false;

        return {
          hasAutomationMarker,
          recentInteraction,
          recentDomChanges,
          isProcessing,
          hasActiveForm,
          lastActivity: window.lastInteractionTime || 0,
          // New enhanced fields
          formActivity,
          searchActivity,
          lastSearchTime,
          automationInProgress,
          browserUseActive,
        };
      });

      // Determine confidence level
      const confidence =
        automationActivity.hasAutomationMarker ||
        automationActivity.recentInteraction < 5000
          ? "HIGH"
          : "MEDIUM";

      // Cache the result
      this.automationCache.set(cacheKey, {
        data: automationActivity,
        timestamp: Date.now(),
        confidence,
      });

      return automationActivity;
    } catch (error) {
      // Return cached result if evaluation fails
      return cached ? cached.data : null;
    }
  }

  /**
   * Fast-path scoring for obvious automation cases
   */
  getQuickScore(automationActivity, url, title) {
    let quickScore = 100; // Base score

    // Quick automation detection
    if (automationActivity) {
      if (automationActivity.hasAutomationMarker) {
        return { score: 5100, method: "AUTOMATION_MARKER", confidence: "HIGH" };
      }

      if (automationActivity.recentInteraction < 2000) {
        return {
          score: 4600,
          method: "RECENT_INTERACTION",
          confidence: "HIGH",
        };
      }

      if (automationActivity.recentDomChanges < 3000) {
        return { score: 4100, method: "DOM_CHANGES", confidence: "HIGH" };
      }
    }

    // Quick URL-based scoring for known patterns
    if (url.includes("redbus.in") || url.includes("booking")) {
      quickScore += 1500;
    }

    // Return null if no quick decision can be made
    return quickScore > 1000
      ? { score: quickScore, method: "URL_PATTERN", confidence: "MEDIUM" }
      : null;
  }

  /**
   * Enhanced bulletproof detection with optimizations
   */
  async optimizedBulletproofDetection(session, sessionId) {
    try {
      const pages = await session.browser.pages();
      if (pages.length === 0) return { tabIndex: 0, page: null };

      // **NEW: Check for activity lock first**
      const activityLock = this.hasActivityLock(sessionId);
      if (activityLock) {
        // Find the locked tab and return it if it still exists
        const lockedTabIndex = pages.findIndex((page) => {
          const targetId = page.target()._targetId;
          return targetId === activityLock.tabId;
        });

        if (lockedTabIndex !== -1) {
          // this.logger.info(`🔒 Activity lock active - staying on tab ${lockedTabIndex} (${activityLock.reason})`);
          return {
            tabIndex: lockedTabIndex,
            page: pages[lockedTabIndex],
            lockReason: activityLock.reason,
          };
        } else {
          // Locked tab no longer exists, clear the lock
          this.clearActivityLock(sessionId);
        }
      }

      let bestTab = { index: 0, score: 0, page: pages[0], method: "DEFAULT" };
      const evaluationPromises = [];

      // Process tabs in parallel for better performance
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];

        evaluationPromises.push(
          this.evaluateTabForAutomation(page, i, sessionId),
        );
      }

      // Wait for all evaluations
      const tabResults = await Promise.allSettled(evaluationPromises);

      // Find best tab from results
      tabResults.forEach((result, index) => {
        if (
          result.status === "fulfilled" &&
          result.value.score > bestTab.score
        ) {
          bestTab = {
            index,
            score: result.value.score,
            page: pages[index],
            method: result.value.method,
            confidence: result.value.confidence,
          };
        }
      });

      // **NEW: Set activity lock if high automation activity detected**
      const targetId = bestTab.page.target()._targetId;
      if (bestTab.score > 10000 && bestTab.method.includes("AUTOMATION")) {
        this.setActivityLock(
          sessionId,
          targetId,
          `high_automation_${bestTab.method}`,
        );
      } else if (bestTab.score > 7000 && bestTab.method.includes("IMMEDIATE")) {
        this.setActivityLock(
          sessionId,
          targetId,
          `immediate_activity_${bestTab.method}`,
        );
      } else if (bestTab.method.includes("GITHUB_SEARCH")) {
        this.setActivityLock(sessionId, targetId, "github_search_activity");
      }

      // Update session activity state
      const hasRecentActivity =
        bestTab.method === "RECENT_INTERACTION" ||
        bestTab.method === "AUTOMATION_MARKER";
      this.updateSessionActivity(sessionId, bestTab.score, hasRecentActivity);

      //   this.logger.info(`🎯 OPTIMIZED tab detection:`, {
      //     index: bestTab.index,
      //     score: bestTab.score,
      //     method: bestTab.method,
      //     confidence: bestTab.confidence,
      //     url: bestTab.page.url().substring(0, 100)
      //   });

      return { tabIndex: bestTab.index, page: bestTab.page };
    } catch (error) {
      this.logger.error("Optimized tab detection failed:", error);
      const pages = await session.browser.pages();
      return { tabIndex: 0, page: pages[0] || null };
    }
  }

  /**
   * Evaluate individual tab for automation activity
   */
  async evaluateTabForAutomation(page, tabIndex, sessionId) {
    try {
      const url = page.url();
      const title = await page.title();

      // Skip system pages
      if (!url || url === "about:blank" || url.startsWith("chrome://")) {
        return { score: 0, method: "SKIPPED", confidence: "LOW" };
      }

      const targetId = page.target()._targetId;

      // Get cached automation activity
      const automationActivity = await this.getCachedAutomationActivity(
        page,
        targetId,
      );

      // Try quick scoring first
      const quickResult = this.getQuickScore(automationActivity, url, title);
      if (quickResult && quickResult.confidence === "HIGH") {
        return quickResult;
      }

      // Full scoring for complex cases
      return this.calculateFullScore(automationActivity, url, title);
    } catch (error) {
      return { score: 0, method: "ERROR", confidence: "LOW" };
    }
  }

  /**
   * Full scoring algorithm (same as enhanced version but optimized)
   */
  calculateFullScore(automationActivity, url, title) {
    let score = 100; // Base score
    let method = "FULL_SCORING";
    let confidence = "MEDIUM";

    if (automationActivity) {
      // **ENHANCED: Much stronger automation activity scoring**
      if (
        automationActivity.hasAutomationMarker ||
        automationActivity.browserUseActive
      ) {
        score += 8000; // Significantly increased from 6000
        method = "AUTOMATION_MARKER";
        confidence = "HIGH";
      }

      // **ENHANCED: Additional automation progress scoring**
      if (automationActivity.automationInProgress) {
        score += 7000; // High score for active automation
        confidence = "HIGH";
      }

      // **ENHANCED: Form and search activity scoring**
      if (automationActivity.formActivity) {
        score += 5000; // High score for form interactions
        method = "FORM_AUTOMATION";
        confidence = "HIGH";
      }

      if (automationActivity.searchActivity) {
        score += 4500; // High score for search interactions
        method = "SEARCH_AUTOMATION";
        confidence = "HIGH";

        // Extra bonus for very recent search activity
        const searchAge = Date.now() - (automationActivity.lastSearchTime || 0);
        if (searchAge < 3000) {
          score += 2000;
        }
      }

      if (automationActivity.recentDomChanges < 5000) score += 6000; // Increased from 5000
      if (automationActivity.recentInteraction < 10000) score += 5500; // Increased from 4500
      if (automationActivity.isProcessing) score += 5000; // Increased from 4000
      if (automationActivity.hasActiveForm) score += 4000; // Increased from 3000

      // **ENHANCED: Much stronger time-based scoring for immediate activity**
      const timeSinceActivity = Date.now() - automationActivity.lastActivity;
      if (timeSinceActivity < 1000) {
        score += 10000; // Massive boost for immediate activity (within 1 second)
        confidence = "HIGH";
        method = "IMMEDIATE_ACTIVITY";
      } else if (timeSinceActivity < 3000) {
        score += 8000; // Increased from 7500 - recent activity (within 3 seconds)
        confidence = "HIGH";
        method = "RECENT_ACTIVITY";
      } else if (timeSinceActivity < 5000) {
        score += 6000; // Increased from 6000
      } else if (timeSinceActivity < 15000) {
        score += 3500; // Increased from 3500
      }

      // **ENHANCED: Strong bonus for search/navigation activity**
      if (
        url.includes("/search") ||
        url.includes("?q=") ||
        url.includes("&q=")
      ) {
        score += 3000; // Increased from 3000 - major bonus for search pages
        method = "SEARCH_ACTIVITY";
      }
    }

    // **ENHANCED: Better URL-based scoring with GitHub priority**
    if (url.includes("github.com")) {
      score += 2500; // Much higher priority for GitHub
      if (url.includes("/search")) {
        score += 3000; // Extra massive bonus for GitHub search
        method = "GITHUB_SEARCH_ACTIVITY";
        confidence = "HIGH";
      }
    }

    // **ENHANCED: Reduce YouTube priority when automation is elsewhere**
    if (url.includes("youtube.com")) {
      score += 500; // Further reduced from 800
      // Apply stronger penalty if this seems like background/idle activity
      if (
        !automationActivity?.hasAutomationMarker &&
        !automationActivity?.browserUseActive &&
        !automationActivity?.automationInProgress &&
        (!automationActivity?.lastActivity ||
          Date.now() - automationActivity.lastActivity > 10000)
      ) {
        score -= 1000; // Increased penalty for idle YouTube
      }
    }

    if (url.includes("redbus.in") || url.includes("booking")) {
      score += 1800; // Keep high for booking sites
    }

    // **ENHANCED: Title-based scoring**
    if (title) {
      if (
        title.toLowerCase().includes("search") ||
        title.toLowerCase().includes("results")
      ) {
        score += 1500;
      }
      if (title.toLowerCase().includes("github")) {
        score += 1000;
      }
    }

    return { score, method, confidence };
  }

  /**
   * Clean up cache periodically
   */
  cleanupCache() {
    const now = Date.now();
    const maxAge = 10000; // 10 seconds

    for (const [key, cached] of this.automationCache.entries()) {
      if (now - cached.timestamp > maxAge) {
        this.automationCache.delete(key);
      }
    }

    // Clean up session states
    for (const [sessionId, state] of this.sessionStates.entries()) {
      if (now - state.lastUpdate > 60000) {
        // 1 minute
        this.sessionStates.delete(sessionId);
      }
    }

    // **NEW: Clean up expired activity locks**
    for (const [sessionId, lock] of this.activityLocks.entries()) {
      if (now > lock.lockUntil) {
        this.activityLocks.delete(sessionId);
      }
    }
  }
}

export default OptimizedTabDetection;
