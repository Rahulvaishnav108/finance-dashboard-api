'use strict';

/**
 * Permissions Matrix
 * Defines what each role can do across all resources.
 * Single source of truth for all access control decisions.
 */

const ROLES = Object.freeze({
  VIEWER:  'viewer',
  ANALYST: 'analyst',
  ADMIN:   'admin',
});

const PERMISSIONS = Object.freeze({
  // User management
  'users:read':         [ROLES.ADMIN],
  'users:create':       [ROLES.ADMIN],
  'users:update':       [ROLES.ADMIN],
  'users:delete':       [ROLES.ADMIN],
  'users:update_status':[ROLES.ADMIN],

  // Own profile
  'profile:read':   [ROLES.VIEWER, ROLES.ANALYST, ROLES.ADMIN],
  'profile:update': [ROLES.VIEWER, ROLES.ANALYST, ROLES.ADMIN],

  // Financial records
  'records:read':   [ROLES.VIEWER, ROLES.ANALYST, ROLES.ADMIN],
  'records:create': [ROLES.ANALYST, ROLES.ADMIN],
  'records:update': [ROLES.ANALYST, ROLES.ADMIN],
  'records:delete': [ROLES.ADMIN],

  // Categories
  'categories:read':   [ROLES.VIEWER, ROLES.ANALYST, ROLES.ADMIN],
  'categories:create': [ROLES.ANALYST, ROLES.ADMIN],
  'categories:update': [ROLES.ADMIN],
  'categories:delete': [ROLES.ADMIN],

  // Dashboard & Analytics
  'dashboard:read':   [ROLES.VIEWER, ROLES.ANALYST, ROLES.ADMIN],
  'analytics:read':   [ROLES.ANALYST, ROLES.ADMIN],
  'analytics:export': [ROLES.ADMIN],

  // Audit logs
  'audit:read': [ROLES.ADMIN],
});

/**
 * Check if a role has a specific permission
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Get all permissions for a role
 * @param {string} role
 * @returns {string[]}
 */
function getPermissionsForRole(role) {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([perm]) => perm);
}

module.exports = { ROLES, PERMISSIONS, can, getPermissionsForRole };
