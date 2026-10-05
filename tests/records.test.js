'use strict';

const request = require('supertest');
const { app, setupTestDb, createUser, loginAs, createCategory, createRecord, getDb } = require('./helpers');

let admin, analyst, viewer;
let adminToken, analystToken, viewerToken;
let incomeCategory, expenseCategory;

beforeEach(async () => {
  setupTestDb();
  const db = getDb();

  admin   = await createUser({ email: 'admin@r.com',   role: 'admin',   password: 'Admin@1' });
  analyst = await createUser({ email: 'analyst@r.com', role: 'analyst', password: 'Analyst@1' });
  viewer  = await createUser({ email: 'viewer@r.com',  role: 'viewer',  password: 'Viewer@1' });
  adminToken   = await loginAs(admin);
  analystToken = await loginAs(analyst);
  viewerToken  = await loginAs(viewer);

  incomeCategory  = createCategory(db, { name: 'Salary',   type: 'income',  createdBy: admin.id });
  expenseCategory = createCategory(db, { name: 'Groceries', type: 'expense', createdBy: admin.id });
});

describe('POST /api/v1/records', () => {
  it('analyst can create an income record', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 50000, type: 'income', date: '2024-01-15', description: 'January salary', category_id: incomeCategory.id });
    expect(res.status).toBe(201);
    expect(res.body.data.amount).toBe(50000);
    expect(res.body.data.type).toBe('income');
    expect(res.body.data.category.id).toBe(incomeCategory.id);
  });

  it('admin can create an expense record', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 5000, type: 'expense', date: '2024-01-20', category_id: expenseCategory.id });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('expense');
  });

  it('viewer cannot create records → 403', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ amount: 100, type: 'income', date: '2024-01-15' });
    expect(res.status).toBe(403);
  });

  it('rejects amount ≤ 0', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: -100, type: 'income', date: '2024-01-15' });
    expect(res.status).toBe(422);
    expect(res.body.errors.some(e => e.field === 'amount')).toBe(true);
  });

  it('rejects future date', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 100, type: 'income', date: future.toISOString().slice(0, 10) });
    expect(res.status).toBe(422);
  });

  it('rejects category-type mismatch (income record with expense category)', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 100, type: 'income', date: '2024-01-15', category_id: expenseCategory.id });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/expense records only/i);
  });

  it('accepts tags array and returns parsed', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 100, type: 'income', date: '2024-01-15', tags: ['q1', 'bonus'] });
    expect(res.status).toBe(201);
    expect(res.body.data.tags).toEqual(['q1', 'bonus']);
  });

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 100 }); // missing type, date
    expect(res.status).toBe(422);
    const fields = res.body.errors.map(e => e.field);
    expect(fields).toContain('type');
    expect(fields).toContain('date');
  });
});

describe('GET /api/v1/records', () => {
  beforeEach(() => {
    const db = getDb();
    createRecord(db, { amount: 1000, type: 'income',  categoryId: incomeCategory.id,  date: '2024-01-10', createdBy: analyst.id });
    createRecord(db, { amount: 500,  type: 'expense', categoryId: expenseCategory.id, date: '2024-01-15', createdBy: analyst.id });
    createRecord(db, { amount: 2000, type: 'income',  date: '2024-02-01', createdBy: admin.id });
  });

  it('viewer can list records', async () => {
    const res = await request(app).get('/api/v1/records').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  it('filters by type', async () => {
    const res = await request(app).get('/api/v1/records?type=income').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.type === 'income')).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('filters by date range', async () => {
    const res = await request(app)
      .get('/api/v1/records?date_from=2024-01-01&date_to=2024-01-31')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every(r => r.date >= '2024-01-01' && r.date <= '2024-01-31')).toBe(true);
  });

  it('filters by category', async () => {
    const res = await request(app)
      .get(`/api/v1/records?category_id=${incomeCategory.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.category?.id === incomeCategory.id)).toBe(true);
  });

  it('filters by amount range', async () => {
    const res = await request(app)
      .get('/api/v1/records?amount_min=600&amount_max=1500')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every(r => r.amount >= 600 && r.amount <= 1500)).toBe(true);
  });

  it('rejects date_to before date_from', async () => {
    const res = await request(app)
      .get('/api/v1/records?date_from=2024-06-01&date_to=2024-01-01')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(422);
  });

  it('paginates correctly', async () => {
    const res = await request(app)
      .get('/api/v1/records?page=1&limit=2')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('unauthenticated → 401', async () => {
    const res = await request(app).get('/api/v1/records');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/records/:id', () => {
  it('returns a single record', async () => {
    const db  = getDb();
    const rec = createRecord(db, { amount: 750, type: 'expense', createdBy: analyst.id });
    const res = await request(app).get(`/api/v1/records/${rec.id}`).set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(rec.id);
    expect(res.body.data.amount).toBe(750);
  });

  it('returns 404 for missing record', async () => {
    const res = await request(app)
      .get('/api/v1/records/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 422 for invalid UUID', async () => {
    const res = await request(app).get('/api/v1/records/not-a-uuid').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(422);
  });
});

describe('PUT /api/v1/records/:id', () => {
  let record;
  beforeEach(() => {
    record = createRecord(getDb(), { amount: 1000, type: 'income', createdBy: analyst.id });
  });

  it('analyst can update a record', async () => {
    const res = await request(app)
      .put(`/api/v1/records/${record.id}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 1500, description: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(1500);
    expect(res.body.data.description).toBe('Updated');
  });

  it('viewer cannot update → 403', async () => {
    const res = await request(app)
      .put(`/api/v1/records/${record.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ amount: 999 });
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent record', async () => {
    const res = await request(app)
      .put('/api/v1/records/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ amount: 100 });
    expect(res.status).toBe(404);
  });

  it('rejects category-type mismatch on update', async () => {
    // record is income; try to set an expense category
    const res = await request(app)
      .put(`/api/v1/records/${record.id}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ category_id: expenseCategory.id });
    expect(res.status).toBe(422);
  });
});

describe('DELETE /api/v1/records/:id', () => {
  it('admin can soft-delete a record', async () => {
    const db  = getDb();
    const rec = createRecord(db, { amount: 999, type: 'income', createdBy: analyst.id });

    const res = await request(app)
      .delete(`/api/v1/records/${rec.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Verify it's no longer fetchable
    const getRes = await request(app)
      .get(`/api/v1/records/${rec.id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(getRes.status).toBe(404);

    // Verify soft-delete in DB
    const row = db.prepare('SELECT status, deleted_at FROM financial_records WHERE id = ?').get(rec.id);
    expect(row.status).toBe('deleted');
    expect(row.deleted_at).toBeTruthy();
  });

  it('analyst cannot delete records → 403', async () => {
    const db  = getDb();
    const rec = createRecord(db, { amount: 100, type: 'income', createdBy: analyst.id });
    const res = await request(app).delete(`/api/v1/records/${rec.id}`).set('Authorization', `Bearer ${analystToken}`);
    expect(res.status).toBe(403);
  });
});
