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
      <div className="w-full max-w-md">
        <div className="text-center mb-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">Workspace Access</div>
          <h1 className="mt-2.5 text-[1.75rem] leading-tight font-bold text-slate-100">System Design Sandbox</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-400">
            Sign in or create an account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[linear-gradient(180deg,rgba(19,32,44,0.96),rgba(14,23,34,0.98))] border border-[rgba(138,167,198,0.16)] rounded-xl px-6 py-6 shadow-[0_18px_42px_rgba(2,8,14,0.24)]">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError();
            }}
            placeholder="you@example.com"
            autoFocus
            className="w-full h-12 rounded-lg border border-[rgba(138,167,198,0.14)] bg-[rgba(7,12,19,0.54)] px-5 text-[15px] leading-none text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.18)]"
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="mt-6 space-y-3">
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full h-12 px-4 bg-[linear-gradient(180deg,#7a89a7,#67748f)] hover:bg-[linear-gradient(180deg,#8697b6,#72809d)] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-[15px] leading-none font-semibold rounded-lg shadow-[0_10px_24px_rgba(9,20,32,0.16)] transition-colors"
            >
              {submitting ? 'Sending...' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => useAuthStore.getState().setView('anonymous')}
              className="w-full min-h-10 rounded-lg px-4 py-2.5 text-sm leading-none text-slate-300 transition-colors hover:bg-[rgba(255,255,255,0.03)] hover:text-slate-100"
            >
              Continue without signing in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
