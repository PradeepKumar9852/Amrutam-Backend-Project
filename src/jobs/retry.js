/**
 * Retry With Exponential Backoff & Jitter
 * Standard resiliency utility for asynchronous tasks and external integrations.
 */

const logger = require('../utils/logger');

/**
 * Execute an async function with exponential backoff retry logic
 * @param {Function} fn - Async operation to execute
 * @param {object} options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.initialDelayMs - Initial delay in ms before first retry (default: 200)
 * @param {number} options.maxDelayMs - Maximum delay ceiling (default: 5000)
 * @param {number} options.backoffFactor - Multiplier for each subsequent retry (default: 2)
 * @param {boolean} options.jitter - Add randomized jitter to avoid thundering herd (default: true)
 * @param {string} options.taskName - Human-readable label for log statements
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 200,
    maxDelayMs = 5000,
    backoffFactor = 2,
    jitter = true,
    taskName = 'AsyncOperation',
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await fn(attempt);
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        logger.error(`[RETRY-EXHAUSTED] ${taskName} failed after ${maxRetries} attempts: ${error.message}`, {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }

      // Calculate next backoff delay
      let calculatedDelay = Math.min(delay * Math.pow(backoffFactor, attempt - 1), maxDelayMs);
      if (jitter) {
        // Random variation between 0.8x and 1.2x
        const jitterFactor = 0.8 + Math.random() * 0.4;
        calculatedDelay = Math.round(calculatedDelay * jitterFactor);
      }

      logger.warn(`[RETRY-ATTEMPT] ${taskName} failed (attempt ${attempt}/${maxRetries}). Retrying in ${calculatedDelay}ms... Reason: ${error.message}`);

      await new Promise((resolve) => setTimeout(resolve, calculatedDelay));
    }
  }
}

module.exports = {
  retryWithBackoff,
};
