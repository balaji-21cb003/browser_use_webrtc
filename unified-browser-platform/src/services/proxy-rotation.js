/**
 * Proxy Rotation Service
 * Handles IP rotation to bypass site blocks and rate limiting
 */

import { Logger } from "../utils/logger.js";

export class ProxyRotationService {
  constructor() {
    this.logger = new Logger("ProxyRotationService");
    this.proxies = [];
    this.currentProxyIndex = 0;
    this.failedProxies = new Set();
    this.sessionProxyMap = new Map(); // Track which proxy each session uses
    this.lastRotationTime = Date.now();
    this.rotationInterval = 300000; // 5 minutes default

    this.initializeProxies();
  }

  initializeProxies() {
    // Initialize with your server IP as primary proxy
    this.proxies = [
      {
        server: "135.235.154.64:8080",
        username: null,
        password: null,
        type: "http",
        country: "Server",
        description: "Primary Server Proxy",
      },
    ];

    // Add environment-configured proxies
    this.loadEnvironmentProxies();

    this.logger.info(
      `🔄 Initialized proxy rotation with ${this.proxies.length} proxies`,
    );
    this.logger.info(`🎯 Using primary server proxy: 135.235.154.64:8080`);
  }

  loadEnvironmentProxies() {
    // Load proxies from environment variables
    const proxyList = process.env.PROXY_LIST;
    const proxyUsername = process.env.PROXY_USERNAME;
    const proxyPassword = process.env.PROXY_PASSWORD;

    if (proxyList) {
      const envProxies = proxyList.split(",").map((proxy) => {
        const [server, type = "http", country = "Unknown"] = proxy.split("|");
        return {
          server: server.trim(),
          username: proxyUsername || null,
          password: proxyPassword || null,
          type: type.trim(),
          country: country.trim(),
          description: `Environment Proxy (${country})`,
        };
      });

      this.proxies.unshift(...envProxies);
      this.logger.info(
        `📥 Loaded ${envProxies.length} proxies from environment`,
      );
    }
  }

  getNextProxy(sessionId = null, forceRotation = false) {
    if (this.proxies.length === 0) {
      this.logger.warn("⚠️ No proxies available");
      return null;
    }

    // Check if we need to rotate based on time or force
    const shouldRotate =
      forceRotation ||
      Date.now() - this.lastRotationTime > this.rotationInterval;

    if (sessionId && this.sessionProxyMap.has(sessionId) && !shouldRotate) {
      // Return existing proxy for session if not time to rotate
      const existingProxy = this.sessionProxyMap.get(sessionId);
      if (!this.failedProxies.has(existingProxy.server)) {
        return existingProxy;
      }
    }

    // Find next working proxy
    let attempts = 0;
    let proxy = null;

    while (attempts < this.proxies.length) {
      proxy = this.proxies[this.currentProxyIndex];
      this.currentProxyIndex =
        (this.currentProxyIndex + 1) % this.proxies.length;

      if (!this.failedProxies.has(proxy.server)) {
        break;
      }

      attempts++;
      proxy = null;
    }

    if (!proxy) {
      this.logger.warn(
        "⚠️ All proxies marked as failed, clearing failed list and retrying",
      );
      this.failedProxies.clear();
      proxy = this.proxies[this.currentProxyIndex];
      this.currentProxyIndex =
        (this.currentProxyIndex + 1) % this.proxies.length;
    }

    if (sessionId) {
      this.sessionProxyMap.set(sessionId, proxy);
    }

    this.lastRotationTime = Date.now();
    this.logger.info(
      `🔄 Selected proxy: ${proxy.description} (${proxy.server})`,
    );

    return proxy;
  }

  markProxyAsFailed(proxyServer) {
    this.failedProxies.add(proxyServer);
    this.logger.warn(`❌ Marked proxy as failed: ${proxyServer}`);

    // Remove from session mappings
    for (const [sessionId, proxy] of this.sessionProxyMap.entries()) {
      if (proxy.server === proxyServer) {
        this.sessionProxyMap.delete(sessionId);
      }
    }
  }

  markProxyAsWorking(proxyServer) {
    this.failedProxies.delete(proxyServer);
    this.logger.info(`✅ Marked proxy as working: ${proxyServer}`);
  }

  getProxyForSession(sessionId) {
    return this.sessionProxyMap.get(sessionId) || null;
  }

