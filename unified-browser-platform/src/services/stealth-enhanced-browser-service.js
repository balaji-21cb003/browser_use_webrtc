/**
 * Stealth-Enhanced Browser Service
 * Integrates stealth anti-detection with existing browser streaming service
 */

import { StealthBrowserManager, STEALTH_CONFIG } from "./stealth/index.js";
import { Logger } from "../utils/logger.js";

export class StealthEnhancedBrowserService {
  constructor(originalBrowserService) {
    this.originalService = originalBrowserService;
    this.stealthManager = new StealthBrowserManager();
    this.logger = new Logger("StealthEnhancedBrowserService");
    this.stealthSessions = new Map(); // Ensure stealthSessions is always a Map
    this.socketServer = null; // Will be set by server.js
    this.isInitialized = false;
  }

  /**
   * Set the Socket.IO server instance for broadcasting tab updates
   */
  setSocketServer(socketServer) {
    this.socketServer = socketServer;
    this.logger.info("🔌 Socket.IO server reference set for tab broadcasting");
  }

  /**
   * Broadcast tab updates to all connected clients for a session
   */
  broadcastTabUpdate(sessionId, reason = "Tab update") {
    if (!this.socketServer) {
      this.logger.debug(
        `📡 No socket server available for broadcasting tab update: ${reason}`,
      );
      return;
    }

    try {
      const tabs = this.getTabsList(sessionId);
      const activeTab = this.getActiveTab(sessionId);

      // Broadcast to all clients in the session room
      this.socketServer.to(sessionId).emit("available-tabs", {
        sessionId,
        tabs,
        activeTabId: activeTab?.id || null,
      });

      this.logger.info(
        `📡 Broadcasted tab update to session ${sessionId}: ${tabs.length} tabs (${reason})`,
      );
    } catch (error) {
      this.logger.warn(
        `⚠️ Failed to broadcast tab update for session ${sessionId}:`,
        error.message,
      );
    }
  }

  /**
   * Initialize the stealth-enhanced service
   */
  async initialize() {
    try {
      this.logger.info("🕵️ Initializing Stealth-Enhanced Browser Service...");

      // Initialize stealth manager
      await this.stealthManager.initialize();

      // Initialize original service if not already done
      if (this.originalService && !this.originalService.isInitialized) {
        await this.originalService.initialize();
      }

      this.isInitialized = true;
      this.logger.info(
        "✅ Stealth-Enhanced Browser Service initialized successfully",
      );
    } catch (error) {
      this.logger.error(
        "❌ Failed to initialize Stealth-Enhanced Browser Service:",
        error,
      );
      throw error;
    }
  }

