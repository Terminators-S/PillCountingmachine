const crypto = require('crypto');

function createRequestContextMiddleware({
  logInfo,
  enabled = true
}) {
  return (req, res, next) => {
    const requestId = req.get('x-request-id') || crypto.randomUUID();
    const startedAt = Date.now();

    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    if (enabled) {
      res.on('finish', () => {
        logInfo('HTTP request completed', {
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt
        });
      });
    }

    next();
  };
}

module.exports = {
  createRequestContextMiddleware
};
