const adminService = require('./admin.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Get dashboard analytics & operational summary
 * GET /api/v1/admin/analytics
 */
async function getAnalytics(req, res, next) {
  try {
    const analytics = await adminService.getDashboardAnalytics();
    return ApiResponse.success(res, 200, 'Admin analytics retrieved successfully', analytics);
  } catch (error) {
    next(error);
  }
}

/**
 * Get system audit logs
 * GET /api/v1/admin/audit-logs
 */
async function getAuditLogs(req, res, next) {
  try {
    const result = await adminService.getAuditLogs(req.query);
    return ApiResponse.success(res, 200, 'Audit logs retrieved successfully', result.logs, result.pagination);
  } catch (error) {
    next(error);
  }
}

/**
 * Verify or unverify a doctor
 * PATCH /api/v1/admin/doctors/:id/verify
 */
async function verifyDoctor(req, res, next) {
  try {
    const doctor = await adminService.verifyDoctor(req.params.id, req.body.isVerified, req.user.id);
    const msg = req.body.isVerified
      ? 'Doctor verified successfully'
      : 'Doctor verification revoked successfully';
    return ApiResponse.success(res, 200, msg, doctor);
  } catch (error) {
    next(error);
  }
}

/**
 * Activate or deactivate a user account
 * PATCH /api/v1/admin/users/:id/status
 */
async function updateUserStatus(req, res, next) {
  try {
    const user = await adminService.updateUserStatus(req.params.id, req.body.isActive, req.user.id);
    const msg = req.body.isActive
      ? 'User account activated successfully'
      : 'User account deactivated successfully';
    return ApiResponse.success(res, 200, msg, user);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAnalytics,
  getAuditLogs,
  verifyDoctor,
  updateUserStatus,
};
