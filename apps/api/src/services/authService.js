const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const { createRemoteJWKSet, jwtVerify } = require('jose');

function createAuthService(options) {
  const {
    authTokenSecret,
    authTokenTtlMs,
    smtp,
    providers,
    quickCodes,
    getDb,
    logInfo,
    logWarn
  } = options;

  let smtpTransporter;
  let smtpWarmupStarted = false;
  let googleClient;
  const microsoftJwks = createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'));
  const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

  function makeError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isValidEmail(value) {
    const email = normalizeEmail(value);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isDeliverableEmail(value) {
    const email = normalizeEmail(value);
    if (!isValidEmail(email)) {
      return false;
    }

    const atIndex = email.lastIndexOf('@');
    const domain = atIndex >= 0 ? email.slice(atIndex + 1) : '';
    if (!domain) {
      return false;
    }

    // Block reserved/test domains to avoid predictable SMTP bounces.
    if (
      domain === 'example.com' ||
      domain === 'example.org' ||
      domain === 'example.net' ||
      domain.endsWith('.example') ||
      domain.endsWith('.invalid') ||
      domain.endsWith('.localhost') ||
      domain.endsWith('.test') ||
      domain.endsWith('.local')
    ) {
      return false;
    }

    return true;
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
    if (normalizedRole === 'admin') return quickCodes.admin;
    if (normalizedRole === 'developer') return quickCodes.developer;
    if (normalizedRole === 'operator') return quickCodes.operator;
    return '';
  }

  function getSmtpTransporter() {
    if (!smtp.host || !smtp.user || !smtp.pass) {
      return null;
    }

    if (!smtpTransporter) {
      smtpTransporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 2,
        maxMessages: 100,
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: {
          user: smtp.user,
          pass: smtp.pass
        }
      });
    }

    if (!smtpWarmupStarted) {
      smtpWarmupStarted = true;
      smtpTransporter.verify().then(() => {
        logInfo('SMTP transporter warmed up');
      }).catch((error) => {
        logWarn('SMTP warmup failed', { error: error.message });
      });
    }

    return smtpTransporter;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function buildVerificationEmailHtml(code, expiresInMinutes) {
    const safeCode = escapeHtml(code);
    const safeMinutes = escapeHtml(expiresInMinutes);

    return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PillCount Verification Code</title>
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
  </head>
  <body style="margin:0;padding:0;background-color:#eef2f7;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#eef2f7" style="background-color:#eef2f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="max-width:560px;background-color:#ffffff;border-radius:14px;border:1px solid #d6dde8;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px;background-color:#0f172a;">
                <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;">PillCount</p>
                <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;color:#ffffff;">Verification Code</h1>
                <p style="margin:8px 0 0;color:#dbe5f4;font-size:14px;">Use this code to complete your sign in or sign up.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1f2937;">Enter this code in your PillCount dashboard:</p>
                <table role="presentation" cellspacing="0" cellpadding="0" bgcolor="#f8fafc" style="background-color:#f8fafc;border:1px solid #dbe3ef;border-radius:10px;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <span style="display:inline-block;font-size:34px;line-height:1;letter-spacing:7px;font-weight:700;color:#0f172a;">${safeCode}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#334155;">This code expires in <strong>${safeMinutes} minutes</strong>.</p>
                <p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:#475569;">If you did not request this email, you can safely ignore it. For security, never share this code.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;">
                <p style="margin:0;padding-top:16px;border-top:1px solid #e5eaf2;font-size:12px;line-height:1.6;color:#64748b;">
                  Sent by PillCount Operations. This is an automated message.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim();
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function sendMailWithTimeout(transporter, mailOptions) {
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`SMTP send timeout after ${smtp.sendTimeoutMs}ms`)), smtp.sendTimeoutMs);
    });

    return Promise.race([sendPromise, timeoutPromise]);
  }

  function sendVerificationCodeEmailInBackground(transporter, mailOptions, code, email) {
    (async () => {
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await sendMailWithTimeout(transporter, mailOptions);
          logInfo('Verification code email sent', {
            email,
            attempt
          });
          return;
        } catch (error) {
          if (attempt < maxAttempts) {
            await delay(500);
            continue;
          }
          logWarn('SMTP send failed in async mode, on-screen fallback remains available', {
            email,
            error: error.message
          });
          logInfo(`[DEV EMAIL FALLBACK] Send code ${code} to ${email}`);
          return;
        }
      }
    })().catch((error) => {
      logWarn('Unexpected async SMTP error', {
        email,
        error: error.message
      });
    });
  }

  async function sendVerificationCodeEmail(email, code) {
    const transporter = getSmtpTransporter();
    const expiresInMinutes = 10;
    const message = `Your PillCount verification code is ${code}. It expires in ${expiresInMinutes} minutes.`;
    const requestedEmail = normalizeEmail(email);
    const recipientEmail = requestedEmail;

    if (!transporter) {
      logInfo(`[DEV EMAIL] Send code ${code} to ${email}`);
      return {
        delivery: 'console',
        reason: 'SMTP not configured',
        recipientEmail
      };
    }

    const mailOptions = {
      from: smtp.from,
      to: recipientEmail,
      subject: 'Your PillCount verification code',
      text: message,
      html: buildVerificationEmailHtml(code, expiresInMinutes)
    };

    if (smtp.sendMode === 'async') {
      sendVerificationCodeEmailInBackground(transporter, mailOptions, code, email);
      return {
        delivery: 'queued',
        reason: 'Email dispatch queued in background for fastest response',
        recipientEmail
      };
    }

    try {
      await sendMailWithTimeout(transporter, mailOptions);
      return {
        delivery: 'email',
        recipientEmail
      };
    } catch (error) {
      logWarn('SMTP send failed, falling back to on-screen code', {
        email,
        error: error.message
      });
      logInfo(`[DEV EMAIL FALLBACK] Send code ${code} to ${email}`);
      return {
        delivery: 'console',
        reason: `SMTP send failed: ${error.message}`,
        recipientEmail
      };
    }
  }

  function getGoogleClient() {
    if (!providers.googleClientId) {
      return null;
    }

    if (!googleClient) {
      googleClient = new OAuth2Client(providers.googleClientId);
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
      audience: providers.googleClientId
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
    if (!providers.microsoftClientId) {
      throw makeError(400, 'Microsoft sign-in is not configured');
    }

    const { payload } = await jwtVerify(String(idToken), microsoftJwks, {
      audience: providers.microsoftClientId
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
    if (!providers.appleClientId) {
      throw makeError(400, 'Apple sign-in is not configured');
    }

    const { payload } = await jwtVerify(String(idToken), appleJwks, {
      issuer: 'https://appleid.apple.com',
      audience: providers.appleClientId
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

    await getDb().run(
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

    return getDb().get(`SELECT * FROM users WHERE email = ?`, normalizedEmail);
  }

  function base64UrlEncode(input) {
    return Buffer.from(input).toString('base64url');
  }

  function base64UrlDecode(input) {
    return Buffer.from(input, 'base64url').toString('utf8');
  }

  function sign(input) {
    return crypto.createHmac('sha256', authTokenSecret).update(input).digest('base64url');
  }

  function createAuthToken(data) {
    const payload = {
      ...data,
      iat: Date.now(),
      exp: Date.now() + authTokenTtlMs
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

  return {
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
  };
}

module.exports = {
  createAuthService
};
