const crypto = require('crypto');

/**
 * Middleware to assign and propagate Request IDs and OpenTelemetry W3C Trace Context
 * Supports W3C `traceparent` (version-trace_id-parent_id-trace_flags) for OpenTelemetry
 * and `X-Request-Id` for HTTP log correlation.
 */
function requestCorrelation(req, res, next) {
  // 1. Request Correlation ID
  const requestId = req.get('x-request-id') || req.get('x-correlation-id') || crypto.randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  // 2. OpenTelemetry W3C Trace Context
  const incomingTraceparent = req.get('traceparent');
  let traceId;
  let spanId;
  let traceparent;

  if (incomingTraceparent && /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i.test(incomingTraceparent)) {
    const parts = incomingTraceparent.split('-');
    traceId = parts[1];
    spanId = crypto.randomBytes(8).toString('hex'); // Generate new span ID for current service
    traceparent = `00-${traceId}-${spanId}-01`;
  } else {
    traceId = crypto.randomBytes(16).toString('hex'); // 128-bit trace ID
    spanId = crypto.randomBytes(8).toString('hex');   // 64-bit span ID
    traceparent = `00-${traceId}-${spanId}-01`;
  }

  req.traceId = traceId;
  req.spanId = spanId;
  res.setHeader('traceparent', traceparent);

  next();
}

module.exports = requestCorrelation;
