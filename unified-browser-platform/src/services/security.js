/**
 * Security Service
 * Handles authentication, authorization, and security policies
 */

import crypto from 'crypto';
import { Logger } from '../utils/logger.js';

export class SecurityService {
  constructor() {
    this.logger = new Logger('SecurityService');
    this.apiKeys = new Map();
    this.sessionTokens = new Map();
    this.rateLimits = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    this.logger.info('🔒 Initializing Security Service...');
    
    // Load API keys from environment
    if (process.env.API_KEYS) {
      const keys = process.env.API_KEYS.split(',');
      keys.forEach((key, index) => {
        this.apiKeys.set(key.trim(), {
          id: `key_${index}`,
          name: `API Key ${index + 1}`,
          createdAt: new Date(),
          permissions: ['read', 'write']
        });
      });
    }

    this.isInitialized = true;
    this.logger.info('✅ Security Service initialized');
  }

  generateApiKey(name = 'Generated Key', permissions = ['read']) {
    const key = 'ubp_' + crypto.randomBytes(32).toString('hex');
    
    this.apiKeys.set(key, {
      id: crypto.randomUUID(),
      name,
      permissions,
      createdAt: new Date(),
      lastUsed: null,
      usageCount: 0
    });

    this.logger.info(`🔑 Generated API key: ${name}`);
    return key;
  }

  validateApiKey(key) {
    const keyData = this.apiKeys.get(key);
    if (!keyData) {
      return null;
    }

    keyData.lastUsed = new Date();
    keyData.usageCount++;
    
    return keyData;
  }

  generateSessionToken(sessionId, clientId) {
    const token = crypto.randomBytes(32).toString('hex');
    
    this.sessionTokens.set(token, {
      sessionId,
      clientId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    return token;
  }

  validateSessionToken(token) {
    const tokenData = this.sessionTokens.get(token);
    if (!tokenData) {
      return null;
    }

    if (tokenData.expiresAt < new Date()) {
      this.sessionTokens.delete(token);
      return null;
    }

    return tokenData;
  }

  checkRateLimit(identifier, maxRequests = 100, windowMs = 60000) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.rateLimits.has(identifier)) {
      this.rateLimits.set(identifier, []);
    }

    const requests = this.rateLimits.get(identifier);
    
    // Remove old requests outside the window
    while (requests.length > 0 && requests[0] < windowStart) {
      requests.shift();
    }

    // Check if limit exceeded
    if (requests.length >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(requests[0] + windowMs)
      };
    }

    // Add current request
    requests.push(now);

    return {
      allowed: true,
      remaining: maxRequests - requests.length,
      resetTime: new Date(now + windowMs)
    };
  }

  sanitizeInput(input, type = 'string') {
    if (typeof input !== 'string') {
      return input;
    }

    switch (type) {
      case 'url':
        // Basic URL validation and sanitization
        try {
          const url = new URL(input);
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('Invalid protocol');
          }
          return url.toString();
        } catch (error) {
          throw new Error('Invalid URL format');
        }

      case 'sessionId':
        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(input)) {
          throw new Error('Invalid session ID format');
        }
        return input;

      case 'string':
      default:
        // Basic string sanitization
        return input
          .replace(/[<>]/g, '') // Remove potential HTML tags
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/data:/gi, '') // Remove data: protocol
          .trim()
          .substring(0, 1000); // Limit length
    }
  }

  validatePermissions(keyData, requiredPermission) {
    if (!keyData || !keyData.permissions) {
      return false;
    }

    return keyData.permissions.includes(requiredPermission) || 
           keyData.permissions.includes('admin');
  }

  createMiddleware() {
    return {
      apiKey: (req, res, next) => {
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        if (!apiKey) {
          return res.status(401).json({ error: 'API key required' });
        }

        const keyData = this.validateApiKey(apiKey);
        if (!keyData) {
          return res.status(401).json({ error: 'Invalid API key' });
        }

        req.apiKey = keyData;
        next();
      },

      rateLimit: (maxRequests = 100, windowMs = 60000) => {
        return async (req, res, next) => {
          const identifier = req.ip || 'unknown';
          const limit = this.checkRateLimit(identifier, maxRequests, windowMs);
          
          res.set({
            'X-RateLimit-Remaining': limit.remaining,
            'X-RateLimit-Reset': limit.resetTime.toISOString()
          });

          if (!limit.allowed) {
            return res.status(429).json({ 
              error: 'Rate limit exceeded',
              resetTime: limit.resetTime
            });
          }

          next();
        };
      },

      permissions: (requiredPermission) => {
        return (req, res, next) => {
          if (!req.apiKey) {
            return res.status(401).json({ error: 'Authentication required' });
          }

          if (!this.validatePermissions(req.apiKey, requiredPermission)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }

          next();
        };
      }
    };
  }

  getSecurityStats() {
    const now = new Date();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    return {
      apiKeys: {
        total: this.apiKeys.size,
        active: Array.from(this.apiKeys.values())
          .filter(key => key.lastUsed && key.lastUsed > oneHourAgo).length
      },
      sessionTokens: {
        total: this.sessionTokens.size,
        expired: Array.from(this.sessionTokens.values())
          .filter(token => token.expiresAt < now).length
      },
      rateLimits: {
        activeClients: this.rateLimits.size
      }
    };
  }

  cleanup() {
    this.logger.info('🧹 Cleaning up Security Service...');

    // Clean expired session tokens
    const now = new Date();
    for (const [token, tokenData] of this.sessionTokens) {
      if (tokenData.expiresAt < now) {
        this.sessionTokens.delete(token);
      }
    }

    // Clean old rate limit data
    const oneHourAgo = now - 60 * 60 * 1000;
    for (const [identifier, requests] of this.rateLimits) {
      const validRequests = requests.filter(timestamp => timestamp > oneHourAgo);
      if (validRequests.length === 0) {
        this.rateLimits.delete(identifier);
      } else {
        this.rateLimits.set(identifier, validRequests);
      }
    }

    this.logger.info('✅ Security Service cleaned up');
  }

  isHealthy() {
    return this.isInitialized;
  }
}

export default SecurityService;
