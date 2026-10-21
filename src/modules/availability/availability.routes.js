const express = require('express');
const availabilityController = require('./availability.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const { uuidParamSchema, slotIdParamSchema } = require('../../utils/commonValidation');
const {
  createSlotSchema,
  createMultipleSlotsSchema,
  slotQuerySchema,
} = require('./availability.validation');

const router = express.Router();

/**
 * @route   POST /api/v1/availability/slots
 * @desc    Create doctor availability slots
 * @access  Private (DOCTOR only)
 */
router.post(
  '/slots',
  authenticate,
  authorizeRoles('DOCTOR'),
  (req, res, next) => {
    const schema = Array.isArray(req.body.slots) ? createMultipleSlotsSchema : createSlotSchema;
    return validateRequest(schema)(req, res, next);
  },
  availabilityController.createSlots
);

/**
 * @route   GET /api/v1/availability/doctors/:doctorId/slots
 * @desc    Get doctor availability slots
 * @access  Public
 */
router.get(
  '/doctors/:doctorId/slots',
  (req, res, next) => {
    // map doctorId to id param schema
    req.params.id = req.params.doctorId;
    return validateRequest(uuidParamSchema, 'params')(req, res, next);
  },
  validateRequest(slotQuerySchema, 'query'),
  availabilityController.getDoctorSlots
);

/**
 * @route   PATCH /api/v1/availability/slots/:slotId
 * @desc    Update unbooked availability slot times
 * @access  Private (DOCTOR only)
 */
router.patch(
  '/slots/:slotId',
  authenticate,
  authorizeRoles('DOCTOR'),
  validateRequest(slotIdParamSchema, 'params'),
  validateRequest(createSlotSchema),
  availabilityController.updateSlot
);

/**
 * @route   DELETE /api/v1/availability/slots/:slotId
 * @desc    Delete unbooked availability slot
 * @access  Private (DOCTOR only)
 */
router.delete(
  '/slots/:slotId',
  authenticate,
  authorizeRoles('DOCTOR'),
  validateRequest(slotIdParamSchema, 'params'),
  availabilityController.deleteSlot
);

module.exports = router;
