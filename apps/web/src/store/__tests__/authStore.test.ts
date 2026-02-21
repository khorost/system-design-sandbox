import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setAccessToken } from '../../api/client.ts';
import { useAuthStore } from '../authStore.ts';

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// Mock localStorage
const localStorageMap = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageMap.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMap.set(key, value),
  removeItem: (key: string) => localStorageMap.delete(key),
  clear: () => localStorageMap.clear(),
});

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
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    view: 'loading',
    email: '',
    error: null,
    authConfig: { referral_field_enabled: false },
  });
});

afterEach(() => {
  setAccessToken(null);
  localStorage.clear();
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
    // auth/config fetch
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { referral_field_enabled: false }));
    // refresh fetch
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'tok', user: mockUser }),
    );

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(localStorage.getItem('has_session')).toBe('1');
  });

  it('sets onboarding when user has no display_name', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { referral_field_enabled: false }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'tok', user: mockUserNoName }),
    );

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('onboarding');
    expect(useAuthStore.getState().user).toEqual(mockUserNoName);
  });

  it('sets anonymous view and clears marker on failed refresh', async () => {
    localStorage.setItem('has_session', '1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { referral_field_enabled: false }));
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'no session' }));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('anonymous');
    expect(localStorage.getItem('has_session')).toBeNull();
  });

  it('sets anonymous view on network error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { referral_field_enabled: false }));
    fetchMock.mockRejectedValueOnce(new Error('network error'));

    await useAuthStore.getState().initialize();

    expect(useAuthStore.getState().view).toBe('anonymous');
  });
});

describe('requestCode', () => {
  it('transitions to verify-code on success', async () => {
    useAuthStore.setState({ view: 'login' });
    // refresh attempt for ensureToken
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    // send-code request
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await useAuthStore.getState().requestCode('test@example.com');

    expect(useAuthStore.getState().view).toBe('verify-code');
    expect(useAuthStore.getState().email).toBe('test@example.com');
  });

  it('sets error on failure', async () => {
    useAuthStore.setState({ view: 'login' });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'invalid email', code: 'bad_request' }),
    );

    await useAuthStore.getState().requestCode('bad');

    expect(useAuthStore.getState().view).toBe('login');
    expect(useAuthStore.getState().error).toBe('invalid email');
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

  it('sends referral_source when provided', async () => {
    useAuthStore.setState({ view: 'onboarding', user: mockUserNoName });
    setAccessToken('tok');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, mockUser));

    await useAuthStore.getState().completeOnboarding('Test User', 'OTUS');

    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.referral_source).toBe('OTUS');
    expect(body.display_name).toBe('Test User');
  });
});

describe('logout', () => {
  it('resets state to anonymous', async () => {
    useAuthStore.setState({ view: 'authenticated', user: mockUser });
    setAccessToken('tok');
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().view).toBe('anonymous');
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().email).toBe('');
  });

  it('still resets state even if logout request fails', async () => {
    useAuthStore.setState({ view: 'authenticated', user: mockUser });
    setAccessToken('tok');
    fetchMock.mockRejectedValueOnce(new Error('network'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().view).toBe('anonymous');
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

describe('fetchAuthConfig', () => {
  it('fetches and stores auth config', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { referral_field_enabled: true }));

    await useAuthStore.getState().fetchAuthConfig();

    expect(useAuthStore.getState().authConfig.referral_field_enabled).toBe(true);
  });

  it('keeps defaults on failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));

    await useAuthStore.getState().fetchAuthConfig();

    expect(useAuthStore.getState().authConfig.referral_field_enabled).toBe(false);
  });
});
