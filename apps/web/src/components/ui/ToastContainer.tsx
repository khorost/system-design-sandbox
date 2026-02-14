import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore, type ToastType } from '../../store/toastStore.ts';

const ICON: Record<ToastType, string> = {
  success: '\u2713',
  warning: '\u26A0',
  error: '\u2715',
};

const COLOR: Record<ToastType, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto max-w-sm rounded-lg border px-4 py-3 shadow-lg flex items-start gap-3 text-sm"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: COLOR[toast.type],
            }}
          >
            <span
              className="text-base font-bold leading-5 shrink-0"
              style={{ color: COLOR[toast.type] }}
            >
              {ICON[toast.type]}
            </span>
            <span className="text-slate-200 break-words whitespace-pre-wrap flex-1 min-w-0">
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-500 hover:text-slate-300 shrink-0 leading-5"
            >
              &times;
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
