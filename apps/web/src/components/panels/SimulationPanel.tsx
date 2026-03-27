import { getDefinition } from '@system-design-sandbox/component-library';
import type { ComponentType as EngineComponentType } from '@system-design-sandbox/simulation-engine';
import { useMemo } from 'react';

import { CLIENT_TYPES } from '../../constants/componentTypes.ts';
import { useCanvasStore } from '../../store/canvasStore.ts';
import { useSimulationStore } from '../../store/simulationStore.ts';
import { getComponentIcon } from '../canvas/controls/paletteData.ts';
import { ComponentIcon } from '../ui/ComponentIcon.tsx';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function formatBandwidth(kbps: number): string {
  if (kbps >= 1_048_576) return `${(kbps / 1_048_576).toFixed(1)} GB/s`;
  if (kbps >= 1_024) return `${(kbps / 1_024).toFixed(1)} MB/s`;
  return `${kbps.toFixed(0)} KB/s`;
}

function formatComponentName(componentType: string): string {
  return componentType.replaceAll('_', ' ');
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (match) => match.toUpperCase());
}

function getNodeDisplayName(node: { data: { label: string; componentType: string; config: Record<string, unknown> } }): string {
  const configuredName = typeof node.data.config.name === 'string' ? node.data.config.name.trim() : '';
  return configuredName || node.data.label;
}

function getNodeDisplayType(node: { data: { componentType: string } }): string {
  return toTitleCase(formatComponentName(node.data.componentType));
}

function useClientNodes() {
  const nodes = useCanvasStore((s) => s.nodes);
  return useMemo(
    () => nodes.filter((n) => CLIENT_TYPES.has(n.data.componentType)),
    [nodes],
  );
}

