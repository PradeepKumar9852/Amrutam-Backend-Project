const express = require('express');
const bookingsController = require('./bookings.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const {
  createBookingSchema,
  cancelBookingSchema,
  updateStatusSchema,
  bookingQuerySchema,
} = require('./bookings.validation');

const router = express.Router();

/**
 * @route   POST /api/v1/bookings
 * @desc    Book a doctor appointment
 * @access  Private (PATIENT only)
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('PATIENT'),
  validateRequest(createBookingSchema),
  bookingsController.createBooking
);

/**
 * @route   GET /api/v1/bookings
 * @desc    List bookings for currently authenticated user
 * @access  Private (Patient/Doctor/Admin)
 */
router.get(
  '/',
  authenticate,
  validateRequest(bookingQuerySchema, 'query'),
  bookingsController.listUserBookings
);

const { uuidParamSchema } = require('../../utils/commonValidation');

/**
 * @route   GET /api/v1/bookings/:id
 * @desc    Get details of a specific booking
 * @access  Private (Patient/Doctor/Admin)
 */
router.get('/:id', authenticate, validateRequest(uuidParamSchema, 'params'), bookingsController.getBookingById);

/**
 * @route   PATCH /api/v1/bookings/:id/cancel
 * @desc    Cancel an appointment and free the slot
 * @access  Private (Patient/Doctor/Admin)
 */
router.patch(
  '/:id/cancel',
  authenticate,
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(cancelBookingSchema),
  bookingsController.cancelBooking
);

/**
 * @route   PATCH /api/v1/bookings/:id/status
 * @desc    Update consultation status (CONFIRMED, IN_PROGRESS, COMPLETED)
 * @access  Private (DOCTOR or ADMIN only)
 */
router.patch(
  '/:id/status',
  authenticate,
  authorizeRoles('DOCTOR', 'ADMIN'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateStatusSchema),
  bookingsController.updateStatus
);

module.exports = router;
