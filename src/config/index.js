'use strict';

const path = require('path');

// Load .env only in non-test environments (tests set vars directly)
if (process.env.NODE_ENV !== 'test') {
  try {
    require('fs').readFileSync(path.join(__dirname, '../../.env'), 'utf8')
      .split('\n')
      .filter(line => line && !line.startsWith('#'))
      .forEach(line => {
        const [key, ...vals] = line.split('=');
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = vals.join('=').trim();
        }
      });
  } catch (_) { /* .env optional */ }
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-prod-32chars!!',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-prod',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  db: {
    path: process.env.NODE_ENV === 'test'
      ? ':memory:'
      : (process.env.DB_PATH || path.join(__dirname, '../../data/finance.db')),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },

  bcrypt: {
    saltRounds: 12,
  },

  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
};

module.exports = config;
