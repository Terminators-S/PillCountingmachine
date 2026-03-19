const path = require('path');
const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db');
const { config } = require('./config');
const { validateBody } = require('./middleware/validateBody');
const { createRequestContextMiddleware } = require('./middleware/requestContext');
const { createRequireAuth, createRequireApiKeyForWrite } = require('./middleware/authGuards');
const {
  validateCreatePillTypeBody,
  validateCreateRecordBody,
  validateCreateJobBody,
  validateFinishJobBody,
  validateIngestEventBody,
  validateRegisterMachineBody,
  validateHeartbeatBody
} = require('./validators/apiValidators');
const { createSystemService } = require('./services/systemService');
const { createOperationsService } = require('./services/operationsService');
const { createSystemController } = require('./controllers/systemController');
const { createSystemRoutes } = require('./routes/systemRoutes');
const { createAuthRoutes } = require('./routes/authRoutes');
const { createOperationsRoutes } = require('./routes/operationsRoutes');
const { createAuthService } = require('./services/authService');
const { createMqttService } = require('./services/mqttService');
const { createLogger } = require('./services/loggerService');

const PORT = config.app.port;
const WEB_DIST_DIR = config.app.webDistDir;
const OFFLINE_THRESHOLD_MS = config.mqtt.offlineThresholdMs;
const SAFE_MQTT_BROKER_URL = config.mqtt.brokerUrl;
const MQTT_USERNAME = config.mqtt.username;
const MQTT_PASSWORD = config.mqtt.password;
const MQTT_TOPIC_PREFIX = config.mqtt.topicPrefix;
const API_KEY = config.security.apiKey;
const APP_USERNAME = config.security.appUsername;
const APP_PASSWORD = config.security.appPassword;
const AUTH_TOKEN_SECRET = config.security.authTokenSecret;
const AUTH_TOKEN_TTL_MS = config.security.authTokenTtlMs;
const VERIFICATION_CODE_TTL_MS = config.security.verificationCodeTtlMs;
const REQUIRE_LOGIN = config.security.requireLogin;
const LEGACY_AUTH_ENABLED = config.security.legacyAuthEnabled;
const QUICK_LOGIN_ENABLED = config.security.quickLoginEnabled;

const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/quick-login',
  '/auth/google',
  '/auth/microsoft',
  '/auth/apple',
  '/auth/request-code',
  '/auth/verify-code',
  '/health'
];

const logger = createLogger({
  logDir: config.observability.logDir,
  logFilePath: config.observability.logFilePath,
  level: config.observability.logLevel,
  redactKeys: config.observability.redactKeys
});

const {
  logInfo,
  logWarn,
  logError,
  readRecentLogLines,
  clearLogFile
} = logger;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(createRequestContextMiddleware({
  logInfo,
  enabled: config.observability.requestLogsEnabled
}));
if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
}

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again shortly.' }
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests. Slow down and retry.' }
});

app.use('/api', readLimiter);

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait and retry.' }
});

const requestCodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification code requests. Please wait.' }
});

let db;
let appInitialized = false;
let mqttService;
let operationsService;

const authService = createAuthService({
  authTokenSecret: AUTH_TOKEN_SECRET,
  authTokenTtlMs: AUTH_TOKEN_TTL_MS,
  smtp: config.smtp,
  providers: config.providers,
  quickCodes: config.security.quickCodes,
  getDb: () => db,
  logInfo,
  logWarn
});

const {
  normalizeEmail,
  isValidEmail,
  isDeliverableEmail,
  hashCode,
  generateVerificationCode,
  timingSafeStringEqual,
  getQuickCodeByRole,
  sendVerificationCodeEmail,
  verifyGoogleIdToken,
  verifyMicrosoftIdToken,
  verifyAppleIdToken,
  upsertUserAccount,
  createAuthToken,
  verifyAuthToken
} = authService;

app.use('/api', createRequireAuth({
  requireLogin: REQUIRE_LOGIN,
  verifyAuthToken,
  logWarn,
  publicPaths: PUBLIC_AUTH_PATHS
}));

app.use('/api', createRequireApiKeyForWrite({
  apiKey: API_KEY,
  logWarn,
  publicPaths: PUBLIC_AUTH_PATHS
}), writeLimiter);

app.use('/api', createAuthRoutes({
  loginLimiter,
  requestCodeLimiter,
  LEGACY_AUTH_ENABLED,
  APP_USERNAME,
  APP_PASSWORD,
  createAuthToken,
  AUTH_TOKEN_TTL_MS,
  getQuickCodeByRole,
  timingSafeStringEqual,
  normalizeEmail,
  isValidEmail,
  isDeliverableEmail,
  upsertUserAccount,
  generateVerificationCode,
  hashCode,
  VERIFICATION_CODE_TTL_MS,
  EXPOSE_VERIFICATION_CODE: config.security.exposeVerificationCode,
  sendVerificationCodeEmail,
  verifyGoogleIdToken,
  verifyMicrosoftIdToken,
  verifyAppleIdToken,
  getDb: () => db
}));

