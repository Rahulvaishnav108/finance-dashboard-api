'use strict';

const express = require('express');
const { getDb } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const ApiResponse = require('../utils/ApiResponse');
const { audit } = require('../utils/audit');

const router = express.Router();

router.use(authenticate);

router.get('/state', (req, res) => {
  const row = getDb().prepare('SELECT state_json FROM mis_app_state WHERE id = 1').get();
  if (!row) return res.json({ state: null });
  try { return res.json({ state: JSON.parse(row.state_json) }); }
  catch { return ApiResponse.serverError(res, 'Stored MIS data is invalid'); }
});

router.put('/state', (req, res) => {
  if (req.user.role === 'viewer') return ApiResponse.forbidden(res, 'This account is read-only');
  const state = req.body;
  if (!state || !Array.isArray(state.tx) || !Array.isArray(state.sales) || !Array.isArray(state.orders)) {
    return ApiResponse.error(res, 'Invalid MIS database state');
  }
  getDb().prepare(`
    INSERT INTO mis_app_state (id, state_json, updated_by, updated_at)
    VALUES (1, @state_json, @updated_by, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run({ state_json: JSON.stringify(state), updated_by: req.user.id });
  audit({ userId: req.user.id, action: 'mis.state_saved', resource: 'mis_app_state', resourceId: '1', req });
  return res.json({ ok: true });
});

module.exports = router;