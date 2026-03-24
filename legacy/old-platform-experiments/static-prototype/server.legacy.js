require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const { createRemoteJWKSet, jwtVerify } = require('jose');
const { initDb } = require('./db');

const PORT = process.env.PORT || 3000;
const OFFLINE_THRESHOLD_MS = 60 * 1000;
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || '';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || 'pillcount';
const RAW_API_KEY = process.env.API_KEY || '';
const APP_USERNAME = process.env.APP_USERNAME || '';
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const ADMIN_QUICK_CODE = process.env.ADMIN_QUICK_CODE || '';
const DEVELOPER_QUICK_CODE = process.env.DEVELOPER_QUICK_CODE || '';
const OPERATOR_QUICK_CODE = process.env.OPERATOR_QUICK_CODE || '';
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'change-me-auth-secret';
const REQUIRE_LOGIN = process.env.REQUIRE_LOGIN !== 'false';
const LEGACY_AUTH_ENABLED = Boolean(APP_USERNAME && APP_PASSWORD);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@pillcount.local';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '';
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';
const QUICK_LOGIN_ENABLED = Boolean(ADMIN_QUICK_CODE || DEVELOPER_QUICK_CODE || OPERATOR_QUICK_CODE);

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE_PATH = path.join(LOG_DIR, 'app.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function normalizeLogMeta(meta) {
  if (!meta) return null;

  if (meta instanceof Error) {
    return {
      name: meta.name,
      message: meta.message,
      stack: meta.stack
    };
  }

  if (typeof meta === 'object') {
    const cloned = { ...meta };
    if (cloned.error instanceof Error) {
      cloned.error = {
        name: cloned.error.name,
        message: cloned.error.message,
        stack: cloned.error.stack
      };
    }
    return cloned;
  }

  return { value: String(meta) };
}

function writeLog(level, message, meta = null) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta: normalizeLogMeta(meta)
  };

  try {
    fs.appendFileSync(LOG_FILE_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch (error) {
    console.error('Failed to write log file:', error.message);
  }
}

function logInfo(message, meta) {
  writeLog('info', message, meta);
  console.log(message);
}

function logWarn(message, meta) {
  writeLog('warn', message, meta);
  console.warn(message);
}

function logError(message, meta) {
  writeLog('error', message, meta);
  console.error(message);
}

function readRecentLogLines(limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  if (!fs.existsSync(LOG_FILE_PATH)) {
    return [];
  }

  const fileText = fs.readFileSync(LOG_FILE_PATH, 'utf8');
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
  fs.writeFileSync(LOG_FILE_PATH, '', 'utf8');
}

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

const SAFE_MQTT_BROKER_URL = sanitizeBrokerUrl(MQTT_BROKER_URL);
const API_KEY = sanitizeApiKey(RAW_API_KEY);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const AUTH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

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

let smtpTransporter;
let googleClient;
const microsoftJwks = createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function timingSafeStringEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function getQuickCodeByRole(role) {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'admin') {
    return ADMIN_QUICK_CODE;
  }
  if (normalizedRole === 'developer') {
    return DEVELOPER_QUICK_CODE;
  }
  if (normalizedRole === 'operator') {
    return OPERATOR_QUICK_CODE;
  }
  return '';
}

function getSmtpTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  return smtpTransporter;
}

async function sendVerificationCodeEmail(email, code) {
  const transporter = getSmtpTransporter();
  const message = `Your PillCount verification code is ${code}. It expires in 10 minutes.`;

  if (!transporter) {
    console.log(`[DEV EMAIL] Send code ${code} to ${email}`);
    return { delivery: 'console' };
  }

  await transporter.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: 'Your PillCount verification code',
    text: message,
    html: `<p>${message}</p>`
  });

  return { delivery: 'email' };
}

function getGoogleClient() {
  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  if (!googleClient) {
    googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  }

  return googleClient;
}

