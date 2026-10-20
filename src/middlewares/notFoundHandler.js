const ApiError = require('../utils/apiError');

/**
 * 404 Not Found Middleware for handling non-existent routes
 */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: [${req.method}] ${req.originalUrl}`));
}

module.exports = notFoundHandler;
