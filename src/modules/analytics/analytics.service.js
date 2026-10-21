const adminService = require('../admin/admin.service');

/**
 * Service to aggregate platform metrics, consultation statistics, and business intelligence
 */
async function getPlatformAnalytics(query = {}) {
  return adminService.getDashboardAnalytics(query);
}

module.exports = {
  getPlatformAnalytics,
};
