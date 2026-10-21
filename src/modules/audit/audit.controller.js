const auditService = require('./audit.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Controller: Get paginated audit logs
 */
async function getAuditLogs(req, res, next) {
  try {
    const result = await auditService.getAuditLogs(req.query);
    return ApiResponse.success(res, 200, 'Audit logs retrieved successfully', result.logs, result.pagination);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAuditLogs,
};
