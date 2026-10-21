const analyticsService = require('./analytics.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Controller: Get platform overview analytics
 */
async function getOverview(req, res, next) {
  try {
    const analytics = await analyticsService.getPlatformAnalytics(req.query);
    return ApiResponse.success(res, 200, 'Platform analytics retrieved successfully', analytics);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getOverview,
};
