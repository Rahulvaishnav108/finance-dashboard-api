'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');
const logger = require('./logger');

const INSERT = `
  INSERT INTO audit_logs (id, user_id, action, resource, resource_id, old_data, new_data, ip_address, user_agent)
  VALUES (@id, @user_id, @action, @resource, @resource_id, @old_data, @new_data, @ip_address, @user_agent)
`;

/**
 * Append an immutable audit entry.
 * Non-blocking – errors are swallowed so audit failures never break business ops.
 */
function audit({ userId, action, resource, resourceId, oldData, newData, req }) {
  try {
    const db = getDb();
    db.prepare(INSERT).run({
      id:          uuidv4(),
      user_id:     userId || null,
      action,
      resource,
      resource_id: resourceId || null,
      old_data:    oldData  ? JSON.stringify(oldData)  : null,
      new_data:    newData  ? JSON.stringify(newData)  : null,
      ip_address:  req ? (req.ip || req.connection?.remoteAddress) : null,
      user_agent:  req ? req.get('user-agent') : null,
    });
  } catch (err) {
    logger.error('Audit log write failed', { error: err.message });
  }
}

module.exports = { audit };
