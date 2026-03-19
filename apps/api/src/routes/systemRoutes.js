const { Router } = require('express');

function createSystemRoutes(controller) {
  const router = Router();

  router.get('/health', controller.getHealth);
  router.get('/logs/recent', controller.getRecentLogs);
  router.post('/logs/clear', controller.clearLogs);

  return router;
}

module.exports = {
  createSystemRoutes
};
