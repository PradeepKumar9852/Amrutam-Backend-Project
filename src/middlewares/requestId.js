const crypto = require('crypto');

/**
 * Middleware to assign or propagate a unique Request ID for distributed tracing and log correlation
 */
function requestCorrelation(req, res, next) {
  // Use incoming request ID or generate a new UUID
  const requestId = req.get('x-request-id') || req.get('x-correlation-id') || crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
}

module.exports = requestCorrelation;
