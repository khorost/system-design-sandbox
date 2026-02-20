import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch, getAccessToken, setAccessToken } from '../client.ts';

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  setAccessToken(null);
});

afterEach(() => {
  setAccessToken(null);
});

describe('setAccessToken / getAccessToken', () => {
  it('stores and retrieves token', () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken('test-token');
    expect(getAccessToken()).toBe('test-token');
  });

  it('can clear token', () => {
    setAccessToken('abc');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('sends Authorization header when token is set', async () => {
    setAccessToken('my-token');
    // Mock refresh to fail (so it doesn't interfere)
    fetchMock.mockResolvedValue(jsonResponse(200, { result: 'ok' }));

    await apiFetch('/api/v1/test');

    // First call should be the actual request (token already set, no refresh needed)
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/v1/test');
    expect(call[1].headers['Authorization']).toBe('Bearer my-token');
  });

  it('includes credentials: include', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('/api/v1/test');

    const call = fetchMock.mock.calls[0];
    expect(call[1].credentials).toBe('include');
  });

  it('returns parsed JSON on success', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValue(jsonResponse(200, { name: 'Alice' }));

    const result = await apiFetch<{ name: string }>('/api/v1/test');
    expect(result.name).toBe('Alice');
  });

  it('returns undefined for 204 No Content', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiFetch('/api/v1/test');
    expect(result).toBeUndefined();
  });

  it('throws ApiError on error response', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'bad input', code: 'bad_request' }));

    try {
      await apiFetch('/api/v1/test');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.message).toBe('bad input');
        expect(e.code).toBe('bad_request');
        expect(e.status).toBe(400);
      }
    }
  });

  it('attempts refresh when no token is set', async () => {
    // First call: refresh attempt (returns token)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'refreshed-token' }));
    // Second call: actual request
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }));

    const result = await apiFetch<{ data: string }>('/api/v1/test');
    expect(result.data).toBe('ok');

    // First call should be to refresh endpoint
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/refresh');
    // Second call should be the actual request with refreshed token
    expect(fetchMock.mock.calls[1][1].headers['Authorization']).toBe('Bearer refreshed-token');
  });

  it('retries on 401 with refresh', async () => {
    setAccessToken('expired-token');

    // First call: actual request returns 401
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'expired', code: 'token_expired' }));
    // Second call: refresh returns new token
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'new-token' }));
    // Third call: retry with new token
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: 'ok' }));

    const result = await apiFetch<{ data: string }>('/api/v1/test');
    expect(result.data).toBe('ok');
  });
});

describe('ApiError', () => {
  it('extends Error', () => {
    const err = new ApiError('something went wrong', 'internal', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('something went wrong');
    expect(err.code).toBe('internal');
    expect(err.status).toBe(500);
  });
});
