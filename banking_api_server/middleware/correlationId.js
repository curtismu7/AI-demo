'use strict';

const { v4: uuidv4 } = require('uuid');

/**
 * Correlation ID middleware.
 * Reads X-Request-ID or X-Correlation-ID from the incoming request, or
 * generates a new UUID v4 if neither is present.  The ID is stored on
 * req.requestId and echoed back in the X-Request-ID response header so
 * clients and log aggregators can correlate request/response pairs end-to-end.
 */
function correlationIdMiddleware(req, res, next) {
  const id = req.headers['x-request-id'] || req.headers['x-correlation-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { correlationIdMiddleware };
