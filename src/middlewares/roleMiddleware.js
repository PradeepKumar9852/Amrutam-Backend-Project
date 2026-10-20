const ApiError = require('../utils/apiError');

/**
 * Middleware factory for Role-Based Access Control (RBAC)
 * @param  {...string} allowedRoles - Roles permitted to access the route ('PATIENT', 'DOCTOR', 'ADMIN')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('User must be authenticated before role verification'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource`
        )
      );
    }

    next();
  };
}

module.exports = authorizeRoles;