async function verifyGoogleIdToken(idToken) {
  const client = getGoogleClient();
  if (!client) {
    throw makeError(400, 'Google sign-in is not configured');
  }

  const ticket = await client.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw makeError(401, 'Invalid Google token payload');
  }

  if (payload.email_verified !== true) {
    throw makeError(401, 'Google account email is not verified');
  }

  return {
    email: normalizeEmail(payload.email),
    displayName: payload.name ? String(payload.name).trim() : null
  };
}

async function verifyMicrosoftIdToken(idToken) {
  if (!MICROSOFT_CLIENT_ID) {
    throw makeError(400, 'Microsoft sign-in is not configured');
  }

  const { payload } = await jwtVerify(String(idToken), microsoftJwks, {
    audience: MICROSOFT_CLIENT_ID
  });

  const issuer = String(payload.iss || '');
  if (!issuer.startsWith('https://login.microsoftonline.com/')) {
    throw makeError(401, 'Invalid Microsoft token issuer');
  }

  const email = normalizeEmail(payload.preferred_username || payload.email || payload.upn || '');
  if (!isValidEmail(email)) {
    throw makeError(401, 'Microsoft account did not return a valid email');
  }

  return {
    email,
    displayName: payload.name ? String(payload.name).trim() : null
  };
}

async function verifyAppleIdToken(idToken) {
  if (!APPLE_CLIENT_ID) {
    throw makeError(400, 'Apple sign-in is not configured');
  }

  const { payload } = await jwtVerify(String(idToken), appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: APPLE_CLIENT_ID
  });

  let email = normalizeEmail(payload.email || '');
  if (!email && payload.sub) {
    email = `apple-${String(payload.sub)}@appleid.local`;
  }

  if (!email) {
    throw makeError(401, 'Apple account did not return a usable identity');
  }

  return {
    email,
    displayName: payload.email ? String(payload.email).split('@')[0] : 'Apple User'
  };
}

async function upsertUserAccount(email, displayName, markVerified = false) {
  const normalizedEmail = normalizeEmail(email);
  const safeDisplayName = displayName ? String(displayName).trim() : null;
  const now = Date.now();

  await db.run(
    `
      INSERT INTO users (email, display_name, email_verified, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        display_name=COALESCE(excluded.display_name, users.display_name),
        email_verified=CASE
          WHEN excluded.email_verified = 1 THEN 1
          ELSE users.email_verified
        END,
        updated_at=excluded.updated_at
    `,
    normalizedEmail,
    safeDisplayName,
    markVerified ? 1 : 0,
    now,
    now
  );

  return db.get(`SELECT * FROM users WHERE email = ?`, normalizedEmail);
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(input) {
  return crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(input).digest('base64url');
}

function createAuthToken(data) {
  const payload = {
    ...data,
    iat: Date.now(),
    exp: Date.now() + AUTH_TOKEN_TTL_MS
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || !String(token).includes('.')) {
    return null;
  }

  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload.exp || Number(payload.exp) < Date.now()) {
      return null;
    }
    return payload;
  } catch (_error) {
    return null;
  }
}

function requireAuth(req, res, next) {
  if (!REQUIRE_LOGIN) {
    return next();
  }

  if (
    req.path === '/auth/login' ||
    req.path === '/auth/quick-login' ||
    req.path === '/auth/google' ||
    req.path === '/auth/microsoft' ||
    req.path === '/auth/apple' ||
    req.path === '/auth/request-code' ||
    req.path === '/auth/verify-code' ||
    req.path === '/health'
  ) {
    return next();
  }

  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = verifyAuthToken(token);

  if (!payload) {
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase());
    if (isWrite) {
      logWarn('Unauthorized write API access attempt', {
        route: req.path,
        method: req.method,
        ip: req.ip
      });
    }
    return res.status(401).json({ error: 'Unauthorized: please login' });
  }

  req.user = payload;
  return next();
}

app.use('/api', requireAuth);

