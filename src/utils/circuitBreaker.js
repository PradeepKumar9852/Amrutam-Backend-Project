/**
 * Circuit Breaker Pattern Implementation
 * Protects the system against cascading failures when external dependencies
 * (payment gateways, notification SMS/Email providers, third-party APIs) degrade.
 * 
 * States:
 * - CLOSED: Normal operation. Requests flow through.
 * - OPEN: Failure threshold exceeded. Fast-fails immediately without calling downstream.
 * - HALF_OPEN: Cooldown elapsed. Allows a test request to check if downstream recovered.
 */

const logger = require('./logger');
const ApiError = require('./apiError');

class CircuitBreaker {
  /**
   * @param {string} serviceName - Identifier for metrics and logging
   * @param {object} options
   * @param {number} [options.failureThreshold=5] - Consecutive failures before opening
   * @param {number} [options.cooldownDurationMs=10000] - Duration to stay OPEN before attempting HALF_OPEN (10s)
   * @param {number} [options.timeoutMs=5000] - Timeout for each individual call
   */
  constructor(serviceName, options = {}) {
    this.name = serviceName;
    this.failureThreshold = options.failureThreshold || 5;
    this.cooldownDurationMs = options.cooldownDurationMs || 10000;
    this.timeoutMs = options.timeoutMs || 5000;

    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.consecutiveFailures = 0;
    this.nextAttemptTimestamp = 0;
    this.lastFailureError = null;
  }

  /**
   * Execute an operation protected by the circuit breaker
   * @param {Function} asyncFn - Async function returning a promise
   * @param {Function} [fallbackFn] - Optional fallback function if circuit is OPEN
   */
  async execute(asyncFn, fallbackFn = null) {
    const now = Date.now();

    // 1. Check if OPEN circuit cooldown period has passed
    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTimestamp) {
        this.state = 'HALF_OPEN';
        logger.info(`[CIRCUIT-BREAKER:${this.name}] Cooldown elapsed. Entering HALF_OPEN trial state.`);
      } else {
        const remainingCooldownMs = this.nextAttemptTimestamp - now;
        logger.warn(
          `[CIRCUIT-BREAKER:${this.name}] Fast-rejecting request: Circuit is OPEN (${remainingCooldownMs}ms remaining)`
        );

        if (fallbackFn) {
          return await fallbackFn();
        }

        throw ApiError.serviceUnavailable(
          `Downstream dependency '${this.name}' is temporarily unavailable. Circuit breaker is OPEN. Please retry shortly.`
        );
      }
    }

    // 2. Execute with bounded timeout
    try {
      const result = await Promise.race([
        asyncFn(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Timeout: ${this.name} failed to respond within ${this.timeoutMs}ms`)),
            this.timeoutMs
          )
        ),
      ]);

      // 3. On success, reset failures and close circuit
      this._onSuccess();
      return result;
    } catch (error) {
      // 4. On failure, increment failures and potentially trip circuit
      this._onFailure(error);

      if (fallbackFn) {
        logger.info(`[CIRCUIT-BREAKER:${this.name}] Invoking fallback after failure: ${error.message}`);
        return await fallbackFn(error);
      }

      throw error;
    }
  }

  _onSuccess() {
    if (this.state === 'HALF_OPEN') {
      logger.info(`[CIRCUIT-BREAKER:${this.name}] Trial request succeeded. Transitioning from HALF_OPEN to CLOSED.`);
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastFailureError = null;
  }

  _onFailure(error) {
    this.consecutiveFailures++;
    this.lastFailureError = error.message;

    logger.warn(
      `[CIRCUIT-BREAKER:${this.name}] Failure recorded (${this.consecutiveFailures}/${this.failureThreshold}): ${error.message}`
    );

    if (this.consecutiveFailures >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttemptTimestamp = Date.now() + this.cooldownDurationMs;
      logger.error(
        `[CIRCUIT-BREAKER:${this.name}] Threshold exceeded! Circuit tripped to OPEN for ${this.cooldownDurationMs}ms.`
      );
    }
  }

  /**
   * Get current state snapshot
   */
  getStatus() {
    return {
      service: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.failureThreshold,
      cooldownDurationMs: this.cooldownDurationMs,
      isOpen: this.state === 'OPEN',
      lastFailure: this.lastFailureError,
    };
  }

  /**
   * Manual reset for administrative recovery
   */
  reset() {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastFailureError = null;
    this.nextAttemptTimestamp = 0;
  }
}

module.exports = CircuitBreaker;
