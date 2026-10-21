const usersService = require('./users.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Controller: Get current authenticated user profile
 */
async function getProfile(req, res, next) {
  try {
    const profile = await usersService.getUserProfile(req.user.id);
    return ApiResponse.success(res, 200, 'User profile retrieved successfully', profile);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: Update current authenticated user profile
 */
async function updateProfile(req, res, next) {
  try {
    const updated = await usersService.updateUserProfile(req.user.id, req.body);
    return ApiResponse.success(res, 200, 'Profile updated successfully', updated);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile,
};
