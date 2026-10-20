const ApiResponse = require('../../utils/apiResponse');
const paymentsService = require('./payments.service');

/**
 * Controller for POST /api/v1/payments/process
 */
async function processPayment(req, res, next) {
  try {
    const idempotencyKey =
      req.get('idempotency-key') || req.get('x-idempotency-key') || req.body.idempotencyKey;

    const clientInfo = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    const result = await paymentsService.processPayment(
      req.user.id,
      req.body,
      idempotencyKey,
      clientInfo
    );

    if (result.isIdempotentReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return ApiResponse.success(
        res,
        200,
        'Payment already completed (Idempotent replay)',
        result.payment
      );
    }

    return ApiResponse.success(res, 201, 'Payment processed successfully', result.payment);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller for GET /api/v1/payments/consultation/:consultationId
 */
async function getPaymentByConsultation(req, res, next) {
  try {
    const result = await paymentsService.getPaymentByConsultationId(
      req.user,
      req.params.consultationId
    );
    return ApiResponse.success(res, 200, 'Payment details retrieved successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller for POST /api/v1/payments/:id/refund
 */
async function refundPayment(req, res, next) {
  try {
    const clientInfo = {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    const refunded = await paymentsService.refundPayment(
      req.user,
      req.params.id,
      req.body.reason,
      clientInfo
    );

    return ApiResponse.success(res, 200, 'Payment refunded successfully', refunded);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  processPayment,
  getPaymentByConsultation,
  refundPayment,
};
