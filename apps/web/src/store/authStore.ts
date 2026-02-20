import { create } from 'zustand';

import { ApiError, apiFetch, setAccessToken } from '../api/client.ts';

export type AuthView = 'loading' | 'login' | 'verify-code' | 'onboarding' | 'authenticated';

interface User {
  id: string;
  email: string;
  name: string;
  status: string;
  display_name: string | null;
  gravatar_allowed: boolean;
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

interface AuthState {
  user: User | null;
  view: AuthView;
  email: string;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  requestLogin: (email: string) => Promise<void>;
  requestRegister: (email: string, promoCode: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  refresh: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateProfile: (displayName: string, gravatarAllowed: boolean) => Promise<void>;
  completeOnboarding: (displayName: string) => Promise<void>;
  clearError: () => void;

  // Session management
  listSessions: () => Promise<SessionInfo[]>;
  revokeSession: (sessionID: string) => Promise<void>;
  revokeOtherSessions: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  view: 'loading',
  email: '',
  error: null,

  clearError: () => set({ error: null }),

  initialize: async () => {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        set({ view: 'login' });
        return;
      }
      const data = await res.json();
      setAccessToken(data.access_token);
      const user: User = data.user;

      // If user has no display_name, show onboarding
      if (!user.display_name) {
        set({ user, view: 'onboarding' });
      } else {
        set({ user, view: 'authenticated' });
      }
    } catch {
      set({ view: 'login' });
    }
  },

  requestLogin: async (email: string) => {
    set({ error: null });
    try {
      await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      set({ email, view: 'verify-code' });
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
      }
    }
  },

  requestRegister: async (email: string, promoCode: string) => {
    set({ error: null });
    try {
      await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, promo_code: promoCode }),
      });
      set({ email, view: 'verify-code' });
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
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
    set({ user: null, view: 'login', email: '' });
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

  completeOnboarding: async (displayName: string) => {
    set({ error: null });
    try {
      const user = await apiFetch<User>('/api/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName }),
      });
      set({ user, view: 'authenticated' });
    } catch (e) {
      if (e instanceof ApiError) {
        set({ error: e.message });
      }
    }
  },

  listSessions: async () => {
    return apiFetch<SessionInfo[]>('/api/v1/auth/sessions');
  },

  revokeSession: async (sessionID: string) => {
    await apiFetch(`/api/v1/auth/sessions/${sessionID}`, { method: 'DELETE' });
  },

  revokeOtherSessions: async () => {
    await apiFetch('/api/v1/auth/sessions/revoke-others', { method: 'POST' });
  },
}));