function requireApiKeyForWrite(req, res, next) {
  if (!API_KEY) {
    return next();
  }

  if (
    req.path === '/auth/login' ||
    req.path === '/auth/quick-login' ||
    req.path === '/auth/google' ||
    req.path === '/auth/microsoft' ||
    req.path === '/auth/apple' ||
    req.path === '/auth/request-code' ||
    req.path === '/auth/verify-code' ||
    req.path === '/health'
  ) {
    return next();
  }

  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase());
  if (!isWrite) {
    return next();
  }

  if (req.user?.kind === 'quick' && req.user?.role === 'operator') {
    logWarn('Operator blocked from write operation', {
      route: req.path,
      method: req.method,
      role: req.user.role
    });
    return res.status(403).json({ error: 'Operator role is read-only' });
  }

  const incoming = req.get('x-api-key') || req.query.apiKey;
  if (!incoming || String(incoming) !== API_KEY) {
    logWarn('Write rejected due to missing/invalid API key', {
      route: req.path,
      method: req.method,
      ip: req.ip
    });
    return res.status(401).json({ error: 'Unauthorized: invalid API key' });
  }

  return next();
}

app.use('/api', requireApiKeyForWrite, writeLimiter);

app.post('/api/auth/login', loginLimiter, (req, res) => {
  if (!LEGACY_AUTH_ENABLED) {
    return res.json({ ok: true, authEnabled: false });
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  if (String(username) !== APP_USERNAME || String(password) !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = createAuthToken({
    kind: 'legacy',
    username: String(username)
  });
  return res.json({ ok: true, authEnabled: true, token, expiresInMs: AUTH_TOKEN_TTL_MS });
});

app.post('/api/auth/quick-login', loginLimiter, async (req, res) => {
  const { role, code } = req.body || {};
  const normalizedRole = String(role || '').trim().toLowerCase();

  if (!normalizedRole || !code) {
    return res.status(400).json({ error: 'role and code are required' });
  }

  if (normalizedRole !== 'admin' && normalizedRole !== 'developer' && normalizedRole !== 'operator') {
    return res.status(400).json({ error: 'role must be admin, developer, or operator' });
  }

  const expectedCode = getQuickCodeByRole(normalizedRole);
  if (!expectedCode) {
    return res.status(403).json({ error: `Quick login code for ${normalizedRole} is not configured` });
  }

  if (!timingSafeStringEqual(code, expectedCode)) {
    return res.status(401).json({ error: 'Invalid quick login code' });
  }

  const token = createAuthToken({
    kind: 'quick',
    role: normalizedRole,
    email: `${normalizedRole}@quick-login.local`
  });

  return res.json({
    ok: true,
    token,
    expiresInMs: AUTH_TOKEN_TTL_MS,
    user: {
      role: normalizedRole,
      quickLogin: true
    }
  });
});

app.post('/api/auth/request-code', requestCodeLimiter, async (req, res) => {
  const { email, displayName } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  const now = Date.now();
  const user = await upsertUserAccount(normalizedEmail, displayName, false);
  const code = generateVerificationCode();

  await db.run(
    `
      INSERT INTO email_verification_codes (user_id, code_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `,
    user.id,
    hashCode(code),
    now + VERIFICATION_CODE_TTL_MS,
    now
  );

  const sent = await sendVerificationCodeEmail(normalizedEmail, code);
  return res.json({
    ok: true,
    delivery: sent.delivery,
    expiresInMs: VERIFICATION_CODE_TTL_MS,
    devCode: sent.delivery === 'console' && process.env.NODE_ENV !== 'production' ? code : undefined
  });
});

app.post('/api/auth/google', loginLimiter, async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const googleProfile = await verifyGoogleIdToken(String(idToken));
    const user = await upsertUserAccount(googleProfile.email, googleProfile.displayName, true);
    const now = Date.now();

    await db.run(
      `
        UPDATE users
        SET email_verified = 1,
            updated_at = ?,
            last_login_at = ?
        WHERE id = ?
      `,
      now,
      now,
      user.id
    );

    const token = createAuthToken({
      kind: 'user',
      userId: user.id,
      email: user.email
    });

    return res.json({
      ok: true,
      token,
      expiresInMs: AUTH_TOKEN_TTL_MS,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        emailVerified: true
      }
    });
  } catch (error) {
    return res.status(error.status || 401).json({ error: error.message || 'Google sign-in failed' });
  }
});

