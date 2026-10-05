'use strict';

const { body, param, query } = require('express-validator');

const createRecord = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ gt: 0 }).withMessage('Amount must be a positive number')
    .toFloat(),
  body('type')
    .notEmpty().withMessage('Type is required')
    .isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('category_id')
    .optional({ nullable: true })
    .isUUID().withMessage('Category ID must be a valid UUID'),
  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601({ strict: true }).withMessage('Date must be a valid ISO 8601 date (YYYY-MM-DD)')
    .custom(val => {
      if (new Date(val) > new Date()) throw new Error('Date cannot be in the future');
      return true;
    }),
  body('description')
    .optional({ nullable: true })
    .trim().isLength({ max: 255 }).withMessage('Description max 255 characters'),
  body('notes')
    .optional({ nullable: true })
    .trim().isLength({ max: 2000 }).withMessage('Notes max 2000 characters'),
  body('tags')
    .optional({ nullable: true })
    .isArray().withMessage('Tags must be an array')
    .custom(tags => {
      if (tags && tags.some(t => typeof t !== 'string' || t.length > 50)) {
        throw new Error('Each tag must be a string under 50 characters');
      }
      return true;
    }),
  body('reference_no')
    .optional({ nullable: true })
    .trim().isLength({ max: 100 }).withMessage('Reference number max 100 characters'),
];

const updateRecord = [
  param('id').isUUID().withMessage('Invalid record ID'),
  body('amount')
    .optional()
    .isFloat({ gt: 0 }).withMessage('Amount must be a positive number')
    .toFloat(),
  body('type')
    .optional()
    .isIn(['income', 'expense']).withMessage('Type must be income or expense'),
  body('category_id')
    .optional({ nullable: true })
    .isUUID().withMessage('Category ID must be a valid UUID'),
  body('date')
    .optional()
    .isISO8601({ strict: true }).withMessage('Date must be a valid ISO 8601 date (YYYY-MM-DD)')
    .custom(val => {
      if (new Date(val) > new Date()) throw new Error('Date cannot be in the future');
      return true;
    }),
  body('description')
    .optional({ nullable: true })
    .trim().isLength({ max: 255 }).withMessage('Description max 255 characters'),
  body('notes')
    .optional({ nullable: true })
    .trim().isLength({ max: 2000 }).withMessage('Notes max 2000 characters'),
  body('tags')
    .optional({ nullable: true })
    .isArray().withMessage('Tags must be an array'),
  body('reference_no')
    .optional({ nullable: true })
    .trim().isLength({ max: 100 }).withMessage('Reference number max 100 characters'),
];

const listRecords = [
  query('type').optional().isIn(['income', 'expense']).withMessage('Invalid type filter'),
  query('category_id').optional().isUUID().withMessage('Invalid category ID'),
  query('date_from').optional().isISO8601({ strict: true }).withMessage('date_from must be YYYY-MM-DD'),
  query('date_to').optional().isISO8601({ strict: true }).withMessage('date_to must be YYYY-MM-DD')
    .custom((val, { req }) => {
      if (req.query.date_from && val < req.query.date_from) {
        throw new Error('date_to must be after date_from');
      }
      return true;
    }),
  query('amount_min').optional().isFloat({ gt: 0 }).withMessage('amount_min must be positive').toFloat(),
  query('amount_max').optional().isFloat({ gt: 0 }).withMessage('amount_max must be positive').toFloat(),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('Search query max 100 chars'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('sort_by').optional()
    .isIn(['amount', 'date', 'created_at', 'type']).withMessage('Invalid sort field'),
  query('sort_dir').optional().isIn(['asc', 'desc', 'ASC', 'DESC']).withMessage('Sort dir must be asc or desc'),
];

const recordId = [
  param('id').isUUID().withMessage('Invalid record ID'),
];

module.exports = { createRecord, updateRecord, listRecords, recordId };
