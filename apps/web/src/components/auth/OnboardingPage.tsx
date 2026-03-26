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
      <div className="w-full max-w-md">
        <div className="text-center mb-9">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">Profile Setup</div>
          <h1 className="text-[1.9rem] leading-tight font-bold text-slate-100">Welcome!</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-400">Let's set up your profile</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[linear-gradient(180deg,rgba(19,32,44,0.96),rgba(14,23,34,0.98))] border border-[var(--color-border)] rounded-xl px-6 py-6 space-y-6 shadow-[var(--shadow-panel)]">
          <div className="space-y-2.5">
            <label className="block text-[11px] font-medium uppercase tracking-[0.12em] leading-none text-slate-400">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                clearError();
              }}
              placeholder="How should we call you?"
              autoFocus
              className="w-full h-12 px-4 bg-[rgba(7,12,19,0.56)] border border-[var(--color-border)] rounded-lg text-slate-100 placeholder-slate-500 text-[15px] leading-none focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.24)]"
            />
          </div>

          {authConfig.referral_field_enabled && (
            <div className="space-y-2.5">
              <label className="block text-[11px] font-medium uppercase tracking-[0.12em] leading-none text-slate-400">
                How did you hear about us?
                <span className="text-slate-500 ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                placeholder="e.g. OTUS, friend, blog..."
                className="w-full h-12 px-4 bg-[rgba(7,12,19,0.56)] border border-[var(--color-border)] rounded-lg text-slate-100 placeholder-slate-500 text-[15px] leading-none focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.24)]"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !displayName.trim()}
            className="w-full h-12 px-4 bg-[linear-gradient(180deg,#7a89a7,#67748f)] hover:bg-[linear-gradient(180deg,#8697b6,#72809d)] disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-base leading-none font-semibold rounded-lg shadow-[0_10px_24px_rgba(9,20,32,0.18)] transition-colors"
          >
            {submitting ? 'Saving...' : 'Continue'}
          </button>

          <button
            type="button"
            onClick={() => useAuthStore.getState().setView('authenticated')}
            className="w-full h-12 px-4 bg-transparent border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300 text-base leading-none font-medium rounded-lg transition-colors"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  );
}
