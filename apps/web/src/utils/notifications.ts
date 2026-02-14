import { useToastStore } from '../store/toastStore.ts';

export const notify = {
  success(message: string) {
    useToastStore.getState().addToast('success', message);
  },
  warn(message: string) {
    useToastStore.getState().addToast('warning', message);
  },
  error(message: string) {
    useToastStore.getState().addToast('error', message);
  },
};
