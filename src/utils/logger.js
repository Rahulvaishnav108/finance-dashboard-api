'use strict';

const config = require('../config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = config.env === 'test' ? -1 : (LEVELS[process.env.LOG_LEVEL] ?? 2);

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const base = { timestamp, level: level.toUpperCase(), message };
  if (Object.keys(meta).length) base.meta = meta;
  return JSON.stringify(base);
}

const logger = {
  error: (msg, meta = {}) => {
    if (currentLevel >= 0) console.error(formatMessage('error', msg, meta));
  },
  warn: (msg, meta = {}) => {
    if (currentLevel >= 1) console.warn(formatMessage('warn', msg, meta));
  },
  info: (msg, meta = {}) => {
    if (currentLevel >= 2) console.log(formatMessage('info', msg, meta));
  },
  debug: (msg, meta = {}) => {
    if (currentLevel >= 3) console.log(formatMessage('debug', msg, meta));
  },
};

module.exports = logger;
