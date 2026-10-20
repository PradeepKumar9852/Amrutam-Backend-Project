/**
 * Asynchronous Background Job Queue & Dispatcher
 * Handles heavy tasks out-of-band so client HTTP requests stay ultra-fast (p95 < 200ms).
 */

const { retryWithBackoff } = require('./retry');
const logger = require('../utils/logger');

// Registry of task handlers
const jobHandlers = new Map();

/**
 * Register a background job handler
 * @param {string} jobName
 * @param {Function} handler
 */
function registerJob(jobName, handler) {
  jobHandlers.set(jobName, handler);
}

/**
 * Dispatch an asynchronous job in the background (fire-and-forget from caller perspective)
 * @param {string} jobName
 * @param {object} payload
 * @param {object} retryOptions
 */
function dispatch(jobName, payload = {}, retryOptions = {}) {
  const handler = jobHandlers.get(jobName);

  if (!handler) {
    logger.warn(`[JOB-QUEUE] No handler registered for job: ${jobName}`);
    return;
  }

  // Defer execution using setImmediate to avoid blocking the current Express event loop tick
  setImmediate(async () => {
    const startTime = Date.now();
    try {
      await retryWithBackoff(
        async (attempt) => {
          return await handler(payload, attempt);
        },
        {
          taskName: `Job:${jobName}`,
          maxRetries: retryOptions.maxRetries || 3,
          initialDelayMs: retryOptions.initialDelayMs || 250,
          ...retryOptions,
        }
      );
      const elapsed = Date.now() - startTime;
      logger.info(`[JOB-SUCCESS] ${jobName} completed successfully in ${elapsed}ms`);
    } catch (error) {
      logger.error(`[JOB-FAILED] ${jobName} definitively failed: ${error.message}`);
    }
  });
}

// ===================================================================
// Default Handlers for Core Telemedicine Workflows
// ===================================================================

// 1. Appointment Reminder Notification Job
registerJob('CONSULTATION_REMINDER', async (data) => {
  logger.info(`[JOB] Dispatching appointment reminder notification`, {
    consultationId: data.consultationId,
    bookingReference: data.bookingReference,
    patientEmail: data.patientEmail,
    scheduledTime: data.scheduledTime,
  });
  // In production, integrates with AWS SES / Twilio SMS / WhatsApp API
  return { delivered: true, timestamp: new Date().toISOString() };
});

// 2. Digital Prescription PDF Generation & Email Job
registerJob('PRESCRIPTION_DELIVERY', async (data) => {
  logger.info(`[JOB] Rendering digital Ayurvedic prescription summary`, {
    prescriptionId: data.prescriptionId,
    consultationId: data.consultationId,
    patientEmail: data.patientEmail,
    itemsCount: data.itemsCount,
  });
  // Simulates asynchronous PDF compilation and secure email dispatch
  return { generated: true, deliveryStatus: 'SENT' };
});

// 3. Payment Settlement Webhook Reconciliation Job
registerJob('PAYMENT_WEBHOOK_DISPATCH', async (data) => {
  logger.info(`[JOB] Emitting payment reconciliation event`, {
    paymentId: data.paymentId,
    transactionId: data.transactionId,
    amount: data.amount,
  });
  return { reconciled: true };
});

module.exports = {
  dispatch,
  registerJob,
};
