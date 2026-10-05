'use strict';

const { body, param, query } = require('express-validator');

const createUser = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number'),
  body('full_name')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('role')
    .notEmpty().withMessage('Role is required')
    .isIn(['viewer', 'analyst', 'admin']).withMessage('Role must be viewer, analyst, or admin'),
];

const updateUser = [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('full_name')
    .optional()
    .trim().isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('role')
    .optional()
    .isIn(['viewer', 'analyst', 'admin']).withMessage('Invalid role'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
];

const updateStatus = [
  param('id').isUUID().withMessage('Invalid user ID'),
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['active', 'inactive', 'suspended']).withMessage('Status must be active, inactive, or suspended'),
];

const listUsers = [
  query('role').optional().isIn(['viewer', 'analyst', 'admin']).withMessage('Invalid role filter'),
  query('status').optional().isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status filter'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
];

module.exports = { createUser, updateUser, updateStatus, listUsers };
