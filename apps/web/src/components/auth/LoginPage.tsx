import { useCallback, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { requestLogin, requestRegister, error, clearError } = useAuthStore();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      try {
        if (isRegister) {
          await requestRegister(email.trim(), promoCode.trim());
        } else {
          await requestLogin(email.trim());
        }
      } finally {
        setSubmitting(false);
      }
    },
    [email, promoCode, isRegister, requestLogin, requestRegister],
  );

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-100">System Design Sandbox</h1>
          <p className="text-sm text-slate-400 mt-2">
            {isRegister ? 'Create an account' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1e293b] rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="you@example.com"
              autoFocus
              className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Promo Code</label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value);
                  clearError();
                }}
                placeholder="Enter promo code"
                className="w-full px-3 py-2.5 bg-[#0f172a] border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !email.trim() || (isRegister && !promoCode.trim())}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {submitting ? 'Sending...' : 'Send Login Code'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                clearError();
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
