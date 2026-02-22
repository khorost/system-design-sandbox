import { create } from 'zustand';

import { ApiError, apiFetch } from '../api/client.ts';
import { getApiUrl } from '../config/env.ts';
import { onTabMessage, postTabMessage } from '../utils/tabChannel.ts';

export type AuthView = 'loading' | 'anonymous' | 'login' | 'verify-code' | 'onboarding' | 'authenticated';

export interface User {
  id: string;
  email: string;
  name: string;
  status: string;
  display_name: string | null;
  gravatar_allowed: boolean;
  gravatar_url?: string;
}

interface SessionInfo {
  session_id: string;
  ip: string;
  user_agent: string;
  geo: string;
  created_at: string;
  last_active_at: string;
  current: boolean;
}

interface SessionsResult {
  sessions: SessionInfo[];
  total: number;
}

interface AuthConfig {
  referral_field_enabled: boolean;
}

interface AuthState {
  user: User | null;
  view: AuthView;
  email: string;
  error: string | null;
  authConfig: AuthConfig;

  // Actions
  initialize: () => Promise<void>;
  setView: (view: AuthView) => void;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  checkSession: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string, gravatarAllowed: boolean) => Promise<void>;
  completeOnboarding: (displayName: string, referralSource?: string) => Promise<void>;
  clearError: () => void;
  fetchAuthConfig: () => Promise<void>;

  // Session management
  listSessions: (limit?: number) => Promise<SessionsResult>;
  revokeSession: (sessionID: string) => Promise<void>;
  revokeOtherSessions: () => Promise<void>;
}

const SESSION_KEY = 'has_session';

let initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  view: 'loading',
  email: '',
  error: null,
  authConfig: { referral_field_enabled: false },

  clearError: () => set({ error: null }),

  setView: (view: AuthView) => set({ view }),

  fetchAuthConfig: async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/auth/config`);
      if (res.ok) {
        const data = await res.json();
        set({ authConfig: data });
      }
    } catch {
      // ignore — use defaults
    }
  },

  initialize: () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      get().fetchAuthConfig();
      try {
        const user = await apiFetch<User>('/api/v1/users/me');
        localStorage.setItem(SESSION_KEY, '1');
        if (!user.display_name) {
          set({ user, view: 'onboarding' });
        } else {
          set({ user, view: 'authenticated' });
        }
        postTabMessage({ type: 'auth:login', user });
      } catch {
        localStorage.removeItem(SESSION_KEY);
        set({ view: 'anonymous' });
      } finally {
        initPromise = null;
      }
    })();
    return initPromise;
  },

  requestCode: async (email: string) => {
    set({ error: null });
    try {
      await apiFetch('/api/v1/auth/send-code', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      set({ email, view: 'verify-code' });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.retryAfter) {
          set({ error: `Too many requests. Try again in ${e.retryAfter} seconds.` });
        } else {
          set({ error: e.message });
        }
      }
    }
  },

  verifyCode: async (code: string) => {
    set({ error: null });
    const { email } = get();
    try {
      const data = await apiFetch<{ user: User }>('/api/v1/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      localStorage.setItem(SESSION_KEY, '1');
      const user = data.user;

      if (!user.display_name) {
        set({ user, view: 'onboarding' });
      } else {
        set({ user, view: 'authenticated' });
      }
      postTabMessage({ type: 'auth:login', user });
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
      }
    }
  },

  checkSession: async () => {
    try {
      const user = await apiFetch<User>('/api/v1/users/me');
      set({ user });
      return true;
    } catch {
      return false;
    }
  },

  logout: async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // ignore errors on logout
    }
    localStorage.removeItem(SESSION_KEY);
    set({ user: null, view: 'anonymous', email: '' });
    postTabMessage({ type: 'auth:logout' });
  },

  updateProfile: async (displayName: string, gravatarAllowed: boolean) => {
    set({ error: null });
    try {
      const user = await apiFetch<User>('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName, gravatar_allowed: gravatarAllowed }),
      });
      set({ user });
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
      }
    }
  },

  completeOnboarding: async (displayName: string, referralSource?: string) => {
    set({ error: null });
    try {
      const body: Record<string, string> = { display_name: displayName };
      if (referralSource) {
        body.referral_source = referralSource;
      }
      const user = await apiFetch<User>('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      set({ user, view: 'authenticated' });
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
      }
    }
  },

  listSessions: async (limit?: number) => {
    const q = limit !== undefined ? `?limit=${limit}` : '';
    return apiFetch<SessionsResult>(`/api/v1/auth/sessions${q}`);
  },

  revokeSession: async (sessionID: string) => {
    await apiFetch(`/api/v1/auth/sessions/${sessionID}`, { method: 'DELETE' });
  },

  revokeOtherSessions: async () => {
    await apiFetch('/api/v1/auth/sessions/revoke-others', { method: 'POST' });
  },
}));

// Cross-tab auth sync
onTabMessage((msg) => {
  if (msg.type === 'auth:logout') {
    localStorage.removeItem(SESSION_KEY);
    useAuthStore.setState({ user: null, view: 'anonymous', email: '' });
  }
  if (msg.type === 'auth:login') {
    localStorage.setItem(SESSION_KEY, '1');
    const view = msg.user.display_name ? 'authenticated' : 'onboarding';
    useAuthStore.setState({ user: msg.user, view });
  }
});
