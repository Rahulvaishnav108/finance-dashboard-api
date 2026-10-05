'use strict';

const express            = require('express');
const RecordController   = require('../controllers/record.controller');
const { authenticate }   = require('../middleware/auth');
const { authorize }      = require('../middleware/authorize');
const validate           = require('../middleware/validate');
const recordV            = require('../validators/record.validators');

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/v1/records
 * @desc  List with full filtering, pagination, sorting
 * @access viewer, analyst, admin
 */
router.get('/', authorize('records:read'), recordV.listRecords, validate, RecordController.list);

/**
 * @route POST /api/v1/records
 * @access analyst, admin
 */
router.post('/', authorize('records:create'), recordV.createRecord, validate, RecordController.create);

/**
 * @route GET /api/v1/records/:id
 * @access viewer, analyst, admin
 */
router.get('/:id', authorize('records:read'), recordV.recordId, validate, RecordController.getById);

/**
 * @route PUT /api/v1/records/:id
 * @access analyst, admin
 */
router.put('/:id', authorize('records:update'), recordV.updateRecord, validate, RecordController.update);

/**
 * @route DELETE /api/v1/records/:id
 * @desc  Soft delete
 * @access admin only
 */
router.delete('/:id', authorize('records:delete'), recordV.recordId, validate, RecordController.delete);

module.exports = router;
