'use strict';

const fs   = require('fs');
const path = require('path');

process.env.NODE_ENV = 'development';
const config = require('../config');

const dbPath = config.db.path;
if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log(`✓ Deleted: ${dbPath}`);
} else {
  console.log('No database file found — nothing to reset.');
}
