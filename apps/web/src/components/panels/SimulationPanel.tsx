import { useMemo } from 'react';
import { useSimulationStore } from '../../store/simulationStore.ts';
import { useCanvasStore } from '../../store/canvasStore.ts';
import { getDefinition } from '@system-design-sandbox/component-library';
import type { ComponentType as EngineComponentType } from '@system-design-sandbox/simulation-engine';

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
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

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Load Simulation</h3>

      {/* Per-client traffic sources */}
      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Traffic Sources
        </label>
        {clientNodes.length === 0 ? (
          <p className="text-xs text-slate-500 mt-1">
            Add client nodes to canvas to generate traffic
          </p>
        ) : (
          <div className="mt-1.5 space-y-1.5">
            {clientNodes.map((node) => {
              const rps = getClientRps(node.data.componentType, node.data.config);
              return (
                <div
                  key={node.id}
                  className="flex items-center justify-between px-3 py-2 bg-[var(--color-bg)] rounded text-xs"
                >
                  <span className="text-slate-300 truncate">
                    {node.data.icon} {node.data.label}
                  </span>
                  <span className="text-blue-400 font-mono font-semibold ml-2 shrink-0">
                    {formatNumber(rps)}/s
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 rounded border border-blue-500/20 text-xs">
              <span className="text-slate-300 font-semibold">Total RPS</span>
              <span className="text-blue-400 font-mono font-bold">{formatNumber(totalRps)}/s</span>
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">
          Configure RPS per client in Properties
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Load Type
        </label>
        <select
          value={loadType}
          onChange={(e) => setLoadType(e.target.value as 'constant' | 'ramp' | 'spike')}
          className="w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="constant">Constant</option>
          <option value="ramp">Ramp Up</option>
          <option value="spike">Spike (3x bursts)</option>
        </select>
      </div>

      {!isRunning ? (
        <button
          onClick={() => start()}
          disabled={clientNodes.length === 0}
          className={`w-full px-6 py-4 text-base font-bold rounded-lg transition-colors ${
            clientNodes.length === 0
              ? 'bg-slate-500/20 text-slate-500 border border-slate-500/30 cursor-not-allowed'
              : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
          }`}
        >
          Start Simulation
        </button>
      ) : isPaused ? (
        <div className="flex gap-2">
          <button
            onClick={() => resume()}
            className="flex-1 px-4 py-4 text-base font-bold rounded-lg transition-colors bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
          >
            Resume
          </button>
          <button
            onClick={() => stop()}
            className="flex-1 px-4 py-4 text-base font-bold rounded-lg transition-colors bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
          >
            Stop
          </button>
        </div>
      ) : (
        <button
          onClick={() => pause()}
          className="w-full px-6 py-4 text-base font-bold rounded-lg transition-colors bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
        >
          Pause Simulation
        </button>
      )}

      {currentMetrics && (
        <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Live Metrics</h4>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="P50" value={`${currentMetrics.latencyP50.toFixed(1)}ms`} />
            <MetricCard label="P95" value={`${currentMetrics.latencyP95.toFixed(1)}ms`} />
            <MetricCard label="P99" value={`${currentMetrics.latencyP99.toFixed(1)}ms`} />
            <MetricCard label="Throughput" value={`${formatNumber(currentMetrics.throughput)}/s`} />
            <MetricCard label="Error Rate" value={`${(currentMetrics.errorRate * 100).toFixed(1)}%`} color={currentMetrics.errorRate > 0.05 ? 'text-red-400' : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[var(--color-bg)] rounded px-3 py-2">
      <div className="text-[11px] text-slate-500 uppercase">{label}</div>
      <div className={`text-sm font-mono font-semibold ${color || 'text-slate-200'}`}>{value}</div>
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
