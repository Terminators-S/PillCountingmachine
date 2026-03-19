function createSystemController(systemService) {
  return {
    getHealth: async (_req, res) => {
      return res.json(systemService.getHealth());
    },

    getRecentLogs: async (req, res) => {
      const limit = Number(req.query.limit || 100);
      return res.json(systemService.getRecentLogs(limit));
    },

    clearLogs: async (_req, res) => {
      return res.json(systemService.clearLogs());
    }
  };
}

module.exports = {
  createSystemController
};
