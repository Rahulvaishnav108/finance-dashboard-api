'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/database');

const DEMO_USERS = [
  ['admin', 'Sukh Sagar Admin', 'admin', 'admin123'],
  ['management', 'Management', 'viewer', 'manage123'],
  ['mis', 'MIS Executive', 'analyst', 'mis123'],
  ['production', 'Production User', 'analyst', 'prod123'],
  ['finance', 'Finance User', 'analyst', 'finance123'],
  ['sales', 'Sales User', 'analyst', 'sales123'],
  ['store', 'Store User', 'analyst', 'store123'],
];

async function ensureDemoUsers() {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, role)
    VALUES (@id, @email, @password_hash, @full_name, @role)
  `);
  for (const [username, full_name, role, password] of DEMO_USERS) {
    insert.run({
      id: uuidv4(),
      email: `${username}@ssmis.demo`,
      password_hash: await bcrypt.hash(password, 10),
      full_name,
      role,
    });
  }
}

module.exports = ensureDemoUsers;