app.post('/api/auth/microsoft', loginLimiter, async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const profile = await verifyMicrosoftIdToken(String(idToken));
    const user = await upsertUserAccount(profile.email, profile.displayName, true);
    const now = Date.now();

    await db.run(
      `UPDATE users SET email_verified = 1, updated_at = ?, last_login_at = ? WHERE id = ?`,
      now,
      now,
      user.id
    );

    const token = createAuthToken({
      kind: 'user',
      userId: user.id,
      email: user.email
    });

    return res.json({
      ok: true,
      token,
      expiresInMs: AUTH_TOKEN_TTL_MS,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        emailVerified: true
      }
    });
  } catch (error) {
    return res.status(error.status || 401).json({ error: error.message || 'Microsoft sign-in failed' });
  }
});

app.post('/api/auth/apple', loginLimiter, async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const profile = await verifyAppleIdToken(String(idToken));
    const user = await upsertUserAccount(profile.email, profile.displayName, true);
    const now = Date.now();

    await db.run(
      `UPDATE users SET email_verified = 1, updated_at = ?, last_login_at = ? WHERE id = ?`,
      now,
      now,
      user.id
    );

    const token = createAuthToken({
      kind: 'user',
      userId: user.id,
      email: user.email
    });

    return res.json({
      ok: true,
      token,
      expiresInMs: AUTH_TOKEN_TTL_MS,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        emailVerified: true
      }
    });
  } catch (error) {
    return res.status(error.status || 401).json({ error: error.message || 'Apple sign-in failed' });
  }
});

app.post('/api/auth/verify-code', loginLimiter, async (req, res) => {
  const { email, code } = req.body || {};
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail) || !code) {
    return res.status(400).json({ error: 'email and code are required' });
  }

  const user = await db.get(`SELECT * FROM users WHERE email = ?`, normalizedEmail);
  if (!user) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const now = Date.now();
  const activeCode = await db.get(
    `
      SELECT *
      FROM email_verification_codes
      WHERE user_id = ?
        AND consumed_at IS NULL
        AND expires_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    user.id,
    now
  );

  if (!activeCode || activeCode.code_hash !== hashCode(code)) {
    return res.status(401).json({ error: 'Invalid or expired verification code' });
  }

  await db.run(`UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?`, now, activeCode.id);
  await db.run(
    `
      UPDATE users
      SET email_verified = 1,
          updated_at = ?,
          last_login_at = ?
      WHERE id = ?
    `,
    now,
    now,
    user.id
  );

  const token = createAuthToken({
    kind: 'user',
    userId: user.id,
    email: user.email
  });

  return res.json({
    ok: true,
    token,
    expiresInMs: AUTH_TOKEN_TTL_MS,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      emailVerified: true
    }
  });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.kind === 'user') {
    const account = await db.get(
      `SELECT id, email, display_name AS displayName, email_verified AS emailVerified FROM users WHERE id = ?`,
      req.user.userId
    );
    if (!account) {
      return res.status(401).json({ error: 'User not found' });
    }
    return res.json({ ok: true, kind: 'user', user: account });
  }

  if (req.user.kind === 'quick') {
    return res.json({
      ok: true,
      kind: 'quick',
      user: {
        role: req.user.role || 'unknown',
        quickLogin: true
      }
    });
  }

  return res.json({ ok: true, kind: req.user.kind || 'legacy', user: { username: req.user.username || null } });
});

let db;
const mqttState = {
  enabled: false,
  connected: false,
  brokerUrl: SAFE_MQTT_BROKER_URL || null,
  topicPrefix: MQTT_TOPIC_PREFIX,
  lastMessageAt: null,
  lastError: null
};

function machineStatusFromLastSeen(lastSeen) {
  if (!lastSeen) return 'offline';
  return Date.now() - Number(lastSeen) <= OFFLINE_THRESHOLD_MS ? 'online' : 'offline';
}

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function upsertMachine(machineId, options = {}) {
  const now = options.lastSeen ?? Date.now();
  await db.run(
    `
    INSERT INTO machines (machine_id, location, status, firmware_version, last_seen)
    VALUES (?, ?, 'online', ?, ?)
    ON CONFLICT(machine_id) DO UPDATE SET
      location=COALESCE(excluded.location, machines.location),
      firmware_version=COALESCE(excluded.firmware_version, machines.firmware_version),
      last_seen=excluded.last_seen,
      status='online'
    `,
    machineId,
    options.location ?? null,
    options.firmwareVersion ?? null,
    now
  );
  return now;
}

async function logMachineEvent(machineId, eventType, payload, timestamp = Date.now()) {
  await db.run(
    `INSERT INTO machine_events (machine_id, event_type, payload, timestamp)
     VALUES (?, ?, ?, ?)`,
    machineId,
    eventType,
    payload ? JSON.stringify(payload) : null,
    timestamp
  );
}

async function createRecord(input) {
  const normalizedMachineId = String(input.machineId || '').trim();
  const normalizedPillCode = String(input.pillTypeCode || '').trim().toUpperCase();

  if (!normalizedMachineId || !normalizedPillCode || input.quantity === undefined) {
    throw makeError(400, 'machineId, pillTypeCode, and quantity are required');
  }

  const qty = toNumber(input.quantity, NaN);
  if (!Number.isInteger(qty) || qty < 0) {
    throw makeError(400, 'quantity must be a non-negative integer');
  }

  const pillType = await db.get(`SELECT code FROM pill_types WHERE code = ?`, normalizedPillCode);
  if (!pillType) {
    throw makeError(404, 'pill type not found. create it first.');
  }

  const now = Date.now();
  await upsertMachine(normalizedMachineId, { lastSeen: now });

  const result = await db.run(
    `
    INSERT INTO pill_records (
      machine_id,
      pill_type_code,
      quantity,
      count_mode,
      confidence,
      status,
      timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    normalizedMachineId,
    normalizedPillCode,
    qty,
    input.countMode ? String(input.countMode).trim() : 'auto',
    toNumber(input.confidence),
    input.status ? String(input.status).trim().toLowerCase() : 'normal',
    toNumber(input.timestamp, now)
  );

  return result.lastID;
}

