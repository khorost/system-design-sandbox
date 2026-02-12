import { useSimulationStore } from '../../store/simulationStore.ts';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

const LOG_MIN = 2; // 10^2 = 100
const LOG_MAX = 6; // 10^6 = 1,000,000

export function SimulationPanel() {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const rps = useSimulationStore((s) => s.rps);
  const payloadSizeKb = useSimulationStore((s) => s.payloadSizeKb);
  const loadType = useSimulationStore((s) => s.loadType);
  const currentMetrics = useSimulationStore((s) => s.currentMetrics);
  const setRps = useSimulationStore((s) => s.setRps);
  const setPayloadSizeKb = useSimulationStore((s) => s.setPayloadSizeKb);
  const setLoadType = useSimulationStore((s) => s.setLoadType);
  const start = useSimulationStore((s) => s.start);
  const stop = useSimulationStore((s) => s.stop);

  const logValue = Math.log10(rps);

  const handleRpsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const log = parseFloat(e.target.value);
    setRps(Math.round(Math.pow(10, log)));
  };

  return (
    <div className="p-3 space-y-3">
      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Load Simulation</h3>

      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          RPS: {formatNumber(rps)}
        </label>
        <input
          type="range"
          min={LOG_MIN}
          max={LOG_MAX}
          step={0.01}
          value={logValue}
          onChange={handleRpsChange}
          disabled={isRunning}
          className="w-full mt-1 accent-blue-500"
        />
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>100</span>
          <span>10K</span>
          <span>1M</span>
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Payload Size (KB)
        </label>
        <input
          type="number"
          min={1}
          max={10000}
          value={payloadSizeKb}
          onChange={(e) => setPayloadSizeKb(Number(e.target.value))}
          disabled={isRunning}
          className="w-full mt-1 px-2 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Load Type
        </label>
        <select
          value={loadType}
          onChange={(e) => setLoadType(e.target.value as 'constant' | 'ramp' | 'spike')}
          disabled={isRunning}
          className="w-full mt-1 px-2 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="constant">Constant</option>
          <option value="ramp">Ramp Up</option>
          <option value="spike">Spike</option>
        </select>
      </div>

      <button
        onClick={() => (isRunning ? stop() : start())}
        className={`w-full px-3 py-2 text-xs font-semibold rounded transition-colors ${
          isRunning
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
            : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
        }`}
      >
        {isRunning ? 'Stop Simulation' : 'Start Simulation'}
      </button>

      {currentMetrics && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)]">
          <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Live Metrics</h4>
          <div className="grid grid-cols-2 gap-1.5">
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
    <div className="bg-[var(--color-bg)] rounded px-2 py-1.5">
      <div className="text-[9px] text-slate-500 uppercase">{label}</div>
      <div className={`text-xs font-mono font-semibold ${color || 'text-slate-200'}`}>{value}</div>
    </div>
  );
}
