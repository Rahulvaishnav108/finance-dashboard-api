'use strict';

const request = require('supertest');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Must set before requiring app
process.env.NODE_ENV = 'test';

const app     = require('../src/app');
const { getDb, resetDb } = require('../src/config/database');

/**
 * Call before each test file's describe block.
 * Re-creates a clean in-memory DB every time.
 */
function setupTestDb() {
  resetDb();      // close any open connection
  getDb();        // re-open fresh :memory: DB with schema
}

/**
 * Create a test user directly in DB (bypasses rate-limiting on /register)
 */
async function createUser({ email, password = 'Test@1234', full_name = 'Test User', role = 'viewer', status = 'active' } = {}) {
  const db            = getDb();
  const id            = uuidv4();
  const password_hash = await bcrypt.hash(password, 4); // low cost for speed in tests
  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, status)
    VALUES (@id, @email, @password_hash, @full_name, @role, @status)
  `).run({ id, email: email || `user-${id.slice(0, 8)}@test.com`, password_hash, full_name, role, status });
  return { id, email: email || `user-${id.slice(0, 8)}@test.com`, password, role, status };
}

/**
 * Login and return the Bearer token
 */
async function loginAs(user) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${JSON.stringify(res.body)}`);
  return res.body.data.access_token;
}

/**
 * Create a category in DB directly
 */
function createCategory(db, { name = 'Test Cat', type = 'both', createdBy } = {}) {
  const id = uuidv4();
  db.prepare(`INSERT INTO categories (id, name, type, created_by) VALUES (?, ?, ?, ?)`)
    .run(id, name, type, createdBy || null);
  return { id, name, type };
}

/**
 * Create a financial record in DB directly
 */
function createRecord(db, { amount = 1000, type = 'income', categoryId = null, date = '2024-01-15', createdBy } = {}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO financial_records (id, amount, type, category_id, date, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, amount, type, categoryId, date, createdBy);
  return { id, amount, type, date };
}

module.exports = { app, setupTestDb, createUser, loginAs, createCategory, createRecord, getDb };
