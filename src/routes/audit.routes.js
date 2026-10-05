'use strict';

const express          = require('express');
const AuditService     = require('../services/audit.service');
const ApiResponse      = require('../utils/ApiResponse');
const { authenticate } = require('../middleware/auth');
const { authorize }    = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/v1/audit
 * @desc  Paginated, filterable audit log — admin only
 */
router.get('/', authorize('audit:read'), (req, res, next) => {
  try {
    const { action, resource, user_id, date_from, date_to, page, limit } = req.query;
    const result = AuditService.list({ action, resource, user_id, date_from, date_to, page, limit });
    return ApiResponse.paginated(res, result.data, result.pagination);
  } catch (err) { next(err); }
});

module.exports = router;
