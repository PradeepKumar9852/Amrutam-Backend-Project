const config = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const { ZodError } = require('zod');

/**
 * Centralized Global Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || [];

  // Log detailed error information with requestId correlation
  logger.error(`[${req.method}] ${req.originalUrl} - ${err.message}`, {
    requestId: req.id,
    statusCode,
    stack: config.isDevelopment ? err.stack : undefined,
  });

  // Handle Zod schema validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  }

  // Handle invalid JSON body in incoming request
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON payload received';
  }

  // Handle Prisma Known Errors (e.g. Unique constraint violation P2002)
  if (err.code && err.code.startsWith('P')) {
    if (err.code === 'P2002') {
      statusCode = 409;
      const target = err.meta?.target ? ` on field: ${err.meta.target}` : '';
      message = `Unique constraint failed${target}`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Requested record not found in database';
    } else if (err.code === 'P2023') {
      statusCode = 400;
      message = 'Invalid ID or column format provided';
    } else {
      statusCode = 400;
      message = config.isProduction ? 'Database query error' : `Database query error [${err.code}]`;
    }
  }

  // Handle Prisma Schema Validation / Malformed Type Conversion Errors
  if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid request parameters or malformed data format';
  }

  // In production, redact unexpected non-operational 500 error messages to prevent internal leakage
  if (statusCode === 500 && !err.isOperational && config.isProduction) {
    message = 'An unexpected internal server error occurred';
  }

  // Response payload
  const errorResponse = {
    success: false,
    statusCode,
    message,
    requestId: req.id,
    errors: errors.length > 0 ? errors : undefined,
    ...(config.isDevelopment && { stack: err.stack }),
  };

  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
