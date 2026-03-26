import { useCallback, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

export function OnboardingPage() {
  const { user, completeOnboarding, error, clearError, authConfig } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [referralSource, setReferralSource] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!displayName.trim()) return;
      setSubmitting(true);
      try {
        await completeOnboarding(
          displayName.trim(),
          referralSource.trim() || undefined,
        );
      } finally {
        setSubmitting(false);
      }
    },
    [displayName, referralSource, completeOnboarding],
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.30em] text-[var(--color-accent)]">Profile Setup</div>
          <h1 className="text-2xl font-bold text-slate-100">Welcome!</h1>
          <p className="text-sm text-slate-400 mt-2">Let's set up your profile</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[linear-gradient(180deg,rgba(19,32,44,0.96),rgba(14,23,34,0.98))] border border-[var(--color-border)] rounded-xl p-6 space-y-4 shadow-[var(--shadow-panel)]">
          <div>
            <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400 mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                clearError();
              }}
              placeholder="How should we call you?"
              autoFocus
              className="w-full px-3 py-2.5 bg-[rgba(7,12,19,0.56)] border border-[var(--color-border)] rounded-md text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.24)]"
            />
          </div>

          {authConfig.referral_field_enabled && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-[0.16em] text-slate-400 mb-2">
                How did you hear about us?
                <span className="text-slate-500 ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                placeholder="e.g. OTUS, friend, blog..."
                className="w-full px-3 py-2.5 bg-[rgba(7,12,19,0.56)] border border-[var(--color-border)] rounded-md text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.24)]"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !displayName.trim()}
            className="w-full py-2.5 bg-[#5f6f89] hover:bg-[#6c7ea0] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors"
          >
            {submitting ? 'Saving...' : 'Continue'}
          </button>

          <button
            type="button"
            onClick={() => useAuthStore.getState().setView('authenticated')}
            className="w-full py-2.5 bg-transparent border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300 text-sm font-medium rounded-md transition-colors"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  );
}
