const BASE_HEADERS = {
  'Content-Type': 'application/json'
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function request(path, options = {}) {
  const token = localStorage.getItem('pillcountAuthToken') || '';
  const apiKey = localStorage.getItem('pillcountApiKey') || '';

  const headers = {
    ...BASE_HEADERS,
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 10000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 408);
    }
    throw new ApiError('Network error. Please check connection and retry.', 0);
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError('UNAUTHORIZED', 401, data);
    }
    throw new ApiError(data.error || `Request failed (${response.status})`, response.status, data);
  }

  return data;
}
