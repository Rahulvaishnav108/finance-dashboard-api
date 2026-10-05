'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Attach a unique X-Request-ID to every request/response.
 * Honour client-supplied IDs so distributed traces can propagate.
 */
function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = requestId;
