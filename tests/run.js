'use strict';

/**
 * Lightweight integration test runner.
 * Uses Node's built-in http.request — zero external dependencies.
 * Runs against a live server spun up in the same process.
 */

process.env.NODE_ENV = 'test';

const http   = require('http');
const assert = require('assert');

// ─── Bootstrap ───────────────────────────────────────────────────────────────
const { resetDb, getDb } = require('../src/config/database');
const app  = require('../src/app');

let server;
let PORT;
let results = { pass: 0, fail: 0, errors: [] };

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function req(method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token  ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ─── Test framework ───────────────────────────────────────────────────────────
const suites = [];
let currentSuite = null;

function describe(name, fn) {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  fn();
  currentSuite = null;
}

function it(name, fn) {
  currentSuite.tests.push({ name, fn });
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function freshDb() {
  resetDb();
  getDb(); // re-open + re-init schema
}

async function makeUser({ email, password = 'Test@1234', full_name = 'Test User', role = 'viewer', status = 'active' } = {}) {
  const db = getDb();
  const id = uuidv4();
  const hash = await bcrypt.hash(password, 4);
  email = email || `u${id.slice(0,8)}@t.com`;
  db.prepare('INSERT INTO users (id,email,password_hash,full_name,role,status) VALUES (?,?,?,?,?,?)')
    .run(id, email, hash, full_name, role, status);
  return { id, email, password, role };
}

async function tokenFor(user) {
  const r = await req('POST', '/api/v1/auth/login', { body: { email: user.email, password: user.password } });
  if (r.status !== 200) throw new Error(`Login failed for ${user.email}: ${r.body.message}`);
  return r.body.data.access_token;
}

function makeCategory(db, { name = 'TestCat', type = 'both', createdBy = null } = {}) {
  const id = uuidv4();
  db.prepare('INSERT INTO categories (id,name,type,created_by) VALUES (?,?,?,?)').run(id, name, type, createdBy);
  return { id, name, type };
}

function makeRecord(db, { amount = 1000, type = 'income', categoryId = null, date = '2024-01-15', createdBy = null } = {}) {
  const id = uuidv4();
  db.prepare('INSERT INTO financial_records (id,amount,type,category_id,date,created_by) VALUES (?,?,?,?,?,?)')
    .run(id, amount, type, categoryId, date, createdBy);
  return { id, amount, type, date };
}

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe('Health', () => {
  it('GET /health → 200 healthy', async () => {
    await freshDb();
    const r = await req('GET', '/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, 'healthy');
    assert.strictEqual(r.body.checks.database, 'ok');
    assert.ok(r.headers['x-request-id'], 'should have X-Request-ID header');
  });

  it('GET /api/v1 → root info', async () => {
    const r = await req('GET', '/api/v1');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.endpoints);
  });

  it('Unknown route → 404', async () => {
    const r = await req('GET', '/api/v1/nope');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.body.success, false);
  });

  it('Security: X-Content-Type-Options nosniff', async () => {
    const r = await req('GET', '/health');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  });

  it('Security: no X-Powered-By header', async () => {
    const r = await req('GET', '/health');
    assert.ok(!r.headers['x-powered-by'], 'must not expose X-Powered-By');
  });
});

describe('Auth — Register', () => {
  it('registers successfully', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/register', {
      body: { email: 'new@t.com', password: 'Pass@1234', full_name: 'New User' },
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.data.email, 'new@t.com');
    assert.strictEqual(r.body.data.role, 'viewer');
  });

  it('default role is viewer', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/register', {
      body: { email: 'v@t.com', password: 'Pass@1234', full_name: 'Viewer' },
    });
    assert.strictEqual(r.body.data.role, 'viewer');
  });

  it('never returns password_hash', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/register', {
      body: { email: 'safe@t.com', password: 'Safe@1234', full_name: 'Safe' },
    });
    assert.ok(!JSON.stringify(r.body).includes('password_hash'));
    assert.ok(!JSON.stringify(r.body).includes('Safe@1234'));
  });

  it('duplicate email → 409', async () => {
    await freshDb();
    await makeUser({ email: 'dup@t.com' });
    const r = await req('POST', '/api/v1/auth/register', {
      body: { email: 'dup@t.com', password: 'Pass@1234', full_name: 'Duplicate' },
    });
    assert.strictEqual(r.status, 409);
  });

  it('missing email → 422', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/register', {
      body: { password: 'Pass@1234', full_name: 'No Email' },
    });
    assert.strictEqual(r.status, 422);
    assert.ok(r.body.errors.some(e => e.field === 'email'));
  });

  it('weak password (no uppercase) → 422', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/register', {
      body: { email: 'weak@t.com', password: 'weakpass1', full_name: 'W' },
    });
    assert.strictEqual(r.status, 422);
  });

  it('invalid role → 422', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/register', {
      body: { email: 'x@t.com', password: 'Pass@1234', full_name: 'X', role: 'superuser' },
    });
    assert.strictEqual(r.status, 422);
  });
});

