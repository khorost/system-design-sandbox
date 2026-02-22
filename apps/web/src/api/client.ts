import { getApiUrl } from '../config/env.ts';

export class ApiError extends Error {
  code: string;
  status: number;
  retryAfter?: number;

  constructor(message: string, code: string, status: number, retryAfter?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${getApiUrl()}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let body: { error?: string; code?: string; retry_after?: number } = {};
    try {
      body = await res.json();
    } catch {
      // ignore parse errors
    }
    throw new ApiError(
      body.error || res.statusText,
      body.code || 'unknown',
      res.status,
      body.retry_after,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}
