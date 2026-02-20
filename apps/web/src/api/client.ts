export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const data = await res.json();
  accessToken = data.access_token;
  return accessToken;
}

async function ensureToken(): Promise<string | null> {
  if (!accessToken) {
    // Try refresh once (single in-flight promise to prevent races)
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }
  return accessToken;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await ensureToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(path, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!res.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      // ignore parse errors
    }
    throw new ApiError(
      body.error || res.statusText,
      body.code || 'unknown',
      res.status,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
