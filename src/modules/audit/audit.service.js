const adminService = require('../admin/admin.service');
const { prisma } = require('../../config/prisma');

/**
 * Service to query and record immutable audit logs
 */
async function getAuditLogs(query) {
  return adminService.getAuditLogs(query);
}

/**
 * Helper to record an immutable audit log entry
 */
async function recordAuditLog(data) {
  return prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId ? String(data.entityId) : null,
      details: data.details || null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
    },
  });
}

module.exports = {
  getAuditLogs,
  recordAuditLog,
};
