const express = require('express');
const authController = require('./auth.controller');
const validateRequest = require('../../middlewares/validateRequest');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const { authRateLimiter } = require('../../middlewares/rateLimiter');
const ApiResponse = require('../../utils/apiResponse');
const {
  registerPatientSchema,
  registerDoctorSchema,
  loginSchema,
  refreshTokenSchema,
} = require('./auth.validation');

const router = express.Router();

/**
 * @route   POST /api/v1/auth/register/patient
 * @desc    Register a new patient account
 * @access  Public (Rate limited)
 */
router.post(
  '/register/patient',
  authRateLimiter,
  validateRequest(registerPatientSchema),
  authController.registerPatient
);

/**
 * @route   POST /api/v1/auth/register/doctor
 * @desc    Register a new doctor account (requires verification)
 * @access  Public (Rate limited)
 */
router.post(
  '/register/doctor',
  authRateLimiter,
  validateRequest(registerDoctorSchema),
  authController.registerDoctor
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user & return JWT token pair
 * @access  Public (Rate limited)
 */
router.post(
  '/login',
  authRateLimiter,
  validateRequest(loginSchema),
  authController.login
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Rotate and refresh access token using valid refresh token
 * @access  Public (Rate limited)
 */
router.post(
  '/refresh',
  authRateLimiter,
  validateRequest(refreshTokenSchema),
  authController.refreshToken
);


/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently logged in user profile
 * @access  Private (Authenticated)
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Revoke current JWT authentication token via Redis blacklist
 * @access  Private (Authenticated)
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   GET /api/v1/auth/doctor-only
 * @desc    Role-protected route (DOCTOR only)
 * @access  Private (Doctor)
 */
router.get(
  '/doctor-only',
  authenticate,
  authorizeRoles('DOCTOR'),
  (req, res) => {
    return ApiResponse.success(res, 200, 'Welcome to the Doctor Portal', {
      user: req.user,
    });
  }
);

/**
 * @route   GET /api/v1/auth/admin-only
 * @desc    Role-protected route (ADMIN only)
 * @access  Private (Admin)
 */
router.get(
  '/admin-only',
  authenticate,
  authorizeRoles('ADMIN'),
  (req, res) => {
    return ApiResponse.success(res, 200, 'Welcome to the Admin Control Panel', {
      user: req.user,
    });
  }
);

module.exports = router;
