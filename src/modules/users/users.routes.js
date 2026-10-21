const express = require('express');
const usersController = require('./users.controller');
const authenticate = require('../../middlewares/authMiddleware');
const validateRequest = require('../../middlewares/validateRequest');
const { updateProfileSchema } = require('./users.validation');

const router = express.Router();

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current logged in user profile
 * @access  Private
 */
router.get('/me', authenticate, usersController.getProfile);

/**
 * @route   PUT /api/v1/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', authenticate, validateRequest(updateProfileSchema), usersController.updateProfile);

module.exports = router;
