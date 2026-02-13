import { useEffect, useState } from 'react';
import { useSimulationStore } from '../../store/simulationStore.ts';
import { useCanvasStore } from '../../store/canvasStore.ts';

export function DebugStats() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '*') setVisible((v) => !v);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!visible) return null;

  return <DebugStatsPanel />;
}

function DebugStatsPanel() {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const metrics = useSimulationStore((s) => s.currentMetrics);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  const stats = metrics?.engineStats;

  const tickBudgetPct = stats ? (stats.tickDurationMs / 100) * 100 : 0;
  const tickColor = tickBudgetPct > 80 ? 'text-red-400' : tickBudgetPct > 50 ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="absolute bottom-2 left-2 z-50 bg-black/80 backdrop-blur-sm border border-slate-600/50 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-none pointer-events-none min-w-[190px]">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Engine Debug [*]</div>

      <Row label="Graph" value={`${nodes.length} nodes / ${edges.length} edges`} />
      <Row label="Sim" value={isRunning ? 'RUNNING' : 'STOPPED'} valueClass={isRunning ? 'text-green-400' : 'text-slate-500'} />

      {stats && (
        <>
          <Sep />
          <Row label="Tick #" value={stats.tickCount} />
          <Row label="Tick time" value={`${stats.tickDurationMs.toFixed(2)} ms`} valueClass={tickColor} />
          <Row label="Budget used" value={`${tickBudgetPct.toFixed(1)}%`} valueClass={tickColor} />
          <Sep />
          <Row label="Active reqs" value={stats.activeRequests.toLocaleString()} valueClass={stats.activeRequests > 50_000 ? 'text-amber-400' : ''} />
          <Row label="Generated" value={`${stats.requestsGenerated}/tick`} />
          <Row label="Completed" value={`${stats.requestsCompleted}/tick`} />
        </>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function Sep() {
  return <div className="border-t border-slate-700 my-1" />;
}