  /**
   * Create browser session with stealth capabilities
   */
  async createSessionWithSeparateBrowser(sessionId, options = {}) {
    try {
      // Check if stealth is requested (default: true for production)
      const enableStealth =
        options.enableStealth !== false &&
        process.env.DISABLE_STEALTH !== "true";

      if (enableStealth) {
        this.logger.info(`🕵️ Creating stealth browser session: ${sessionId}`);

        // Create stealth session
        const stealthSession = await this.stealthManager.createStealthSession(
          sessionId,
          options,
        );

        // Store stealth session info
        this.stealthSessions.set(sessionId, {
          isStealthEnabled: true,
          stealthSession: stealthSession,
          createdAt: new Date(),
        });

        // Create a wrapper that looks like the original browser session
        const browserSession = {
          id: sessionId,
          browser: stealthSession.browser,
          page: stealthSession.page,
          context: stealthSession.context,
          browserWSEndpoint: stealthSession.browser.wsEndpoint(),
          createdAt: stealthSession.createdAt,
          lastActivity: stealthSession.lastActivity,
          streaming: false,
          mouseButtonState: new Set(),

          // Stealth-specific properties
          stealthEnabled: true,
          userAgent: stealthSession.userAgent,
          viewport: stealthSession.viewport,
          humanMouse: stealthSession.humanMouse,
          humanTyping: stealthSession.humanTyping,

          // Stealth-enhanced methods
          navigate: async (url, options) => {
            return await this.stealthManager.navigateStealthily(
              sessionId,
              url,
              options,
            );
          },

          click: async (selector, options) => {
            return await this.stealthManager.clickStealthily(
              sessionId,
              selector,
              options,
            );
          },

          type: async (selector, text, options) => {
            return await this.stealthManager.typeStealthily(
              sessionId,
              selector,
              text,
              options,
            );
          },

          screenshot: async (options) => {
            return await this.stealthManager.takeStealthScreenshot(
              sessionId,
              options,
            );
          },
        };

        // CRITICAL: Register stealth session with original browser service for streaming compatibility
        if (this.originalService && this.originalService.sessions) {
          // Create simple session structure matching the working reference
          const target = stealthSession.page.target();
          const client = await target.createCDPSession();
          await client.send("Page.enable");
          await client.send("Runtime.enable");
          await client.send("DOM.enable");

          const simpleSession = {
            id: sessionId,
            browser: stealthSession.browser,
            page: stealthSession.page,
            client: client, // Direct CDP client reference - this is key!
            browserWSEndpoint: stealthSession.browser.wsEndpoint(),
            cdpPort:
              stealthSession.browser.wsEndpoint().match(/:(\d+)/)?.[1] ||
              "9222",
            streaming: false,
            streamCallback: null,
            viewport: stealthSession.viewport || {
              width: parseInt(process.env.BROWSER_WIDTH) || 1920,
              height: parseInt(process.env.BROWSER_HEIGHT) || 1080,
            },
            createdAt: stealthSession.createdAt,
            lastActivity: Date.now(),
            mouseButtonState: new Set(),

            // Stealth-specific properties
            stealthEnabled: true,
            userAgent: stealthSession.userAgent,
            humanMouse: stealthSession.humanMouse,
            humanTyping: stealthSession.humanTyping,

            // Tab management (simplified for stealth compatibility)
            tabs: new Map(),
            activeTabId: null,
            lastTabSwitchTime: new Date(),
          };

          this.originalService.sessions.set(sessionId, simpleSession);

          // Add simpleSession reference to stealth session info for getTabsList access
          const stealthInfo = this.stealthSessions.get(sessionId);
          if (stealthInfo) {
            stealthInfo.simpleSession = simpleSession;
          }

          // Initialize tab tracking for stealth session (enhanced)
          const targetId = stealthSession.page.target()._targetId;
          this.logger.info(
            `🔧 [TAB TRACKING] Initial tab registered with FULL ID: ${targetId}`,
          );

          simpleSession.tabs.set(targetId, {
            page: stealthSession.page,
            title: "🕵️ Stealth Tab",
            url: "about:blank",
            isActive: true,
            createdAt: new Date(),
            lastActiveAt: new Date(),
          });
          simpleSession.activeTabId = targetId;
          simpleSession.currentTabId = targetId;

          // **INJECT BROWSER-USE TRACKERS INTO INITIAL PAGE**
          await this.injectBrowserUseTrackers(stealthSession.page);

          // Set up enhanced tab tracking for stealth sessions
          this.logger.info(
            `🔧 [TAB TRACKING] Setting up targetcreated listener for session ${sessionId}`,
          );

          stealthSession.browser.on("targetcreated", async (target) => {
            if (target.type() === "page") {
              this.logger.info(
                `🆕 [TAB TRACKING] New stealth tab created in session ${sessionId}: ${target.url()}`,
              );

              try {
                const newPage = await target.page();
                if (newPage) {
                  const newTargetId = target._targetId;

                  this.logger.info(
                    `🆕 [TAB TRACKING] Processing new page with FULL ID: ${newTargetId}`,
                  );

                  // **INJECT BROWSER-USE TRACKERS IMMEDIATELY**
                  await this.injectBrowserUseTrackers(newPage);

                  // Add to tabs registry with proper title and URL tracking
                  simpleSession.tabs.set(newTargetId, {
                    page: newPage,
                    title: (await newPage.title()) || "New Tab",
                    url: newPage.url(),
                    isActive: false,
                    createdAt: new Date(),
                    lastActiveAt: new Date(),
                  });

                  this.logger.info(
                    `📋 [TAB TRACKING] Added tab to registry. Total tabs now: ${simpleSession.tabs.size}`,
                  ); // Check if this is a real URL and should become the active tab
                  const initialUrl = newPage.url();
                  if (
                    initialUrl &&
                    initialUrl !== "about:blank" &&
                    !initialUrl.startsWith("chrome-extension://") &&
                    !initialUrl.startsWith("chrome://")
                  ) {
                    this.logger.info(
                      `🚀 Auto-switching to new stealth tab ${newTargetId.substring(0, 8)}: ${initialUrl}`,
                    );

                    // Mark all other tabs as inactive
                    for (const [
                      tabId,
                      tabInfo,
                    ] of simpleSession.tabs.entries()) {
                      tabInfo.isActive = tabId === newTargetId;
                    }

                    // Update active tab
                    simpleSession.activeTabId = newTargetId;
                    simpleSession.currentTabId = newTargetId; // Keep both for consistency
                    simpleSession.page = newPage;

                    // **IMPORTANT**: Notify streaming service about tab switch
                    if (
                      this.originalService &&
                      this.originalService.switchToTab
                    ) {
                      try {
                        await this.originalService.switchToTab(
                          sessionId,
                          newTargetId,
                          false,
                        );
                        this.logger.info(
                          `🎬 Updated streaming to follow new active tab: ${newTargetId.substring(0, 8)}`,
                        );
                      } catch (error) {
                        this.logger.warn(
                          `⚠️ Failed to update streaming for tab switch:`,
                          error.message,
                        );
                      }
                    }

                    // Update CDP client
                    try {
                      simpleSession.client = await newPage
                        .target()
                        .createCDPSession();
                      await simpleSession.client.send("Page.enable");
                      await simpleSession.client.send("Runtime.enable");
                      await simpleSession.client.send("DOM.enable");
                    } catch (error) {
                      this.logger.warn(
                        `⚠️ Failed to create CDP client for new tab:`,
                        error.message,
                      );
                    }
                  }

                  // Set up navigation listener for title/URL updates
                  newPage.on("framenavigated", async (frame) => {
                    if (frame === newPage.mainFrame()) {
                      const tabInfo = simpleSession.tabs.get(newTargetId);
                      if (tabInfo) {
                        try {
                          tabInfo.url = newPage.url();
                          tabInfo.title =
                            (await newPage.title()) || "Loading...";
                          this.logger.debug(
                            `📝 Updated tab ${newTargetId.substring(0, 8)}: ${tabInfo.title}`,
                          );
                        } catch (error) {
                          this.logger.debug(
                            `⚠️ Failed to update tab info:`,
                            error.message,
                          );
                        }
                      }
                    }
                  });

                  this.logger.info(
                    `📋 Registered new stealth tab: ${newTargetId.substring(0, 8)} (Total tabs: ${simpleSession.tabs.size})`,
                  );

                  // Notify frontend about new tab
                  this.broadcastTabUpdate(sessionId, "New tab created");
                }
              } catch (error) {
                this.logger.warn(
                  `⚠️ Failed to handle new target in stealth session ${sessionId}:`,
                  error.message,
                );
              }
            }
          });

          // Add periodic bulletproof tab detection
          const tabDiscoveryInterval = setInterval(async () => {
            try {
              // Use bulletproof detection for stable tab switching
              await this.bulletproofTabDetection(sessionId, simpleSession);
            } catch (error) {
              this.logger.error(`Tab discovery error: ${error.message}`);
            }
          }, 2500); // Stable 2.5-second intervals to prevent ping-ponging

          // Store interval for cleanup
          if (!simpleSession.intervals) {
            simpleSession.intervals = [];
          }
          simpleSession.intervals.push(tabDiscoveryInterval);

          // **DISABLED**: Add listener for tab activation/focus changes (causes rapid switching)
          /*
          stealthSession.browser.on("targetchanged", async (target) => {
            if (target.type() === "page") {
              try {
                const page = await target.page();
                if (page && !page.isClosed()) {
                  const targetId = target._targetId;
                  const tabInfo = simpleSession.tabs.get(targetId);

                  if (tabInfo) {
                    // Check if this tab is now the active one (by checking if it's focused)
                    const isActive = await page
                      .evaluate(() => document.hasFocus())
                      .catch(() => false);

                    if (isActive && simpleSession.currentTabId !== targetId) {
                      this.logger.info(
                        `🎯 Tab focus changed to: ${targetId.substring(0, 8)} (${tabInfo.title})`,
                      );

                      // Mark all tabs as inactive
                      for (const [
                        tabId,
                        tabInfoItem,
                      ] of simpleSession.tabs.entries()) {
                        tabInfoItem.isActive = tabId === targetId;
                      }

                      // Update current active tab
                      const previousTabId = simpleSession.currentTabId;
                      simpleSession.currentTabId = targetId;
                      simpleSession.activeTabId = targetId;
                      simpleSession.page = page;

                      // Update streaming service to follow the active tab (high priority for browser-use agent)
                      if (
                        this.originalService &&
                        this.originalService.switchToTab &&
                        previousTabId !== targetId
                      ) {
                        try {
                          // Immediate streaming update for browser-use agent tab change
                          await this.originalService.switchToTab(
                            sessionId,
                            targetId,
                            false, // Not manual, this is browser-use agent driven
                          );
                          
                          // Force streaming synchronization with triple-check
                          const ensureStreamingSync = async () => {
                            for (let attempt = 0; attempt < 3; attempt++) {
                              try {
                                await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1))); // Incremental delay
                                await this.originalService.switchToTab(
                                  sessionId,
                                  targetId,
                                  false,
                                );
                                this.logger.debug(
                                  `✅ [SYNC] Streaming sync attempt ${attempt + 1} successful for browser-use tab: ${targetId.substring(0, 8)}`,
                                );
                                break; // Exit loop on success
                              } catch (syncError) {
                                this.logger.warn(
                                  `⚠️ Streaming sync attempt ${attempt + 1} failed:`,
                                  syncError.message,
                                );
                                if (attempt === 2) {
                                  this.logger.error(
                                    `❌ All streaming sync attempts failed for tab: ${targetId.substring(0, 8)}`,
                                  );
                                }
                              }
                            }
                          };
                          
                          // Run sync in background
                          ensureStreamingSync();
                          
                          this.logger.info(
                            `🎬 [BROWSER-USE] Streaming switched to follow agent's active tab: ${targetId.substring(0, 8)}`,
                          );
                        } catch (error) {
                          this.logger.warn(
                            `⚠️ Failed to update streaming for tab focus:`,
                            error.message,
                          );
                        }
                      }

                      // Notify frontend about active tab change
                      this.broadcastTabUpdate(sessionId, "Tab focus changed");
                    }
                  }
                }
              } catch (error) {
                this.logger.debug(
                  `⚠️ Failed to handle target change in stealth session:`,
                  error.message,
                );
              }
            }
          });
          */

          this.logger.info(
            `🔗 Stealth session registered with original browser service for streaming: ${sessionId}`,
          );
          this.logger.info(
            `🎬 CDP streaming capabilities initialized for session: ${sessionId}`,
          );
        }

        this.logger.info(`✅ Stealth browser session created: ${sessionId}`);
        return browserSession;
      } else {
        // Use original service without stealth
        this.logger.info(`🔧 Creating regular browser session: ${sessionId}`);
        return await this.originalService.createSessionWithSeparateBrowser(
          sessionId,
          options,
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Failed to create browser session ${sessionId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Bulletproof tab detection using browser.targets() - scans all tabs directly
   */
  async bulletproofTabDetection(sessionId, simpleSession) {
    if (!simpleSession || !simpleSession.browser) return;

    // Skip automatic switching if manual override is active
    if (
      simpleSession.manualOverride &&
      Date.now() - simpleSession.manualOverride < 3000
    ) {
      return;
    } else if (simpleSession.manualOverride) {
      // Manual override expired - clear it
      delete simpleSession.manualOverride;
    }

    try {
      // Get ALL targets from browser directly
      const allTargets = await simpleSession.browser.targets();
      const pageTargets = allTargets.filter(
        (target) => target.type() === "page",
      );

      let bestTarget = null;
      let bestScore = 0;
      let bestUrl = "";

      for (const target of pageTargets) {
        try {
          const page = await target.page();
          if (!page) continue;

          const targetId = target._targetId;
          const url = page.url();
          const title = await page.title();

          // Skip empty/system pages for scoring
          if (
            !url ||
            url === "about:blank" ||
            url.startsWith("chrome://") ||
            url.startsWith("chrome-extension://")
          ) {
            continue;
          }

          // Update tab registry
          if (!simpleSession.tabs.has(targetId)) {
            simpleSession.tabs.set(targetId, {
              page: page,
              title: title,
              url: url,
              isActive: false,
              createdAt: new Date(),
              lastActiveAt: new Date(),
            });
          } else {
            // Update existing tab info
            const tabInfo = simpleSession.tabs.get(targetId);
            const urlChanged = tabInfo.url !== url;
            tabInfo.title = title;
            tabInfo.url = url;
            tabInfo.page = page;

            // If URL changed, update the last active time (this tab is being used)
            if (urlChanged && url !== "about:blank") {
              tabInfo.lastActiveAt = new Date();
            }
          }

          // Priority scoring
          let score = 100; // Base score

          // **UNIVERSAL AUTOMATION DETECTION - Works for all tasks and websites**
          try {
            const automationActivity = await page.evaluate(() => {
              const now = Date.now();

              // **1. DETECT ACTUAL BROWSER-USE ACTIVITY**
              const browserUseMarkers = {
                lastAction: window.browserUseLastAction || 0,
                isActive: window.browserUseActive || false,
                automationProgress: window.automationInProgress || false,
                lastInteraction: window.lastInteractionTime || 0,
                lastDomChange: window.lastDomModification || 0,
              };

              // **2. DETECT RECENT INTERACTIONS (Universal for all automation)**
              const recentActivity = {
                clicks: now - browserUseMarkers.lastInteraction < 5000,
                domChanges: now - browserUseMarkers.lastDomChange < 3000,
                browserUseAction: now - browserUseMarkers.lastAction < 3000,
                anyRecentActivity: Math.min(
                  browserUseMarkers.lastInteraction,
                  browserUseMarkers.lastDomChange,
                  browserUseMarkers.lastAction,
                ),
              };

              // **3. DETECT PAGE STATE (Critical for accurate detection)**
              const pageState = {
                isVisible: document.visibilityState === "visible",
                hasFocus: document.hasFocus(),
                isActiveElement:
                  document.activeElement &&
                  document.activeElement !== document.body,
                hasInputFocus:
                  document.activeElement &&
                  ["input", "textarea", "select"].includes(
                    document.activeElement.tagName?.toLowerCase(),
                  ),
                isLoading: document.readyState === "loading",
              };

              // **4. DETECT AUTOMATION SIGNATURES (Browser-use specific patterns)**
              const automationSignatures = {
                hasAutomationMarkers: !!(
                  window.browserUseActive ||
                  window._browserUse ||
                  document.querySelector("[data-browser-use]")
                ),
                hasAutomationClasses: !!document.querySelector(
                  ".browser-use-target, .automation-highlight, [automation-target]",
                ),
                hasFormActivity: !!document.querySelector(
                  "input:focus, textarea:focus, select:focus",
                ),
                hasClickTargets: !!document.querySelector(
                  '[data-testid], [aria-label], button, a, input[type="submit"]',
                ),
                hasRecentFormChanges: !!document.querySelector(
                  'input[value]:not([value=""]), textarea:not(:empty)',
                ),
              };

              // **5. CALCULATE ACTIVITY RECENCY (Universal timing detection)**
              const timings = {
                lastActivityTime: Math.max(
                  browserUseMarkers.lastAction,
                  browserUseMarkers.lastInteraction,
                  browserUseMarkers.lastDomChange,
                ),
                timeSinceLastActivity:
                  now -
                  Math.max(
                    browserUseMarkers.lastAction,
                    browserUseMarkers.lastInteraction,
                    browserUseMarkers.lastDomChange,
                  ),
              };

              return {
                // Activity markers
                ...browserUseMarkers,
                // Recent activity flags
                ...recentActivity,
                // Page state
                ...pageState,
                // Automation signatures
                ...automationSignatures,
                // Timing info
                ...timings,
                // Page info for debugging
                title: document.title,
                url: window.location.href,
                timestamp: now,
              };
            });

            // **UNIVERSAL SCORING SYSTEM - Prioritizes CURRENT ACTIVITY over OLD MARKERS**
            let automationScore = 0;

            // **SUPREME PRIORITY: Current form/input activity (OVERRIDE EVERYTHING)**
            if (
              automationActivity.hasFormActivity ||
              automationActivity.hasInputFocus
            ) {
              // Current form interaction gets MASSIVE priority regardless of time
              if (automationActivity.hasFormActivity) automationScore += 12000; // SUPREME priority for current form work
              if (automationActivity.hasInputFocus) automationScore += 8000; // MASSIVE priority for current input focus
              if (automationActivity.isActiveElement) automationScore += 4000; // Additional for active elements

              // Boost further if visible and has focus
              if (automationActivity.isVisible && automationActivity.hasFocus) {
                automationScore += 5000; // Extra boost for visible current work
              }

              // this.logger.info(
              //   `🔥 CURRENT FORM/INPUT ACTIVITY: ${title.substring(0, 40)}... - Form:${automationActivity.hasFormActivity} Input:${automationActivity.hasInputFocus}`,
              // );
            }
            // **HIGHEST PRIORITY: Active browser-use automation with visible page**
            else if (
              automationActivity.isVisible &&
              automationActivity.hasFocus
            ) {
              // Real-time automation activity (within 3 seconds)
              if (automationActivity.timeSinceLastActivity < 3000) {
                automationScore += 8000; // Massive priority for active automation
                this.logger.debug(
                  `🚀 ACTIVE AUTOMATION: ${title} - Recent activity: ${automationActivity.timeSinceLastActivity}ms ago`,
                );
              }
              // Very recent automation activity (within 5 seconds)
              else if (automationActivity.timeSinceLastActivity < 5000) {
                automationScore += 6000; // Very high priority
              }
              // Recent automation activity (within 10 seconds)
              else if (automationActivity.timeSinceLastActivity < 10000) {
                automationScore += 4000; // High priority
              }

              // REDUCED bonuses for old automation markers (don't override current work)
              if (
                automationActivity.hasAutomationMarkers &&
                automationActivity.timeSinceLastActivity < 5000
              ) {
                automationScore += 1000; // Only if recent (reduced from 2000)
              }
            }
            // **MEDIUM PRIORITY: Automation activity on non-visible tabs (background)**
            else if (automationActivity.timeSinceLastActivity < 3000) {
              automationScore += 3000; // Still significant for recent activity
              if (automationActivity.hasAutomationMarkers)
                automationScore += 500; // Reduced bonus for background old markers
            }
            // **LOW PRIORITY: Older automation activity**
            else if (automationActivity.timeSinceLastActivity < 15000) {
              automationScore += 500; // Reduced priority for old activity (was 1000)
            }

            score += automationScore;

            // **ENHANCED LOGGING: Log all significant automation activity**
            // if (
            //   automationScore > 2000 ||
            //   automationActivity.timeSinceLastActivity < 5000
            // ) {
            //   this.logger.info(
            //     `🤖 UNIVERSAL AUTOMATION: ${title.substring(0, 40)}... | ${url.substring(0, 50)}...`,
            //   );
            //   this.logger.info(
            //     `   📊 Score: ${automationScore} | Total: ${score} | Activity: ${automationActivity.timeSinceLastActivity}ms ago`,
            //   );
            //   this.logger.info(
            //     `   👁️  Visible: ${automationActivity.isVisible} | Focus: ${automationActivity.hasFocus} | Input: ${automationActivity.hasInputFocus}`,
            //   );
            //   this.logger.info(
            //     `   🎯 Markers: ${automationActivity.hasAutomationMarkers} | Forms: ${automationActivity.hasFormActivity} | Recent: ${automationActivity.timeSinceLastActivity < 3000}`,
            //   );
            // }
          } catch (e) {
            // Ignore evaluation errors but log them for debugging
            this.logger.debug(
              `❌ Universal automation detection failed for ${title}: ${e.message}`,
            );
          }

          // **UNIVERSAL CONTENT-BASED SCORING (No task-specific logic)**
          // Base URL quality scoring (non-automation dependent)
          let contentScore = 0;

          // Penalty for system/empty pages (universal)
          if (
            url === "about:blank" ||
            url.startsWith("chrome://") ||
            url.startsWith("chrome-extension://")
          ) {
            contentScore -= 1000;
          }
          // Moderate bonus for real web content (universal)
          else if (url.startsWith("https://") || url.startsWith("http://")) {
            contentScore += 200; // Base score for real web content
          }

          // **NAVIGATION RECENCY (Universal for all automation)**
          const tabInfo = simpleSession.tabs.get(targetId);
          if (tabInfo && tabInfo.lastActiveAt) {
            const timeSinceUpdate = Date.now() - tabInfo.lastActiveAt.getTime();
            if (timeSinceUpdate < 2000)
              contentScore += 1500; // Very recent navigation (2 seconds)
            else if (timeSinceUpdate < 5000)
              contentScore += 1000; // Recent navigation (5 seconds)
            else if (timeSinceUpdate < 15000)
              contentScore += 500; // Moderately recent (15 seconds)
            else if (timeSinceUpdate < 30000) contentScore += 200; // Still relevant (30 seconds)
          }

          score += contentScore;

          // **DEBUG: Comprehensive scoring breakdown for high-scoring tabs**
          const totalAutomationScore = score - 100 - contentScore; // Subtract base + content scores
          if (score > 1000) {
            this.logger.info(
              `📊 TAB SCORING: ${title.substring(0, 30)}... | Total: ${score}`,
            );
            this.logger.info(
              `   🤖 Automation: ${totalAutomationScore} | 📄 Content: ${contentScore} | 🕐 Age: ${tabInfo ? Math.floor((Date.now() - tabInfo.lastActiveAt.getTime()) / 1000) : 0}s`,
            );
          }

          if (score > bestScore) {
            bestScore = score;
            bestTarget = target;
            bestUrl = url;
          }

          // **DEBUG: Log all tab scores for debugging**
          // this.logger.info(
          //   `🎯 TAB SCORE: ${title.substring(0, 40)}... | ${url.substring(0, 60)}... | Score: ${score}`,
          // );
        } catch (error) {
          continue;
        }
      }

      // Switch to best target if found and different from current
      if (bestTarget && bestScore > 1000) {
        const targetId = bestTarget._targetId;

        if (targetId !== simpleSession.activeTabId) {
          // 🛡️ Check for manual switch protection
          const protection = simpleSession.manualSwitchProtection;
          if (
            protection &&
            Date.now() - protection.timestamp < protection.duration
          ) {
            this.logger.info(
              `🛡️ [MANUAL SWITCH PROTECTION] Automatic switch blocked - manual switch to ${protection.tabId.substring(0, 8)} is protected for ${Math.ceil((protection.duration - (Date.now() - protection.timestamp)) / 1000)}s more`,
            );
            return;
          }

          this.logger.info(
            `🚀 BULLETPROOF SWITCH: ${simpleSession.activeTabId} → ${targetId} (${bestUrl}) Score: ${bestScore}`,
          );

          // Update session state FIRST
          simpleSession.currentTabId = targetId;
          simpleSession.activeTabId = targetId;
          simpleSession.lastTabSwitchTime = Date.now();

          // Get the page for this target
          try {
            const targetPage = await bestTarget.page();
            simpleSession.page = targetPage;

            // **BULLETPROOF FIX: Direct streaming switch without circular calls**
            await this.directStreamingSwitch(sessionId, targetId, targetPage);

            this.logger.info(
              `🎬 [BULLETPROOF] Direct streaming switch completed for tab: ${targetId.substring(0, 8)} - ${bestUrl}`,
            );

            // **ADDITIONAL FIX: Force bring tab to front and ensure it's visible**
            try {
              await targetPage.bringToFront();
              this.logger.info(
                `🎯 [BULLETPROOF] Tab ${targetId.substring(0, 8)} brought to front successfully`,
              );
            } catch (error) {
              this.logger.warn(
                `⚠️ [BULLETPROOF] Failed to bring tab to front: ${error.message}`,
              );
            }
          } catch (error) {
            this.logger.warn(`⚠️ Failed to switch streaming: ${error.message}`);
          }

          // Broadcast tab update
          this.broadcastTabUpdate(sessionId, "Bulletproof tab detection");
        }
      }
    } catch (error) {
      this.logger.error(`Error in bulletproof tab detection: ${error.message}`);
    }
  }

  /**
   * Direct streaming switch without circular calls - specifically for bulletproof detection
   */
  async directStreamingSwitch(sessionId, targetId, targetPage) {
    try {
      this.logger.info(
        `🔄 [DIRECT STREAMING SWITCH] Starting switch to tab ${targetId.substring(0, 8)} for session ${sessionId}`,
      );

      const session = this.originalService.sessions.get(sessionId);
      if (!session) {
        this.logger.error(
          `❌ [DIRECT STREAMING SWITCH] Session ${sessionId} not found`,
        );
        return;
      }

      this.logger.info(
        `🔄 [DIRECT STREAMING SWITCH] Session found, streaming: ${session.streaming}, hasClient: ${!!session.client}`,
      );

      // Bring tab to front immediately
      await targetPage.bringToFront();
      this.logger.info(
        `🎯 [DIRECT STREAMING SWITCH] Tab brought to front successfully`,
      );

      // Update session references
      const oldActiveTabId = session.activeTabId;
      session.activeTabId = targetId;
      session.page = targetPage;

      this.logger.info(
        `🔄 [DIRECT STREAMING SWITCH] Session references updated: ${oldActiveTabId} → ${targetId}`,
      );

      // Update all tabs in session
      let tabCount = 0;
      for (const [tabId, tabInfo] of session.tabs.entries()) {
        tabInfo.isActive = tabId === targetId;
        if (tabId === targetId) {
          tabInfo.lastActiveAt = new Date();
        }
        tabCount++;
      }

      this.logger.info(
        `🔄 [DIRECT STREAMING SWITCH] Updated ${tabCount} tabs in session`,
      );

      // **CRITICAL: Update CDP client for streaming to follow this tab**
      if (session.streaming && session.client) {
        this.logger.info(
          `🎬 [DIRECT STREAMING SWITCH] Starting CDP streaming update...`,
        );
        try {
          // Stop current screencast
          await session.client.send("Page.stopScreencast").catch(() => {});
          this.logger.info(
            `🛑 [DIRECT STREAMING SWITCH] Stopped old screencast`,
          );

          // Create new CDP session for this tab
          const newClient = await targetPage.target().createCDPSession();
          await newClient.send("Page.enable");
          await newClient.send("Runtime.enable");
          await newClient.send("DOM.enable");
          this.logger.info(
            `🔗 [DIRECT STREAMING SWITCH] Created new CDP session and enabled domains`,
          );

          // Start screencast on new tab
          await newClient.send("Page.startScreencast", {
            format: "jpeg",
            quality: 95,
            maxWidth:
              session.viewport?.width ||
              parseInt(process.env.BROWSER_WIDTH) ||
              1920,
            maxHeight:
              session.viewport?.height ||
              parseInt(process.env.BROWSER_HEIGHT) ||
              1080,
            everyNthFrame: 1,
          });
          this.logger.info(
            `🎬 [DIRECT STREAMING SWITCH] Started new screencast`,
          );

          // Set up frame handler for new client
          newClient.on("Page.screencastFrame", async (params) => {
            try {
              await newClient.send("Page.screencastFrameAck", {
                sessionId: params.sessionId,
              });

              if (session.streamCallback && session.streaming) {
                session.streamCallback(params.data);
              }
            } catch (error) {
              // Ignore frame errors
            }
          });

          // Replace the client
          session.client = newClient;
          this.logger.info(
            `✅ [DIRECT STREAMING SWITCH] CDP client replaced - streaming now follows tab ${targetId.substring(0, 8)}`,
          );

          this.logger.info(
            `🎬 Direct streaming switch completed for tab: ${targetId.substring(0, 8)}`,
          );
        } catch (error) {
          this.logger.error(
            `❌ [DIRECT STREAMING SWITCH] Failed to update CDP streaming: ${error.message}`,
          );
        }
      } else {
        this.logger.warn(
          `⚠️ [DIRECT STREAMING SWITCH] Session not streaming or no client - streaming: ${session.streaming}, client: ${!!session.client}`,
        );
      }
    } catch (error) {
      this.logger.error(`❌ Direct streaming switch failed: ${error.message}`);
    }
  }

  /**
   * Mark browser-use activity on the current active tab
   */
  async markBrowserUseActivity(sessionId, actionType = "automation") {
    try {
      const session = this.originalService.sessions.get(sessionId);
      if (!session || !session.page) return;

      // Update browser-use activity markers on the current page
      await session.page.evaluate((type) => {
        window.browserUseLastAction = Date.now();
        window.lastInteractionTime = Date.now();
        window.browserUseActive = true;
        window.lastActionType = type;

        // Also trigger a small DOM modification to signal automation activity
        if (!document.getElementById("browser-use-activity-marker")) {
          const marker = document.createElement("div");
          marker.id = "browser-use-activity-marker";
          marker.style.display = "none";
          marker.setAttribute("data-browser-use", "active");
          marker.setAttribute("data-last-action", type);
          marker.setAttribute("data-timestamp", Date.now().toString());
          document.body.appendChild(marker);
        } else {
          const marker = document.getElementById("browser-use-activity-marker");
          marker.setAttribute("data-last-action", type);
          marker.setAttribute("data-timestamp", Date.now().toString());
        }

        console.log(
          `🤖 Browser-use activity marked: ${type} at ${new Date().toISOString()}`,
        );
      }, actionType);

      // Update tab activity time
      if (session.activeTabId && session.tabs) {
        const tabInfo = session.tabs.get(session.activeTabId);
        if (tabInfo) {
          tabInfo.lastActiveAt = new Date();
        }
      }
    } catch (error) {
      this.logger.debug(
        `⚠️ Failed to mark browser-use activity: ${error.message}`,
      );
    }
  }

  /**
   * Get enhanced tab information for stealth sessions
   */
  getStealthTabsList(sessionId) {
    const session = this.originalService.sessions.get(sessionId);
    if (!session) return [];

    const stealthInfo = this.stealthSessions.get(sessionId);
    const isStealthSession = stealthInfo?.isStealthEnabled;

    if (!isStealthSession) {
      // Delegate to original service for non-stealth sessions
      return this.originalService.getTabsList(sessionId);
    }

    // Enhanced tab list for stealth sessions
    const tabsList = [];
    for (const [targetId, tabInfo] of session.tabs.entries()) {
      tabsList.push({
        id: targetId,
        title: tabInfo.isStealthTab ? "🕵️ Stealth Tab" : tabInfo.title || "Tab",
        url: tabInfo.url || "about:blank",
        isActive: tabInfo.isActive || targetId === session.activeTabId,
        createdAt: tabInfo.createdAt,
        isStealthTab: tabInfo.isStealthTab || false,
      });
    }

    return tabsList;
  }

  /**
   * Delegate certain methods to original service with stealth enhancements
   */
  getTabsList(sessionId) {
    return this.getStealthTabsList(sessionId);
  }

  getSession(sessionId) {
    return this.originalService.getSession(sessionId);
  }

  getActiveTab(sessionId) {
    return this.originalService.getActiveTab(sessionId);
  }

  listSessions() {
    return this.originalService.listSessions();
  }

  /**
   * Enhanced tab switching that works with stealth sessions
   */
  async switchToTab(sessionId, targetTabId) {
    try {
      const stealthInfo = this.stealthSessions.get(sessionId);
      const session = this.originalService.sessions.get(sessionId);

      if (!stealthInfo || !session) {
        this.logger.warn(`❌ Session not found for tab switch: ${sessionId}`);
        return false;
      }

      // Get the tab info
      const tabInfo = session.tabs.get(targetTabId);
      if (!tabInfo) {
        this.logger.warn(
          `❌ Tab ${targetTabId} not found in session ${sessionId}`,
        );
        const availableTabs = Array.from(session.tabs.keys());
        this.logger.warn(`Available tab IDs: ${availableTabs.join(", ")}`);
        return false;
      }

      // Switch to the tab with immediate activation
      await tabInfo.page.bringToFront();

      // Force immediate focus for better streaming sync
      try {
        await tabInfo.page.focus();
        await tabInfo.page.evaluate(() => {
          window.focus();
          document.body.click(); // Ensure the page gets focus
        });
      } catch (focusError) {
        this.logger.debug(`⚠️ Focus enhancement failed: ${focusError.message}`);
      }

      // Update session state
      session.activeTabId = targetTabId;
      session.page = tabInfo.page;

      // Update tab states
      for (const [tabId, tabInfoEntry] of session.tabs.entries()) {
        tabInfoEntry.isActive = tabId === targetTabId;
        if (tabId === targetTabId) {
          tabInfoEntry.lastActiveAt = new Date();
        }
      }

      // Update CDP client for streaming if needed
      if (tabInfo.page) {
        try {
          session.client = await tabInfo.page.target().createCDPSession();
          await session.client.send("Page.enable");
          await session.client.send("Runtime.enable");
          await session.client.send("DOM.enable");
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to update CDP client for tab ${targetTabId}:`,
            error.message,
          );
        }
      }

      // **CRITICAL**: Ensure streaming follows the manually switched tab immediately
      if (this.originalService && this.originalService.switchToTab) {
        try {
          // Immediate streaming update for manual tab switch
          await this.originalService.switchToTab(sessionId, targetTabId, true); // Mark as manual

          // Force streaming synchronization for manual clicks
          setTimeout(async () => {
            try {
              await this.originalService.switchToTab(
                sessionId,
                targetTabId,
                true,
              );
              this.logger.info(
                `🎯 [MANUAL] Confirmed streaming sync for manually clicked tab: ${targetTabId.substring(0, 8)}`,
              );
            } catch (syncError) {
              this.logger.warn(
                `⚠️ Manual tab streaming sync confirmation failed:`,
                syncError.message,
              );
            }
          }, 200); // Quick confirmation sync

          this.logger.info(
            `🖱️ [MANUAL] Streaming immediately switched to manually clicked tab: ${targetTabId.substring(0, 8)}`,
          );
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to update streaming for manual tab switch:`,
            error.message,
          );
        }
      }

      // Broadcast the tab switch to frontend
      this.broadcastTabUpdate(sessionId, "Manual tab switch");

      this.logger.info(
        `✅ [MANUAL] Successfully switched to tab ${targetTabId.substring(0, 8)}... in session ${sessionId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `❌ Failed to switch to tab ${targetTabId} in session ${sessionId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get CDP endpoint for session
   */
  getCDPEndpoint(sessionId) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      const stealthSession = this.stealthManager.getSession(sessionId);
      if (stealthSession && stealthSession.browser) {
        const wsEndpoint = stealthSession.browser.wsEndpoint();
        this.logger.info(
          `🔗 Returning CDP endpoint for stealth session ${sessionId}: ${wsEndpoint}`,
        );
        return wsEndpoint;
      }
    }

    // Fall back to original service
    if (this.originalService && this.originalService.getCDPEndpoint) {
      return this.originalService.getCDPEndpoint(sessionId);
    }

    return null;
  }

  /**
   * Get debug port from browser instance
   */
  getDebugPort(browser) {
    try {
      const wsEndpoint = browser.wsEndpoint();
      const portMatch = wsEndpoint.match(/:(\d+)/);
      return portMatch ? portMatch[1] : "9222";
    } catch (error) {
      return "9222"; // Default port
    }
  }

  /**
   * Get session with stealth awareness
   */
  getSession(sessionId) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      // Check if session is registered with original service first
      if (this.originalService && this.originalService.sessions) {
        const registeredSession = this.originalService.sessions.get(sessionId);
        if (registeredSession) {
          return registeredSession;
        }
      }

      // Fallback: construct session from stealth manager
      const stealthSession = this.stealthManager.getSession(sessionId);
      if (!stealthSession) return null;

      const target = stealthSession.page.target();
      return {
        id: sessionId,
        browser: stealthSession.browser,
        page: stealthSession.page,
        context: stealthSession.context,
        browserWSEndpoint: stealthSession.browser.wsEndpoint(),
        createdAt: stealthSession.createdAt,
        lastActivity: stealthSession.lastActivity,
        streaming: false,
        mouseButtonState: new Set(),
        stealthEnabled: true,
        userAgent: stealthSession.userAgent,
        viewport: stealthSession.viewport,
        humanMouse: stealthSession.humanMouse,
        humanTyping: stealthSession.humanTyping,
        tabs: new Map([
          [
            target._targetId,
            {
              page: stealthSession.page,
              targetId: target._targetId,
              url: "about:blank",
              title: "Stealth Browser Tab",
              lastActivity: Date.now(),
              isActive: true,
            },
          ],
        ]),
        activeTabId: target._targetId,
        cdpSession: null,
        isStreamingReady: true,
      };
    }

    // Fall back to original service
    return this.originalService
      ? this.originalService.getSession(sessionId)
      : null;
  }

  /**
   * Close browser session with stealth cleanup
   */
  async closeBrowser(sessionId) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      // Clean up stealth session
      await this.stealthManager.destroySession(sessionId);
      this.stealthSessions.delete(sessionId);

      // Also remove from original browser service sessions
      if (this.originalService && this.originalService.sessions) {
        this.originalService.sessions.delete(sessionId);
        this.logger.info(
          `🗑️ Stealth session removed from original browser service: ${sessionId}`,
        );
      }

      this.logger.info(`🗑️ Stealth session closed: ${sessionId}`);
      return true;
    }

    // Fall back to original service
    if (this.originalService) {
      return await this.originalService.closeBrowser(sessionId);
    }

    return false;
  }

  /**
   * Take screenshot with stealth considerations
   */
  async getScreenshot(sessionId) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      return await this.stealthManager.takeStealthScreenshot(sessionId);
    }

    // Fall back to original service
    if (this.originalService) {
      return await this.originalService.getScreenshot(sessionId);
    }

    throw new Error(`Session ${sessionId} not found`);
  }

