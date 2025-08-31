const { RateLimiterMemory } = require('rate-limiter-flexible');

class SecurityService {
  constructor() {
    this.rateLimiter = null;
    this.trustedIPs = new Set(['127.0.0.1', '::1', 'localhost']);
    this.blacklistedIPs = new Set();
  }

  async initialize() {
    try {
      this.rateLimiter = new RateLimiterMemory({
        keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown',
        points: 100, // Number of requests
        duration: 60, // Per 60 seconds
      });
      
      console.log('✅ Security Service initialized');
    } catch (error) {
      console.warn('⚠️ Rate limiter initialization failed, using basic security:', error.message);
      // Continue without rate limiter
    }
  }

  async checkRateLimit(req, res, next) {
    if (!this.rateLimiter) {
      return next(); // Skip if rate limiter failed to initialize
    }

    try {
      const key = req.ip || req.connection?.remoteAddress || 'unknown';
      await this.rateLimiter.consume(key);
      next();
    } catch (rejRes) {
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.round(rejRes.msBeforeNext / 1000)
      });
    }
  }

  isIPTrusted(ip) {
    return this.trustedIPs.has(ip);
  }

  isIPBlacklisted(ip) {
    return this.blacklistedIPs.has(ip);
  }

  addTrustedIP(ip) {
    this.trustedIPs.add(ip);
  }

  blacklistIP(ip) {
    this.blacklistedIPs.add(ip);
  }

  validateRequest(req, res, next) {
    const clientIP = req.ip || req.connection?.remoteAddress;

    if (this.isIPBlacklisted(clientIP)) {
      return res.status(403).json({ error: 'Access forbidden' });
    }

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    next();
  }
}

module.exports = SecurityService;
