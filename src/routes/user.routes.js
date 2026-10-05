'use strict';

const express          = require('express');
const UserController   = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize, authorizeOwnerOrAdmin } = require('../middleware/authorize');
const validate         = require('../middleware/validate');
const userV            = require('../validators/user.validators');

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/users
 * @access Admin only
 */
router.get('/', authorize('users:read'), userV.listUsers, validate, UserController.list);

/**
 * @route POST /api/v1/users
 * @access Admin only
 */
router.post('/', authorize('users:create'), userV.createUser, validate, UserController.create);

/**
 * @route GET /api/v1/users/:id
 * @access Admin, or the user themselves
 */
router.get('/:id', authorizeOwnerOrAdmin('id'), UserController.getById);

/**
 * @route PUT /api/v1/users/:id
 * @access Admin only (role/status changes must be admin-only)
 */
router.put('/:id', authorize('users:update'), userV.updateUser, validate, UserController.update);

/**
 * @route DELETE /api/v1/users/:id
 * @access Admin only
 */
router.delete('/:id', authorize('users:delete'), UserController.delete);

module.exports = router;
