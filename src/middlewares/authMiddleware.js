const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/apiError');
const { prisma } = require('../config/prisma');
const { isTokenBlacklisted } = require('../config/redis');

/**
 * Middleware to authenticate requests via JWT Bearer token
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication required: Missing or malformed Bearer token');
    }

    const token = authHeader.split(' ')[1];

    // Check Redis token revocation blacklist
    const isRevoked = await isTokenBlacklisted(token);
    if (isRevoked) {
      throw ApiError.unauthorized('Token has been revoked. Please log in again.');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Authentication token has expired. Please log in again.');
      }
      throw ApiError.unauthorized('Invalid authentication token.');
    }

    // Security check: Only tokens explicitly signed as ACCESS tokens are valid for API authorization
    if (decoded.type && decoded.type !== 'ACCESS') {
      throw ApiError.unauthorized('Invalid token type: Access token required');
    }

    // Retrieve active user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        patientProfile: true,
        doctorProfile: true,
      },
    });

    if (!user) {
      throw ApiError.unauthorized('User associated with this token no longer exists');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
    }

    // Exclude password hash and MFA secrets from req.user
    const { passwordHash, mfaSecret, mfaBackupCodes, ...sanitizedUser } = user;
    req.user = sanitizedUser;
    req.token = token;
    req.tokenExp = decoded.exp;

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = authenticate;
