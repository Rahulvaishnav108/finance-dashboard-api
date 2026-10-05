'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiResponse = require('../utils/ApiResponse');
const { getDb } = require('../config/database');

/**
 * Verify JWT access token and attach decoded user to req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.unauthorized(res, 'No token provided');
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret);

    // Verify user still exists and is active
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, role, status, full_name FROM users WHERE id = ?'
    ).get(decoded.sub);

    if (!user) {
      return ApiResponse.unauthorized(res, 'User no longer exists');
    }

    if (user.status !== 'active') {
      return ApiResponse.unauthorized(res, 'Account is inactive or suspended');
    }

    req.user = {
      id:       user.id,
      email:    user.email,
      role:     user.role,
      fullName: user.full_name,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token expired');
    }
    if (err.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, 'Invalid token');
    }
    return ApiResponse.unauthorized(res, 'Authentication failed');
  }
}

/**
 * Optional auth – attaches user if token present, does not fail if absent
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, role, status, full_name FROM users WHERE id = ?'
    ).get(decoded.sub);
    if (user && user.status === 'active') {
      req.user = { id: user.id, email: user.email, role: user.role, fullName: user.full_name };
    }
  } catch (_) { /* ignore */ }
  next();
}

module.exports = { authenticate, optionalAuth };
