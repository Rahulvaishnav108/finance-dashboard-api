'use strict';

const express               = require('express');
const DashboardController   = require('../controllers/dashboard.controller');
const { authenticate }      = require('../middleware/auth');
const { authorize }         = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate);

/**
 * @route GET /api/v1/dashboard/overview
 * @desc  All summary sections in a single call — ideal for initial page load
 * @access viewer, analyst, admin
 */
router.get('/overview',            authorize('dashboard:read'), DashboardController.overview);

/** @route GET /api/v1/dashboard/summary */
router.get('/summary',             authorize('dashboard:read'), DashboardController.summary);

/** @route GET /api/v1/dashboard/categories */
router.get('/categories',          authorize('dashboard:read'), DashboardController.categoryBreakdown);

/** @route GET /api/v1/dashboard/trends/monthly */
router.get('/trends/monthly',      authorize('dashboard:read'), DashboardController.monthlyTrends);

/** @route GET /api/v1/dashboard/trends/weekly */
router.get('/trends/weekly',       authorize('dashboard:read'), DashboardController.weeklyTrends);

/** @route GET /api/v1/dashboard/recent */
router.get('/recent',              authorize('dashboard:read'), DashboardController.recentActivity);

/**
 * @route GET /api/v1/dashboard/insights
 * @desc  Deeper analytics — savings rate, expense ratios, top categories
 * @access analyst, admin
 */
router.get('/insights',            authorize('analytics:read'), DashboardController.insights);

module.exports = router;
