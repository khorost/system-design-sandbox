import { useCallback, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

export function OnboardingPage() {
  const { user, completeOnboarding, error, clearError } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!displayName.trim()) return;
      setSubmitting(true);
      try {
        await completeOnboarding(displayName.trim());
      } finally {
        setSubmitting(false);
      }
    },
    [displayName, completeOnboarding],
  );

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Welcome!</h1>
          <p className="text-sm text-slate-400 mt-2">Let's set up your profile</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1e293b] rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                clearError();
              }}
              placeholder="How should we call you?"
              autoFocus
              className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !displayName.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {submitting ? 'Saving...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
