import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

const CODE_LENGTH = 6;

export function CodeVerifyPage() {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { verifyCode, requestCode, email, error, clearError } = useAuthStore();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const submitCode = useCallback(
    async (code: string) => {
      setSubmitting(true);
      try {
        // Format as XXX-XXX
        const formatted = code.slice(0, 3) + '-' + code.slice(3);
        await verifyCode(formatted);
      } finally {
        setSubmitting(false);
      }
    },
    [verifyCode],
  );

  const handleChange = useCallback(
    (index: number, value: string) => {
      clearError();
      const char = value.slice(-1).toUpperCase();
      const newDigits = [...digits];
      newDigits[index] = char;
      setDigits(newDigits);

      if (char && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit when all filled
      const code = newDigits.join('');
      if (code.length === CODE_LENGTH && newDigits.every((d) => d)) {
        submitCode(code);
      }
    },
    [digits, clearError, submitCode],
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (text.length >= CODE_LENGTH) {
        const newDigits = text.slice(0, CODE_LENGTH).split('');
        setDigits(newDigits);
        inputRefs.current[CODE_LENGTH - 1]?.focus();
        submitCode(newDigits.join(''));
      }
    },
    [submitCode],
  );

  const handleResend = useCallback(async () => {
    setResendCooldown(60);
    setDigits(Array(CODE_LENGTH).fill(''));
    clearError();
    await requestCode(email);
    inputRefs.current[0]?.focus();
  }, [email, requestCode, clearError]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-9">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">Email Verification</div>
          <h1 className="text-[1.9rem] leading-tight font-bold text-slate-100">Check your email</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-400">
            We sent a code to <span className="text-blue-400">{email}</span>
          </p>
        </div>

        <div className="bg-[linear-gradient(180deg,rgba(19,32,44,0.96),rgba(14,23,34,0.98))] border border-[var(--color-border)] rounded-xl px-6 py-6 shadow-[var(--shadow-panel)]">
          <div className="mb-5 text-center">
            <div className="text-[11px] font-medium uppercase tracking-[0.10em] leading-none text-slate-400">Verification code</div>
          </div>

          <div className="flex justify-center gap-2.5 mb-6" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <span key={i} className="contents">
                <input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={submitting}
                  className="h-13 w-11 text-center text-xl leading-none font-bold bg-[rgba(7,12,19,0.56)] border border-[var(--color-border)] rounded-lg text-slate-100 focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[rgba(110,220,255,0.24)] disabled:opacity-50"
                />
                {i === 2 && <span className="flex items-center text-slate-500 text-xl font-bold">-</span>}
              </span>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

          {submitting && (
            <p className="text-blue-400 text-xs text-center mb-3">Verifying...</p>
          )}

          <div className="text-center mt-6">
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-sm leading-relaxed text-slate-300 hover:text-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          <div className="text-center mt-5 space-y-3">
            <div>
              <button
                onClick={() => useAuthStore.setState({ view: 'login', error: null })}
                className="text-sm leading-relaxed text-slate-400 hover:text-slate-200"
              >
                Use a different email
              </button>
            </div>
            <div>
              <button
                onClick={() => useAuthStore.getState().setView('anonymous')}
                className="text-sm leading-relaxed text-slate-400 hover:text-slate-200"
              >
                Continue without signing in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
