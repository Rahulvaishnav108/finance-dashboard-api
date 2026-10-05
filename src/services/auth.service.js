'use strict';

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { getDb }   = require('../config/database');
const config      = require('../config');
const { audit }   = require('../utils/audit');

// ─── helpers ────────────────────────────────────────────────────────────────

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

function issueRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh', jti: crypto.randomUUID() },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn },
  );
}

function safeUser(user) {
  const { password_hash, ...safe } = user; // eslint-disable-line no-unused-vars
  return safe;
}

// ─── service ────────────────────────────────────────────────────────────────

const AuthService = {

  /**
   * Register a new user (admin-only path in prod; used for initial seed too)
   */
  async register({ email, password, full_name, role = 'viewer' }, req) {
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

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);

    audit({ userId: req?.user?.id || id, action: 'user.register', resource: 'users', resourceId: id, newData: safeUser(user), req });

    return safeUser(user);
  },

  /**
   * Authenticate a user; return access + refresh tokens
   */
  async login({ email, password }, req) {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      // Constant-time: compare against a dummy hash to prevent timing oracle
      await bcrypt.compare(password, '$2a$12$irrelevantdummyhashforsecurity000000000000000000000');
      const err = new Error('Invalid email or password'); err.statusCode = 401; err.isOperational = true;
      throw err;
    }

    if (user.status !== 'active') {
      const err = new Error('Account is inactive or suspended'); err.statusCode = 403; err.isOperational = true;
      throw err;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      audit({ userId: user.id, action: 'auth.login_failed', resource: 'users', resourceId: user.id, req });
      const err = new Error('Invalid email or password'); err.statusCode = 401; err.isOperational = true;
      throw err;
    }

    // Update last_login_at
    db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(user.id);

    const accessToken  = issueAccessToken(user);
    const refreshToken = issueRefreshToken(user);

    // Persist hashed refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
      VALUES (@id, @user_id, @token_hash, @expires_at, @user_agent, @ip_address)
    `).run({
      id:         uuidv4(),
      user_id:    user.id,
      token_hash: hashToken(refreshToken),
      expires_at: expiresAt,
      user_agent: req?.get('user-agent') || null,
      ip_address: req?.ip || null,
    });

    audit({ userId: user.id, action: 'auth.login', resource: 'users', resourceId: user.id, req });

    return { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 86400, user: safeUser(user) };
  },

  /**
   * Issue new access + refresh token pair, rotate the refresh token
   */
  async refresh({ refresh_token: rawToken }, req) {
    let decoded;
    try {
      decoded = jwt.verify(rawToken, config.jwt.refreshSecret);
    } catch {
      const err = new Error('Invalid or expired refresh token'); err.statusCode = 401; err.isOperational = true;
      throw err;
    }

    if (decoded.type !== 'refresh') {
      const err = new Error('Invalid token type'); err.statusCode = 401; err.isOperational = true;
      throw err;
    }

    const db    = getDb();
    const hash  = hashToken(rawToken);
    const stored = db.prepare(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0'
    ).get(hash);

    if (!stored || new Date(stored.expires_at) < new Date()) {
      // Possible token reuse — revoke ALL tokens for this user (security measure)
      if (decoded.sub) {
        db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(decoded.sub);
        audit({ userId: decoded.sub, action: 'auth.token_reuse_detected', resource: 'refresh_tokens', req });
      }
      const err = new Error('Refresh token is invalid, expired, or already used'); err.statusCode = 401; err.isOperational = true;
      throw err;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND status = ?').get(decoded.sub, 'active');
    if (!user) {
      const err = new Error('User not found or inactive'); err.statusCode = 401; err.isOperational = true;
      throw err;
    }

    // Rotate — revoke old, issue new
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(stored.id);

    const newAccessToken  = issueAccessToken(user);
    const newRefreshToken = issueRefreshToken(user);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
      VALUES (@id, @user_id, @token_hash, @expires_at, @user_agent, @ip_address)
    `).run({
      id:         uuidv4(),
      user_id:    user.id,
      token_hash: hashToken(newRefreshToken),
      expires_at: expiresAt,
      user_agent: req?.get('user-agent') || null,
      ip_address: req?.ip || null,
    });

    return { access_token: newAccessToken, refresh_token: newRefreshToken, token_type: 'Bearer', expires_in: 86400 };
  },

  /**
   * Revoke a specific refresh token (logout)
   */
  logout({ refresh_token: rawToken }, userId, req) {
    if (rawToken) {
      const db   = getDb();
      const hash = hashToken(rawToken);
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(hash);
    }
    audit({ userId, action: 'auth.logout', resource: 'users', resourceId: userId, req });
  },

  /**
   * Change authenticated user's password
   */
  async changePassword({ current_password, new_password }, userId, req) {
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      const err = new Error('User not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      const err = new Error('Current password is incorrect'); err.statusCode = 400; err.isOperational = true;
      throw err;
    }

    const new_hash = await bcrypt.hash(new_password, config.bcrypt.saltRounds);
    db.prepare("UPDATE users SET password_hash = @h, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = @id")
      .run({ h: new_hash, id: userId });

    // Revoke all refresh tokens on password change
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);

    audit({ userId, action: 'auth.password_changed', resource: 'users', resourceId: userId, req });
  },
};

module.exports = AuthService;
