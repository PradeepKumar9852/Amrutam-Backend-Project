const express = require('express');
const adminController = require('./admin.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const {
  verifyDoctorSchema,
  userStatusSchema,
  auditLogQuerySchema,
  createUserSchema,
  userQuerySchema,
  analyticsQuerySchema,
} = require('./admin.validation');

const router = express.Router();

// Apply Admin-only security barrier to all routes in this router
router.use(authenticate, authorizeRoles('ADMIN'));

/**
 * @route   GET /api/v1/admin/analytics
 * @desc    Get system analytics, revenue summary, and operational metrics
 * @access  Private (ADMIN only)
 */
router.get(
  '/analytics',
  validateRequest(analyticsQuerySchema, 'query'),
  adminController.getAnalytics
);

/**
 * @route   GET /api/v1/admin/audit-logs
 * @desc    Query and filter security and operational audit logs
 * @access  Private (ADMIN only)
 */
router.get(
  '/audit-logs',
  validateRequest(auditLogQuerySchema, 'query'),
  adminController.getAuditLogs
);

/**
 * @route   GET /api/v1/admin/users
 * @desc    List and search user accounts with status and role filters
 * @access  Private (ADMIN only)
 */
router.get(
  '/users',
  validateRequest(userQuerySchema, 'query'),
  adminController.getUsers
);

/**
 * @route   POST /api/v1/admin/users
 * @desc    Admin creates a user account (with explicit role)
 * @access  Private (ADMIN only)
 */
router.post(
  '/users',
  validateRequest(createUserSchema),
  adminController.createUser
);

const { uuidParamSchema } = require('../../utils/commonValidation');

/**
 * @route   PATCH /api/v1/admin/doctors/:id/verify
 * @desc    Approve or revoke doctor credential verification
 * @access  Private (ADMIN only)
 */
router.patch(
  '/doctors/:id/verify',
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(verifyDoctorSchema),
  adminController.verifyDoctor
);

/**
 * @route   PATCH /api/v1/admin/users/:id/status
 * @desc    Activate or deactivate user account
 * @access  Private (ADMIN only)
 */
router.patch(
  '/users/:id/status',
  validateRequest(uuidParamSchema, 'params'),
  validateRequest(userStatusSchema),
  adminController.updateUserStatus
);

module.exports = router;

