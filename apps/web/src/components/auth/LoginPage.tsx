import { useCallback, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { requestCode, error, clearError } = useAuthStore();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      try {
        await requestCode(email.trim());
      } finally {
        setSubmitting(false);
      }
    },
    [email, requestCode],
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.30em] text-[var(--color-accent)]">Workspace Access</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-100">System Design Sandbox</h1>
          <p className="text-sm text-slate-400 mt-2">
            Sign in or create an account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[linear-gradient(180deg,rgba(19,32,44,0.96),rgba(14,23,34,0.98))] border border-[var(--color-border)] rounded-xl p-6 space-y-4 shadow-[var(--shadow-panel)]">
          <div>
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="you@example.com"
              autoFocus
              className="w-full px-3 py-2.5 bg-[rgba(7,12,19,0.56)] border border-[var(--color-border)] rounded-md text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.24)]"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="w-full py-2.5 bg-[#5f6f89] hover:bg-[#6c7ea0] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
          >
            {submitting ? 'Sending...' : 'Continue'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => useAuthStore.getState().setView('anonymous')}
              className="text-xs text-slate-500 hover:text-slate-400"
            >
              Continue without signing in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
