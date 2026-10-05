'use strict';

const CategoryService = require('../services/category.service');
const ApiResponse     = require('../utils/ApiResponse');

const CategoryController = {

  list(req, res, next) {
    try {
      return ApiResponse.success(res, CategoryService.list());
    } catch (err) { next(err); }
  },

  getById(req, res, next) {
    try {
      return ApiResponse.success(res, CategoryService.getById(req.params.id));
    } catch (err) { next(err); }
  },

  create(req, res, next) {
    try {
      const cat = CategoryService.create(req.body, req.user.id, req);
      return ApiResponse.created(res, cat, 'Category created successfully');
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const updated = CategoryService.update(req.params.id, req.body, req.user.id, req);
      return ApiResponse.success(res, updated, 'Category updated successfully');
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      CategoryService.delete(req.params.id, req.user.id, req);
      return ApiResponse.noContent(res);
    } catch (err) { next(err); }
  },
};

module.exports = CategoryController;