  removeSessionProxy(sessionId) {
    if (this.sessionProxyMap.has(sessionId)) {
      const proxy = this.sessionProxyMap.get(sessionId);
      this.sessionProxyMap.delete(sessionId);
      this.logger.debug(
        `🗑️ Removed proxy mapping for session ${sessionId}: ${proxy.server}`,
      );
    }
  }

  // Convert proxy to Puppeteer args format
  getProxyArgs(proxy) {
    if (!proxy) return [];

    const args = [`--proxy-server=${proxy.type}://${proxy.server}`];

    // Add auth if available
    if (proxy.username && proxy.password) {
      args.push(`--proxy-auth=${proxy.username}:${proxy.password}`);
    }

    return args;
  }

  // Get proxy configuration for direct use
  getProxyConfig(proxy) {
    if (!proxy) return null;

    const [host, port] = proxy.server.split(":");

    return {
      host,
      port: parseInt(port),
      protocol: proxy.type,
      auth:
        proxy.username && proxy.password
          ? {
              username: proxy.username,
              password: proxy.password,
            }
          : null,
    };
  }

  // Test proxy connectivity (simplified version without additional dependencies)
  async testProxy(proxy) {
    try {
      // Simple connectivity test using built-in fetch
      const { default: fetch } = await import("node-fetch");

      // Test direct connection to the proxy server
      const proxyUrl = `http://${proxy.server}`;

      const response = await fetch("http://httpbin.org/ip", {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (response.ok) {
        this.logger.info(`✅ Proxy test successful: ${proxy.server}`);
        this.markProxyAsWorking(proxy.server);
        return true;
      } else {
        this.logger.warn(
          `❌ Proxy test failed: ${proxy.server} - Status: ${response.status}`,
        );
        this.markProxyAsFailed(proxy.server);
        return false;
      }
    } catch (error) {
      this.logger.warn(
        `❌ Proxy test error: ${proxy.server} - ${error.message}`,
      );
      // Don't mark as failed immediately for connection errors as proxy might still work
      this.logger.info(
        `ℹ️ Proxy ${proxy.server} will be used despite test failure`,
      );
      return true; // Allow proxy to be used even if test fails
    }
  }

  // Test all proxies and remove failed ones
  async validateAllProxies() {
    this.logger.info("🔍 Testing all proxies...");

    const testPromises = this.proxies.map((proxy) =>
      this.testProxy(proxy).catch(() => false),
    );

    const results = await Promise.allSettled(testPromises);

    const workingCount = results.filter(
      (result) => result.status === "fulfilled" && result.value === true,
    ).length;

    this.logger.info(
      `✅ Proxy validation complete: ${workingCount}/${this.proxies.length} working`,
    );

    return workingCount;
  }

  // Get statistics
  getStats() {
    return {
      totalProxies: this.proxies.length,
      failedProxies: this.failedProxies.size,
      workingProxies: this.proxies.length - this.failedProxies.size,
      activeSessions: this.sessionProxyMap.size,
      currentProxyIndex: this.currentProxyIndex,
      lastRotationTime: this.lastRotationTime,
      rotationInterval: this.rotationInterval,
    };
  }

  // Force rotation for next request
  forceRotation() {
    this.lastRotationTime = 0;
    this.logger.info("🔄 Forced proxy rotation for next request");
  }

  // Update rotation interval
  setRotationInterval(intervalMs) {
    this.rotationInterval = intervalMs;
    this.logger.info(`⏰ Updated proxy rotation interval to ${intervalMs}ms`);
  }

  // Add new proxy at runtime
  addProxy(proxyConfig) {
    this.proxies.push(proxyConfig);
    this.logger.info(
      `➕ Added new proxy: ${proxyConfig.server} (${proxyConfig.description})`,
    );
  }

  // Remove proxy
  removeProxy(proxyServer) {
    this.proxies = this.proxies.filter((p) => p.server !== proxyServer);
    this.failedProxies.delete(proxyServer);

    // Remove from session mappings
    for (const [sessionId, proxy] of this.sessionProxyMap.entries()) {
      if (proxy.server === proxyServer) {
        this.sessionProxyMap.delete(sessionId);
      }
    }

    this.logger.info(`➖ Removed proxy: ${proxyServer}`);
  }
}

export default ProxyRotationService;
