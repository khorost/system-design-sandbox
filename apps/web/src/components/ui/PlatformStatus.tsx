import { useState } from 'react';

import { usePlatformMetricsStore } from '../../store/platformMetricsStore.ts';

const DOT_COLOR: Record<string, string> = {
  connected: 'bg-green-400',
  connecting: 'bg-yellow-400 animate-pulse',
  disconnected: 'bg-slate-500',
};

export function PlatformStatus() {
  const status = usePlatformMetricsStore((s) => s.status);
  const metrics = usePlatformMetricsStore((s) => s.metrics);
  const [hover, setHover] = useState(false);

  // Show nothing until we've received at least one snapshot.
  if (!metrics) return null;

  return (
    <div
      className="relative flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[rgba(6,13,19,0.48)] px-3 py-1.5 text-[11px] text-slate-400 cursor-default"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${DOT_COLOR[status]}`} />
      <span>{metrics.usersOnline} online</span>

      {hover && (
        <div className="absolute top-full right-0 mt-2 z-50 w-52 px-3 py-3 rounded-xl bg-[linear-gradient(180deg,rgba(19,32,44,0.97),rgba(10,17,24,0.98))] border border-[var(--color-border)] shadow-[var(--shadow-panel)] text-xs text-slate-300 space-y-2">
          <div className="flex justify-between">
            <span>Users online</span>
            <span className="text-white font-medium">{metrics.usersOnline}</span>
          </div>
          <div className="flex justify-between">
            <span>Users offline</span>
            <span className="text-white font-medium">{metrics.usersOffline}</span>
          </div>
          <div className="flex justify-between">
            <span>Anonymous recent</span>
            <span className="text-white font-medium">{metrics.anonRecent}</span>
          </div>
        </div>
      )}
    </div>
  );
}
