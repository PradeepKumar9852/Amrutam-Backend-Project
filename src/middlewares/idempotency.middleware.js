/**
 * Idempotency Middleware for Write Mutations
 * Ensures network retries do not produce duplicate business effects.
 * Complies with IETF Idempotency-Key specification draft.
 */

const crypto = require('crypto');
const { getCache, setCache } = require('../config/redis');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

// Local in-memory lock map to prevent in-flight concurrent stampedes
const inFlightKeys = new Set();

/**
 * Compute stable hash of incoming request payload
 */
function computeRequestHash(req) {
  const normalized = {
    method: req.method,
    url: req.baseUrl + req.path,
    body: req.body || {},
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/**
 * Creates an idempotency middleware
 * @param {object} options
 * @param {number} options.ttlSeconds - Time to live for stored responses (default 86400 = 24h)
 */
function idempotency(options = {}) {
  const ttl = options.ttlSeconds || 86400; // 24 hours

  return async (req, res, next) => {
    // Only apply to write mutations (POST, PUT, PATCH, DELETE)
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.get('idempotency-key') || req.get('x-idempotency-key');

    // If client did not provide an idempotency key, proceed normally
    if (!idempotencyKey) {
      return next();
    }

    // Bind key to authenticated user ID or IP to prevent cross-tenant key collision
    const actorId = req.user ? req.user.id : (req.ip || 'anon');
    const storageKey = `idemp:${actorId}:${idempotencyKey}`;
    const requestHash = computeRequestHash(req);

    // 1. Concurrency Shield: Check if exact same key is currently being processed
    if (inFlightKeys.has(storageKey)) {
      return next(
        ApiError.conflict(
          'A mutation with this Idempotency-Key is currently processing. Please wait and retry.'
        )
      );
    }

    try {
      // 2. Cache Lookup: Check if response has already been cached
      const cached = await getCache(storageKey);
      if (cached && cached.statusCode && cached.body) {
        // Enforce IETF RFC specification: reject if key is reused with a different request payload
        if (cached.requestHash && cached.requestHash !== requestHash) {
          return next(
            ApiError.conflict(
              'Idempotency-Key has already been used with a different request payload.'
            )
          );
        }

        logger.info(`[IDEMPOTENCY] Replaying cached response for key: ${idempotencyKey}`, {
          actorId,
          method: req.method,
          url: req.originalUrl,
        });

        res.setHeader('X-Idempotent-Replay', 'true');
        res.setHeader('Idempotency-Key', idempotencyKey);
        return res.status(cached.statusCode).json(cached.body);
      }

      // Mark key as in-flight
      inFlightKeys.add(storageKey);

      // 3. Response Interceptor: Capture output when the route handler finishes
      const originalJson = res.json.bind(res);

      res.json = function (body) {
        inFlightKeys.delete(storageKey);

        // Cache successful responses (2xx and 3xx)
        if (res.statusCode >= 200 && res.statusCode < 400) {
          setCache(storageKey, { statusCode: res.statusCode, body, requestHash }, ttl).catch((err) => {
            logger.warn(`[IDEMPOTENCY] Failed to cache idempotent response: ${err.message}`);
          });
        }

        res.setHeader('Idempotency-Key', idempotencyKey);
        return originalJson(body);
      };

      // Ensure cleanup in case of unhandled error or socket close
      res.on('close', () => {
        inFlightKeys.delete(storageKey);
      });

      next();
    } catch (error) {
      inFlightKeys.delete(storageKey);
      next(error);
    }
  };
}

module.exports = idempotency;
