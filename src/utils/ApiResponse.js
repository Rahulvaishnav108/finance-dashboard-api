'use strict';

/**
 * Standardized API response format across all endpoints.
 * Every response follows: { success, data|error, meta?, pagination? }
 */

class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200, meta = {}) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(Object.keys(meta).length ? { meta } : {}),
    });
  }

  static created(res, data, message = 'Resource created successfully') {
    return ApiResponse.success(res, data, message, 201);
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page:        pagination.page,
        limit:       pagination.limit,
        total:       pagination.total,
        totalPages:  Math.ceil(pagination.total / pagination.limit),
        hasNext:     pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev:     pagination.page > 1,
      },
    });
  }

  static error(res, message, statusCode = 400, errors = null) {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
  }

  static notFound(res, resource = 'Resource') {
    return ApiResponse.error(res, `${resource} not found`, 404);
  }

  static unauthorized(res, message = 'Unauthorized') {
    return ApiResponse.error(res, message, 401);
  }

  static forbidden(res, message = 'Forbidden: insufficient permissions') {
    return ApiResponse.error(res, message, 403);
  }

  static conflict(res, message = 'Resource already exists') {
    return ApiResponse.error(res, message, 409);
  }

  static serverError(res, message = 'Internal server error') {
    return ApiResponse.error(res, message, 500);
  }

  static validationError(res, errors) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = ApiResponse;
