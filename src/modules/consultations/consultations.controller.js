const consultationsService = require('./consultations.service');
const ApiResponse = require('../../utils/apiResponse');

function getClientInfo(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * Controller: Book a consultation
 */
async function bookConsultation(req, res, next) {
  try {
    const idempotencyKey =
      req.get('idempotency-key') || req.get('x-idempotency-key') || req.body.idempotencyKey;
    const clientInfo = getClientInfo(req);

    const { booking, isIdempotentReplay } = await consultationsService.bookConsultation(
      req.user.id,
      req.body,
      idempotencyKey,
      clientInfo
    );

    if (isIdempotentReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return ApiResponse.success(res, 200, 'Consultation retrieved (Idempotent response)', booking);
    }

    return ApiResponse.created(res, 'Consultation booked successfully', booking);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: List consultations
 */
async function listConsultations(req, res, next) {
  try {
    const result = await consultationsService.listConsultations(req.user, req.query);
    return ApiResponse.success(
      res,
      200,
      'Consultations retrieved successfully',
      result.bookings,
      result.pagination
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Get consultation by ID
 */
async function getConsultationById(req, res, next) {
  try {
    const consultation = await consultationsService.getConsultationById(req.user, req.params.id);
    return ApiResponse.success(res, 200, 'Consultation details retrieved successfully', consultation);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update status
 */
async function updateStatus(req, res, next) {
  try {
    const updated = await consultationsService.updateConsultationStatus(
      req.user,
      req.params.id,
      req.body.status,
      req.body.notes
    );
    return ApiResponse.success(res, 200, 'Consultation status updated successfully', updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Cancel consultation
 */
async function cancelConsultation(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const reason = req.body.cancellationReason || req.body.reason;
    const updated = await consultationsService.cancelConsultation(
      req.user,
      req.params.id,
      reason,
      clientInfo
    );
    return ApiResponse.success(
      res,
      200,
      'Consultation cancelled successfully. Slot has been freed.',
      updated
    );
  } catch (error) {
    next(error);
  }
}

module.exports = {
  bookConsultation,
  listConsultations,
  getConsultationById,
  updateStatus,
  cancelConsultation,
};
