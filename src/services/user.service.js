'use strict';

const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb }      = require('../config/database');
const config         = require('../config');
const { audit }      = require('../utils/audit');
const { parsePagination, parseSort } = require('../utils/pagination');

const SORT_WHITELIST = ['full_name', 'email', 'role', 'status', 'created_at', 'last_login_at'];

function safeUser(u) {
  if (!u) return null;
  const { password_hash, ...safe } = u; // eslint-disable-line no-unused-vars
  return safe;
}

const UserService = {

  list({ role, status, search, ...query }) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const { sortBy, sortDir }     = parseSort(query, SORT_WHITELIST);

    const conditions = [];
    const params     = {};

    if (role)   { conditions.push('u.role = @role');     params.role = role; }
    if (status) { conditions.push('u.status = @status'); params.status = status; }
    if (search) {
      conditions.push('(u.full_name LIKE @search OR u.email LIKE @search)');
      params.search = `%${search}%`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as n FROM users u ${where}`).get(params).n;
    const rows  = db.prepare(
      `SELECT u.id, u.email, u.full_name, u.role, u.status, u.created_at, u.updated_at, u.last_login_at
       FROM users u ${where}
       ORDER BY u.${sortBy} ${sortDir}
       LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset });

    return { data: rows, pagination: { page, limit, total } };
  },

  getById(id) {
    const db   = getDb();
    const user = db.prepare(
      'SELECT id, email, full_name, role, status, created_at, updated_at, last_login_at FROM users WHERE id = ?'
    ).get(id);
    if (!user) {
      const err = new Error('User not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }
    return user;
  },

  async create({ email, password, full_name, role }, actorId, req) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      const err = new Error('Email already registered'); err.statusCode = 409; err.isOperational = true;
      throw err;
    }

    const password_hash = await bcrypt.hash(password, config.bcrypt.saltRounds);
    const id = uuidv4();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, role)
      VALUES (@id, @email, @password_hash, @full_name, @role)
    `).run({ id, email, password_hash, full_name, role });

    const user = db.prepare('SELECT id, email, full_name, role, status, created_at FROM users WHERE id = ?').get(id);
    audit({ userId: actorId, action: 'user.create', resource: 'users', resourceId: id, newData: user, req });
    return user;
  },

  update(id, updates, actorId, req) {
    const db       = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('User not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }

    // Prevent demoting the last admin
    if (updates.role && updates.role !== 'admin' && existing.role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin' AND status = 'active'").get().n;
      if (adminCount <= 1) {
        const err = new Error('Cannot demote the last active admin'); err.statusCode = 409; err.isOperational = true;
        throw err;
      }
    }

    const allowedFields = ['full_name', 'role', 'status'];
    const setClause = [];
    const params    = { id };

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = @${field}`);
        params[field] = updates[field];
      }
    }

    if (!setClause.length) {
      const err = new Error('No updatable fields provided'); err.statusCode = 400; err.isOperational = true;
      throw err;
    }

    setClause.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    db.prepare(`UPDATE users SET ${setClause.join(', ')} WHERE id = @id`).run(params);

    const updated = db.prepare('SELECT id, email, full_name, role, status, created_at, updated_at FROM users WHERE id = ?').get(id);
    audit({ userId: actorId, action: 'user.update', resource: 'users', resourceId: id, oldData: safeUser(existing), newData: updated, req });
    return updated;
  },

  delete(id, actorId, req) {
    const db       = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('User not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }
    if (id === actorId) {
      const err = new Error('Cannot delete your own account'); err.statusCode = 409; err.isOperational = true;
      throw err;
    }

    const adminCount = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin' AND status = 'active'").get().n;
    if (existing.role === 'admin' && adminCount <= 1) {
      const err = new Error('Cannot delete the last active admin'); err.statusCode = 409; err.isOperational = true;
      throw err;
    }

    // Hard delete — cascade will clean up refresh tokens
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    audit({ userId: actorId, action: 'user.delete', resource: 'users', resourceId: id, oldData: safeUser(existing), req });
  },
};

module.exports = UserService;
