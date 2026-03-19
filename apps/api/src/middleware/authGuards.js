function isPublicPath(pathname, publicPaths) {
  return publicPaths.includes(pathname);
}

function createRequireAuth({
  requireLogin,
  verifyAuthToken,
  logWarn,
  publicPaths
}) {
  return function requireAuth(req, res, next) {
    if (!requireLogin || isPublicPath(req.path, publicPaths)) {
      return next();
    }

    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const payload = verifyAuthToken(token);

    if (!payload) {
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase());
      if (isWrite) {
        logWarn('Unauthorized write API access attempt', {
          requestId: req.requestId,
          route: req.path,
          method: req.method,
          ip: req.ip
        });
      }
      return res.status(401).json({ error: 'Unauthorized: please login' });
    }

    req.user = payload;
    return next();
  };
}

function createRequireApiKeyForWrite({
  apiKey,
  logWarn,
  publicPaths
}) {
  return function requireApiKeyForWrite(req, res, next) {
    if (!apiKey || isPublicPath(req.path, publicPaths)) {
      return next();
    }

    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase());
    if (!isWrite) {
      return next();
    }

    if (req.user?.kind === 'quick' && req.user?.role === 'operator') {
      logWarn('Operator blocked from write operation', {
        requestId: req.requestId,
        route: req.path,
        method: req.method,
        role: req.user.role
      });
      return res.status(403).json({ error: 'Operator role is read-only' });
    }

    const incoming = req.get('x-api-key') || req.query.apiKey;
    if (!incoming || String(incoming) !== apiKey) {
      logWarn('Write rejected due to missing/invalid API key', {
        requestId: req.requestId,
        route: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({ error: 'Unauthorized: invalid API key' });
    }

    return next();
  };
}

module.exports = {
  createRequireAuth,
  createRequireApiKeyForWrite
};
