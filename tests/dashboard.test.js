'use strict';

const request = require('supertest');
const { app, setupTestDb, createUser, loginAs, createCategory, createRecord, getDb } = require('./helpers');

let adminToken, analystToken, viewerToken;
let analyst;

beforeEach(async () => {
  setupTestDb();
  const db = getDb();

  const admin  = await createUser({ email: 'admin@d.com',   role: 'admin',   password: 'Admin@1' });
  analyst       = await createUser({ email: 'analyst@d.com', role: 'analyst', password: 'Analyst@1' });
  const viewer  = await createUser({ email: 'viewer@d.com',  role: 'viewer',  password: 'Viewer@1' });
  adminToken   = await loginAs(admin);
  analystToken = await loginAs(analyst);
  viewerToken  = await loginAs(viewer);

  const salarycat = createCategory(db, { name: 'Salary',    type: 'income',  createdBy: admin.id });
  const rentcat   = createCategory(db, { name: 'Rent',      type: 'expense', createdBy: admin.id });
  const foodcat   = createCategory(db, { name: 'Groceries', type: 'expense', createdBy: admin.id });

  // Seed deterministic records
  createRecord(db, { amount: 80000, type: 'income',  categoryId: salarycat.id, date: '2024-01-01', createdBy: analyst.id });
  createRecord(db, { amount: 20000, type: 'expense', categoryId: rentcat.id,   date: '2024-01-05', createdBy: analyst.id });
  createRecord(db, { amount: 5000,  type: 'expense', categoryId: foodcat.id,   date: '2024-01-15', createdBy: analyst.id });
  createRecord(db, { amount: 90000, type: 'income',  categoryId: salarycat.id, date: '2024-02-01', createdBy: analyst.id });
  createRecord(db, { amount: 20000, type: 'expense', categoryId: rentcat.id,   date: '2024-02-05', createdBy: analyst.id });
});

describe('GET /api/v1/dashboard/summary', () => {
  it('returns correct totals', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.total_income).toBe(170000);
    expect(data.total_expenses).toBe(45000);
    expect(data.net_balance).toBe(125000);
    expect(data.total_records).toBe(5);
  });

  it('respects date_from / date_to filter', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary?date_from=2024-01-01&date_to=2024-01-31')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total_income).toBe(80000);
    expect(res.body.data.total_expenses).toBe(25000);
    expect(res.body.data.net_balance).toBe(55000);
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app).get('/api/v1/dashboard/summary');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/dashboard/categories', () => {
  it('returns category totals', async () => {
    const res = await request(app).get('/api/v1/dashboard/categories').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const salaryRow = res.body.data.find(r => r.category_name === 'Salary');
    expect(salaryRow).toBeDefined();
    expect(salaryRow.total).toBe(170000);
    expect(salaryRow.type).toBe('income');
  });

  it('filters by type=expense', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/categories?type=expense')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.type === 'expense')).toBe(true);
  });
});

describe('GET /api/v1/dashboard/trends/monthly', () => {
  it('returns monthly pivoted data', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/trends/monthly?date_from=2024-01-01&date_to=2024-02-28')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    const months = res.body.data;
    expect(Array.isArray(months)).toBe(true);
    const jan = months.find(m => m.month === '2024-01');
    const feb = months.find(m => m.month === '2024-02');
    expect(jan).toBeDefined();
    expect(jan.income).toBe(80000);
    expect(jan.expense).toBe(25000);
    expect(jan.net).toBe(55000);
    expect(feb.income).toBe(90000);
  });
});

describe('GET /api/v1/dashboard/trends/weekly', () => {
  it('returns weekly trend data', async () => {
    const res = await request(app).get('/api/v1/dashboard/trends/weekly').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/v1/dashboard/recent', () => {
  it('returns recent activity', async () => {
    const res = await request(app).get('/api/v1/dashboard/recent').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('respects limit query param', async () => {
    const res = await request(app).get('/api/v1/dashboard/recent?limit=2').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });
});

describe('GET /api/v1/dashboard/insights', () => {
  it('analyst can access insights', async () => {
    const res = await request(app).get('/api/v1/dashboard/insights').set('Authorization', `Bearer ${analystToken}`);
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.savings_rate).toBeDefined();
    expect(data.expense_to_income_ratio).toBeDefined();
    expect(Array.isArray(data.top_expense_categories)).toBe(true);
    expect(Array.isArray(data.top_income_categories)).toBe(true);
    // Savings rate: 125000/170000 * 100 ≈ 73.53
    expect(data.savings_rate).toBeGreaterThan(70);
  });

  it('viewer cannot access insights → 403', async () => {
    const res = await request(app).get('/api/v1/dashboard/insights').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can access insights', async () => {
    const res = await request(app).get('/api/v1/dashboard/insights').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/dashboard/overview', () => {
  it('returns all sections in one call', async () => {
    const res = await request(app).get('/api/v1/dashboard/overview').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data).toHaveProperty('category_totals');
    expect(res.body.data).toHaveProperty('monthly_trends');
    expect(res.body.data).toHaveProperty('recent_activity');
  });
});
