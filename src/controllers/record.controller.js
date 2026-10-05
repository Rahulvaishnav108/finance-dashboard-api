'use strict';

const RecordService = require('../services/record.service');
const ApiResponse   = require('../utils/ApiResponse');

const RecordController = {

  list(req, res, next) {
    try {
      const { type, category_id, date_from, date_to, amount_min, amount_max, search } = req.query;
      const { page, limit, sort_by, sort_dir } = req.query;

      const result = RecordService.list(
        { type, category_id, date_from, date_to, amount_min, amount_max, search },
        { page, limit, sort_by, sort_dir },
      );
      return ApiResponse.paginated(res, result.data, result.pagination);
    } catch (err) { next(err); }
  },

  getById(req, res, next) {
    try {
      const record = RecordService.getById(req.params.id);
      return ApiResponse.success(res, record);
    } catch (err) { next(err); }
  },

  create(req, res, next) {
    try {
      const record = RecordService.create(req.body, req.user.id, req);
      return ApiResponse.created(res, record, 'Financial record created successfully');
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const updated = RecordService.update(req.params.id, req.body, req.user.id, req);
      return ApiResponse.success(res, updated, 'Financial record updated successfully');
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      RecordService.delete(req.params.id, req.user.id, req);
      return ApiResponse.success(res, null, 'Financial record deleted successfully');
    } catch (err) { next(err); }
  },
};

module.exports = RecordController;
