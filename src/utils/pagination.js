'use strict';

const config = require('../config');

/**
 * Parse and validate pagination query params
 */
function parsePagination(query) {
  const limit = Math.min(
    parseInt(query.limit, 10) || config.pagination.defaultLimit,
    config.pagination.maxLimit,
  );
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Parse sort parameters safely (whitelist-based)
 * @param {object} query
 * @param {string[]} allowedFields
 * @param {string} defaultField
 */
function parseSort(query, allowedFields, defaultField = 'created_at') {
  const sortBy  = allowedFields.includes(query.sort_by) ? query.sort_by : defaultField;
  const sortDir = query.sort_dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { sortBy, sortDir };
}

module.exports = { parsePagination, parseSort };
