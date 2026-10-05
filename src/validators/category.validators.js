'use strict';

const { body, param } = require('express-validator');

const createCategory = [
  body('name')
    .trim().notEmpty().withMessage('Category name is required')
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
  body('type')
    .notEmpty().withMessage('Type is required')
    .isIn(['income', 'expense', 'both']).withMessage('Type must be income, expense, or both'),
  body('color')
    .optional({ nullable: true })
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex code e.g. #FF5733'),
  body('icon')
    .optional({ nullable: true })
    .trim().isLength({ max: 50 }).withMessage('Icon identifier max 50 characters'),
  body('description')
    .optional({ nullable: true })
    .trim().isLength({ max: 255 }).withMessage('Description max 255 characters'),
];

const updateCategory = [
  param('id').isUUID().withMessage('Invalid category ID'),
  body('name')
    .optional().trim()
    .isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
  body('type')
    .optional()
    .isIn(['income', 'expense', 'both']).withMessage('Type must be income, expense, or both'),
  body('color')
    .optional({ nullable: true })
    .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Color must be a valid hex code'),
  body('icon')
    .optional({ nullable: true })
    .trim().isLength({ max: 50 }).withMessage('Icon identifier max 50 characters'),
  body('description')
    .optional({ nullable: true })
    .trim().isLength({ max: 255 }).withMessage('Description max 255 characters'),
];

const categoryId = [
  param('id').isUUID().withMessage('Invalid category ID'),
];

module.exports = { createCategory, updateCategory, categoryId };
