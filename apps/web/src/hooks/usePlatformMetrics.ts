import { useEffect } from 'react';

import { useAuthStore } from '../store/authStore.ts';
import {
  getPlatformMetricsSentUid,
  setPlatformMetricsUid,
  usePlatformMetricsStore,
} from '../store/platformMetricsStore.ts';

export function usePlatformMetrics() {
  const userId = useAuthStore((s) => s.user?.id ?? '');

  useEffect(() => {
    setPlatformMetricsUid(userId);

    const store = usePlatformMetricsStore.getState();

    if (store.status === 'disconnected') {
      store.connect();
    } else if (getPlatformMetricsSentUid() !== userId) {
      // WS is alive but was opened with a different uid — reconnect.
      store.disconnect();
      store.connect();
    }

    // Disconnect when MainApp unmounts (e.g. navigating to login page)
    // to avoid zombie connections in the hub.
    return () => {
      usePlatformMetricsStore.getState().disconnect();
    };
  }, [userId]);
}
