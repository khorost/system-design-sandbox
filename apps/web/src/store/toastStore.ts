import { create } from 'zustand';

export type ToastType = 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 5000,
  warning: 8000,
  error: 10000,
};

const MAX_TOASTS = 5;

let nextId = 1;

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (type, message) => {
    const id = String(nextId++);
    const toast: Toast = { id, type, message };

    set((state) => {
      const updated = [...state.toasts, toast];
      // FIFO eviction when exceeding limit
      if (updated.length > MAX_TOASTS) {
        return { toasts: updated.slice(updated.length - MAX_TOASTS) };
      }
      return { toasts: updated };
    });

    setTimeout(() => {
      get().removeToast(id);
    }, AUTO_DISMISS_MS[type]);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
