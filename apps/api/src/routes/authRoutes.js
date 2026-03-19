const { Router } = require('express');

function createAuthRoutes(deps) {
  const {
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
    EXPOSE_VERIFICATION_CODE,
    sendVerificationCodeEmail,
    verifyGoogleIdToken,
    verifyMicrosoftIdToken,
    verifyAppleIdToken,
    getDb
  } = deps;

  const router = Router();

  router.post('/auth/login', loginLimiter, (req, res) => {
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

    const token = createAuthToken({ kind: 'legacy', username: String(username) });
    return res.json({ ok: true, authEnabled: true, token, expiresInMs: AUTH_TOKEN_TTL_MS });
  });

  router.post('/auth/quick-login', loginLimiter, async (req, res) => {
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
      user: { role: normalizedRole, quickLogin: true }
    });
  });

  router.post('/auth/request-code', requestCodeLimiter, async (req, res) => {
    const { email, displayName } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!isDeliverableEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Use a real inbox email address (placeholder/test domains are not allowed)' });
    }

    const now = Date.now();
    const user = await upsertUserAccount(normalizedEmail, displayName, false);
    const code = generateVerificationCode();

    await getDb().run(
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
    const shouldExposeCode = EXPOSE_VERIFICATION_CODE === true && sent.delivery === 'console';
    return res.json({
      ok: true,
      delivery: sent.delivery,
      deliveryTarget: sent.recipientEmail || undefined,
      expiresInMs: VERIFICATION_CODE_TTL_MS,
      message:
        sent.delivery === 'email'
          ? 'Verification code sent to your email'
          : sent.delivery === 'queued'
          ? 'Verification code is being sent. Use on-screen code immediately if email is delayed.'
          : 'Email delivery unavailable. Use the verification code shown on screen.',
      deliveryReason: sent.reason || undefined,
      devCode: shouldExposeCode ? code : undefined
    });
  });

  router.post('/auth/google', loginLimiter, async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    try {
      const profile = await verifyGoogleIdToken(String(idToken));
      const user = await upsertUserAccount(profile.email, profile.displayName, true);
      const now = Date.now();

      await getDb().run(
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

      const token = createAuthToken({ kind: 'user', userId: user.id, email: user.email });
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

  router.post('/auth/microsoft', loginLimiter, async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    try {
      const profile = await verifyMicrosoftIdToken(String(idToken));
      const user = await upsertUserAccount(profile.email, profile.displayName, true);
      const now = Date.now();

      await getDb().run(`UPDATE users SET email_verified = 1, updated_at = ?, last_login_at = ? WHERE id = ?`, now, now, user.id);

      const token = createAuthToken({ kind: 'user', userId: user.id, email: user.email });
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

  router.post('/auth/apple', loginLimiter, async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    try {
      const profile = await verifyAppleIdToken(String(idToken));
      const user = await upsertUserAccount(profile.email, profile.displayName, true);
      const now = Date.now();

      await getDb().run(`UPDATE users SET email_verified = 1, updated_at = ?, last_login_at = ? WHERE id = ?`, now, now, user.id);

      const token = createAuthToken({ kind: 'user', userId: user.id, email: user.email });
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

  router.post('/auth/verify-code', loginLimiter, async (req, res) => {
    const { email, code } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail) || !code) {
      return res.status(400).json({ error: 'email and code are required' });
    }

    const user = await getDb().get(`SELECT * FROM users WHERE email = ?`, normalizedEmail);
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const now = Date.now();
    const activeCode = await getDb().get(
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

    await getDb().run(`UPDATE email_verification_codes SET consumed_at = ? WHERE id = ?`, now, activeCode.id);
    await getDb().run(
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

    const token = createAuthToken({ kind: 'user', userId: user.id, email: user.email });
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

  router.get('/auth/me', async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.user.kind === 'user') {
      const account = await getDb().get(
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

  return router;
}

module.exports = {
  createAuthRoutes
};
