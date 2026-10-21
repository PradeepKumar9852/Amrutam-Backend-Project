const express = require('express');
const analyticsController = require('./analytics.controller');
const authenticate = require('../../middlewares/authMiddleware');
const authorizeRoles = require('../../middlewares/roleMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const { analyticsQuerySchema } = require('../admin/admin.validation');

const router = express.Router();

/**
 * @route   GET /api/v1/analytics/overview
 * @desc    Get aggregate platform metrics & consultation statistics
 * @access  Private (ADMIN only)
 */
router.get(
  '/overview',
  authenticate,
  authorizeRoles('ADMIN'),
  validateRequest(analyticsQuerySchema, 'query'),
  analyticsController.getOverview
);

module.exports = router;
