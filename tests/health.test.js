'use strict';

const request = require('supertest');
const { app, setupTestDb } = require('./helpers');

beforeEach(() => setupTestDb());

describe('GET /health', () => {
  it('returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
  });
});

describe('GET /api/v1', () => {
  it('returns API root info', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('v1');
    expect(res.body.endpoints).toBeDefined();
  });
});

describe('Unknown routes', () => {
  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for unknown method', async () => {
    const res = await request(app).patch('/api/v1/records');
    expect(res.status).toBe(404);
  });
});

describe('Request ID tracing', () => {
  it('echoes back X-Request-ID from client', async () => {
    const res = await request(app).get('/health').set('X-Request-ID', 'my-trace-123');
    expect(res.headers['x-request-id']).toBe('my-trace-123');
  });

  it('generates X-Request-ID when not supplied', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('Payload size limits', () => {
  it('rejects bodies over 10kb', async () => {
    const huge = { description: 'x'.repeat(15000) };
    const res  = await request(app).post('/api/v1/auth/login').send(huge);
    expect([400, 413].includes(res.status)).toBe(true);
  });
});

describe('Security headers', () => {
  it('sets X-Content-Type-Options header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not expose X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