describe('Auth — Login', () => {
  it('valid credentials → tokens', async () => {
    await freshDb();
    const user = await makeUser({ email: 'l@t.com', password: 'Login@1234' });
    const r = await req('POST', '/api/v1/auth/login', {
      body: { email: user.email, password: user.password },
    });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.access_token);
    assert.ok(r.body.data.refresh_token);
    assert.strictEqual(r.body.data.token_type, 'Bearer');
  });

  it('wrong password → 401', async () => {
    await freshDb();
    const user = await makeUser({ email: 'lw@t.com', password: 'Right@1234' });
    const r = await req('POST', '/api/v1/auth/login', {
      body: { email: user.email, password: 'Wrong@1234' },
    });
    assert.strictEqual(r.status, 401);
  });

  it('unknown email → 401', async () => {
    await freshDb();
    const r = await req('POST', '/api/v1/auth/login', {
      body: { email: 'ghost@t.com', password: 'Ghost@1234' },
    });
    assert.strictEqual(r.status, 401);
  });

  it('inactive user → 403', async () => {
    await freshDb();
    const user = await makeUser({ email: 'inactive@t.com', password: 'Test@1234', status: 'inactive' });
    const r = await req('POST', '/api/v1/auth/login', {
      body: { email: user.email, password: user.password },
    });
    assert.strictEqual(r.status, 403);
  });

  it('same error message for bad email vs bad password (no oracle)', async () => {
    await freshDb();
    const user = await makeUser({ email: 'oracle@t.com', password: 'Pass@1234' });
    const r1 = await req('POST', '/api/v1/auth/login', { body: { email: 'ghost@t.com', password: 'Pass@1234' } });
    const r2 = await req('POST', '/api/v1/auth/login', { body: { email: user.email, password: 'Bad@1234' } });
    assert.strictEqual(r1.body.message, r2.body.message);
  });
});

describe('Auth — Me + Refresh + Logout', () => {
  it('GET /me returns user + permissions', async () => {
    await freshDb();
    const user  = await makeUser({ email: 'me@t.com', role: 'analyst' });
    const token = await tokenFor(user);
    const r = await req('GET', '/api/v1/auth/me', { token });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.email, 'me@t.com');
    assert.ok(Array.isArray(r.body.data.permissions));
    assert.ok(r.body.data.permissions.includes('records:read'));
    assert.ok(r.body.data.permissions.includes('analytics:read'));
  });

  it('GET /me without token → 401', async () => {
    await freshDb();
    const r = await req('GET', '/api/v1/auth/me');
    assert.strictEqual(r.status, 401);
  });

  it('GET /me with garbage token → 401', async () => {
    await freshDb();
    const r = await req('GET', '/api/v1/auth/me', { token: 'not.a.token' });
    assert.strictEqual(r.status, 401);
  });

  it('refresh token rotation works', async () => {
    await freshDb();
    const user = await makeUser({ email: 'rot@t.com', password: 'Pass@1234' });
    const loginR = await req('POST', '/api/v1/auth/login', { body: { email: user.email, password: user.password } });
    const { refresh_token } = loginR.body.data;

    const refreshR = await req('POST', '/api/v1/auth/refresh', { body: { refresh_token } });
    assert.strictEqual(refreshR.status, 200);
    assert.ok(refreshR.body.data.access_token);
    assert.ok(refreshR.body.data.refresh_token !== refresh_token, 'new token must differ');
  });

  it('reused refresh token → 401 (reuse detection)', async () => {
    await freshDb();
    const user = await makeUser({ email: 'reuse@t.com', password: 'Pass@1234' });
    const loginR = await req('POST', '/api/v1/auth/login', { body: { email: user.email, password: user.password } });
    const { refresh_token } = loginR.body.data;

    await req('POST', '/api/v1/auth/refresh', { body: { refresh_token } });       // valid use
    const r2 = await req('POST', '/api/v1/auth/refresh', { body: { refresh_token } }); // reuse
    assert.strictEqual(r2.status, 401);
  });
});

