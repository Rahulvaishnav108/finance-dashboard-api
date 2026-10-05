'use strict';

const UserService = require('../services/user.service');
const ApiResponse = require('../utils/ApiResponse');

const UserController = {

  list(req, res, next) {
    try {
      const { role, status, search, page, limit, sort_by, sort_dir } = req.query;
      const result = UserService.list({ role, status, search, page, limit, sort_by, sort_dir });
      return ApiResponse.paginated(res, result.data, result.pagination);
    } catch (err) { next(err); }
  },

  getById(req, res, next) {
    try {
      const user = UserService.getById(req.params.id);
      return ApiResponse.success(res, user);
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const user = await UserService.create(req.body, req.user.id, req);
      return ApiResponse.created(res, user, 'User created successfully');
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const updated = UserService.update(req.params.id, req.body, req.user.id, req);
      return ApiResponse.success(res, updated, 'User updated successfully');
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      UserService.delete(req.params.id, req.user.id, req);
      return ApiResponse.noContent(res);
    } catch (err) { next(err); }
  },
};

module.exports = UserController;
