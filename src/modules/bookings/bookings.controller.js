const bookingService = require('./bookings.service');
const ApiResponse = require('../../utils/apiResponse');

function getClientInfo(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * Book an appointment
 * POST /api/v1/bookings
 */
async function createBooking(req, res, next) {
  try {
    const idempotencyKey =
      req.get('idempotency-key') || req.get('x-idempotency-key') || req.body.idempotencyKey;
    const clientInfo = getClientInfo(req);

    const { booking, isIdempotentReplay } = await bookingService.createBooking(
      req.user.id,
      req.body,
      idempotencyKey,
      clientInfo
    );

    if (isIdempotentReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
      return ApiResponse.success(res, 200, 'Appointment retrieved (Idempotent response)', booking);
    }

    return ApiResponse.created(res, 'Appointment booked successfully', booking);
  } catch (error) {
    next(error);
  }
}

/**
 * List bookings for current user (Patient or Doctor)
 * GET /api/v1/bookings
 */
async function listUserBookings(req, res, next) {
  try {
    const result = await bookingService.listUserBookings(req.user, req.query);
    return ApiResponse.success(
      res,
      200,
      'Bookings retrieved successfully',
      result.bookings,
      result.pagination
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Get booking details by ID
 * GET /api/v1/bookings/:id
 */
async function getBookingById(req, res, next) {
  try {
    const booking = await bookingService.getBookingById(req.user, req.params.id);
    return ApiResponse.success(res, 200, 'Booking details retrieved successfully', booking);
  } catch (error) {
    next(error);
  }
}

/**
 * Cancel an appointment
 * PATCH /api/v1/bookings/:id/cancel
 */
async function cancelBooking(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const updated = await bookingService.cancelBooking(
      req.user,
      req.params.id,
      req.body.cancellationReason,
      clientInfo
    );
    return ApiResponse.success(res, 200, 'Appointment cancelled successfully. Slot has been freed.', updated);
  } catch (error) {
    next(error);
  }
}

/**
 * Update consultation status (Doctor or Admin)
 * PATCH /api/v1/bookings/:id/status
 */
async function updateStatus(req, res, next) {
  try {
    const updated = await bookingService.updateBookingStatus(
      req.user,
      req.params.id,
      req.body.status,
      req.body.notes
    );
    return ApiResponse.success(res, 200, `Appointment status updated to ${req.body.status}`, updated);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createBooking,
  listUserBookings,
  getBookingById,
  cancelBooking,
  updateStatus,
};