export function SimulationPanel() {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const loadType = useSimulationStore((s) => s.loadType);
  const currentMetrics = useSimulationStore((s) => s.currentMetrics);
  const setLoadType = useSimulationStore((s) => s.setLoadType);
  const start = useSimulationStore((s) => s.start);
  const stop = useSimulationStore((s) => s.stop);
  const pause = useSimulationStore((s) => s.pause);
  const resume = useSimulationStore((s) => s.resume);
  const clientNodes = useClientNodes();

  const totalRps = clientNodes.reduce((sum, n) => {
    return sum + getClientRps(n.data.componentType, n.data.config);
  }, 0);
  const statusLabel = isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped';
  const statusClass = isRunning
    ? isPaused
      ? 'border-[rgba(251,191,36,0.26)] bg-[rgba(251,191,36,0.10)] text-amber-300'
      : 'border-[rgba(34,197,94,0.26)] bg-[rgba(34,197,94,0.10)] text-emerald-300'
    : 'border-[rgba(138,167,198,0.18)] bg-[rgba(138,167,198,0.08)] text-slate-300';

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Load Simulation</h3>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Per-client traffic sources */}
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Traffic Sources
        </label>
        {clientNodes.length === 0 ? (
          <p className="text-xs text-slate-400 mt-1">
            Add client nodes to canvas to generate traffic
          </p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {clientNodes.map((node) => {
              const rps = getClientRps(node.data.componentType, node.data.config);
              const icon = getComponentIcon(node.data.componentType, node.data.icon);
              return (
                <div
                  key={node.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[rgba(138,167,198,0.10)] bg-[rgba(7,12,19,0.52)] px-3 py-2.5"
                >
                  <span className="min-w-0 flex items-start gap-2.5">
                    <ComponentIcon icon={icon} alt={getNodeDisplayName(node)} className="shrink-0 pt-0.5 text-[1rem] leading-none" imgClassName="h-4 w-4 object-contain" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-100">
                        {getNodeDisplayName(node)}
                      </span>
                      <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {getNodeDisplayType(node)}
                      </span>
                    </span>
                  </span>
                  <span className="ml-2 shrink-0 font-mono text-sm font-semibold text-blue-300">
                    {formatNumber(rps)}/s
                  </span>
                </div>
              );
            })}
            <div className="mt-2 flex items-center justify-between rounded-lg border border-blue-500/22 bg-blue-500/10 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-200">Total RPS</span>
              <span className="font-mono font-bold text-blue-300">{formatNumber(totalRps)}/s</span>
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-1.5">
          Configure RPS per client in Properties
        </p>
      </div>

      <div>
        <label htmlFor="sim-load-type" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Load Type
        </label>
        <select
          id="sim-load-type"
          value={loadType}
          onChange={(e) => setLoadType(e.target.value as 'constant' | 'ramp' | 'spike')}
          className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="constant">Constant</option>
          <option value="ramp">Ramp Up</option>
          <option value="spike">Spike (3x bursts)</option>
        </select>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[rgba(7,12,19,0.32)] p-2.5">
        {!isRunning ? (
          <button
            onClick={() => start()}
            disabled={clientNodes.length === 0}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              clientNodes.length === 0
                ? 'cursor-not-allowed border border-slate-500/20 bg-slate-500/10 text-slate-500'
                : 'border border-emerald-500/28 bg-emerald-500/14 text-emerald-300 hover:bg-emerald-500/22'
            }`}
          >
            <span className="text-xs">▶</span>
            <span>Start Simulation</span>
          </button>
        ) : isPaused ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => resume()}
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/28 bg-emerald-500/14 px-3 py-2 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/22"
            >
              <span className="text-xs">▶</span>
              <span>Resume</span>
            </button>
            <button
              onClick={() => stop()}
              className="flex items-center justify-center gap-2 rounded-lg border border-rose-500/24 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/16"
            >
              <span className="text-xs">■</span>
              <span>Stop</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => pause()}
              className="flex items-center justify-center gap-2 rounded-lg border border-amber-500/28 bg-amber-500/12 px-3 py-2 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/18"
            >
              <span className="text-xs">❚❚</span>
              <span>Pause</span>
            </button>
            <button
              onClick={() => stop()}
              className="flex items-center justify-center gap-2 rounded-lg border border-rose-500/24 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/16"
            >
              <span className="text-xs">■</span>
              <span>Stop</span>
            </button>
          </div>
        )}
      </div>

      {currentMetrics && (
        <div aria-live="polite" className="space-y-2 pt-3 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Metrics</h4>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Realtime</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="P50" value={`${currentMetrics.latencyP50.toFixed(1)} ms`} />
            <MetricCard label="P95" value={`${currentMetrics.latencyP95.toFixed(1)} ms`} />
            <MetricCard label="P99" value={`${currentMetrics.latencyP99.toFixed(1)} ms`} />
            <MetricCard label="RPS" value={`${formatNumber(currentMetrics.throughput)}/s`} />
            <MetricCard label="Err" value={`${(currentMetrics.errorRate * 100).toFixed(1)}%`} color={currentMetrics.errorRate > 0.05 ? 'text-rose-300' : undefined} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <MetricCard label="In" value={formatBandwidth(currentMetrics.totalInboundKBps)} />
            <MetricCard label="Out" value={formatBandwidth(currentMetrics.totalOutboundKBps)} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-[rgba(138,167,198,0.14)] bg-[linear-gradient(180deg,rgba(18,28,40,0.94),rgba(10,18,28,0.98))] px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 text-[15px] font-mono font-semibold leading-none ${color || 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

function getClientRps(componentType: string, config: Record<string, unknown>): number {
  const def = getDefinition(componentType as EngineComponentType);
  if (config.concurrent_users_k != null) {
    const usersK = config.concurrent_users_k as number;
    const rpu = (config.requests_per_user as number) ??
      (def?.params?.find(p => p.key === 'requests_per_user')?.default as number ?? 0.1);
    return usersK * 1000 * rpu;
  }
  if (config.requests_per_sec != null) {
    return config.requests_per_sec as number;
  }
  const defUsersK = (def?.params?.find(p => p.key === 'concurrent_users_k')?.default as number) ?? 1;
  const defRpu = (def?.params?.find(p => p.key === 'requests_per_user')?.default as number) ?? 0.1;
  return defUsersK * 1000 * defRpu;
}
