/**
 * Lightweight, structured JSON/readable logger with sensitive data redaction
 */

const formatTimestamp = () => new Date().toISOString();

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'jwtsecret',
  'authorization',
  'diagnosissummary',
  'symptomssummary',
  'emergencycontact',
]);

/**
 * Recursively sanitize metadata to guarantee zero leakage of passwords, tokens, or PHI
 */
function sanitizeMeta(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeMeta);
  }

  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (val && typeof val === 'object') {
      clean[key] = sanitizeMeta(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

function output(level, message, meta = {}) {
  const safeMeta = sanitizeMeta(meta);
  const logEntry = {
    timestamp: formatTimestamp(),
    level,
    message,
    ...(Object.keys(safeMeta).length > 0 && { meta: safeMeta }),
  };

  if (process.env.NODE_ENV === 'production') {
    // Production: Output single-line structured JSON for cloud log collectors (Datadog, CloudWatch, ELK)
    console.log(JSON.stringify(logEntry));
  } else {
    // Development / Test: Formatted human-readable output
    const metaStr = Object.keys(safeMeta).length ? ` ${JSON.stringify(safeMeta)}` : '';
    const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
    consoleFn(`[${logEntry.timestamp}] [${level}]: ${message}${metaStr}`);
  }
}

const logger = {
  info: (message, meta = {}) => output('INFO', message, meta),
  warn: (message, meta = {}) => output('WARN', message, meta),
  error: (message, meta = {}) => output('ERROR', message, meta),
  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      output('DEBUG', message, meta);
    }
  },
};

module.exports = logger;
