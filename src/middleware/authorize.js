'use strict';

const { can } = require('../config/permissions');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Authorize middleware factory.
 * Usage: authorize('records:create')
 *
 * Must be used AFTER authenticate middleware so req.user is set.
 */
function authorize(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res);
    }

    if (!can(req.user.role, permission)) {
      return ApiResponse.forbidden(
        res,
        `Role '${req.user.role}' is not permitted to perform '${permission}'`,
      );
    }

    next();
  };
}

/**
 * Authorize any of the given permissions (OR logic).
 * Usage: authorizeAny('records:update', 'records:delete')
 */
function authorizeAny(...permissions) {
  return (req, res, next) => {
    if (!req.user) return ApiResponse.unauthorized(res);

    const allowed = permissions.some(p => can(req.user.role, p));
    if (!allowed) {
      return ApiResponse.forbidden(res);
    }
    next();
  };
}

/**
 * Restrict access to own resources OR admins.
 * Usage: authorizeOwnerOrAdmin('userId') — param name for the target user id.
 */
function authorizeOwnerOrAdmin(paramName = 'id') {
  return (req, res, next) => {
    if (!req.user) return ApiResponse.unauthorized(res);
    const targetId = req.params[paramName];
    if (req.user.id === targetId || req.user.role === 'admin') return next();
    return ApiResponse.forbidden(res);
  };
}

module.exports = { authorize, authorizeAny, authorizeOwnerOrAdmin };