function getMqttState() {
  if (!mqttService) {
    return {
      enabled: false,
      connected: false,
      brokerUrl: SAFE_MQTT_BROKER_URL || null,
      topicPrefix: MQTT_TOPIC_PREFIX,
      lastMessageAt: null,
      lastError: null
    };
  }

  return mqttService.getState();
}

function getHealthPayload() {
  const mqttState = getMqttState();
  return {
    ok: true,
    service: 'pillcount-api',
    now: Date.now(),
    observability: {
      logLevel: config.observability.logLevel,
      requestLogsEnabled: config.observability.requestLogsEnabled,
      redactionKeyCount: (config.observability.redactKeys || []).length
    },
    security: {
      authEnabled: REQUIRE_LOGIN,
      authMode: LEGACY_AUTH_ENABLED ? 'legacy+email-code' : 'email-code',
      googleAuthEnabled: Boolean(config.providers.googleClientId),
      googleClientId: config.providers.googleClientId || null,
      microsoftAuthEnabled: Boolean(config.providers.microsoftClientId),
      microsoftClientId: config.providers.microsoftClientId || null,
      appleAuthEnabled: Boolean(config.providers.appleClientId),
      appleClientId: config.providers.appleClientId || null,
      quickLoginEnabled: QUICK_LOGIN_ENABLED,
      quickLoginRoles: {
        admin: Boolean(config.security.quickCodes.admin),
        developer: Boolean(config.security.quickCodes.developer),
        operator: Boolean(config.security.quickCodes.operator)
      },
      smtpConfigured: Boolean(config.smtp.host && config.smtp.user && config.smtp.pass),
      apiKeyEnabled: Boolean(API_KEY),
      writeProtection: 'x-api-key header on write routes when API_KEY is set'
    },
    mqtt: {
      enabled: mqttState.enabled,
      connected: mqttState.connected,
      brokerUrl: mqttState.brokerUrl,
      topicPrefix: mqttState.topicPrefix,
      lastMessageAt: mqttState.lastMessageAt,
      lastError: mqttState.lastError
    }
  };
}

const systemService = createSystemService({
  readRecentLogLines,
  clearLogFile,
  getHealthPayload,
  logInfo
});

const systemController = createSystemController(systemService);
app.use('/api', createSystemRoutes(systemController));

app.use('/api', createOperationsRoutes({
  validateBody,
  validateCreatePillTypeBody,
  validateRegisterMachineBody,
  validateHeartbeatBody,
  validateCreateRecordBody,
  validateCreateJobBody,
  validateFinishJobBody,
  validateIngestEventBody,
  operationsService: {
    getPillTypes: (...args) => operationsService.getPillTypes(...args),
    createPillType: (...args) => operationsService.createPillType(...args),
    getMachines: (...args) => operationsService.getMachines(...args),
    registerMachine: (...args) => operationsService.registerMachine(...args),
    createHeartbeat: (...args) => operationsService.createHeartbeat(...args),
    createRecord: (...args) => operationsService.createRecord(...args),
    getRecords: (...args) => operationsService.getRecords(...args),
    getStats: (...args) => operationsService.getStats(...args),
    getEvents: (...args) => operationsService.getEvents(...args),
    getJobs: (...args) => operationsService.getJobs(...args),
    createJob: (...args) => operationsService.createJob(...args),
    startJob: (...args) => operationsService.startJob(...args),
    finishJob: (...args) => operationsService.finishJob(...args),
    getInventoryBalances: (...args) => operationsService.getInventoryBalances(...args),
    ingestEvent: (...args) => operationsService.ingestEvent(...args)
  },
  logError,
  logWarn
}));

if (fs.existsSync(WEB_DIST_DIR)) {
  app.get('*', (req, res, next) => {
    if (String(req.path || '').startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(WEB_DIST_DIR, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  logError('Unhandled API error', {
    error: err,
    requestId: _req.requestId,
    route: _req.path,
    method: _req.method
  });
  res.status(500).json({ error: 'internal server error' });
});

async function start() {
  await initializeApp();
  app.listen(PORT, () => {
    logInfo(`PillCount backend running on http://localhost:${PORT}`);
  });
}

async function initializeApp() {
  if (appInitialized) {
    return;
  }

  db = await initDb();
  logInfo('Database initialized', { logFile: config.observability.logFilePath });

  operationsService = createOperationsService({
    getDb: () => db,
    offlineThresholdMs: OFFLINE_THRESHOLD_MS
  });

  mqttService = createMqttService({
    brokerUrl: SAFE_MQTT_BROKER_URL,
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
    topicPrefix: MQTT_TOPIC_PREFIX,
    logInfo,
    logError,
    upsertMachine: operationsService.upsertMachine,
    logMachineEvent: operationsService.logMachineEvent,
    createRecord: operationsService.createRecord
  });
  mqttService.init();
  appInitialized = true;
}

if (require.main === module) {
  start().catch((error) => {
    logError('Failed to start app', { error });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logError('Unhandled promise rejection', { error: reason });
  });

  process.on('uncaughtException', (error) => {
    logError('Uncaught exception', { error });
    setTimeout(() => process.exit(1), 50);
  });
}

module.exports = {
  app,
  start,
  initializeApp
};
