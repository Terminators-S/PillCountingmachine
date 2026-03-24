export const ACCESS_TOKEN_KEY = 'pillcount_access_token';
export const REFRESH_TOKEN_KEY = 'pillcount_refresh_token';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function writeCookie(name: string, value: string, maxAgeSeconds = AUTH_COOKIE_MAX_AGE_SECONDS) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getAccessToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function getRefreshToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  writeCookie(ACCESS_TOKEN_KEY, accessToken);
  writeCookie(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearCookie(ACCESS_TOKEN_KEY);
  clearCookie(REFRESH_TOKEN_KEY);
}

export function syncAuthCookiesFromStorage() {
  if (typeof window === 'undefined') return;

  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) || '';
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || '';

  if (accessToken) {
    writeCookie(ACCESS_TOKEN_KEY, accessToken);
  } else {
    clearCookie(ACCESS_TOKEN_KEY);
  }

  if (refreshToken) {
    writeCookie(REFRESH_TOKEN_KEY, refreshToken);
  } else {
    clearCookie(REFRESH_TOKEN_KEY);
  }
}