  /**
   * Start video streaming (delegate to original service)
   */
  async startVideoStreaming(sessionId, io) {
    if (this.originalService) {
      return await this.originalService.startVideoStreaming(sessionId, io);
    }
    throw new Error(
      "Original browser service not available for video streaming",
    );
  }

  /**
   * Stop video streaming (delegate to original service)
   */
  async stopVideoStreaming(sessionId) {
    if (this.originalService) {
      return await this.originalService.stopVideoStreaming(sessionId);
    }
    return false;
  }

  /**
   * Check if video streaming is active (delegate to original service)
   */
  isVideoStreaming(sessionId) {
    if (this.originalService) {
      return this.originalService.isVideoStreaming(sessionId);
    }
    return false;
  }

  /**
   * Reset mouse state (delegate to original service)
   */
  async resetMouseState(sessionId) {
    if (this.originalService) {
      return await this.originalService.resetMouseState(sessionId);
    }
    return { success: false, message: "Original service not available" };
  }

  /**
   * Get tabs list (stealth implementation with proper tab tracking)
   */
  getTabsList(sessionId) {
    // Debug logging to understand session structure
    // this.logger.info(
    //   `🔍 [DEBUG] getTabsList called for sessionId: ${sessionId}`,
    // );
    // this.logger.info(
    //   `🔍 [DEBUG] Available stealth sessions:`,
    //   Array.from(this.stealthSessions.keys()),
    // );

    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      // this.logger.info(
      //   `🔍 [DEBUG] Stealth session found, checking simpleSession...`,
      // );
      const simpleSession = stealthInfo.simpleSession;

      if (simpleSession) {
        // this.logger.info(`🔍 [DEBUG] SimpleSession exists, checking tabs...`);
        // this.logger.info(
        //   `🔍 [DEBUG] SimpleSession tabs type:`,
        //   typeof simpleSession.tabs,
        // );
        // this.logger.info(
        //   `🔍 [DEBUG] SimpleSession tabs size:`,
        //   simpleSession.tabs?.size || 0,
        // );
        // this.logger.info(
        //   `🔍 [DEBUG] SimpleSession structure keys:`,
        //   Object.keys(simpleSession),
        // );

        if (simpleSession.tabs) {
          // Convert tab registry to array format expected by frontend
          const tabs = [];
          this.logger.info(
            `🔍 [TAB DEBUG] Processing ${simpleSession.tabs.size} tabs from Map:`,
          );

          for (const [tabId, tabInfo] of simpleSession.tabs.entries()) {
            this.logger.info(
              `🔍 [TAB DEBUG] Tab ${tabId.substring(0, 8)}: title="${tabInfo.title}", url="${tabInfo.url}", active=${tabId === simpleSession.currentTabId}`,
            );

            tabs.push({
              id: tabId,
              title: tabInfo.title || "Stealth Browser Tab",
              url: tabInfo.url || "about:blank",
              active: tabId === simpleSession.currentTabId,
            });
          }

          this.logger.info(
            `📋 [STEALTH] Returning ${tabs.length} tabs for session ${sessionId}:`,
            tabs.map((t) => `${t.id.substring(0, 8)}: ${t.title}`),
          );

          return tabs;
        } else {
          this.logger.warn(
            `🔍 [DEBUG] No tabs found in simpleSession for ${sessionId}`,
          );
        }
      } else {
        this.logger.warn(
          `🔍 [DEBUG] No simpleSession found in stealthInfo for ${sessionId}`,
        );
      }
    } else {
      this.logger.warn(
        `🔍 [DEBUG] No stealth session found for ${sessionId}, falling back to original service`,
      );
    }

