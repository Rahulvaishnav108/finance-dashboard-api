'use strict';

const request = require('supertest');
const { app, setupTestDb, createUser, loginAs, createCategory, createRecord, getDb } = require('./helpers');

let adminToken, analystToken, viewerToken, admin;

beforeEach(async () => {
  setupTestDb();
  admin         = await createUser({ email: 'admin@c.com',   role: 'admin',   password: 'Admin@1' });
  const analyst = await createUser({ email: 'analyst@c.com', role: 'analyst', password: 'Analyst@1' });
  const viewer  = await createUser({ email: 'viewer@c.com',  role: 'viewer',  password: 'Viewer@1' });
  adminToken   = await loginAs(admin);
  analystToken = await loginAs(analyst);
  viewerToken  = await loginAs(viewer);
});

describe('POST /api/v1/categories', () => {
  it('analyst can create a category', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ name: 'Bonus', type: 'income', color: '#22C55E' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Bonus');
    expect(res.body.data.color).toBe('#22C55E');
  });

  it('viewer cannot create categories → 403', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Nope', type: 'income' });
    expect(res.status).toBe(403);
  });

  it('rejects duplicate category name', async () => {
    createCategory(getDb(), { name: 'Food', type: 'expense', createdBy: admin.id });
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ name: 'Food', type: 'expense' });
    expect(res.status).toBe(409);
  });

  it('rejects invalid hex color', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ name: 'Colorful', type: 'both', color: 'red' });
    expect(res.status).toBe(422);
  });

  it('accepts type=both', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ name: 'Misc', type: 'both' });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('both');
  });
});

describe('GET /api/v1/categories', () => {
  it('viewer can list categories', async () => {
    const db = getDb();
    createCategory(db, { name: 'Cat A', type: 'income', createdBy: admin.id });
    createCategory(db, { name: 'Cat B', type: 'expense', createdBy: admin.id });
    const res = await request(app).get('/api/v1/categories').set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
});

describe('PUT /api/v1/categories/:id', () => {
  it('admin can update a category', async () => {
    const cat = createCategory(getDb(), { name: 'OldName', type: 'expense', createdBy: admin.id });
    const res = await request(app)
      .put(`/api/v1/categories/${cat.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'NewName', color: '#FF0000' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('NewName');
    expect(res.body.data.color).toBe('#FF0000');
  });

  it('analyst cannot update categories → 403', async () => {
    const cat = createCategory(getDb(), { name: 'X', type: 'expense', createdBy: admin.id });
    const res = await request(app)
      .put(`/api/v1/categories/${cat.id}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/v1/categories/:id', () => {
  it('admin can delete an unused category', async () => {
    const cat = createCategory(getDb(), { name: 'ToDelete', type: 'income', createdBy: admin.id });
    const res = await request(app)
      .delete(`/api/v1/categories/${cat.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it('cannot delete category with active records', async () => {
    const db  = getDb();
    const cat = createCategory(db, { name: 'InUse', type: 'income', createdBy: admin.id });
    createRecord(db, { amount: 100, type: 'income', categoryId: cat.id, createdBy: admin.id });
    const res = await request(app)
      .delete(`/api/v1/categories/${cat.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/cannot delete/i);
  });

  it('returns 404 for non-existent category', async () => {
    const res = await request(app)
      .delete('/api/v1/categories/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});
