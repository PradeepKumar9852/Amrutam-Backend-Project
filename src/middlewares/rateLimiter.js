const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/apiError');

/**
 * Rate limiter for sensitive authentication endpoints (e.g. login, register)
 * Prevents brute-force credential stuffing and password guessing.
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 10, // Limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', // Skip during automated test runs
  handler: (req, res, next) => {
    next(
      new ApiError(
        429,
        'Too many authentication attempts from this IP. Please try again after 15 minutes.'
      )
    );
  },
});

/**
 * General API Rate Limiter
 * Protects all API endpoints against Denial of Service and excessive scraping.
 */
const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (req, res, next) => {
    next(
      new ApiError(
        429,
        'Too many requests to the Amrutam API from this IP. Please slow down.'
      )
    );
  },
});

module.exports = {
  authRateLimiter,
  apiRateLimiter,
};

