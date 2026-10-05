'use strict';

const { validationResult } = require('express-validator');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Run after express-validator chains.
 * Collects all errors and returns a 422 with structured detail.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array().map(e => ({
    field:   e.path || e.param,
    message: e.msg,
    value:   e.value !== undefined ? e.value : undefined,
  }));

  return ApiResponse.validationError(res, errors);
}

module.exports = validate;
