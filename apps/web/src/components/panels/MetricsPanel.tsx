import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CONFIG } from '../../config/constants.ts';
import { useSimulationStore } from '../../store/simulationStore.ts';

const TICK_SEC = CONFIG.SIMULATION.TICK_INTERVAL_SEC;
const WINDOWS = [
  { label: '30s', sec: 30, ticks: 300 },
  { label: '60s', sec: 60, ticks: 600 },
  { label: '5m', sec: 300, ticks: 3000 },
] as const;

const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 13 };
const fmtLabel = (v: ReactNode) => `${Number(v).toFixed(1)}s`;

export function MetricsPanel() {
  const metricsHistory = useSimulationStore((s) => s.metricsHistory);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const currentMetrics = useSimulationStore((s) => s.currentMetrics);
  const [windowIdx, setWindowIdx] = useState(0);

  if (!isRunning && metricsHistory.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Metrics</h3>
        <p className="text-sm text-slate-400">Start simulation to see real-time metrics.</p>
      </div>
    );
  }

  const win = WINDOWS[windowIdx];
  const visible = metricsHistory.slice(-win.ticks);
  const offset = metricsHistory.length - visible.length;

  const data = visible.map((m, i) => ({
    t: +((offset + i) * TICK_SEC).toFixed(1),
    p50: m.latencyP50,
    p95: m.latencyP95,
    p99: m.latencyP99,
    throughput: m.throughput,
    errorRate: m.errorRate * 100,
  }));

  // Fixed X domain: always spans exactly windowSec so pixel-per-step never changes
  const lastT = data.length > 0 ? data[data.length - 1].t : 0;
  const domainMax = Math.max(lastT, win.sec);
  const domainMin = domainMax - win.sec;
  const xDomain: [number, number] = [domainMin, domainMax];

  const btnClass = (active: boolean) =>
    `px-2.5 py-1 text-[11px] rounded-md transition-colors ${
      active
        ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)] border border-[rgba(110,220,255,0.28)]'
        : 'text-slate-400 hover:text-slate-300 border border-transparent'
    }`;

  return (
    <div aria-live="polite" className="p-4 space-y-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.30em] text-[var(--color-accent-warm)]">Observability</div>
          <h3 className="mt-1 text-sm font-bold text-slate-100 uppercase tracking-wider">Metrics</h3>
        </div>
        <div className="flex gap-1 rounded-lg border border-[var(--color-border)] bg-[rgba(6,13,19,0.40)] p-1">
          {WINDOWS.map((w, i) => (
            <button key={w.label} className={btnClass(i === windowIdx)} onClick={() => setWindowIdx(i)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div role="img" aria-label="Latency chart showing P50, P95, and P99 percentiles" className="rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(19,32,44,0.92),rgba(10,17,24,0.96))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-xs text-slate-300 uppercase tracking-[0.22em]">Latency</h4>
            <p className="mt-1 text-[11px] text-slate-500">P50 / P95 / P99 response bands</p>
          </div>
          <div className="rounded-lg border border-[rgba(110,220,255,0.18)] bg-[rgba(110,220,255,0.08)] px-3 py-1 text-right">
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Live P99</div>
            <div className="font-mono text-sm text-[var(--color-accent)]">{(currentMetrics?.latencyP99 ?? 0).toFixed(1)}ms</div>
          </div>
        </div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(151,170,189,0.10)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="t" type="number" domain={xDomain} tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtLabel} />
              <Line type="monotone" dataKey="p50" stroke="#22c55e" strokeWidth={1.5} dot={false} name="P50" isAnimationActive={false} />
              <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="P95" isAnimationActive={false} />
              <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={1.5} dot={false} name="P99" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div role="img" aria-label="Throughput chart showing requests per second" className="rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(19,32,44,0.92),rgba(10,17,24,0.96))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-xs text-slate-300 uppercase tracking-[0.22em]">Throughput</h4>
            <p className="mt-1 text-[11px] text-slate-500">Requests processed per second</p>
          </div>
          <div className="rounded-lg border border-[rgba(59,130,246,0.18)] bg-[rgba(59,130,246,0.08)] px-3 py-1 text-right">
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Live RPS</div>
            <div className="font-mono text-sm text-[#7db7ff]">{(currentMetrics?.throughput ?? 0).toFixed(0)}</div>
          </div>
        </div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(151,170,189,0.10)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="t" type="number" domain={xDomain} tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtLabel} />
              <Line type="monotone" dataKey="throughput" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="RPS" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div role="img" aria-label="Error rate chart showing percentage of failed requests" className="rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(19,32,44,0.92),rgba(10,17,24,0.96))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-xs text-slate-300 uppercase tracking-[0.22em]">Error Rate</h4>
            <p className="mt-1 text-[11px] text-slate-500">Failed request share over time</p>
          </div>
          <div className="rounded-lg border border-[rgba(255,125,125,0.18)] bg-[rgba(255,125,125,0.08)] px-3 py-1 text-right">
            <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Live Errors</div>
            <div className="font-mono text-sm text-[#ff9b9b]">{((currentMetrics?.errorRate ?? 0) * 100).toFixed(1)}%</div>
          </div>
        </div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid stroke="rgba(151,170,189,0.10)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="t" type="number" domain={xDomain} tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" domain={[0, 'auto']} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtLabel} />
              <Area type="monotone" dataKey="errorRate" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={1.5} name="Errors %" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
