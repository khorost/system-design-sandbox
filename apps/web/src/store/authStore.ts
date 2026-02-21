import { create } from 'zustand';

import { ApiError, apiFetch, setAccessToken } from '../api/client.ts';

export type AuthView = 'loading' | 'anonymous' | 'login' | 'verify-code' | 'onboarding' | 'authenticated';

interface User {
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
  refresh: () => Promise<boolean>;
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
      const res = await fetch('/api/v1/auth/config');
      if (res.ok) {
        const data = await res.json();
        set({ authConfig: data });
      }
    } catch {
      // ignore — use defaults
    }
  },

  initialize: async () => {
    // Fetch auth config in parallel
    get().fetchAuthConfig();

    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        localStorage.removeItem(SESSION_KEY);
        set({ view: 'anonymous' });
        return;
      }
      const data = await res.json();
      setAccessToken(data.access_token);
      localStorage.setItem(SESSION_KEY, '1');
      const user: User = data.user;

      if (!user.display_name) {
        set({ user, view: 'onboarding' });
      } else {
        set({ user, view: 'authenticated' });
      }
    } catch {
      set({ view: 'anonymous' });
    }
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
      const data = await apiFetch<{ access_token: string; user: User }>('/api/v1/auth/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      setAccessToken(data.access_token);
      localStorage.setItem(SESSION_KEY, '1');
      const user = data.user;

      if (!user.display_name) {
        set({ user, view: 'onboarding' });
      } else {
        set({ user, view: 'authenticated' });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
      }
    }
  },

  refresh: async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = await res.json();
      setAccessToken(data.access_token);
      set({ user: data.user });
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
    setAccessToken(null);
    localStorage.removeItem(SESSION_KEY);
    set({ user: null, view: 'anonymous', email: '' });
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
