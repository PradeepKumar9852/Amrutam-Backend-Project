const Redis = require('ioredis');
const crypto = require('crypto');
const config = require('./env');
const logger = require('../utils/logger');

let redisClient = null;
let isConnected = false;

// Fallback in-memory cache for development/test when Redis is not running
const inMemoryCache = new Map();
const inMemoryBlacklist = new Map();

// Periodic sweep for in-memory fallback stores (unref'd so it does not block process exit)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of inMemoryBlacklist.entries()) {
    if (now > v) inMemoryBlacklist.delete(k);
  }
  for (const [k, v] of inMemoryCache.entries()) {
    if (now > v.expiresAt) inMemoryCache.delete(k);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref();

// Helper to hash token string for compact storage
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Initialize Redis connection safely with non-blocking fallback
 */
function initRedis() {
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        // Stop retrying aggressively if Redis is unavailable in local dev/tests
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });

    redisClient.on('connect', () => {
      isConnected = true;
      logger.info('Connected to Redis service successfully');
    });

    redisClient.on('ready', () => {
      isConnected = true;
    });

    redisClient.on('error', (err) => {
      isConnected = false;
      // Do not crash application if Redis is offline; log debug info
      if (config.isDevelopment) {
        logger.debug(`Redis offline: ${err.message}. Operating with fallback mode.`);
      }
    });

    redisClient.on('close', () => {
      isConnected = false;
    });

    // Attempt initial connection without blocking process execution
    redisClient.connect().catch((err) => {
      isConnected = false;
      if (config.isDevelopment) {
        logger.debug(`Redis server not reachable at ${config.redisUrl}. Using in-memory fallback.`);
      }
    });
  } catch (error) {
    isConnected = false;
  }

  return redisClient;
}

// Initialize on module load
initRedis();

/**
 * Check if Redis is actively connected
 */
function isRedisConnected() {
  return isConnected && redisClient && redisClient.status === 'ready';
}

/**
 * Set a key-value pair with TTL in seconds
 */
async function setCache(key, value, ttlSeconds = 60) {
  const serialized = JSON.stringify(value);
  if (isRedisConnected()) {
    try {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
      return true;
    } catch (e) {
      // Fall through to memory
    }
  }

  // In-memory fallback
  inMemoryCache.set(key, {
    data: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return true;
}

/**
 * Get cached value by key
 */
async function getCache(key) {
  if (isRedisConnected()) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      // Fall through to memory
    }
  }

  // In-memory fallback
  const record = inMemoryCache.get(key);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  return JSON.parse(record.data);
}

/**
 * Delete a specific cache key
 */
async function deleteCache(key) {
  if (isRedisConnected()) {
    try {
      await redisClient.del(key);
    } catch (e) {}
  }
  inMemoryCache.delete(key);
}

/**
 * Invalidate all keys matching a prefix/pattern
 */
async function deletePattern(pattern) {
  if (isRedisConnected()) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (e) {}
  }

  // Clear in-memory keys matching pattern prefix
  const prefix = pattern.replace('*', '');
  for (const k of inMemoryCache.keys()) {
    if (k.startsWith(prefix)) {
      inMemoryCache.delete(k);
    }
  }
}

/**
 * Blacklist a JWT token upon user logout
 * @param {string} token - The raw JWT token string
 * @param {number} expirySeconds - Time remaining until the token's natural expiration
 */
async function blacklistToken(token, expirySeconds = 86400) {
  const key = `bl_${hashToken(token)}`;
  const ttl = Math.max(1, expirySeconds);

  if (isRedisConnected()) {
    try {
      await redisClient.set(key, 'revoked', 'EX', ttl);
      return true;
    } catch (e) {}
  }

  inMemoryBlacklist.set(key, Date.now() + ttl * 1000);
  return true;
}

/**
 * Check if a JWT token has been explicitly revoked/blacklisted
 * @param {string} token - The raw JWT token string
 * @returns {Promise<boolean>} - True if blacklisted, false otherwise
 */
async function isTokenBlacklisted(token) {
  const key = `bl_${hashToken(token)}`;

  if (isRedisConnected()) {
    try {
      const exists = await redisClient.exists(key);
      return exists === 1;
    } catch (e) {}
  }

  const expiresAt = inMemoryBlacklist.get(key);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    inMemoryBlacklist.delete(key);
    return false;
  }
  return true;
}

/**
 * Acquire a distributed mutex lock
 * @param {string} resourceKey - Name of resource to lock
 * @param {number} ttlSeconds - Expiration timeout in seconds
 * @returns {Promise<string|null>} - Returns unique lockToken if acquired, or null if lock is already held
 */
async function acquireLock(resourceKey, ttlSeconds = 10) {
  const lockKey = `lock:${resourceKey}`;
  const lockToken = crypto.randomUUID();

  if (isRedisConnected()) {
    try {
      const result = await redisClient.set(lockKey, lockToken, 'EX', ttlSeconds, 'NX');
      return result === 'OK' ? lockToken : null;
    } catch (e) {
      // Fall through to memory
    }
  }

  // In-memory fallback mutex
  const existing = inMemoryCache.get(lockKey);
  if (existing && Date.now() <= existing.expiresAt) {
    return null; // Lock is already held
  }

  inMemoryCache.set(lockKey, {
    data: JSON.stringify(lockToken),
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return lockToken;
}

/**
 * Release a distributed mutex lock safely
 * @param {string} resourceKey - Name of locked resource
 * @param {string} lockToken - Unique token obtained upon acquisition
 */
async function releaseLock(resourceKey, lockToken) {
  if (!lockToken) return;
  const lockKey = `lock:${resourceKey}`;

  if (isRedisConnected()) {
    try {
      const luaScript = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        else
          return 0
        end
      `;
      await redisClient.eval(luaScript, 1, lockKey, lockToken);
      return;
    } catch (e) {}
  }

  // In-memory release
  const existing = inMemoryCache.get(lockKey);
  if (existing) {
    try {
      if (JSON.parse(existing.data) === lockToken) {
        inMemoryCache.delete(lockKey);
      }
    } catch (e) {
      inMemoryCache.delete(lockKey);
    }
  }
}

/**
 * Gracefully disconnect Redis on server shutdown
 */
async function closeRedis() {
  clearInterval(cleanupTimer);
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (e) {
      redisClient.disconnect();
    }
  }
}

module.exports = {
  redisClient,
  isRedisConnected,
  setCache,
  getCache,
  deleteCache,
  deletePattern,
  blacklistToken,
  isTokenBlacklisted,
  acquireLock,
  releaseLock,
  closeRedis,
};
