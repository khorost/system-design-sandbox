import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setAccessToken } from '../../api/client.ts';
import { useAuthStore } from '../authStore.ts';

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'test@example.com',
  status: 'active',
  display_name: 'Test User',
  gravatar_allowed: false,
};

const mockUserNoName = {
  ...mockUser,
  display_name: null,
};

beforeEach(() => {
  fetchMock.mockReset();
  setAccessToken(null);
  useAuthStore.setState({
    user: null,
    view: 'loading',
    email: '',
    error: null,
  });
});

afterEach(() => {
  setAccessToken(null);
});

describe('authStore initial state', () => {
  it('starts with loading view', () => {
    expect(useAuthStore.getState().view).toBe('loading');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('clearError', () => {
  it('clears error', () => {
    useAuthStore.setState({ error: 'some error' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('initialize', () => {
  it('sets authenticated on successful refresh with display_name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'tok', user: mockUser }),
    );

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('sets onboarding when user has no display_name', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'tok', user: mockUserNoName }),
    );

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('onboarding');
    expect(useAuthStore.getState().user).toEqual(mockUserNoName);
  });

  it('sets login view on failed refresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'no session' }));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('login');
  });

  it('sets login view on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('login');
  });
});

describe('requestLogin', () => {
  it('transitions to verify-code on success', async () => {
    useAuthStore.setState({ view: 'login' });
    // refresh attempt for ensureToken
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    // login request
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await useAuthStore.getState().requestLogin('test@example.com');

    expect(useAuthStore.getState().view).toBe('verify-code');
    expect(useAuthStore.getState().email).toBe('test@example.com');
  });

  it('sets error on failure', async () => {
    useAuthStore.setState({ view: 'login' });
    // refresh attempt
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    // login fails
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid email', code: 'bad_request' }),
    );

    await useAuthStore.getState().requestLogin('bad');

    expect(useAuthStore.getState().view).toBe('login');
    expect(useAuthStore.getState().error).toBe('invalid email');
  });
});

describe('requestRegister', () => {
  it('transitions to verify-code on success', async () => {
    useAuthStore.setState({ view: 'login' });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await useAuthStore.getState().requestRegister('new@example.com', 'PROMO1');

    expect(useAuthStore.getState().view).toBe('verify-code');
    expect(useAuthStore.getState().email).toBe('new@example.com');
  });

  it('sets error on invalid promo', async () => {
    useAuthStore.setState({ view: 'login' });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid or expired promo code', code: 'invalid_promo' }),
    );

    await useAuthStore.getState().requestRegister('new@example.com', 'BAD');

    expect(useAuthStore.getState().error).toBe('invalid or expired promo code');
  });
});

describe('verifyCode', () => {
  it('transitions to authenticated on success with display_name', async () => {
    useAuthStore.setState({ view: 'verify-code', email: 'test@example.com' });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'tok', user: mockUser }),
    );

    await useAuthStore.getState().verifyCode('ABC-DEF');

    expect(useAuthStore.getState().view).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('transitions to onboarding when no display_name', async () => {
    useAuthStore.setState({ view: 'verify-code', email: 'test@example.com' });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'tok', user: mockUserNoName }),
    );

    await useAuthStore.getState().verifyCode('ABC-DEF');

    expect(useAuthStore.getState().view).toBe('onboarding');
  });

  it('sets error on invalid code', async () => {
    useAuthStore.setState({ view: 'verify-code', email: 'test@example.com' });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid code', code: 'invalid_code' }),
    );

    await useAuthStore.getState().verifyCode('WRONG');

    expect(useAuthStore.getState().error).toBe('invalid code');
    expect(useAuthStore.getState().view).toBe('verify-code');
  });
});

describe('completeOnboarding', () => {
  it('transitions to authenticated', async () => {
    useAuthStore.setState({ view: 'onboarding', user: mockUserNoName });
    setAccessToken('tok');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, mockUser));

    await useAuthStore.getState().completeOnboarding('Test User');

    expect(useAuthStore.getState().view).toBe('authenticated');
    expect(useAuthStore.getState().user?.display_name).toBe('Test User');
  });
});

describe('logout', () => {
  it('resets state to login', async () => {
    useAuthStore.setState({ view: 'authenticated', user: mockUser });
    setAccessToken('tok');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().view).toBe('login');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().email).toBe('');
  });

  it('still resets state even if logout request fails', async () => {
    useAuthStore.setState({ view: 'authenticated', user: mockUser });
    setAccessToken('tok');
    fetchMock.mockRejectedValueOnce(new Error('network'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().view).toBe('login');
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('updateProfile', () => {
  it('updates user in state', async () => {
    useAuthStore.setState({ view: 'authenticated', user: mockUser });
    setAccessToken('tok');
    const updated = { ...mockUser, display_name: 'New Name', gravatar_allowed: true };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, updated));

    await useAuthStore.getState().updateProfile('New Name', true);

    expect(useAuthStore.getState().user?.display_name).toBe('New Name');
    expect(useAuthStore.getState().user?.gravatar_allowed).toBe(true);
  });
});

describe('refresh', () => {
  it('returns true and updates user on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'new-tok', user: mockUser }),
    );

    const result = await useAuthStore.getState().refresh();

    expect(result).toBe(true);
    expect(useAuthStore.getState().user).toEqual(mockUser);
  });

  it('returns false on failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));

    const result = await useAuthStore.getState().refresh();

    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    const result = await useAuthStore.getState().refresh();

    expect(result).toBe(false);
  });
});
