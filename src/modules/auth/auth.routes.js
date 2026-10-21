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
  enableMfaSchema,
  disableMfaSchema,
  verifyMfaLoginSchema,
  changePasswordSchema,
  updateProfileSchema,
  deactivateAccountSchema,
  revokeTokenSchema,
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
 * @desc    Register a new doctor account (requires administrative verification)
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
 * @desc    Authenticate user & return JWT token pair (or MFA challenge)
 * @access  Public (Rate limited)
 */
router.post(
  '/login',
  authRateLimiter,
  validateRequest(loginSchema),
  authController.login
);

/**
 * @route   POST /api/v1/auth/mfa/verify-login
 * @desc    Complete login MFA challenge using 6-digit TOTP or backup recovery code
 * @access  Public (Rate limited)
 */
router.post(
  '/mfa/verify-login',
  authRateLimiter,
  validateRequest(verifyMfaLoginSchema),
  authController.verifyMfaLogin
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
 * @route   POST /api/v1/auth/revoke
 * @desc    Explicitly revoke an access or refresh token
 * @access  Public (Rate limited)
 */
router.post(
  '/revoke',
  authRateLimiter,
  validateRequest(revokeTokenSchema),
  authController.revokeToken
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently logged-in user profile
 * @access  Private (Authenticated)
 */
router.get('/me', authenticate, authController.getMe);

/**
 * @route   PUT /api/v1/auth/profile
 * @desc    Update authenticated user profile (role escalation protected)
 * @access  Private (Authenticated)
 */
router.put(
  '/profile',
  authenticate,
  validateRequest(updateProfileSchema),
  authController.updateProfile
);

/**
 * @route   PUT /api/v1/auth/change-password
 * @desc    Change password securely and invalidate previous session
 * @access  Private (Authenticated, Rate limited)
 */
router.put(
  '/change-password',
  authenticate,
  authRateLimiter,
  validateRequest(changePasswordSchema),
  authController.changePassword
);

/**
 * @route   PATCH /api/v1/auth/deactivate
 * @desc    Self account deactivation
 * @access  Private (Authenticated, Rate limited)
 */
router.patch(
  '/deactivate',
  authenticate,
  authRateLimiter,
  validateRequest(deactivateAccountSchema),
  authController.deactivateAccount
);

/**
 * @route   POST /api/v1/auth/mfa/setup
 * @desc    Enroll in MFA: generates TOTP secret, otpauth URL, and emergency backup codes
 * @access  Private (Authenticated)
 */
router.post('/mfa/setup', authenticate, authController.setupMfa);

/**
 * @route   POST /api/v1/auth/mfa/enable
 * @desc    Confirm setup by validating 6-digit TOTP code and activating MFA
 * @access  Private (Authenticated, Rate limited)
 */
router.post(
  '/mfa/enable',
  authenticate,
  authRateLimiter,
  validateRequest(enableMfaSchema),
  authController.enableMfa
);

/**
 * @route   POST /api/v1/auth/mfa/disable
 * @desc    Disable MFA with password and TOTP/recovery code confirmation
 * @access  Private (Authenticated, Rate limited)
 */
router.post(
  '/mfa/disable',
  authenticate,
  authRateLimiter,
  validateRequest(disableMfaSchema),
  authController.disableMfa
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Revoke current JWT authentication token and refresh token via Redis blacklist
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