    return [];

    // Fall back to original service
    if (this.originalService) {
      return this.originalService.getTabsList(sessionId);
    }

    return [];
  }

  /**
   * Get active tab (stealth implementation with proper tab tracking)
   */
  getActiveTab(sessionId) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      const simpleSession = stealthInfo.simpleSession;
      if (simpleSession && simpleSession.currentTabId && simpleSession.tabs) {
        const activeTabInfo = simpleSession.tabs.get(
          simpleSession.currentTabId,
        );
        if (activeTabInfo) {
          return {
            id: simpleSession.currentTabId,
            title: activeTabInfo.title || "Stealth Browser Tab",
            url: activeTabInfo.url || "about:blank",
            active: true,
          };
        }
      }
      return null;
    }

    // Fall back to original service
    if (this.originalService) {
      return this.originalService.getActiveTab(sessionId);
    }

    return null;
  }

  /**
   * Switch to tab (stealth implementation)
   */
  async switchToTab(sessionId, tabId, isManual = false) {
    try {
      // this.logger.info(
      //   "[StealthEnhancedBrowserService] 🔄 Switching to tab with stealth considerations:",
      //   { sessionId, tabId },
      // );
      if (!this.stealthSessions || !(this.stealthSessions instanceof Map)) {
        throw new Error("stealthSessions is not initialized as a Map!");
      }

      const stealthInfo = this.stealthSessions.get(sessionId);
      if (!stealthInfo?.simpleSession?.browser) {
        throw new Error(`No active stealth session found: ${sessionId}`);
      }

      const session = stealthInfo.simpleSession;

      // Get all pages and find the target
      const pages = await session.browser.pages();
      this.logger.info(
        `🔍 [TAB SWITCH] Looking for tab ID: ${tabId} in ${pages.length} pages`,
      );

      // Enhanced debugging - get target IDs properly
      const availablePages = pages.map((page) => {
        const pageTarget = page.target();
        const pageTabId =
          pageTarget._targetId ||
          pageTarget.targetId ||
          page._target?._targetId ||
          page._target?.targetId;
        return {
          id: pageTabId,
          url: page.url(),
          title: page.title ? page.title() : "No title",
        };
      });

      this.logger.info(
        `🔍 [TAB SWITCH] Available pages with proper IDs:`,
        availablePages,
      );

      const targetPage = pages.find((page) => {
        const pageTarget = page.target();
        const pageTabId =
          pageTarget._targetId ||
          pageTarget.targetId ||
          page._target?._targetId ||
          page._target?.targetId;
        this.logger.debug(
          `🔍 [TAB SWITCH] Checking page ID: ${pageTabId} against target: ${tabId}`,
        );
        return pageTabId === tabId; // Use exact matching only
      });

      if (!targetPage) {
        this.logger.error(
          `❌ [TAB SWITCH] Tab not found: ${tabId}. Available pages:`,
          availablePages,
        );
        throw new Error(`Tab not found: ${tabId}`);
      }

      // Switch to the target page
      await targetPage.bringToFront();

      // Update session state
      session.currentTabId = tabId;
      session.activeTabId = tabId;

      // Update stealth session tab tracking
      if (stealthInfo.tabs && stealthInfo.tabs.has(tabId)) {
        // Mark the tab as active in our tracking
        for (const [id, tab] of stealthInfo.tabs) {
          tab.isActive = id === tabId;
        }
      }

      // 🛡️ MANUAL SWITCH PROTECTION: Prevent automatic switching for 5 seconds only
      if (isManual) {
        session.manualSwitchProtection = {
          tabId: tabId,
          timestamp: Date.now(),
          duration: 5000, // 5 seconds only - allow quick automatic switching
        };
        this.logger.info(
          `🛡️ [MANUAL SWITCH PROTECTION] Protected tab ${tabId.substring(0, 8)} for 5 seconds`,
        );
      }

      // Emit tab switch event using socketServer
      if (this.socketServer) {
        let pageTitle = "Loading...";
        try {
          pageTitle = await targetPage.title();
        } catch (titleError) {
          // Handle "Execution context destroyed" and other navigation errors
          this.logger.debug(
            `📝 Could not get page title during navigation: ${titleError.message}`,
          );
          // Try to get title from our tracked tab info
          if (stealthInfo.tabs && stealthInfo.tabs.has(tabId)) {
            const tabInfo = stealthInfo.tabs.get(tabId);
            pageTitle = tabInfo.title || "Unknown";
          }
        }

        this.socketServer.to(sessionId).emit("tab-switched", {
          sessionId,
          tabId,
          url: targetPage.url(),
          title: pageTitle,
        });
      }

      this.logger.info(
        "[StealthEnhancedBrowserService] ✅ Tab switch completed successfully",
      );

      // Get title safely for return value
      let returnTitle = "Loading...";
      try {
        returnTitle = await targetPage.title();
      } catch (titleError) {
        this.logger.debug(
          `📝 Could not get return title during navigation: ${titleError.message}`,
        );
        // Try to get title from our tracked tab info
        if (stealthInfo.tabs && stealthInfo.tabs.has(tabId)) {
          const tabInfo = stealthInfo.tabs.get(tabId);
          returnTitle = tabInfo.title || "Unknown";
        }
      }

      return {
        success: true,
        tabId,
        url: targetPage.url(),
        title: returnTitle,
      };
    } catch (error) {
      this.logger.error(
        "[StealthEnhancedBrowserService] ❌ Tab switch failed:",
        error,
      );
      throw error;
    }
  }

  /**
   * Recreate page (delegate to original service or implement for stealth)
   */
  async recreatePage(sessionId) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (stealthInfo && stealthInfo.isStealthEnabled) {
      // For stealth sessions, recreate the stealth page
      const stealthSession = this.stealthManager.getSession(sessionId);
      if (stealthSession && stealthSession.context) {
        try {
          // Close existing page safely
          if (stealthSession.page) {
            try {
              if (!stealthSession.page.isClosed()) {
                await stealthSession.page.close();
              }
            } catch (closeError) {
              this.logger.debug(`Page already closed or closing: ${closeError.message}`);
            }
          }

          // Create new page with stealth
          const newPage = await stealthSession.context.newPage();
          await newPage.setViewport(stealthSession.viewport);
          await newPage.setExtraHTTPHeaders(stealthSession.headers);

          // Re-inject stealth scripts with error handling
          try {
            await this.stealthManager.injectStealthScripts(newPage);
          } catch (injectError) {
            this.logger.debug(`Failed to inject stealth scripts: ${injectError.message}`);
          }

          // **INJECT BROWSER-USE TRACKERS FOR NEW PAGE**
          try {
            await this.injectBrowserUseTrackers(newPage);
          } catch (trackerError) {
            this.logger.debug(`Failed to inject browser-use trackers: ${trackerError.message}`);
          }

          // Update session
          stealthSession.page = newPage;

          // Update the registered session in original service
          if (this.originalService && this.originalService.sessions) {
            const registeredSession = this.originalService.sessions.get(sessionId);
            if (registeredSession) {
              registeredSession.page = newPage;
            }
          }

          this.logger.info(
            `🔄 Stealth page recreated for session ${sessionId}`,
          );
          return true;
        } catch (error) {
          this.logger.warn(
            `⚠️ Failed to recreate stealth page for ${sessionId}: ${error.message}`,
          );
          // Don't completely fail - let the browser-use agent continue
          return false;
        }
      }
    }

    // Fall back to original service
    if (this.originalService) {
      try {
        return await this.originalService.recreatePage(sessionId);
      } catch (error) {
        this.logger.warn(`⚠️ Original service page recreation failed: ${error.message}`);
        return false;
      }
    }

    return false;
  }

  /**
   * **UNIVERSAL BROWSER-USE ACTIVITY TRACKING**
   * Inject comprehensive automation detection that works for ALL websites and tasks
   */
  async injectBrowserUseTrackers(page) {
    try {
      await page.evaluateOnNewDocument(() => {
        // **UNIVERSAL ACTIVITY TRACKING - Works for all automation tasks**
        window.browserUseLastAction = Date.now();
        window.browserUseActive = true;
        window.automationInProgress = true;

        // **COMPREHENSIVE ACTIVITY TRACKER - Detects all forms of automation**
        const trackUniversalActivity = (eventType = "interaction") => {
          const now = Date.now();
          window.browserUseLastAction = now;
          window.lastInteractionTime = now;
          window.lastActivityType = eventType;

          // Mark page as recently active for tab detection
          document.body?.setAttribute(
            "data-browser-use-activity",
            now.toString(),
          );

          // Log activity for debugging (rate-limited)
          if (!window.lastActivityLog || now - window.lastActivityLog > 2000) {
            console.log(`🤖 Universal automation activity: ${eventType}`);
            window.lastActivityLog = now;
          }
        };

        // **MOUSE INTERACTION TRACKING (Universal)**
        ["click", "mousedown", "mouseup", "mousemove", "wheel"].forEach(
          (event) => {
            document.addEventListener(
              event,
              () => trackUniversalActivity(event),
              true,
            );
          },
        );

        // **KEYBOARD INTERACTION TRACKING (Universal)**
        ["keydown", "keyup", "keypress", "input"].forEach((event) => {
          document.addEventListener(
            event,
            () => trackUniversalActivity(event),
            true,
          );
        });

        // **FORM INTERACTION TRACKING (Universal for all forms)**
        ["change", "select", "focus", "blur", "submit"].forEach((event) => {
          document.addEventListener(
            event,
            () => trackUniversalActivity(event),
            true,
          );
        });

        // **UNIVERSAL DOM MUTATION OBSERVER - Tracks all automation changes**
        if (typeof MutationObserver !== "undefined") {
          const observer = new MutationObserver((mutations) => {
            const now = Date.now();
            window.lastDomModification = now;
            window.browserUseLastAction = now;

            // Track significant mutations that indicate automation
            let significantChange = false;
            mutations.forEach((mutation) => {
              if (
                mutation.type === "childList" &&
                mutation.addedNodes.length > 0
              )
                significantChange = true;
              if (
                mutation.type === "attributes" &&
                ["class", "style", "value"].includes(mutation.attributeName)
              )
                significantChange = true;
            });

            if (significantChange) {
              trackUniversalActivity("dom_mutation");
            }
          });

          // Observe all meaningful changes
          observer.observe(document, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
              "class",
              "style",
              "data-testid",
              "aria-label",
              "value",
              "checked",
              "selected",
            ],
            characterData: true,
          });

          window.browserUseMutationObserver = observer;
        }

        // **PAGE FOCUS/VISIBILITY TRACKING (Critical for tab detection)**
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            trackUniversalActivity("page_visible");
            window.lastVisibilityChange = Date.now();
          }
        });

        // **UNIVERSAL MARKERS - Work for all automation frameworks**
        window.browserUseTrackingInjected = true;
        window.universalAutomationDetection = true;
        window._browserUse = {
          active: true,
          startTime: Date.now(),
          lastActivity: Date.now(),
          version: "universal",
        };

        // Initial activity marker
        trackUniversalActivity("injection_complete");

        console.log(
          "🚀 UNIVERSAL browser-use tracking injected - works for ALL websites",
        );
      });

      // **Also inject into existing pages immediately**
      await page.evaluate(() => {
        if (!window.browserUseTrackingInjected) {
          const now = Date.now();
          window.browserUseLastAction = now;
          window.browserUseActive = true;
          window.automationInProgress = true;
          window.browserUseTrackingInjected = true;
          window.universalAutomationDetection = true;
          window._browserUse = {
            active: true,
            startTime: now,
            lastActivity: now,
            version: "universal",
          };

          console.log("🚀 UNIVERSAL automation markers added to existing page");
        }
      });
    } catch (error) {
      // Silently handle injection errors - page might be closed or restricted
      this.logger.debug(`Universal tracker injection failed: ${error.message}`);
    }
  }

  /**
   * Cleanup method
   */
  isHealthy() {
    const stealthHealth = this.stealthManager.isHealthy();
    const originalHealth = this.originalService
      ? this.originalService.isHealthy()
      : { initialized: false };

    return {
      stealth: stealthHealth,
      original: originalHealth,
      totalSessions:
        stealthHealth.activeSessions + (originalHealth.activeSessions || 0),
      stealthSessions: stealthHealth.activeSessions,
      regularSessions: originalHealth.activeSessions || 0,
      initialized: this.isInitialized,
    };
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    this.logger.info("🧹 Cleaning up Stealth-Enhanced Browser Service...");

    try {
      // Cleanup stealth sessions and intervals
      for (const [sessionId, stealthInfo] of this.stealthSessions.entries()) {
        if (stealthInfo.simpleSession && stealthInfo.simpleSession.intervals) {
          for (const interval of stealthInfo.simpleSession.intervals) {
            clearInterval(interval);
          }
          this.logger.debug(`🧹 Cleared intervals for session ${sessionId}`);
        }
      }

      await this.stealthManager.cleanup();

      // Cleanup original service
      if (this.originalService && this.originalService.cleanup) {
        await this.originalService.cleanup();
      }

      // Clear stealth session tracking
      this.stealthSessions.clear();

      this.logger.info("✅ Stealth-Enhanced Browser Service cleanup completed");
    } catch (error) {
      this.logger.error("❌ Cleanup failed:", error);
    }
  }

  /**
   * Get stealth configuration for monitoring/debugging
   */
  getStealthConfig() {
    return {
      enabled: process.env.DISABLE_STEALTH !== "true",
      environment: STEALTH_CONFIG.getEnvironmentConfig(),
      activeSessions: this.stealthSessions.size,
      resourceLimits: STEALTH_CONFIG.RESOURCE_LIMITS,
      userAgents: STEALTH_CONFIG.USER_AGENTS.length,
      viewportOptions: STEALTH_CONFIG.VIEWPORT_SIZES.length,
    };
  }

  /**
   * Force enable/disable stealth for a session
   */
  async toggleStealthForSession(sessionId, enableStealth) {
    const stealthInfo = this.stealthSessions.get(sessionId);

    if (enableStealth && (!stealthInfo || !stealthInfo.isStealthEnabled)) {
      // Convert regular session to stealth session
      this.logger.info(`🔄 Converting session ${sessionId} to stealth mode`);
      // This would require recreating the session - complex operation
      throw new Error(
        "Converting existing session to stealth mode is not supported. Please create a new session.",
      );
    }

    if (!enableStealth && stealthInfo && stealthInfo.isStealthEnabled) {
      // Convert stealth session to regular session
      this.logger.info(`🔄 Converting session ${sessionId} to regular mode`);
      // This would require recreating the session - complex operation
      throw new Error(
        "Converting stealth session to regular mode is not supported. Please create a new session.",
      );
    }

    return false;
  }

  // Proxy all other methods to original service
  get sessions() {
    if (this.originalService) {
      return this.originalService.sessions;
    }
    return new Map();
  }
}

export default StealthEnhancedBrowserService;
