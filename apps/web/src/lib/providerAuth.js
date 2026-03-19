import { PublicClientApplication } from '@azure/msal-browser';

const scriptPromises = new Map();
const msalApps = new Map();

function loadScriptOnce(src, id) {
  if (scriptPromises.has(src)) {
    return scriptPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const existingById = id ? document.getElementById(id) : null;
    if (existingById && typeof window !== 'undefined') {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (id) {
      script.id = id;
    }
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load provider SDK: ${src}`));
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

async function getGoogleIdToken(clientId) {
  if (!clientId) {
    throw new Error('Google login is not configured.');
  }

  await loadScriptOnce('https://accounts.google.com/gsi/client', 'google-gsi-client');
  if (!window.google?.accounts?.id) {
    throw new Error('Google SDK not available.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn(value);
    };

    const timeout = setTimeout(() => {
      finish(reject, new Error('Google sign-in timed out. Please retry.'));
    }, 20000);

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (response?.credential) {
          finish(resolve, response.credential);
          return;
        }
        finish(reject, new Error('Google did not return an ID token.'));
      }
    });

    window.google.accounts.id.prompt((notification) => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        finish(reject, new Error('Google sign-in popup was blocked or unavailable.'));
      }
    });
  });
}

async function getMicrosoftIdToken(clientId) {
  if (!clientId) {
    throw new Error('Microsoft login is not configured.');
  }

  let app = msalApps.get(clientId);
  if (!app) {
    app = new PublicClientApplication({
      auth: {
        clientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin
      },
      cache: {
        cacheLocation: 'sessionStorage'
      }
    });
    msalApps.set(clientId, app);
  }

  await app.initialize();
  const result = await app.loginPopup({
    scopes: ['openid', 'profile', 'email'],
    prompt: 'select_account'
  });

  if (!result?.idToken) {
    throw new Error('Microsoft did not return an ID token.');
  }

  return result.idToken;
}

async function getAppleIdToken(clientId) {
  if (!clientId) {
    throw new Error('Apple login is not configured.');
  }

  await loadScriptOnce(
    'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
    'appleid-sdk'
  );

  if (!window.AppleID?.auth) {
    throw new Error('Apple SDK not available.');
  }

  window.AppleID.auth.init({
    clientId,
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true
  });

  const result = await window.AppleID.auth.signIn();
  const idToken = result?.authorization?.id_token;
  if (!idToken) {
    throw new Error('Apple did not return an ID token.');
  }

  return idToken;
}

export async function getProviderIdToken(provider, options = {}) {
  const clientId = options.clientId || '';
  const normalized = String(provider || '').trim().toLowerCase();

  if (normalized === 'google') {
    return getGoogleIdToken(clientId);
  }

  if (normalized === 'microsoft') {
    return getMicrosoftIdToken(clientId);
  }

  if (normalized === 'apple') {
    return getAppleIdToken(clientId);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
