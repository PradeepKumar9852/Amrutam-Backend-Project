const express = require('express');
const prescriptionsController = require('./prescriptions.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const {
  createPrescriptionSchema,
  prescriptionQuerySchema,
} = require('./prescriptions.validation');

const router = express.Router();

/**
 * @route   POST /api/v1/prescriptions
 * @desc    Issue a new prescription with medicine items
 * @access  Private (DOCTOR only)
 */
router.post(
  '/',
  authenticate,
  authorizeRoles('DOCTOR'),
  validateRequest(createPrescriptionSchema),
  prescriptionsController.createPrescription
);

/**
 * @route   GET /api/v1/prescriptions
 * @desc    List prescriptions for authenticated user
 * @access  Private (Patient/Doctor/Admin)
 */
router.get(
  '/',
  authenticate,
  validateRequest(prescriptionQuerySchema, 'query'),
  prescriptionsController.listPrescriptions
);

const { uuidParamSchema, consultationIdParamSchema } = require('../../utils/commonValidation');

/**
 * @route   GET /api/v1/prescriptions/consultation/:consultationId
 * @desc    Get prescription for a specific consultation
 * @access  Private (Authorized Patient/Doctor/Admin)
 */
router.get(
  '/consultation/:consultationId',
  authenticate,
  validateRequest(consultationIdParamSchema, 'params'),
  prescriptionsController.getPrescriptionByConsultationId
);

/**
 * @route   GET /api/v1/prescriptions/:id
 * @desc    Get detailed prescription by ID
 * @access  Private (Authorized Patient/Doctor/Admin)
 */
router.get(
  '/:id',
  authenticate,
  validateRequest(uuidParamSchema, 'params'),
  prescriptionsController.getPrescriptionById
);

module.exports = router;