describe('Auth — Change Password', () => {
  it('changes password and invalidates old one', async () => {
    await freshDb();
    const user  = await makeUser({ email: 'chpw@t.com', password: 'Old@1234' });
    const token = await tokenFor(user);

    const r = await req('PUT', '/api/v1/auth/change-password', {
      token,
      body: { current_password: 'Old@1234', new_password: 'New@5678' },
    });
    assert.strictEqual(r.status, 200);

    const oldLogin = await req('POST', '/api/v1/auth/login', { body: { email: user.email, password: 'Old@1234' } });
    assert.strictEqual(oldLogin.status, 401);

    const newLogin = await req('POST', '/api/v1/auth/login', { body: { email: user.email, password: 'New@5678' } });
    assert.strictEqual(newLogin.status, 200);
  });

  it('wrong current password → 400', async () => {
    await freshDb();
    const user  = await makeUser({ email: 'chpw2@t.com', password: 'Curr@1234' });
    const token = await tokenFor(user);
    const r = await req('PUT', '/api/v1/auth/change-password', {
      token,
      body: { current_password: 'Wrong@1234', new_password: 'New@5678' },
    });
    assert.strictEqual(r.status, 400);
  });

  it('same new password → 422', async () => {
    await freshDb();
    const user  = await makeUser({ email: 'same@t.com', password: 'Same@1234' });
    const token = await tokenFor(user);
    const r = await req('PUT', '/api/v1/auth/change-password', {
      token,
      body: { current_password: 'Same@1234', new_password: 'Same@1234' },
    });
    assert.strictEqual(r.status, 422);
  });
});

