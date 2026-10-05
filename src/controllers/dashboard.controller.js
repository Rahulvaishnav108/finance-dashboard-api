'use strict';

const DashboardService = require('../services/dashboard.service');
const ApiResponse      = require('../utils/ApiResponse');

const DashboardController = {

  overview(req, res, next) {
    try {
      const { date_from, date_to } = req.query;
      return ApiResponse.success(res, DashboardService.getOverview({ date_from, date_to }));
    } catch (err) { next(err); }
  },

  summary(req, res, next) {
    try {
      const { date_from, date_to } = req.query;
      return ApiResponse.success(res, DashboardService.getSummary({ date_from, date_to }));
    } catch (err) { next(err); }
  },

  categoryBreakdown(req, res, next) {
    try {
      const { date_from, date_to, type } = req.query;
      return ApiResponse.success(res, DashboardService.getCategoryBreakdown({ date_from, date_to, type }));
    } catch (err) { next(err); }
  },

  monthlyTrends(req, res, next) {
    try {
      const { date_from, date_to, months } = req.query;
      return ApiResponse.success(res, DashboardService.getMonthlyTrends({ date_from, date_to, months: parseInt(months, 10) }));
    } catch (err) { next(err); }
  },

  weeklyTrends(req, res, next) {
    try {
      const { weeks } = req.query;
      return ApiResponse.success(res, DashboardService.getWeeklyTrends({ weeks: parseInt(weeks, 10) }));
    } catch (err) { next(err); }
  },

  recentActivity(req, res, next) {
    try {
      const { limit } = req.query;
      return ApiResponse.success(res, DashboardService.getRecentActivity({ limit }));
    } catch (err) { next(err); }
  },

  insights(req, res, next) {
    try {
      const { date_from, date_to } = req.query;
      return ApiResponse.success(res, DashboardService.getInsights({ date_from, date_to }));
    } catch (err) { next(err); }
  },
};

module.exports = DashboardController;
