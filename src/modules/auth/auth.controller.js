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
    const { email, password } = req.body;
    const result = await authService.login(email, password, clientInfo);
    return ApiResponse.success(res, 200, 'Login successful', result);
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
 * Logout user and revoke token
 * POST /api/v1/auth/logout
 */
async function logout(req, res, next) {
  try {
    await authService.logout(req.token, req.tokenExp, req.user?.id);
    return ApiResponse.success(res, 200, 'Successfully logged out. Token has been invalidated.');
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

module.exports = {
  registerPatient,
  registerDoctor,
  login,
  logout,
  getMe,
  refreshToken,
};

