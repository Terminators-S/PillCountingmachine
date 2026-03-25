import { getAccessToken, getRefreshToken, clearTokens, setTokens } from './auth';
import { DemoApiError, demoApiRequest, demoDownloadFromApi, isDemoMode } from './demo-api';

const LOCAL_API_BASE_URL = 'http://localhost:4000/api';
const SAME_ORIGIN_API_BASE_URL = '/api';
const BROWSER_API_BASE_URL_KEY = 'pillcount_api_base_url';
const FALLBACK_STATUS_CODES = new Set([404, 502, 503, 504]);
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
let preferredApiBaseUrl: string | null = null;

function looksLikeHtmlDocument(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('<!doctype html') || normalized.startsWith('<html');
}

function getFriendlyApiErrorMessage(path: string, status: number, payload: string) {
  if (!looksLikeHtmlDocument(payload)) {
    return String(payload || 'Request failed');
  }

  if (typeof window !== 'undefined' && !LOCAL_HOSTNAMES.has(window.location.hostname)) {
    return `The hosted UI cannot reach the support API yet. Open Advanced connection and enter your public API URL before using ${path.replace(/^\//, '')}.`;
  }

  return `The app reached a webpage instead of the API while calling ${path.replace(/^\//, '')}. Check the API base URL and try again.`;
}

function normalizeApiBaseUrl(url: string) {
  return String(url).trim().replace(/\/+$/, '');
}

function getBrowserApiBaseUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return normalizeApiBaseUrl(window.localStorage.getItem(BROWSER_API_BASE_URL_KEY) || '');
}

function buildApiBaseCandidates() {
  const candidates: string[] = [];
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  const browserApiUrl = getBrowserApiBaseUrl();
  if (preferredApiBaseUrl) {
    candidates.push(preferredApiBaseUrl);
  }

  if (browserApiUrl) {
    candidates.push(browserApiUrl);
  }

  if (configuredApiUrl) {
    candidates.push(normalizeApiBaseUrl(configuredApiUrl));
  }

  if (typeof window !== 'undefined') {
    candidates.push(SAME_ORIGIN_API_BASE_URL);
  }

  if (typeof window !== 'undefined') {
    if (LOCAL_HOSTNAMES.has(window.location.hostname)) {
      candidates.push(LOCAL_API_BASE_URL);
    }
  } else {
    candidates.push(LOCAL_API_BASE_URL);
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

async function fetchFromApi(path: string, init: RequestInit = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const candidates = buildApiBaseCandidates();
  let lastResponse: Response | null = null;
  let lastNetworkError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    const hasFallback = index < candidates.length - 1;

    try {
      const response = await fetch(`${baseUrl}${normalizedPath}`, init);
      if (!response.ok && hasFallback && FALLBACK_STATUS_CODES.has(response.status)) {
        lastResponse = response;
        continue;
      }

      preferredApiBaseUrl = baseUrl;
      return response;
    } catch (error) {
      lastNetworkError = error;
      if (!hasFallback) {
        throw error;
      }
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  if (lastNetworkError instanceof Error) {
    throw lastNetworkError;
  }

  throw new Error('Unable to reach API');
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return '';

  const response = await fetchFromApi('/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    clearTokens();
    return '';
  }

  const payload = await response.json();
  if (payload.accessToken && payload.refreshToken) {
    setTokens(payload.accessToken, payload.refreshToken);
    return payload.accessToken;
  }

  return '';
}

async function authenticatedApiFetch(path: string, init: RequestInit = {}, retryAuth = true): Promise<Response> {
  if (isDemoMode()) {
    throw new Error('Raw API fetch is not available in demo mode');
  }

  const accessToken = getAccessToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetchFromApi(path, {
    ...init,
    headers
  });

  if (response.status === 401 && retryAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return authenticatedApiFetch(path, init, false);
    }
  }

  return response;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retryAuth = true): Promise<T> {
  if (isDemoMode()) {
    try {
      return await demoApiRequest<T>(path, init);
    } catch (error) {
      if (error instanceof DemoApiError) {
        throw new ApiError(error.message, error.status, error.code, error.details);
      }
      throw error;
    }
  }

  const response = await authenticatedApiFetch(path, init, retryAuth);

  if (!response.ok) {
    const payload = await parseResponse(response);
    if (typeof payload === 'object' && payload !== null) {
      throw new ApiError((payload as any).message || 'Request failed', response.status, (payload as any).code, payload);
    }
    throw new ApiError(getFriendlyApiErrorMessage(path, response.status, String(payload || 'Request failed')), response.status);
  }

  return parseResponse(response) as Promise<T>;
}

export async function apiBlob(path: string, init: RequestInit = {}, retryAuth = true): Promise<Blob> {
  if (isDemoMode()) {
    throw new ApiError('Blob fetch is not available in demo mode', 400);
  }

  const response = await authenticatedApiFetch(path, init, retryAuth);
  if (!response.ok) {
    const payload = await parseResponse(response);
    if (typeof payload === 'object' && payload !== null) {
      throw new ApiError((payload as any).message || 'Request failed', response.status, (payload as any).code, payload);
    }
    throw new ApiError(getFriendlyApiErrorMessage(path, response.status, String(payload || 'Request failed')), response.status);
  }

  return response.blob();
}

export async function downloadFromApi(path: string, filename: string) {
  if (isDemoMode()) {
    return demoDownloadFromApi(path, filename);
  }

  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function getApiBaseUrl() {
  return preferredApiBaseUrl || buildApiBaseCandidates()[0] || SAME_ORIGIN_API_BASE_URL;
}

export function getStoredApiBaseUrl() {
  return getBrowserApiBaseUrl();
}

export function setStoredApiBaseUrl(url: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  const normalized = normalizeApiBaseUrl(url);
  if (normalized) {
    window.localStorage.setItem(BROWSER_API_BASE_URL_KEY, normalized);
    preferredApiBaseUrl = normalized;
    return normalized;
  }

  window.localStorage.removeItem(BROWSER_API_BASE_URL_KEY);
  preferredApiBaseUrl = null;
  return '';
}

export function clearStoredApiBaseUrl() {
  return setStoredApiBaseUrl('');
}
