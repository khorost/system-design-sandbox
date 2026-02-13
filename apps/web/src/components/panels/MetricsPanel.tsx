import { useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore.ts';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const TICK_SEC = 0.1;
const WINDOWS = [
  { label: '30s', sec: 30, ticks: 300 },
  { label: '60s', sec: 60, ticks: 600 },
  { label: '5m', sec: 300, ticks: 3000 },
] as const;

const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 13 };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fmtLabel = (v: any) => `${Number(v).toFixed(1)}s`;

export function MetricsPanel() {
  const metricsHistory = useSimulationStore((s) => s.metricsHistory);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const [windowIdx, setWindowIdx] = useState(0);

  if (!isRunning && metricsHistory.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Metrics</h3>
        <p className="text-sm text-slate-500">Start simulation to see real-time metrics.</p>
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
    `px-2 py-0.5 text-[11px] rounded transition-colors ${
      active
        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
        : 'text-slate-500 hover:text-slate-300 border border-transparent'
    }`;

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Metrics</h3>
        <div className="flex gap-1">
          {WINDOWS.map((w, i) => (
            <button key={w.label} className={btnClass(i === windowIdx)} onClick={() => setWindowIdx(i)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs text-slate-400 uppercase mb-1">Latency (ms)</h4>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
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

      <div>
        <h4 className="text-xs text-slate-400 uppercase mb-1">Throughput (rps)</h4>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="t" type="number" domain={xDomain} tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtLabel} />
              <Line type="monotone" dataKey="throughput" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="RPS" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="text-xs text-slate-400 uppercase mb-1">Error Rate (%)</h4>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
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