describe('Users — RBAC', () => {
  let admin, analyst, viewer, adminToken, analystToken, viewerToken;

  async function setup() {
    await freshDb();
    admin    = await makeUser({ email: 'admin@u.com',   role: 'admin',   password: 'Admin@1' });
    analyst  = await makeUser({ email: 'analyst@u.com', role: 'analyst', password: 'Analyst@1' });
    viewer   = await makeUser({ email: 'viewer@u.com',  role: 'viewer',  password: 'Viewer@1' });
    adminToken   = await tokenFor(admin);
    analystToken = await tokenFor(analyst);
    viewerToken  = await tokenFor(viewer);
  }

  it('admin can list users', async () => {
    await setup();
    const r = await req('GET', '/api/v1/users', { token: adminToken });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.length >= 3);
    assert.ok(r.body.pagination);
  });

  it('analyst cannot list users → 403', async () => {
    await setup();
    const r = await req('GET', '/api/v1/users', { token: analystToken });
    assert.strictEqual(r.status, 403);
  });

  it('viewer cannot list users → 403', async () => {
    await setup();
    const r = await req('GET', '/api/v1/users', { token: viewerToken });
    assert.strictEqual(r.status, 403);
  });

  it('user can read own profile', async () => {
    await setup();
    const r = await req('GET', `/api/v1/users/${viewer.id}`, { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.id, viewer.id);
  });

  it('viewer cannot read another user → 403', async () => {
    await setup();
    const r = await req('GET', `/api/v1/users/${analyst.id}`, { token: viewerToken });
    assert.strictEqual(r.status, 403);
  });

  it('admin can update user role', async () => {
    await setup();
    const r = await req('PUT', `/api/v1/users/${viewer.id}`, {
      token: adminToken,
      body: { role: 'analyst' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.role, 'analyst');
  });

  it('cannot demote last admin → 409', async () => {
    await setup();
    const r = await req('PUT', `/api/v1/users/${admin.id}`, {
      token: adminToken,
      body: { role: 'viewer' },
    });
    assert.strictEqual(r.status, 409);
    assert.ok(r.body.message.match(/last.*admin/i));
  });

  it('admin can delete non-admin user', async () => {
    await setup();
    const r = await req('DELETE', `/api/v1/users/${viewer.id}`, { token: adminToken });
    assert.strictEqual(r.status, 204);
    const check = await req('GET', `/api/v1/users/${viewer.id}`, { token: adminToken });
    assert.strictEqual(check.status, 404);
  });

  it('cannot delete own account → 409', async () => {
    await setup();
    const r = await req('DELETE', `/api/v1/users/${admin.id}`, { token: adminToken });
    assert.strictEqual(r.status, 409);
  });

  it('passwords never appear in user responses', async () => {
    await setup();
    const r = await req('GET', '/api/v1/users', { token: adminToken });
    assert.ok(!JSON.stringify(r.body).includes('password'));
  });

  it('filter by role', async () => {
    await setup();
    const r = await req('GET', '/api/v1/users?role=analyst', { token: adminToken });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.every(u => u.role === 'analyst'));
  });

  it('non-existent user → 404', async () => {
    await setup();
    const r = await req('GET', '/api/v1/users/00000000-0000-0000-0000-000000000000', { token: adminToken });
    assert.strictEqual(r.status, 404);
  });
});

describe('Records — CRUD + Validation', () => {
  let admin, analyst, viewer, adminToken, analystToken, viewerToken;
  let incomeCat, expenseCat;

  async function setup() {
    await freshDb();
    const db = getDb();
    admin    = await makeUser({ email: 'admin@r.com',   role: 'admin',   password: 'Admin@1' });
    analyst  = await makeUser({ email: 'analyst@r.com', role: 'analyst', password: 'Analyst@1' });
    viewer   = await makeUser({ email: 'viewer@r.com',  role: 'viewer',  password: 'Viewer@1' });
    adminToken   = await tokenFor(admin);
    analystToken = await tokenFor(analyst);
    viewerToken  = await tokenFor(viewer);
    incomeCat  = makeCategory(db, { name: 'Salary',    type: 'income',  createdBy: admin.id });
    expenseCat = makeCategory(db, { name: 'Groceries', type: 'expense', createdBy: admin.id });
  }

  it('analyst can create income record', async () => {
    await setup();
    const r = await req('POST', '/api/v1/records', {
      token: analystToken,
      body: { amount: 50000, type: 'income', date: '2024-01-15', category_id: incomeCat.id },
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.data.amount, 50000);
    assert.strictEqual(r.body.data.category.id, incomeCat.id);
  });

  it('tags are stored and returned as array', async () => {
    await setup();
    const r = await req('POST', '/api/v1/records', {
      token: analystToken,
      body: { amount: 1000, type: 'income', date: '2024-01-15', tags: ['q1', 'bonus'] },
    });
    assert.strictEqual(r.status, 201);
    assert.deepStrictEqual(r.body.data.tags, ['q1', 'bonus']);
  });

  it('viewer cannot create records → 403', async () => {
    await setup();
    const r = await req('POST', '/api/v1/records', {
      token: viewerToken,
      body: { amount: 100, type: 'income', date: '2024-01-15' },
    });
    assert.strictEqual(r.status, 403);
  });

  it('amount ≤ 0 → 422', async () => {
    await setup();
    const r = await req('POST', '/api/v1/records', {
      token: analystToken,
      body: { amount: -50, type: 'income', date: '2024-01-15' },
    });
    assert.strictEqual(r.status, 422);
    assert.ok(r.body.errors.some(e => e.field === 'amount'));
  });

  it('future date → 422', async () => {
    await setup();
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const r = await req('POST', '/api/v1/records', {
      token: analystToken,
      body: { amount: 100, type: 'income', date: future.toISOString().slice(0, 10) },
    });
    assert.strictEqual(r.status, 422);
  });

  it('category-type mismatch → 422', async () => {
    await setup();
    const r = await req('POST', '/api/v1/records', {
      token: analystToken,
      body: { amount: 100, type: 'income', date: '2024-01-15', category_id: expenseCat.id },
    });
    assert.strictEqual(r.status, 422);
    assert.ok(r.body.message.includes('expense records only'));
  });

  it('missing type + date → 422 with both fields listed', async () => {
    await setup();
    const r = await req('POST', '/api/v1/records', {
      token: analystToken,
      body: { amount: 500 },
    });
    assert.strictEqual(r.status, 422);
    const fields = r.body.errors.map(e => e.field);
    assert.ok(fields.includes('type'));
    assert.ok(fields.includes('date'));
  });

  it('viewer can list records', async () => {
    await setup();
    const db = getDb();
    makeRecord(db, { amount: 1000, type: 'income',  createdBy: analyst.id });
    makeRecord(db, { amount: 500,  type: 'expense', createdBy: analyst.id });
    const r = await req('GET', '/api/v1/records', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.length, 2);
  });

  it('filter by type=income', async () => {
    await setup();
    const db = getDb();
    makeRecord(db, { amount: 1000, type: 'income',  createdBy: analyst.id });
    makeRecord(db, { amount: 500,  type: 'expense', createdBy: analyst.id });
    const r = await req('GET', '/api/v1/records?type=income', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.every(rec => rec.type === 'income'));
  });

  it('filter by date range', async () => {
    await setup();
    const db = getDb();
    makeRecord(db, { amount: 100, type: 'income', date: '2024-01-10', createdBy: analyst.id });
    makeRecord(db, { amount: 200, type: 'income', date: '2024-03-01', createdBy: analyst.id });
    const r = await req('GET', '/api/v1/records?date_from=2024-01-01&date_to=2024-01-31', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.length, 1);
    assert.strictEqual(r.body.data[0].date, '2024-01-10');
  });

  it('date_to before date_from → 422', async () => {
    await setup();
    const r = await req('GET', '/api/v1/records?date_from=2024-06-01&date_to=2024-01-01', { token: viewerToken });
    assert.strictEqual(r.status, 422);
  });

  it('pagination works', async () => {
    await setup();
    const db = getDb();
    for (let i = 0; i < 5; i++) makeRecord(db, { amount: 100 * (i+1), type: 'income', createdBy: analyst.id });
    const r = await req('GET', '/api/v1/records?page=1&limit=3', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.length, 3);
    assert.strictEqual(r.body.pagination.total, 5);
    assert.strictEqual(r.body.pagination.totalPages, 2);
    assert.strictEqual(r.body.pagination.hasNext, true);
  });

  it('analyst can update record', async () => {
    await setup();
    const db  = getDb();
    const rec = makeRecord(db, { amount: 1000, type: 'income', createdBy: analyst.id });
    const r   = await req('PUT', `/api/v1/records/${rec.id}`, {
      token: analystToken,
      body: { amount: 1500, description: 'Updated' },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.amount, 1500);
    assert.strictEqual(r.body.data.description, 'Updated');
  });

  it('admin soft-deletes record', async () => {
    await setup();
    const db  = getDb();
    const rec = makeRecord(db, { amount: 999, type: 'income', createdBy: analyst.id });

    const delR = await req('DELETE', `/api/v1/records/${rec.id}`, { token: adminToken });
    assert.strictEqual(delR.status, 200);

    // No longer visible via GET
    const getR = await req('GET', `/api/v1/records/${rec.id}`, { token: viewerToken });
    assert.strictEqual(getR.status, 404);

    // DB row has status=deleted and deleted_at set
    const row = getDb().prepare('SELECT status, deleted_at FROM financial_records WHERE id=?').get(rec.id);
    assert.strictEqual(row.status, 'deleted');
    assert.ok(row.deleted_at);
  });

  it('analyst cannot delete records → 403', async () => {
    await setup();
    const db  = getDb();
    const rec = makeRecord(db, { amount: 100, type: 'income', createdBy: analyst.id });
    const r   = await req('DELETE', `/api/v1/records/${rec.id}`, { token: analystToken });
    assert.strictEqual(r.status, 403);
  });

  it('invalid UUID → 422', async () => {
    await setup();
    const r = await req('GET', '/api/v1/records/not-a-uuid', { token: viewerToken });
    assert.strictEqual(r.status, 422);
  });

  it('non-existent record → 404', async () => {
    await setup();
    const r = await req('GET', '/api/v1/records/00000000-0000-0000-0000-000000000000', { token: viewerToken });
    assert.strictEqual(r.status, 404);
  });

  it('unauthenticated → 401', async () => {
    await setup();
    const r = await req('GET', '/api/v1/records');
    assert.strictEqual(r.status, 401);
  });
});

describe('Categories', () => {
  let admin, analyst, viewer, adminToken, analystToken, viewerToken;

  async function setup() {
    await freshDb();
    admin    = await makeUser({ email: 'admin@c.com',   role: 'admin',   password: 'Admin@1' });
    analyst  = await makeUser({ email: 'analyst@c.com', role: 'analyst', password: 'Analyst@1' });
    viewer   = await makeUser({ email: 'viewer@c.com',  role: 'viewer',  password: 'Viewer@1' });
    adminToken   = await tokenFor(admin);
    analystToken = await tokenFor(analyst);
    viewerToken  = await tokenFor(viewer);
  }

  it('analyst can create category', async () => {
    await setup();
    const r = await req('POST', '/api/v1/categories', {
      token: analystToken,
      body: { name: 'Bonus', type: 'income', color: '#22C55E' },
    });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.data.name, 'Bonus');
    assert.strictEqual(r.body.data.color, '#22C55E');
  });

  it('viewer cannot create category → 403', async () => {
    await setup();
    const r = await req('POST', '/api/v1/categories', {
      token: viewerToken,
      body: { name: 'Nope', type: 'income' },
    });
    assert.strictEqual(r.status, 403);
  });

  it('duplicate name → 409', async () => {
    await setup();
    makeCategory(getDb(), { name: 'Food', type: 'expense', createdBy: admin.id });
    const r = await req('POST', '/api/v1/categories', {
      token: analystToken,
      body: { name: 'Food', type: 'expense' },
    });
    assert.strictEqual(r.status, 409);
  });

  it('invalid hex color → 422', async () => {
    await setup();
    const r = await req('POST', '/api/v1/categories', {
      token: analystToken,
      body: { name: 'Colorful', type: 'both', color: 'red' },
    });
    assert.strictEqual(r.status, 422);
  });

  it('viewer can list categories', async () => {
    await setup();
    const db = getDb();
    makeCategory(db, { name: 'A', type: 'income',  createdBy: admin.id });
    makeCategory(db, { name: 'B', type: 'expense', createdBy: admin.id });
    const r = await req('GET', '/api/v1/categories', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.length, 2);
  });

  it('admin can delete unused category', async () => {
    await setup();
    const cat = makeCategory(getDb(), { name: 'ToDelete', type: 'income', createdBy: admin.id });
    const r   = await req('DELETE', `/api/v1/categories/${cat.id}`, { token: adminToken });
    assert.strictEqual(r.status, 204);
  });

  it('cannot delete category with active records → 409', async () => {
    await setup();
    const db  = getDb();
    const cat = makeCategory(db, { name: 'InUse', type: 'income', createdBy: admin.id });
    makeRecord(db, { amount: 100, type: 'income', categoryId: cat.id, createdBy: admin.id });
    const r = await req('DELETE', `/api/v1/categories/${cat.id}`, { token: adminToken });
    assert.strictEqual(r.status, 409);
    assert.ok(r.body.message.match(/cannot delete/i));
  });

  it('analyst cannot update categories → 403', async () => {
    await setup();
    const cat = makeCategory(getDb(), { name: 'X', type: 'expense', createdBy: admin.id });
    const r   = await req('PUT', `/api/v1/categories/${cat.id}`, {
      token: analystToken,
      body: { name: 'Hacked' },
    });
    assert.strictEqual(r.status, 403);
  });
});

describe('Dashboard Analytics', () => {
  let viewerToken, analystToken, adminToken;

  async function setup() {
    await freshDb();
    const db = getDb();
    const admin   = await makeUser({ email: 'admin@d.com',   role: 'admin',   password: 'Admin@1' });
    const analyst = await makeUser({ email: 'analyst@d.com', role: 'analyst', password: 'Analyst@1' });
    const viewer  = await makeUser({ email: 'viewer@d.com',  role: 'viewer',  password: 'Viewer@1' });
    adminToken   = await tokenFor(admin);
    analystToken = await tokenFor(analyst);
    viewerToken  = await tokenFor(viewer);

    const salaryCat = makeCategory(db, { name: 'Salary',    type: 'income',  createdBy: admin.id });
    const rentCat   = makeCategory(db, { name: 'Rent',      type: 'expense', createdBy: admin.id });
    const foodCat   = makeCategory(db, { name: 'Groceries', type: 'expense', createdBy: admin.id });

    // Deterministic data
    makeRecord(db, { amount: 80000, type: 'income',  categoryId: salaryCat.id, date: '2024-01-01', createdBy: analyst.id });
    makeRecord(db, { amount: 20000, type: 'expense', categoryId: rentCat.id,   date: '2024-01-05', createdBy: analyst.id });
    makeRecord(db, { amount: 5000,  type: 'expense', categoryId: foodCat.id,   date: '2024-01-15', createdBy: analyst.id });
    makeRecord(db, { amount: 90000, type: 'income',  categoryId: salaryCat.id, date: '2024-02-01', createdBy: analyst.id });
    makeRecord(db, { amount: 20000, type: 'expense', categoryId: rentCat.id,   date: '2024-02-05', createdBy: analyst.id });
  }

  it('summary returns correct totals', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/summary', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.total_income,   170000);
    assert.strictEqual(r.body.data.total_expenses,  45000);
    assert.strictEqual(r.body.data.net_balance,    125000);
    assert.strictEqual(r.body.data.total_records,       5);
  });

  it('summary respects date_from/date_to filter', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/summary?date_from=2024-01-01&date_to=2024-01-31', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.total_income,  80000);
    assert.strictEqual(r.body.data.total_expenses, 25000);
    assert.strictEqual(r.body.data.net_balance,    55000);
  });

  it('category breakdown returns per-category totals', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/categories', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    const salary = r.body.data.find(d => d.category_name === 'Salary');
    assert.ok(salary, 'Salary category must appear');
    assert.strictEqual(salary.total, 170000);
    assert.strictEqual(salary.type, 'income');
  });

  it('category breakdown filters by type=expense', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/categories?type=expense', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.every(d => d.type === 'expense'));
  });

  it('monthly trends pivot correctly', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/trends/monthly?date_from=2024-01-01&date_to=2024-02-28', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    const jan = r.body.data.find(m => m.month === '2024-01');
    const feb = r.body.data.find(m => m.month === '2024-02');
    assert.ok(jan, 'January must be present');
    assert.strictEqual(jan.income,  80000);
    assert.strictEqual(jan.expense, 25000);
    assert.strictEqual(jan.net,     55000);
    assert.strictEqual(feb.income,  90000);
    assert.strictEqual(feb.expense, 20000);
  });

  it('overview returns all sections', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/overview', { token: viewerToken });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.data.summary);
    assert.ok(r.body.data.category_totals);
    assert.ok(Array.isArray(r.body.data.monthly_trends));
    assert.ok(Array.isArray(r.body.data.recent_activity));
  });

  it('insights accessible by analyst', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/insights', { token: analystToken });
    assert.strictEqual(r.status, 200);
    assert.ok(typeof r.body.data.savings_rate === 'number');
    assert.ok(Array.isArray(r.body.data.top_expense_categories));
    assert.ok(Array.isArray(r.body.data.top_income_categories));
    // savings_rate = 125000/170000 * 100 ≈ 73.53
    assert.ok(r.body.data.savings_rate > 70);
  });

  it('insights blocked for viewer → 403', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/insights', { token: viewerToken });
    assert.strictEqual(r.status, 403);
  });

  it('insights accessible by admin', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/insights', { token: adminToken });
    assert.strictEqual(r.status, 200);
  });

  it('unauthenticated dashboard → 401', async () => {
    await setup();
    const r = await req('GET', '/api/v1/dashboard/summary');
    assert.strictEqual(r.status, 401);
  });
});