function initMqttIngestion() {
  if (!SAFE_MQTT_BROKER_URL) {
    logInfo('MQTT disabled: set MQTT_BROKER_URL to enable device ingestion.');
    return;
  }

  mqttState.enabled = true;
  mqttState.brokerUrl = SAFE_MQTT_BROKER_URL;
  const client = mqtt.connect(SAFE_MQTT_BROKER_URL, {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 3000
  });

  client.on('connect', () => {
    mqttState.connected = true;
    mqttState.lastError = null;

    const topics = [
      `${MQTT_TOPIC_PREFIX}/+/heartbeat`,
      `${MQTT_TOPIC_PREFIX}/+/record`,
      `${MQTT_TOPIC_PREFIX}/+/register`
    ];

    client.subscribe(topics, (error) => {
      if (error) {
        mqttState.lastError = error.message;
        logError('MQTT subscribe error', { error: error.message });
      } else {
        logInfo(`MQTT connected and subscribed: ${topics.join(', ')}`);
      }
    });
  });

  client.on('reconnect', () => {
    mqttState.connected = false;
  });

  client.on('error', (error) => {
    mqttState.lastError = error.message;
    logError('MQTT error', { error: error.message });
  });

  client.on('close', () => {
    mqttState.connected = false;
  });

  client.on('message', async (topic, buffer) => {
    mqttState.lastMessageAt = Date.now();

    try {
      const payload = buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
      const parts = String(topic).split('/');
      if (parts.length < 3 || parts[0] !== MQTT_TOPIC_PREFIX) {
        return;
      }

      const machineId = String(parts[1] || '').trim() || String(payload.machineId || '').trim();
      const messageType = parts[2];
      if (!machineId) {
        return;
      }

      if (messageType === 'register') {
        const now = await upsertMachine(machineId, {
          location: payload.location ? String(payload.location).trim() : null,
          firmwareVersion: payload.firmwareVersion ? String(payload.firmwareVersion).trim() : null,
          lastSeen: Date.now()
        });
        await logMachineEvent(machineId, 'register', payload, now);
        return;
      }

      if (messageType === 'heartbeat') {
        const now = await upsertMachine(machineId, {
          location: payload.location ? String(payload.location).trim() : null,
          firmwareVersion: payload.firmwareVersion ? String(payload.firmwareVersion).trim() : null,
          lastSeen: Date.now()
        });
        await logMachineEvent(machineId, 'heartbeat', payload, now);
        return;
      }

      if (messageType === 'record') {
        await createRecord({
          machineId,
          pillTypeCode: payload.pillTypeCode,
          quantity: payload.quantity,
          countMode: payload.countMode,
          confidence: payload.confidence,
          status: payload.status,
          timestamp: payload.timestamp
        });
      }
    } catch (error) {
      mqttState.lastError = error.message;
      logError(`MQTT message handling failed for topic ${topic}`, { error: error.message });
    }
  });
}

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'pillcount-api',
    now: Date.now(),
    security: {
      authEnabled: REQUIRE_LOGIN,
      authMode: LEGACY_AUTH_ENABLED ? 'legacy+email-code' : 'email-code',
      googleAuthEnabled: Boolean(GOOGLE_CLIENT_ID),
      googleClientId: GOOGLE_CLIENT_ID || null,
      microsoftAuthEnabled: Boolean(MICROSOFT_CLIENT_ID),
      microsoftClientId: MICROSOFT_CLIENT_ID || null,
      appleAuthEnabled: Boolean(APPLE_CLIENT_ID),
      appleClientId: APPLE_CLIENT_ID || null,
      quickLoginEnabled: QUICK_LOGIN_ENABLED,
      quickLoginRoles: {
        admin: Boolean(ADMIN_QUICK_CODE),
        developer: Boolean(DEVELOPER_QUICK_CODE),
        operator: Boolean(OPERATOR_QUICK_CODE)
      },
      smtpConfigured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS),
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
  });
});

