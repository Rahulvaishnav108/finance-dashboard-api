'use strict';

const AuthService   = require('../services/auth.service');
const ApiResponse   = require('../utils/ApiResponse');
const { getPermissionsForRole } = require('../config/permissions');

const AuthController = {

  async register(req, res, next) {
    try {
      const user = await AuthService.register(req.body, req);
      return ApiResponse.created(res, user, 'User registered successfully');
    } catch (err) { next(err); }
  },

  async login(req, res, next) {
    try {
      const result = await AuthService.login(req.body, req);
      return ApiResponse.success(res, result, 'Login successful');
    } catch (err) { next(err); }
  },

  async refresh(req, res, next) {
    try {
      const result = await AuthService.refresh(req.body, req);
      return ApiResponse.success(res, result, 'Token refreshed');
    } catch (err) { next(err); }
  },

  async logout(req, res, next) {
    try {
      AuthService.logout(req.body, req.user.id, req);
      return ApiResponse.success(res, null, 'Logged out successfully');
    } catch (err) { next(err); }
  },

  async me(req, res) {
    return ApiResponse.success(res, {
      ...req.user,
      permissions: getPermissionsForRole(req.user.role),
    });
  },

  async changePassword(req, res, next) {
    try {
      await AuthService.changePassword(req.body, req.user.id, req);
      return ApiResponse.success(res, null, 'Password changed successfully');
    } catch (err) { next(err); }
  },
};

module.exports = AuthController;
