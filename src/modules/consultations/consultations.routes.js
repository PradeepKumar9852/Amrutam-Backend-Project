const express = require('express');
const consultationsController = require('./consultations.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const { uuidParamSchema } = require('../../utils/commonValidation');
const {
  createConsultationSchema,
  cancelConsultationSchema,
  updateStatusSchema,
  consultationQuerySchema,
} = require('./consultations.validation');

const router = express.Router();

/**
 * @route   POST /api/v1/consultations
 * @desc    Book a consultation / appointment
 * @access  Private (PATIENT only)
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('PATIENT'),
  validateRequest(createConsultationSchema),
  consultationsController.bookConsultation
);

/**
 * @route   GET /api/v1/consultations
 * @desc    List consultations for the authenticated user
 * @access  Private (PATIENT, DOCTOR, ADMIN)
 */
router.get(
  '/',
  authenticate,
  validateRequest(consultationQuerySchema, 'query'),
  consultationsController.listConsultations
);

/**
 * @route   GET /api/v1/consultations/:id
 * @desc    Get details of a specific consultation
 * @access  Private (PATIENT, DOCTOR, ADMIN)
 */
router.get(
  '/:id',
  authenticate,
  validateRequest(uuidParamSchema, 'params'),
  consultationsController.getConsultationById
);

/**
 * @route   PATCH /api/v1/consultations/:id/cancel
 * @desc    Cancel a consultation
 * @access  Private (PATIENT, DOCTOR, ADMIN)
 */
router.patch(
  '/:id/cancel',
  authenticate,
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(cancelConsultationSchema),
  consultationsController.cancelConsultation
);

/**
 * @route   PATCH /api/v1/consultations/:id/status
 * @desc    Update consultation status (CONFIRMED, IN_PROGRESS, COMPLETED)
 * @access  Private (DOCTOR, ADMIN)
 */
router.patch(
  '/:id/status',
  authenticate,
  authorizeRoles('DOCTOR', 'ADMIN'),
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(updateStatusSchema),
  consultationsController.updateStatus
);

module.exports = router;