app.get('/api/logs/recent', async (req, res) => {
  const limit = Math.min(Math.max(toNumber(req.query.limit, 100), 1), 1000);
  const entries = readRecentLogLines(limit);
  res.json({ ok: true, count: entries.length, entries });
});

app.post('/api/logs/clear', async (_req, res) => {
  clearLogFile();
  logInfo('Log file cleared', { route: '/api/logs/clear' });
  res.json({ ok: true });
});

app.get('/api/pill-types', async (_req, res) => {
  const rows = await db.all(`SELECT * FROM pill_types ORDER BY name ASC`);
  res.json(rows);
});

app.post('/api/pill-types', async (req, res) => {
  const { code, name, dosageMg, manufacturer } = req.body || {};

  if (!code || !name) {
    return res.status(400).json({ error: 'code and name are required' });
  }

  try {
    await db.run(
      `INSERT INTO pill_types (code, name, dosage_mg, manufacturer) VALUES (?, ?, ?, ?)`,
      String(code).trim().toUpperCase(),
      String(name).trim(),
      toNumber(dosageMg),
      manufacturer ? String(manufacturer).trim() : null
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'pill type code already exists' });
    }
    logError('Failed to create pill type', { error, route: req.path });
    return res.status(500).json({ error: 'failed to create pill type' });
  }
});

app.get('/api/machines', async (_req, res) => {
  const rows = await db.all(`SELECT * FROM machines ORDER BY machine_id ASC`);
  const withComputedStatus = rows.map((item) => ({
    ...item,
    status: machineStatusFromLastSeen(item.last_seen)
  }));

  res.json(withComputedStatus);
});

