const express = require('express');
const auditController = require('./audit.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const { auditQuerySchema } = require('./audit.validation');

const router = express.Router();

/**
 * @route   GET /api/v1/audit/logs
 * @desc    Query immutable audit logs
 * @access  Private (ADMIN only)
 */
router.get(
  '/logs',
  authenticate,
  authorizeRoles('ADMIN'),
  validateRequest(auditQuerySchema, 'query'),
  auditController.getAuditLogs
);

module.exports = router;
