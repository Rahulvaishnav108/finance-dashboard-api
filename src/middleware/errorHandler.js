'use strict';

const logger = require('../utils/logger');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Centralised Express error handler.
 * Catches all errors thrown / passed via next(err) anywhere in the app.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Already-sent responses — nothing we can do
  if (res.headersSent) return;

  logger.error('Unhandled error', {
    message:  err.message,
    stack:    err.stack,
    path:     req.path,
    method:   req.method,
    userId:   req.user?.id,
  });

  // SQLite constraint violations
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return ApiResponse.conflict(res, 'A record with that value already exists');
  }
  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return ApiResponse.error(res, 'Referenced resource does not exist', 422);
  }

  // Known operational errors
  if (err.isOperational) {
    return ApiResponse.error(res, err.message, err.statusCode || 400);
  }

  // Unknown — don't leak internals
  return ApiResponse.serverError(res,
    process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  );
}

/**
 * 404 handler — must be registered AFTER all routes
 */
function notFoundHandler(req, res) {
  return ApiResponse.error(res, `Route ${req.method} ${req.path} not found`, 404);
}

module.exports = { errorHandler, notFoundHandler };
