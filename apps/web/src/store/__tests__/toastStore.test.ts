import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '../toastStore.ts';

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  vi.useFakeTimers();
});

describe('toastStore', () => {
  it('addToast adds a toast to the list', () => {
    useToastStore.getState().addToast('success', 'Saved');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]).toMatchObject({
      type: 'success',
      message: 'Saved',
    });
  });

  it('removeToast removes a toast by id', () => {
    useToastStore.getState().addToast('error', 'Oops');
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('evicts oldest toast when exceeding max of 5', () => {
    for (let i = 0; i < 6; i++) {
      useToastStore.getState().addToast('warning', `msg-${i}`);
    }
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(5);
    // First toast (msg-0) should be evicted
    expect(toasts[0].message).toBe('msg-1');
    expect(toasts[4].message).toBe('msg-5');
  });

  it('auto-dismisses success toast after 5s', () => {
    useToastStore.getState().addToast('success', 'Done');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses warning toast after 8s', () => {
    useToastStore.getState().addToast('warning', 'Careful');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(7999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('auto-dismisses error toast after 10s', () => {
    useToastStore.getState().addToast('error', 'Failed');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(9999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
