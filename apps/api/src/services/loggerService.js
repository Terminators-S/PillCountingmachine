const fs = require('fs');

function createLogger({ logDir, logFilePath, level = 'info', redactKeys = [] }) {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  const configuredLevel = Object.prototype.hasOwnProperty.call(levels, level) ? level : 'info';
  const redactSet = new Set((redactKeys || []).map((key) => String(key || '').toLowerCase()));

  function shouldLog(entryLevel) {
    const normalizedEntry = Object.prototype.hasOwnProperty.call(levels, entryLevel) ? entryLevel : 'info';
    return levels[normalizedEntry] <= levels[configuredLevel];
  }

  function redactValue(input) {
    if (input instanceof Error) {
      return {
        name: input.name,
        message: input.message,
        stack: input.stack
      };
    }

    if (Array.isArray(input)) {
      return input.map((item) => redactValue(item));
    }

    if (input && typeof input === 'object') {
      const output = {};
      for (const [key, value] of Object.entries(input)) {
        const lowered = String(key || '').toLowerCase();
        if (redactSet.has(lowered)) {
          output[key] = '[REDACTED]';
        } else {
          output[key] = redactValue(value);
        }
      }
      return output;
    }

    return input;
  }

  function normalizeMeta(meta) {
    if (!meta) return null;

    if (meta instanceof Error) {
      return {
        name: meta.name,
        message: meta.message,
        stack: meta.stack
      };
    }

    if (typeof meta === 'object') {
      return redactValue(meta);
    }

    return { value: String(meta) };
  }

  function writeLog(level, message, meta = null) {
    if (!shouldLog(level)) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: normalizeMeta(meta)
    };

    try {
      fs.appendFileSync(logFilePath, `${JSON.stringify(payload)}\n`, 'utf8');
    } catch (error) {
      safeConsole('error', ['Failed to write log file:', error.message]);
    }
  }

  function safeConsole(method, args) {
    try {
      if (method === 'warn') {
        console.warn(...args);
      } else if (method === 'error') {
        console.error(...args);
      } else {
        console.log(...args);
      }
    } catch (error) {
      // Ignore console stream write failures (e.g. EPIPE) to avoid recursive crashes.
    }
  }

  function logInfo(message, meta) {
    if (!shouldLog('info')) {
      return;
    }
    writeLog('info', message, meta);
    safeConsole('info', [message]);
  }

  function logWarn(message, meta) {
    if (!shouldLog('warn')) {
      return;
    }
    writeLog('warn', message, meta);
    safeConsole('warn', [message]);
  }

  function logError(message, meta) {
    if (!shouldLog('error')) {
      return;
    }
    writeLog('error', message, meta);
    safeConsole('error', [message]);
  }

  function readRecentLogLines(limit = 100) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    if (!fs.existsSync(logFilePath)) {
      return [];
    }

    const fileText = fs.readFileSync(logFilePath, 'utf8');
    const lines = fileText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.slice(-safeLimit).map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return {
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: 'Unreadable log line',
          meta: { raw: line }
        };
      }
    });
  }

  function clearLogFile() {
    fs.writeFileSync(logFilePath, '', 'utf8');
  }

  return {
    logInfo,
    logWarn,
    logError,
    readRecentLogLines,
    clearLogFile
  };
}

module.exports = {
  createLogger
};
