'use strict';

const express              = require('express');
const CategoryController   = require('../controllers/category.controller');
const { authenticate }     = require('../middleware/auth');
const { authorize }        = require('../middleware/authorize');
const validate             = require('../middleware/validate');
const categoryV            = require('../validators/category.validators');

const router = express.Router();

router.use(authenticate);

/** @route GET /api/v1/categories  — all authenticated roles */
router.get('/', authorize('categories:read'), CategoryController.list);

/** @route POST /api/v1/categories — analyst, admin */
router.post('/', authorize('categories:create'), categoryV.createCategory, validate, CategoryController.create);

/** @route GET /api/v1/categories/:id */
router.get('/:id', authorize('categories:read'), categoryV.categoryId, validate, CategoryController.getById);

/** @route PUT /api/v1/categories/:id — admin only */
router.put('/:id', authorize('categories:update'), categoryV.updateCategory, validate, CategoryController.update);

/** @route DELETE /api/v1/categories/:id — admin only */
router.delete('/:id', authorize('categories:delete'), categoryV.categoryId, validate, CategoryController.delete);

module.exports = router;
