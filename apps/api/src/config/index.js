const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
require('dotenv').config();

function sanitizeBrokerUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lowered = raw.toLowerCase();
  if (lowered.includes('your_broker_ip') || lowered.includes('example') || lowered.includes('localhost:0')) {
    return '';
  }

  return raw;
}

function sanitizeApiKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lowered = raw.toLowerCase();
  if (
    lowered.includes('change-this') ||
    lowered.includes('your-very-strong-secret') ||
    lowered.includes('replace-me')
  ) {
    return '';
  }

  return raw;
}

const appRoot = path.join(__dirname, '..', '..', '..', '..');
const defaultRedactKeys = ['authorization', 'x-api-key', 'token', 'idtoken', 'password', 'code'];

function parseRedactKeys(value) {
  if (!value) return defaultRedactKeys;

  const parsed = String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!parsed.length) {
    return defaultRedactKeys;
  }

  return Array.from(new Set([...defaultRedactKeys, ...parsed]));
}

const config = {
  app: {
    port: Number(process.env.PORT || 3000),
    webDistDir: path.join(__dirname, '..', '..', '..', 'web', 'dist')
  },
  observability: {
    logDir: path.join(appRoot, 'logs'),
    logFilePath: path.join(appRoot, 'logs', 'app.log'),
    requestLogsEnabled: process.env.REQUEST_LOGS_ENABLED !== 'false',
    logLevel: String(process.env.LOG_LEVEL || 'info').toLowerCase(),
    redactKeys: parseRedactKeys(process.env.REDACT_LOG_KEYS)
  },
  security: {
    rawApiKey: process.env.API_KEY || '',
    apiKey: sanitizeApiKey(process.env.API_KEY || ''),
    requireLogin: process.env.REQUIRE_LOGIN !== 'false',
    appUsername: process.env.APP_USERNAME || '',
    appPassword: process.env.APP_PASSWORD || '',
    authTokenSecret: process.env.AUTH_TOKEN_SECRET || 'change-me-auth-secret',
    authTokenTtlMs: 24 * 60 * 60 * 1000,
    verificationCodeTtlMs: 10 * 60 * 1000,
    exposeVerificationCode: process.env.EXPOSE_VERIFICATION_CODE === 'true',
    quickCodes: {
      admin: process.env.ADMIN_QUICK_CODE || '',
      developer: process.env.DEVELOPER_QUICK_CODE || '',
      operator: process.env.OPERATOR_QUICK_CODE || ''
    }
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@pillcount.local',
    sendTimeoutMs: Math.max(Number(process.env.SMTP_SEND_TIMEOUT_MS || 5000), 1000),
    sendMode: String(process.env.SMTP_SEND_MODE || 'async').trim().toLowerCase()
  },
  providers: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
    appleClientId: process.env.APPLE_CLIENT_ID || ''
  },
  mqtt: {
    offlineThresholdMs: 60 * 1000,
    brokerUrl: sanitizeBrokerUrl(process.env.MQTT_BROKER_URL || ''),
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    topicPrefix: process.env.MQTT_TOPIC_PREFIX || 'pillcount'
  }
};

config.security.legacyAuthEnabled = Boolean(config.security.appUsername && config.security.appPassword);
config.security.quickLoginEnabled = Boolean(
  config.security.quickCodes.admin ||
    config.security.quickCodes.developer ||
    config.security.quickCodes.operator
);

module.exports = {
  config
};
