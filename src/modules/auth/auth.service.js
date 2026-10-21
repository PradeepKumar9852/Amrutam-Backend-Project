const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../../config/env');
const { prisma } = require('../../config/prisma');
const {
  blacklistToken,
  isTokenBlacklisted,
  setCache,
  getCache,
  deleteCache,
} = require('../../config/redis');
const ApiError = require('../../utils/apiError');
const {
  generateMfaSecret,
  generateTotp,
  verifyTotp,
  generateBackupCodes,
  verifyAndConsumeBackupCode,
  getOtpAuthUrl,
} = require('../../utils/mfa');

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
 * Sanitize user object to never leak password hashes, MFA secrets, or recovery codes
 */
function sanitizeUser(user, profile = null) {
  const { passwordHash, mfaSecret, mfaBackupCodes, ...safeUser } = user;
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
        role: 'PATIENT', // Role escalation defense: strictly enforced
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
        role: 'DOCTOR', // Role escalation defense: strictly enforced
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
        isVerified: false, // Administrative verification mandatory
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
 * Login user with email, password, and optional MFA code
 */
async function login(email, password, clientInfo = {}, mfaCode = null) {
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

  const profile = user.role === 'PATIENT' ? user.patientProfile : user.doctorProfile;

  // Handle MFA verification for accounts with MFA enabled
  if (user.mfaEnabled) {
    if (!mfaCode) {
      // Issue short-lived MFA challenge token (valid 5 minutes)
      const tempToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          type: 'MFA_CHALLENGE',
        },
        config.jwtSecret,
        { expiresIn: '5m' }
      );

      return {
        mfaRequired: true,
        tempToken,
        message: 'MFA authentication required. Please provide a 6-digit TOTP code or emergency backup code.',
      };
    }

    // MFA code provided directly in login body: verify code
    let isMfaValid = verifyTotp(mfaCode, user.mfaSecret);
    let usedBackupCode = false;

    if (!isMfaValid && Array.isArray(user.mfaBackupCodes)) {
      const backupResult = verifyAndConsumeBackupCode(mfaCode, user.mfaBackupCodes);
      if (backupResult.isValid) {
        isMfaValid = true;
        usedBackupCode = true;
        await prisma.user.update({
          where: { id: user.id },
          data: { mfaBackupCodes: backupResult.remainingCodes },
        });
      }
    }

    if (!isMfaValid) {
      throw ApiError.unauthorized('Invalid MFA verification code');
    }
  }

  // Record login audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: { email: user.email, role: user.role, mfaVerified: !!user.mfaEnabled },
      ipAddress: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
    },
  });

  const tokens = generateAuthTokens(user);
  return {
    user: sanitizeUser(user, profile),
    ...tokens,
  };
}

/**
 * Complete MFA verification challenge during login
 */
async function verifyMfaLogin(tempToken, mfaCode, clientInfo = {}) {
  let decoded;
  try {
    decoded = jwt.verify(tempToken, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired MFA session token. Please log in again.');
  }

  if (decoded.type !== 'MFA_CHALLENGE') {
    throw ApiError.unauthorized('Invalid MFA challenge token type');
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: {
      patientProfile: true,
      doctorProfile: true,
    },
  });

  if (!user || !user.isActive || !user.mfaEnabled) {
    throw ApiError.unauthorized('User not found, disabled, or MFA is not active on this account');
  }

  let isMfaValid = verifyTotp(mfaCode, user.mfaSecret);
  let usedBackupCode = false;

  if (!isMfaValid && Array.isArray(user.mfaBackupCodes)) {
    const backupResult = verifyAndConsumeBackupCode(mfaCode, user.mfaBackupCodes);
    if (backupResult.isValid) {
      isMfaValid = true;
      usedBackupCode = true;
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: backupResult.remainingCodes },
      });
    }
  }

  if (!isMfaValid) {
    throw ApiError.unauthorized('Invalid MFA verification code');
  }

  // Record audit log
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: {
        email: user.email,
        role: user.role,
        mfaVerified: true,
        method: usedBackupCode ? 'BACKUP_CODE' : 'TOTP',
      },
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
 * Setup MFA enrollment for privileged accounts or general users
 */
async function setupMfa(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.mfaEnabled) {
    throw ApiError.badRequest('MFA is already enabled on this account');
  }

  const secret = generateMfaSecret();
  const backupCodes = generateBackupCodes(8);
  const otpauthUrl = getOtpAuthUrl(user.email, secret);

  // Store pending setup in Redis cache (TTL: 10 minutes)
  const cacheKey = `mfa:pending:${userId}`;
  await setCache(
    cacheKey,
    {
      secret,
      hashedBackupCodes: backupCodes.hashedCodes,
    },
    600
  );

  return {
    secret,
    otpauthUrl,
    backupCodes: backupCodes.plainCodes,
    message:
      'Scan the otpauthUrl or enter the secret in your authenticator app (Google Authenticator, Authy, etc.). Confirm setup using /api/v1/auth/mfa/enable.',
  };
}

/**
 * Verify and enable MFA for the user
 */
async function enableMfa(userId, token, clientInfo = {}) {
  const cacheKey = `mfa:pending:${userId}`;
  const pending = await getCache(cacheKey);

  if (!pending || !pending.secret) {
    throw ApiError.badRequest('MFA setup session expired or not initialized. Please call setup first.');
  }

  const isValid = verifyTotp(token, pending.secret);
  if (!isValid) {
    throw ApiError.badRequest('Invalid 6-digit verification code. Please check your authenticator clock and try again.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaSecret: pending.secret,
      mfaBackupCodes: pending.hashedBackupCodes,
    },
  });

  await deleteCache(cacheKey);

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: userId,
      details: { action: 'MFA_ENABLED' },
      ipAddress: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
    },
  });

  return {
    mfaEnabled: true,
    message: 'MFA has been successfully activated for your account.',
  };
}

