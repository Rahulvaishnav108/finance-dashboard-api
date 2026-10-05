'use strict';

const express   = require('express');
const { getDb } = require('../config/database');
const config    = require('../config');

const router = express.Router();

/**
 * @route GET /health
 * @desc  Liveness + readiness probe — no auth required
 */
router.get('/', (req, res) => {
  let dbStatus = 'ok';
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }

  const status = dbStatus === 'ok' ? 200 : 503;

  return res.status(status).json({
    status:    status === 200 ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version:   process.env.npm_package_version || '1.0.0',
    env:       config.env,
    uptime:    Math.floor(process.uptime()),
    checks: {
      database: dbStatus,
      memory: {
        used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    },
  });
});

module.exports = router;
