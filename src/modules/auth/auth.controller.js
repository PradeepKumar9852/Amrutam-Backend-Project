const authService = require('./auth.service');
const ApiResponse = require('../../utils/apiResponse');

function getClientInfo(req) {
  return {
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

/**
 * Register a new patient
 * POST /api/v1/auth/register/patient
 */
async function registerPatient(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.registerPatient(req.body, clientInfo);
    return ApiResponse.created(res, 'Patient registered successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Register a new doctor
 * POST /api/v1/auth/register/doctor
 */
async function registerDoctor(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.registerDoctor(req.body, clientInfo);
    return ApiResponse.created(
      res,
      'Doctor registered successfully. Account is pending verification.',
      result
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Login user (patient, doctor, admin)
 * POST /api/v1/auth/login
 */
async function login(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const { email, password, mfaCode } = req.body;
    const result = await authService.login(email, password, clientInfo, mfaCode);

    if (result.mfaRequired) {
      return ApiResponse.success(res, 200, result.message, {
        mfaRequired: true,
        tempToken: result.tempToken,
      });
    }

    return ApiResponse.success(res, 200, 'Login successful', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Complete MFA verification challenge during login
 * POST /api/v1/auth/mfa/verify-login
 */
async function verifyMfaLogin(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const { tempToken, mfaCode } = req.body;
    const result = await authService.verifyMfaLogin(tempToken, mfaCode, clientInfo);
    return ApiResponse.success(res, 200, 'MFA authentication successful. Logged in.', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Setup MFA enrollment (generates TOTP secret and backup codes)
 * POST /api/v1/auth/mfa/setup
 */
async function setupMfa(req, res, next) {
  try {
    const result = await authService.setupMfa(req.user.id);
    return ApiResponse.success(res, 200, result.message, {
      secret: result.secret,
      otpauthUrl: result.otpauthUrl,
      backupCodes: result.backupCodes,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify and enable MFA
 * POST /api/v1/auth/mfa/enable
 */
async function enableMfa(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.enableMfa(req.user.id, req.body.token, clientInfo);
    return ApiResponse.success(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Disable MFA
 * POST /api/v1/auth/mfa/disable
 */
async function disableMfa(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.disableMfa(
      req.user.id,
      req.body.password,
      req.body.token,
      clientInfo
    );
    return ApiResponse.success(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get current authenticated user profile
 * GET /api/v1/auth/me
 */
async function getMe(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    return ApiResponse.success(res, 200, 'User profile retrieved successfully', profile);
  } catch (error) {
    next(error);
  }
}

/**
 * Update authenticated user profile
 * PUT /api/v1/auth/profile
 */
async function updateProfile(req, res, next) {
  try {
    const profile = await authService.updateProfile(req.user.id, req.body);
    return ApiResponse.success(res, 200, 'User profile updated successfully', profile);
  } catch (error) {
    next(error);
  }
}

/**
 * Change account password
 * PUT /api/v1/auth/change-password
 */
async function changePassword(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.changePassword(
      req.user.id,
      req.body.currentPassword,
      req.body.newPassword,
      req.token,
      req.tokenExp,
      clientInfo
    );
    return ApiResponse.success(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Self-deactivate account
 * PATCH /api/v1/auth/deactivate
 */
async function deactivateAccount(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.deactivateAccount(
      req.user.id,
      req.body.password,
      req.token,
      req.tokenExp,
      clientInfo
    );
    return ApiResponse.success(res, 200, result.message);
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh access token using valid refresh token
 * POST /api/v1/auth/refresh
 */
async function refreshToken(req, res, next) {
  try {
    const { refreshToken: tokenInput } = req.body;
    const result = await authService.refreshAuthTokens(tokenInput);
    return ApiResponse.success(res, 200, 'Tokens refreshed successfully', result);
  } catch (error) {
    next(error);
  }
}

/**
 * Revoke specific token
 * POST /api/v1/auth/revoke
 */
async function revokeToken(req, res, next) {
  try {
    const clientInfo = getClientInfo(req);
    const result = await authService.revokeToken(req.body.token, clientInfo);
    return ApiResponse.success(res, 200, result.message, result);
  } catch (error) {
    next(error);
  }
}

/**
 * Logout user and revoke token
 * POST /api/v1/auth/logout
 */
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body || {};
    await authService.logout(req.token, req.tokenExp, req.user?.id, refreshToken);
    return ApiResponse.success(res, 200, 'Successfully logged out. Token has been invalidated.');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerPatient,
  registerDoctor,
  login,
  verifyMfaLogin,
  setupMfa,
  enableMfa,
  disableMfa,
  getMe,
  updateProfile,
  changePassword,
  deactivateAccount,
  refreshToken,
  revokeToken,
  logout,
};
