const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { deletePattern } = require('../../config/redis');

/**
 * Get comprehensive system metrics, business breakdown, and analytics
 */
async function getDashboardAnalytics() {
  const [
    totalUsers,
    totalPatients,
    totalDoctors,
    pendingVerifications,
    consultationsByStatus,
    totalPrescriptions,
    topSpecializations,
    completedConsultations,
    recentAudits,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.patientProfile.count(),
    prisma.doctorProfile.count(),
    prisma.doctorProfile.count({ where: { isVerified: false } }),
    prisma.consultation.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.prescription.count(),
    prisma.doctorProfile.groupBy({
      by: ['specialization'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    prisma.consultation.findMany({
      where: { status: 'COMPLETED' },
      include: {
        doctor: { select: { consultationFee: true } },
      },
    }),
    prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, role: true } },
      },
    }),
  ]);

  // Aggregate consultations count map
  const consultationStats = {
    TOTAL: 0,
    PENDING: 0,
    CONFIRMED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    RESCHEDULED: 0,
  };

  consultationsByStatus.forEach((stat) => {
    consultationStats[stat.status] = stat._count.id;
    consultationStats.TOTAL += stat._count.id;
  });

  // Calculate gross completed consultation revenue
  const totalCompletedRevenue = completedConsultations.reduce((sum, c) => {
    return sum + (parseFloat(c.doctor.consultationFee) || 0);
  }, 0);

  return {
    overview: {
      totalUsers,
      totalPatients,
      totalDoctors,
      pendingDoctorVerifications: pendingVerifications,
      totalPrescriptions,
      grossCompletedRevenue: `₹${totalCompletedRevenue.toFixed(2)}`,
    },
    consultations: consultationStats,
    topSpecializations: topSpecializations.map((s) => ({
      specialization: s.specialization,
      doctorCount: s._count.id,
    })),
    recentSystemActivity: recentAudits,
  };
}

/**
 * Get paginated audit logs with flexible filtering
 */
async function getAuditLogs(query = {}) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(query.action && { action: query.action }),
    ...(query.entityType && { entityType: query.entityType }),
    ...(query.userId && { userId: query.userId }),
    ...(query.startDate && { createdAt: { gte: new Date(query.startDate) } }),
    ...(query.endDate && { createdAt: { lte: new Date(query.endDate) } }),
  };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    logs,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Verify or unverify a doctor profile
 */
async function verifyDoctor(doctorId, isVerified, adminUserId) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { OR: [{ id: doctorId }, { userId: doctorId }] },
  });

  if (!doctor) {
    throw ApiError.notFound('Doctor profile not found');
  }

  const updatedDoctor = await prisma.$transaction(async (tx) => {
    const updated = await tx.doctorProfile.update({
      where: { id: doctor.id },
      data: { isVerified },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'USER_REGISTERED', // Records administrative verification change
        entityType: 'DoctorProfile',
        entityId: doctor.id,
        details: {
          action: 'ADMIN_DOCTOR_VERIFICATION',
          isVerified,
          licenseNumber: doctor.licenseNumber,
        },
      },
    });

    return updated;
  });

  // Invalidate doctor listing cache across all search queries
  await deletePattern('doctors:*');

  return updatedDoctor;
}

/**
 * Activate or deactivate a user account
 */
async function updateUserStatus(targetUserId, isActive, adminUserId) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });

  if (!user) {
    throw ApiError.notFound('User account not found');
  }

  if (user.id === adminUserId) {
    throw ApiError.badRequest('Admins cannot deactivate their own account');
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'USER_LOGIN', // Administrative account status modification
        entityType: 'User',
        entityId: targetUserId,
        details: {
          action: 'ADMIN_USER_STATUS_CHANGE',
          previousStatus: user.isActive,
          newStatus: isActive,
        },
      },
    });

    return updated;
  });

  return updatedUser;
}

module.exports = {
  getDashboardAnalytics,
  getAuditLogs,
  verifyDoctor,
  updateUserStatus,
};
