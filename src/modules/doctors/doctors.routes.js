const express = require('express');
const doctorsController = require('./doctors.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const {
  createSlotSchema,
  createMultipleSlotsSchema,
  updateSlotSchema,
  updateDoctorProfileSchema,
  doctorQuerySchema,
  slotQuerySchema,
} = require('./doctors.validation');

const router = express.Router();

/**
 * @route   GET /api/v1/doctors
 * @desc    List all doctors with search and filters
 * @access  Public
 */
router.get('/', validateRequest(doctorQuerySchema, 'query'), doctorsController.listDoctors);

/**
 * @route   PUT /api/v1/doctors/profile
 * @desc    Update authenticated doctor profile
 * @access  Private (DOCTOR only)
 */
router.put(
  '/profile',
  authenticate,
  authorizeRoles('DOCTOR'),
  validateRequest(updateDoctorProfileSchema),
  doctorsController.updateProfile
);

/**
 * @route   POST /api/v1/doctors/slots
 * @desc    Create doctor availability slots (Single or array)
 * @access  Private (DOCTOR only)
 */
router.post(
  '/slots',
  authenticate,
  authorizeRoles('DOCTOR'),
  (req, res, next) => {
    // Dynamically validate single slot or batch array
    const schema = Array.isArray(req.body.slots) ? createMultipleSlotsSchema : createSlotSchema;
    return validateRequest(schema)(req, res, next);
  },
  doctorsController.createSlots
);

const { uuidParamSchema, slotIdParamSchema } = require('../../utils/commonValidation');

/**
 * @route   PATCH /api/v1/doctors/slots/:slotId
 * @desc    Update unbooked availability slot times
 * @access  Private (DOCTOR only)
 */
router.patch(
  '/slots/:slotId',
  authenticate,
  authorizeRoles('DOCTOR'),
  validateRequest(slotIdParamSchema, 'params'),
  validateRequest(updateSlotSchema),
  doctorsController.updateSlot
);

/**
 * @route   DELETE /api/v1/doctors/slots/:slotId
 * @desc    Delete unbooked availability slot
 * @access  Private (DOCTOR only)
 */
router.delete(
  '/slots/:slotId',
  authenticate,
  authorizeRoles('DOCTOR'),
  validateRequest(slotIdParamSchema, 'params'),
  doctorsController.deleteSlot
);

/**
 * @route   GET /api/v1/doctors/:id
 * @desc    Get detailed doctor profile
 * @access  Public
 */
router.get('/:id', validateRequest(uuidParamSchema, 'params'), doctorsController.getDoctorById);

/**
 * @route   GET /api/v1/doctors/:id/slots
 * @desc    Get doctor availability slots
 * @access  Public / Patients
 */
router.get(
  '/:id/slots',
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(slotQuerySchema, 'query'),
  doctorsController.getDoctorSlots
);

module.exports = router;
