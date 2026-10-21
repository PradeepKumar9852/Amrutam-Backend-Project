const { prisma } = require('../../config/prisma');
const ApiError = require('../../utils/apiError');

/**
 * Get profile details for the authenticated user
 */
async function getUserProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      role: true,
      isActive: true,
      mfaEnabled: true,
      createdAt: true,
      patientProfile: true,
      doctorProfile: true,
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
}

/**
 * Update user / patient profile
 */
async function updateUserProfile(userId, data) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { patientProfile: true, doctorProfile: true },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const { firstName, lastName, phoneNumber, dateOfBirth, gender, bloodGroup, emergencyContact, address } = data;

  // Check phone number conflict if changed
  if (phoneNumber !== undefined && phoneNumber !== user.phoneNumber) {
    const existingPhone = await prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (existingPhone && existingPhone.id !== user.id) {
      throw ApiError.conflict('An account with this phone number already exists');
    }
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    // 1. Update basic user data if phoneNumber provided
    if (phoneNumber !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: { phoneNumber },
      });
    }

    // 2. Update Patient profile if patient
    if (user.role === 'PATIENT' && user.patientProfile) {
      await tx.patientProfile.update({
        where: { userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
          ...(gender && { gender }),
          ...(bloodGroup !== undefined && { bloodGroup }),
          ...(emergencyContact !== undefined && { emergencyContact }),
          ...(address !== undefined && { address }),
        },
      });
    } else if (user.role === 'DOCTOR' && user.doctorProfile) {
      await tx.doctorProfile.update({
        where: { userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
        },
      });
    }

    // 3. Record audit log entry
    await tx.auditLog.create({
      data: {
        userId,
        action: 'USER_LOGIN',
        entityType: 'User',
        entityId: userId,
        details: { action: 'PROFILE_UPDATED', role: user.role },
      },
    });

    return tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        role: true,
        patientProfile: true,
        doctorProfile: true,
        updatedAt: true,
      },
    });
  });

  return updatedUser;
}

module.exports = {
  getUserProfile,
  updateUserProfile,
};