describe('Audit Log', () => {
  it('admin can read audit log', async () => {
    await freshDb();
    const admin = await makeUser({ email: 'audit@t.com', role: 'admin', password: 'Admin@1' });
    const token = await tokenFor(admin);
    const r = await req('GET', '/api/v1/audit', { token });
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.data));
    assert.ok(r.body.pagination);
  });

  it('non-admin cannot read audit log → 403', async () => {
    await freshDb();
    const viewer = await makeUser({ email: 'va@t.com', role: 'viewer', password: 'Viewer@1' });
    const token  = await tokenFor(viewer);
    const r = await req('GET', '/api/v1/audit', { token });
    assert.strictEqual(r.status, 403);
  });
});

describe('MIS State API', () => {
  it('persists shared MIS state for an authenticated user', async () => {
    await freshDb();
    const user = await makeUser({ email: 'mis@t.com', role: 'admin' });
    const token = await tokenFor(user);
    const state = { tx: [], sales: [], orders: [], products: [], customers: [] };
    const saved = await req('PUT', '/api/mis/state', { token, body: state });
    assert.strictEqual(saved.status, 200);
    const loaded = await req('GET', '/api/mis/state', { token });
    assert.strictEqual(loaded.status, 200);
    assert.deepStrictEqual(loaded.body.state, state);
  });

  it('rejects unauthenticated state writes', async () => {
    await freshDb();
    const response = await req('PUT', '/api/mis/state', { body: { tx: [], sales: [], orders: [] } });
    assert.strictEqual(response.status, 401);
  });

  it('blocks read-only viewer state writes', async () => {
    await freshDb();
    const user = await makeUser({ email: 'viewer@mis.test', role: 'viewer' });
    const token = await tokenFor(user);
    const response = await req('PUT', '/api/mis/state', { token, body: { tx: [], sales: [], orders: [] } });
    assert.strictEqual(response.status, 403);
  });
});

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  // Start server on random port
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      PORT = server.address().port;
      resolve();
    });
  });

  console.log(`\n🚀 Test server on port ${PORT}\n`);
  const start = Date.now();

  for (const suite of suites) {
    console.log(`\n  📦 ${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        console.log(`    ✅ ${test.name}`);
        results.pass++;
      } catch (err) {
        console.log(`    ❌ ${test.name}`);
        console.log(`       ${err.message}`);
        results.fail++;
        results.errors.push({ suite: suite.name, test: test.name, error: err.message });
      }
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  server.close();

  console.log('\n' + '─'.repeat(60));
  console.log(`\n  Tests:   ${results.pass + results.fail}`);
  console.log(`  Passed:  ${results.pass} ✅`);
  console.log(`  Failed:  ${results.fail} ${results.fail > 0 ? '❌' : ''}`);
  console.log(`  Time:    ${elapsed}s`);

  if (results.errors.length) {
    console.log('\n  Failures:');
    for (const e of results.errors) {
      console.log(`    [${e.suite}] ${e.test}`);
      console.log(`      ${e.error}`);
    }
  }

  console.log('');
  process.exit(results.fail > 0 ? 1 : 0);
}

run().catch(err => { console.error('Runner crashed:', err); process.exit(1); });
