'use strict';

const request = require('supertest');
const { app, setupTestDb, createUser, loginAs, getDb } = require('./helpers');

beforeEach(() => setupTestDb());

describe('POST /api/v1/auth/register', () => {
  it('registers a new user with valid data', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'new@test.com', password: 'NewPass@1', full_name: 'New User',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ email: 'new@test.com', role: 'viewer' });
    expect(res.body.data.password_hash).toBeUndefined();
  });

  it('assigns default role viewer', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'viewer@test.com', password: 'Pass@1234', full_name: 'Viewer',
    });
    expect(res.body.data.role).toBe('viewer');
  });

  it('accepts a specified valid role', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'analyst@test.com', password: 'Pass@1234', full_name: 'Ana', role: 'analyst',
    });
    expect(res.body.data.role).toBe('analyst');
  });

  it('rejects duplicate email with 409', async () => {
    await createUser({ email: 'dup@test.com' });
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'dup@test.com', password: 'Pass@1234', full_name: 'Dup',
    });
    expect(res.status).toBe(409);
  });

  it('rejects missing email with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      password: 'Pass@1234', full_name: 'No Email',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'email' }),
    ]));
  });

  it('rejects weak password (no uppercase)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'weak@test.com', password: 'password1', full_name: 'Weak',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors.some(e => e.field === 'password')).toBe(true);
  });

  it('rejects invalid role', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'bad@test.com', password: 'Pass@1234', full_name: 'Bad Role', role: 'superuser',
    });
    expect(res.status).toBe(422);
  });

  it('never returns password_hash in response', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'safe@test.com', password: 'Safe@1234', full_name: 'Safe',
    });
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('Safe@1234');
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await createUser({ email: 'login@test.com', password: 'Login@1234' });
  });

  it('returns access + refresh tokens on valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@test.com', password: 'Login@1234',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      token_type: 'Bearer',
      expires_in: 86400,
    });
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@test.com', password: 'WrongPass@1',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects unknown email with 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'ghost@test.com', password: 'Ghost@1234',
    });
    expect(res.status).toBe(401);
  });

  it('rejects inactive user with 403', async () => {
    await createUser({ email: 'inactive@test.com', password: 'Test@1234', status: 'inactive' });
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'inactive@test.com', password: 'Test@1234',
    });
    expect(res.status).toBe(403);
  });

  it('does not leak which field is wrong', async () => {
    const r1 = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@test.com', password: 'Pass@1' });
    const r2 = await request(app).post('/api/v1/auth/login').send({ email: 'login@test.com', password: 'BadPass@1' });
    expect(r1.body.message).toBe(r2.body.message);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns current user profile', async () => {
    const user  = await createUser({ email: 'me@test.com', role: 'analyst' });
    const token = await loginAs(user);
    const res   = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: 'me@test.com', role: 'analyst' });
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
    expect(res.body.data.permissions).toContain('records:read');
  });

  it('rejects missing token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects malformed token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.token');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('issues new token pair and rotates refresh token', async () => {
    const user = await createUser({ email: 'refresh@test.com', password: 'Pass@1234' });
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const { refresh_token } = loginRes.body.data;

    const res = await request(app).post('/api/v1/auth/refresh').send({ refresh_token });
    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toBeTruthy();
    expect(res.body.data.refresh_token).toBeTruthy();
    // New refresh token must differ
    expect(res.body.data.refresh_token).not.toBe(refresh_token);
  });

  it('rejects the old token after rotation (reuse detection)', async () => {
    const user = await createUser({ email: 'rotate@test.com', password: 'Pass@1234' });
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    const { refresh_token } = loginRes.body.data;

    // First refresh (valid)
    await request(app).post('/api/v1/auth/refresh').send({ refresh_token });

    // Reuse old token → must fail
    const res2 = await request(app).post('/api/v1/auth/refresh').send({ refresh_token });
    expect(res2.status).toBe(401);
  });

  it('rejects invalid refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refresh_token: 'garbage' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/v1/auth/change-password', () => {
  it('changes password successfully', async () => {
    const user  = await createUser({ email: 'chpw@test.com', password: 'Old@1234' });
    const token = await loginAs(user);

    const res = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Old@1234', new_password: 'New@5678' });
    expect(res.status).toBe(200);

    // Old password no longer works
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Old@1234' });
    expect(loginRes.status).toBe(401);

    // New password works
    const loginRes2 = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'New@5678' });
    expect(loginRes2.status).toBe(200);
  });

  it('rejects wrong current password', async () => {
    const user  = await createUser({ email: 'chpw2@test.com', password: 'Curr@1234' });
    const token = await loginAs(user);
    const res   = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Wrong@1234', new_password: 'New@5678' });
    expect(res.status).toBe(400);
  });

  it('rejects same password as new', async () => {
    const user  = await createUser({ email: 'same@test.com', password: 'Same@1234' });
    const token = await loginAs(user);
    const res   = await request(app)
      .put('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'Same@1234', new_password: 'Same@1234' });
    expect(res.status).toBe(422);
  });
});
