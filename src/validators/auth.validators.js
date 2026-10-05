'use strict';

const { body } = require('express-validator');

const login = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Password is required'),
];

const register = [
  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('full_name')
    .trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be 2-100 characters'),
  body('role')
    .optional()
    .isIn(['viewer', 'analyst', 'admin']).withMessage('Role must be viewer, analyst, or admin'),
];

const changePassword = [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number')
    .custom((val, { req }) => {
      if (val === req.body.current_password) {
        throw new Error('New password must differ from current password');
      }
      return true;
    }),
];

const refreshToken = [
  body('refresh_token').notEmpty().withMessage('Refresh token is required'),
];

module.exports = { login, register, changePassword, refreshToken };
