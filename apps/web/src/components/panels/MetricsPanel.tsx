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

export function MetricsPanel() {
  const metricsHistory = useSimulationStore((s) => s.metricsHistory);
  const isRunning = useSimulationStore((s) => s.isRunning);

  if (!isRunning && metricsHistory.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Metrics</h3>
        <p className="text-sm text-slate-500">Start simulation to see real-time metrics.</p>
      </div>
    );
  }

  const data = metricsHistory.map((m, i) => ({
    t: i * 0.1,
    p50: m.latencyP50,
    p95: m.latencyP95,
    p99: m.latencyP99,
    throughput: m.throughput,
    errorRate: m.errorRate * 100,
  }));

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Metrics</h3>

      <div>
        <h4 className="text-xs text-slate-400 uppercase mb-1">Latency (ms)</h4>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="t" tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 13 }}
                labelFormatter={(v) => `${Number(v).toFixed(1)}s`}
              />
              <Line type="monotone" dataKey="p50" stroke="#22c55e" strokeWidth={1.5} dot={false} name="P50" />
              <Line type="monotone" dataKey="p95" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="P95" />
              <Line type="monotone" dataKey="p99" stroke="#ef4444" strokeWidth={1.5} dot={false} name="P99" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="text-xs text-slate-400 uppercase mb-1">Throughput (rps)</h4>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis dataKey="t" tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 13 }}
                labelFormatter={(v) => `${Number(v).toFixed(1)}s`}
              />
              <Line type="monotone" dataKey="throughput" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="RPS" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="text-xs text-slate-400 uppercase mb-1">Error Rate (%)</h4>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <XAxis dataKey="t" tick={false} stroke="#475569" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} stroke="#475569" domain={[0, 'auto']} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 13 }}
                labelFormatter={(v) => `${Number(v).toFixed(1)}s`}
              />
              <Area type="monotone" dataKey="errorRate" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} strokeWidth={1.5} name="Errors %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
