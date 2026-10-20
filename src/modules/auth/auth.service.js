const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { prisma } = require('../../config/prisma');
const { blacklistToken, isTokenBlacklisted } = require('../../config/redis');
const ApiError = require('../../utils/apiError');

/**
 * Generate signed JWT Access token (15m or configured)
 */
function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'ACCESS',
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiresIn,
    }
  );
}

/**
 * Generate signed JWT Refresh token (7 days) with unique JTI nonce for rotation
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'REFRESH',
      jti: crypto.randomUUID(),
    },
    config.jwtSecret,
    {
      expiresIn: '7d',
    }
  );
}


/**
 * Generate Access and Refresh token pair
 */
function generateAuthTokens(user) {
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);
  return {
    token,
    accessToken: token,
    refreshToken,
  };
}


/**
 * Sanitize user object to never leak password hashes or internal sensitive secrets
 */
function sanitizeUser(user, profile = null) {
  const { passwordHash, ...safeUser } = user;
  if (profile) {
    if (user.role === 'PATIENT') safeUser.patientProfile = profile;
    if (user.role === 'DOCTOR') safeUser.doctorProfile = profile;
  }
  return safeUser;
}

/**
 * Register a new patient
 */
async function registerPatient(payload, clientInfo = {}) {
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: payload.email },
        ...(payload.phoneNumber ? [{ phoneNumber: payload.phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    if (existingUser.email === payload.email) {
      throw ApiError.conflict('An account with this email address already exists');
    }
    if (payload.phoneNumber && existingUser.phoneNumber === payload.phoneNumber) {
      throw ApiError.conflict('An account with this phone number already exists');
    }
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: payload.email,
        passwordHash,
        phoneNumber: payload.phoneNumber || null,
        role: 'PATIENT',
        isActive: true,
      },
    });

    const patientProfile = await tx.patientProfile.create({
      data: {
        userId: user.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : null,
        gender: payload.gender || null,
        bloodGroup: payload.bloodGroup || null,
        emergencyContact: payload.emergencyContact || null,
        address: payload.address || null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: user.id,
        details: { role: 'PATIENT', email: user.email },
        ipAddress: clientInfo.ip || null,
        userAgent: clientInfo.userAgent || null,
      },
    });

    return { user, patientProfile };
  });

  const tokens = generateAuthTokens(result.user);
  return {
    user: sanitizeUser(result.user, result.patientProfile),
    ...tokens,
  };
}


/**
 * Register a new doctor
 */
async function registerDoctor(payload, clientInfo = {}) {
  // Check email, phone, or license conflict
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: payload.email },
        ...(payload.phoneNumber ? [{ phoneNumber: payload.phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    if (existingUser.email === payload.email) {
      throw ApiError.conflict('An account with this email address already exists');
    }
    if (payload.phoneNumber && existingUser.phoneNumber === payload.phoneNumber) {
      throw ApiError.conflict('An account with this phone number already exists');
    }
  }

  const existingLicense = await prisma.doctorProfile.findUnique({
    where: { licenseNumber: payload.licenseNumber },
  });

  if (existingLicense) {
    throw ApiError.conflict('A doctor profile with this medical license number already exists');
  }

  const passwordHash = await bcrypt.hash(payload.password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: payload.email,
        passwordHash,
        phoneNumber: payload.phoneNumber || null,
        role: 'DOCTOR',
        isActive: true,
      },
    });

    const doctorProfile = await tx.doctorProfile.create({
      data: {
        userId: user.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        specialization: payload.specialization,
        qualification: payload.qualification,
        experienceYears: payload.experienceYears || 0,
        licenseNumber: payload.licenseNumber,
        consultationFee: payload.consultationFee || 0,
        bio: payload.bio || null,
        isVerified: false, // Subject to administrative verification
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: user.id,
        details: { role: 'DOCTOR', licenseNumber: payload.licenseNumber },
        ipAddress: clientInfo.ip || null,
        userAgent: clientInfo.userAgent || null,
      },
    });

    return { user, doctorProfile };
  });

  const tokens = generateAuthTokens(result.user);
  return {
    user: sanitizeUser(result.user, result.doctorProfile),
    ...tokens,
  };
}

/**
 * Login user with email and password
 */
async function login(email, password, clientInfo = {}) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      patientProfile: true,
      doctorProfile: true,
    },
  });

  // Timing attack resistant: if user doesn't exist, perform constant-time dummy compare
  const DUMMY_HASH = '$2a$12$e80yq7hFvU3rDqP7d0f9yeG0Z2wU1m7Z1v6k8q5x2v6k8q5x2v6k8';
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account is currently disabled. Please contact support.');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Record audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
    },
  });

  const tokens = generateAuthTokens(user);
  const profile = user.role === 'PATIENT' ? user.patientProfile : user.doctorProfile;

  return {
    user: sanitizeUser(user, profile),
    ...tokens,
  };
}

/**
 * Rotate and exchange valid refresh token for a new access & refresh token pair
 */
async function refreshAuthTokens(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwtSecret);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  if (decoded.type !== 'REFRESH') {
    throw ApiError.unauthorized('Provided token is not a valid refresh token');
  }

  // Check if refresh token is blacklisted in Redis
  const isRevoked = await isTokenBlacklisted(refreshToken);
  if (isRevoked) {
    throw ApiError.unauthorized('Refresh token has been revoked. Please log in again.');
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: {
      patientProfile: true,
      doctorProfile: true,
    },
  });

  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User not found or account disabled');
  }

  // Invalidate old refresh token to prevent replay attacks (Refresh Token Rotation)
  if (decoded.exp) {
    await blacklistToken(refreshToken, decoded.exp);
  }

  const tokens = generateAuthTokens(user);
  const profile = user.role === 'PATIENT' ? user.patientProfile : user.doctorProfile;

  return {
    user: sanitizeUser(user, profile),
    ...tokens,
  };
}


/**
 * Get profile for authenticated user
 */
async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      patientProfile: true,
      doctorProfile: true,
    },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const profile = user.role === 'PATIENT' ? user.patientProfile : user.doctorProfile;
  return sanitizeUser(user, profile);
}

/**
 * Logout user by blacklisting current JWT token until expiration

 */
async function logout(token, tokenExp, userId = null) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = tokenExp ? Math.max(60, tokenExp - nowInSeconds) : 86400;

  if (token) {
    await blacklistToken(token, remainingSeconds);
  }

  if (userId) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'USER_LOGIN', // Logged out
          entityType: 'User',
          entityId: userId,
          details: { action: 'USER_LOGOUT' },
        },
      });
    } catch (e) {}
  }

  return { loggedOut: true };
}

module.exports = {
  generateToken,
  generateAuthTokens,
  sanitizeUser,
  registerPatient,
  registerDoctor,
  login,
  logout,
  getProfile,
  refreshAuthTokens,
};

