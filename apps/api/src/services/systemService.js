function createSystemService({
  readRecentLogLines,
  clearLogFile,
  getHealthPayload,
  logInfo
}) {
  function getHealth() {
    return getHealthPayload();
  }

  function getRecentLogs(limit) {
    const entries = readRecentLogLines(limit);
    return {
      ok: true,
      count: entries.length,
      entries
    };
  }

  function clearLogs() {
    clearLogFile();
    logInfo('Log file cleared', { route: '/api/logs/clear' });
    return { ok: true };
  }

  return {
    getHealth,
    getRecentLogs,
    clearLogs
  };
}

module.exports = {
  createSystemService
};