app.post('/api/machines/register', async (req, res) => {
  const { machineId, location, firmwareVersion } = req.body || {};

  if (!machineId) {
    return res.status(400).json({ error: 'machineId is required' });
  }

  const normalizedMachineId = String(machineId).trim();
  const now = await upsertMachine(normalizedMachineId, {
    location: location ? String(location).trim() : null,
    firmwareVersion: firmwareVersion ? String(firmwareVersion).trim() : null,
    lastSeen: Date.now()
  });

  await logMachineEvent(
    normalizedMachineId,
    'register',
    { location: location || null, firmwareVersion: firmwareVersion || null },
    now
  );

  res.status(201).json({ ok: true, machineId: normalizedMachineId, lastSeen: now });
});

app.post('/api/iot/heartbeat', async (req, res) => {
  const { machineId, payload } = req.body || {};
  if (!machineId) {
    return res.status(400).json({ error: 'machineId is required' });
  }

  const normalizedMachineId = String(machineId).trim();
  const now = await upsertMachine(normalizedMachineId, { lastSeen: Date.now() });
  await logMachineEvent(normalizedMachineId, 'heartbeat', payload || null, now);

  res.json({ ok: true, machineId: normalizedMachineId, lastSeen: now });
});

app.post('/api/records', async (req, res) => {
  try {
    const id = await createRecord(req.body || {});
    return res.status(201).json({ ok: true, id });
  } catch (error) {
    if ((error.status || 500) >= 500) {
      logError('Failed to create record', { error, route: req.path });
    } else {
      logWarn('Record rejected', { error: error.message, route: req.path });
    }
    return res.status(error.status || 500).json({ error: error.message || 'failed to create record' });
  }
});

app.get('/api/records', async (req, res) => {
  const limit = Math.min(Math.max(toNumber(req.query.limit, 50), 1), 500);

  const rows = await db.all(
    `
    SELECT
      pr.id,
      pr.machine_id AS machineId,
      pr.pill_type_code AS pillTypeCode,
      pt.name AS pillName,
      pt.dosage_mg AS dosageMg,
      pr.quantity,
      pr.count_mode AS countMode,
      pr.confidence,
      pr.status,
      pr.timestamp
    FROM pill_records pr
    LEFT JOIN pill_types pt ON pt.code = pr.pill_type_code
    ORDER BY pr.timestamp DESC
    LIMIT ?
    `,
    limit
  );

  res.json(rows);
});

app.get('/api/stats', async (_req, res) => {
  const totalPills = await db.get(`SELECT COALESCE(SUM(quantity), 0) AS value FROM pill_records`);
  const totalRecords = await db.get(`SELECT COUNT(*) AS value FROM pill_records`);
  const totalTypes = await db.get(`SELECT COUNT(*) AS value FROM pill_types`);
  const machineRows = await db.all(`SELECT machine_id, last_seen FROM machines`);

  const machinesOnline = machineRows.filter((m) => machineStatusFromLastSeen(m.last_seen) === 'online').length;

  res.json({
    totalPills: totalPills.value,
    totalRecords: totalRecords.value,
    totalTypes: totalTypes.value,
    machinesOnline,
    machinesTotal: machineRows.length,
    updatedAt: Date.now()
  });
});

app.get('/api/events', async (req, res) => {
  const limit = Math.min(Math.max(toNumber(req.query.limit, 30), 1), 200);
  const rows = await db.all(
    `
    SELECT id, machine_id AS machineId, event_type AS eventType, payload, timestamp
    FROM machine_events
    ORDER BY timestamp DESC
    LIMIT ?
    `,
    limit
  );

  const parsed = rows.map((row) => ({
    ...row,
    payload: row.payload ? JSON.parse(row.payload) : null
  }));

  res.json(parsed);
});

app.use((err, _req, res, _next) => {
  logError('Unhandled API error', { error: err, route: _req.path, method: _req.method });
  res.status(500).json({ error: 'internal server error' });
});

async function start() {
  db = await initDb();
  logInfo('Database initialized', { logFile: LOG_FILE_PATH });
  initMqttIngestion();
  app.listen(PORT, () => {
    logInfo(`PillCount backend running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  logError('Failed to start app', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError('Unhandled promise rejection', { error: reason });
});

process.on('uncaughtException', (error) => {
  logError('Uncaught exception', { error });
});
