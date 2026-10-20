const express = require('express');
const paymentsController = require('./payments.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const idempotency = require('../../middlewares/idempotency.middleware');
const { uuidParamSchema, consultationIdParamSchema } = require('../../utils/commonValidation');
const {
  processPaymentSchema,
  refundPaymentSchema,
} = require('./payments.validation');

const router = express.Router();

/**
 * @route   POST /api/v1/payments/process
 * @desc    Process consultation payment with idempotency support
 * @access  Private (PATIENT only)
 */
router.post(
  '/process',
  authenticate,
  authorizeRoles('PATIENT'),
  idempotency({ ttlSeconds: 86400 }),
  validateRequest(processPaymentSchema),
  paymentsController.processPayment
);

/**
 * @route   GET /api/v1/payments/consultation/:consultationId
 * @desc    Get payment receipt for a consultation
 * @access  Private (Authorized Patient/Doctor/Admin)
 */
router.get(
  '/consultation/:consultationId',
  authenticate,
  validateRequest(consultationIdParamSchema, 'params'),
  paymentsController.getPaymentByConsultation
);

/**
 * @route   POST /api/v1/payments/:id/refund
 * @desc    Refund payment and cancel consultation
 * @access  Private (DOCTOR or ADMIN only)
 */
router.post(
  '/:id/refund',
  authenticate,
  authorizeRoles('DOCTOR', 'ADMIN'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(refundPaymentSchema),
  paymentsController.refundPayment
);

module.exports = router;
