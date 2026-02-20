import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '../../store/authStore.ts';

const CODE_LENGTH = 6;

export function CodeVerifyPage() {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { verifyCode, requestLogin, email, error, clearError } = useAuthStore();

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
    await requestLogin(email);
    inputRefs.current[0]?.focus();
  }, [email, requestLogin, clearError]);

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-100">Check your email</h1>
          <p className="text-sm text-slate-400 mt-2">
            We sent a code to <span className="text-blue-400">{email}</span>
          </p>
        </div>

        <div className="bg-[#1e293b] rounded-xl p-6">
          <div className="flex justify-center gap-2 mb-4" onPaste={handlePaste}>
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
                  className="w-11 h-13 text-center text-xl font-bold bg-[#0f172a] border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                {i === 2 && <span className="flex items-center text-slate-500 text-xl font-bold">-</span>}
              </span>
            ))}
          </div>

          {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}

          {submitting && (
            <p className="text-blue-400 text-xs text-center mb-3">Verifying...</p>
          )}

          <div className="text-center mt-4">
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          <div className="text-center mt-3">
            <button
              onClick={() => useAuthStore.setState({ view: 'login', error: null })}
              className="text-xs text-slate-400 hover:text-slate-300"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