/**
 * Disable MFA for the user
 */
async function disableMfa(userId, password, token, clientInfo = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (!user.mfaEnabled) {
    throw ApiError.badRequest('MFA is not enabled on this account');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid password');
  }

  let isMfaValid = verifyTotp(token, user.mfaSecret);
  if (!isMfaValid && Array.isArray(user.mfaBackupCodes)) {
    const backupResult = verifyAndConsumeBackupCode(token, user.mfaBackupCodes);
    if (backupResult.isValid) {
      isMfaValid = true;
    }
  }

  if (!isMfaValid) {
    throw ApiError.unauthorized('Invalid MFA verification code');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: userId,
      details: { action: 'MFA_DISABLED' },
      ipAddress: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
    },
  });

  return {
    mfaEnabled: false,
    message: 'MFA has been successfully disabled for your account.',
  };
}

/**
 * Rotate and exchange valid refresh token for a new access & refresh token pair
 */
async function refreshAuthTokens(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  if (decoded.type !== 'REFRESH') {
    throw ApiError.unauthorized('Provided token is not a valid refresh token');
  }

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
 * Update authenticated user profile
 */
async function updateProfile(userId, payload) {
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

  // Prevent role escalation & identity alteration: cannot update role, email, or mfa status
  delete payload.role;
  delete payload.email;
  delete payload.password;
  delete payload.passwordHash;
  delete payload.mfaEnabled;
  delete payload.mfaSecret;

  // Handle phone number conflict if provided
  if (payload.phoneNumber && payload.phoneNumber !== user.phoneNumber) {
    const existingPhone = await prisma.user.findUnique({
      where: { phoneNumber: payload.phoneNumber },
    });
    if (existingPhone && existingPhone.id !== user.id) {
      throw ApiError.conflict('An account with this phone number already exists');
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { phoneNumber: payload.phoneNumber },
    });
  }

  if (user.role === 'PATIENT' && user.patientProfile) {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      emergencyContact,
      address,
    } = payload;

    await prisma.patientProfile.update({
      where: { id: user.patientProfile.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
        ...(gender && { gender }),
        ...(bloodGroup && { bloodGroup }),
        ...(emergencyContact && { emergencyContact }),
        ...(address && { address }),
      },
    });
  } else if (user.role === 'DOCTOR' && user.doctorProfile) {
    const { firstName, lastName, bio, consultationFee, experienceYears } = payload;

    await prisma.doctorProfile.update({
      where: { id: user.doctorProfile.id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(bio !== undefined && { bio }),
        ...(consultationFee !== undefined && { consultationFee }),
        ...(experienceYears !== undefined && { experienceYears }),
      },
    });
  }

  return getProfile(userId);
}

/**
 * Change password securely and invalidate previous session tokens
 */
async function changePassword(userId, currentPassword, newPassword, currentToken = null, tokenExp = null, clientInfo = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Incorrect current password');
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
  if (isSamePassword) {
    throw ApiError.badRequest('New password cannot be the same as the current password');
  }

  const newHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  // Blacklist existing token so it cannot be used anymore
  if (currentToken) {
    await logout(currentToken, tokenExp, userId);
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: userId,
      details: { action: 'PASSWORD_CHANGED' },
      ipAddress: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
    },
  });

  // Generate brand new tokens for the updated account
  const tokens = generateAuthTokens(user);
  return {
    message: 'Password changed successfully. New tokens issued.',
    ...tokens,
  };
}

/**
 * Self account deactivation by user
 */
async function deactivateAccount(userId, password, currentToken = null, tokenExp = null, clientInfo = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Incorrect password');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  if (currentToken) {
    await logout(currentToken, tokenExp, userId);
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: 'USER_LOGIN',
      entityType: 'User',
      entityId: userId,
      details: { action: 'ACCOUNT_DEACTIVATED' },
      ipAddress: clientInfo.ip || null,
      userAgent: clientInfo.userAgent || null,
    },
  });

  return { message: 'Your account has been deactivated successfully.' };
}

/**
 * Explicitly revoke an access or refresh token
 */
async function revokeToken(token, clientInfo = {}) {
  if (!token) {
    throw ApiError.badRequest('Token is required');
  }

  let decoded;
  try {
    decoded = jwt.decode(token);
  } catch (e) {}

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = decoded?.exp ? Math.max(60, decoded.exp - nowInSeconds) : 86400 * 7;

  await blacklistToken(token, remainingSeconds);

  return { revoked: true, message: 'Token successfully revoked and added to blacklist.' };
}

/**
 * Logout user by blacklisting current JWT access token and optional refresh token
 */
async function logout(token, tokenExp, userId = null, refreshToken = null) {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = tokenExp ? Math.max(60, tokenExp - nowInSeconds) : 86400;

  if (token) {
    await blacklistToken(token, remainingSeconds);
  }

  if (refreshToken) {
    try {
      const decodedRefresh = jwt.decode(refreshToken);
      const refreshRemaining = decodedRefresh?.exp
        ? Math.max(60, decodedRefresh.exp - nowInSeconds)
        : 86400 * 7;
      await blacklistToken(refreshToken, refreshRemaining);
    } catch (e) {}
  }

  if (userId) {
    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: 'USER_LOGIN',
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
  generateRefreshToken,
  generateAuthTokens,
  sanitizeUser,
  registerPatient,
  registerDoctor,
  login,
  verifyMfaLogin,
  setupMfa,
  enableMfa,
  disableMfa,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  deactivateAccount,
  revokeToken,
  refreshAuthTokens,
};
