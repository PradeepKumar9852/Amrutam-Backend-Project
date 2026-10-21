/**
 * Custom operational API Error class
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error description
   * @param {Array<object>} errors - Validation or sub-errors list
   * @param {boolean} isOperational - Distinguishes operational vs programmer errors
   * @param {string} stack - Optional stack trace
   */
  constructor(
    statusCode = 500,
    message = 'Internal Server Error',
    errors = [],
    isOperational = true,
    stack = ''
  ) {
    super(message);
    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;
    this.isOperational = isOperational;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  static badRequest(message = 'Bad Request', errors = []) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Resource conflict') {
    return new ApiError(409, message);
  }

  static serviceUnavailable(message = 'Service Unavailable') {
    return new ApiError(503, message);
  }

  static internal(message = 'Internal Server Error') {
    return new ApiError(500, message, [], false);
  }
}

module.exports = ApiError;
