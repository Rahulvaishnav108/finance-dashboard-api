'use strict';

const app    = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { getDb, closeDb } = require('./config/database');
const ensureDemoUsers = require('./utils/demoUsers');

// Initialise DB on startup
async function start() {
try {
  getDb();
  await ensureDemoUsers();
  logger.info('Database initialised successfully');
} catch (err) {
  logger.error('Database initialisation failed', { error: err.message });
  process.exit(1);
}

return app.listen(config.port, () => {
  logger.info(`Sukh Sagar MIS API running`, {
    port: config.port,
    env:  config.env,
    pid:  process.pid,
  });
});
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown…`);

  server.close(err => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
      process.exit(1);
    }
    closeDb();
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force-kill after 10s if something hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

let server;
start().then(value => { server = value; });

process.on('SIGTERM', () => server && shutdown('SIGTERM'));
process.on('SIGINT',  () => server && shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  shutdown('uncaughtException');
});

module.exports = server;
