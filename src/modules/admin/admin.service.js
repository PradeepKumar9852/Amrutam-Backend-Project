const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');
const { deletePattern } = require('../../config/redis');

/**
 * Get comprehensive system metrics, business breakdown, and analytics
 * Supports date range filtering, booking trends, cancellation analytics, and financial totals.
 */
async function getDashboardAnalytics(query = {}) {
  const dateFilter = {};
  if (query.startDate) {
    dateFilter.gte = new Date(query.startDate);
  }
  if (query.endDate) {
    dateFilter.lte = new Date(query.endDate);
  }
  const hasDateFilter = Object.keys(dateFilter).length > 0;
  const consultationWhere = hasDateFilter ? { createdAt: dateFilter } : {};

  const [
    totalUsers,
    totalPatients,
    totalDoctors,
    pendingVerifications,
    consultationsByStatus,
    totalPrescriptions,
    topSpecializations,
    completedConsultations,
    cancelledConsultations,
    allConsultationsInPeriod,
    recentAudits,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.patientProfile.count(),
    prisma.doctorProfile.count(),
    prisma.doctorProfile.count({ where: { isVerified: false } }),
    prisma.consultation.groupBy({
      by: ['status'],
      where: consultationWhere,
      _count: { id: true },
    }),
    prisma.prescription.count(hasDateFilter ? { where: { createdAt: dateFilter } } : undefined),
    prisma.doctorProfile.groupBy({
      by: ['specialization'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
    prisma.consultation.findMany({
      where: { status: 'COMPLETED', ...consultationWhere },
      include: {
        doctor: { select: { consultationFee: true } },
      },
    }),
    prisma.consultation.findMany({
      where: { status: 'CANCELLED', ...consultationWhere },
      select: {
        id: true,
        cancellationReason: true,
        createdAt: true,
      },
    }),
    prisma.consultation.findMany({
      where: consultationWhere,
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: 'asc' },
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

  // Booking trends by day (YYYY-MM-DD)
  const trendsMap = {};
  allConsultationsInPeriod.forEach((c) => {
    const dayKey = c.createdAt.toISOString().slice(0, 10);
    if (!trendsMap[dayKey]) {
      trendsMap[dayKey] = { date: dayKey, total: 0, confirmed: 0, completed: 0, cancelled: 0 };
    }
    trendsMap[dayKey].total += 1;
    if (c.status === 'CONFIRMED') trendsMap[dayKey].confirmed += 1;
    if (c.status === 'COMPLETED') trendsMap[dayKey].completed += 1;
    if (c.status === 'CANCELLED') trendsMap[dayKey].cancelled += 1;
  });
  const bookingTrends = Object.values(trendsMap);

  // Cancellation metrics & reason distribution
  const cancellationReasonsMap = {};
  cancelledConsultations.forEach((c) => {
    const reason = c.cancellationReason || 'No reason specified';
    cancellationReasonsMap[reason] = (cancellationReasonsMap[reason] || 0) + 1;
  });
  const cancellationRate =
    consultationStats.TOTAL > 0
      ? `${((consultationStats.CANCELLED / consultationStats.TOTAL) * 100).toFixed(1)}%`
      : '0.0%';

  return {
    overview: {
      totalUsers,
      totalPatients,
      totalDoctors,
      pendingDoctorVerifications: pendingVerifications,
      totalPrescriptions,
      grossCompletedRevenue: `₹${totalCompletedRevenue.toFixed(2)}`,
      dateRange: {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
      },
    },
    consultations: consultationStats,
    bookingTrends,
    cancellations: {
      totalCancelled: consultationStats.CANCELLED,
      cancellationRate,
      breakdownByReason: Object.entries(cancellationReasonsMap).map(([reason, count]) => ({
        reason,
        count,
      })),
    },
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

/**
 * Get paginated list of users with optional role, search, and status filtering
 */
async function getUsers(query = {}) {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const where = {
    ...(query.role && { role: query.role }),
    ...(query.isActive !== undefined && {
      isActive: query.isActive === 'true' || query.isActive === true,
    }),
    ...(query.search && {
      OR: [
        { email: { contains: query.search, mode: 'insensitive' } },
        { phoneNumber: { contains: query.search } },
      ],
    }),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        patientProfile: true,
        doctorProfile: true,
      },
    }),
  ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    users,
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
 * Admin creates a user account (e.g. ADMIN, DOCTOR, PATIENT)
 */
async function createUser(payload, adminUserId) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: payload.email },
        ...(payload.phoneNumber ? [{ phoneNumber: payload.phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    throw ApiError.conflict('A user with this email or phone number already exists');
  }

  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash(payload.password, 12);

  const newUser = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: payload.email,
        passwordHash,
        phoneNumber: payload.phoneNumber || null,
        role: payload.role || 'PATIENT',
        isActive: payload.isActive !== undefined ? payload.isActive : true,
      },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        createdAt: true,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: user.id,
        details: { action: 'ADMIN_CREATED_USER', role: user.role, email: user.email },
      },
    });

    return user;
  });

  return newUser;
}

module.exports = {
  getDashboardAnalytics,
  getAuditLogs,
  verifyDoctor,
  updateUserStatus,
  getUsers,
  createUser,
};

