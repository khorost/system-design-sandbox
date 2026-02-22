import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, apiFetch } from '../client.ts';

// Ensure window exists for getApiUrl()
if (typeof window === 'undefined') {
  vi.stubGlobal('window', {});
}

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
});

afterEach(() => {
  fetchMock.mockReset();
});

describe('apiFetch', () => {
  it('includes credentials: include', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('/api/v1/test');

    const call = fetchMock.mock.calls[0];
    expect(call[1].credentials).toBe('include');
  });

  it('does not send Authorization header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('/api/v1/test');

    const call = fetchMock.mock.calls[0];
    expect(call[1].headers['Authorization']).toBeUndefined();
  });

  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { name: 'Alice' }));

    const result = await apiFetch<{ name: string }>('/api/v1/test');
    expect(result.name).toBe('Alice');
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiFetch('/api/v1/test');
    expect(result).toBeUndefined();
  });

  it('throws ApiError on error response', async () => {
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

  it('includes retry_after in ApiError', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: 'rate limited', code: 'rate_limited', retry_after: 30 }),
    );

    try {
      await apiFetch('/api/v1/test');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      if (e instanceof ApiError) {
        expect(e.retryAfter).toBe(30);
      }
    }
  });

  it('makes only one fetch call per request (no refresh retry)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized', code: 'unauthorized' }));

    try {
      await apiFetch('/api/v1/test');
    } catch {
      // expected
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
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
