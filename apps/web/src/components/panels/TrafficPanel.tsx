import type { EdgeTagTraffic, NodeTagTraffic, TagTraffic } from '@system-design-sandbox/simulation-engine';
import { useState, useRef } from 'react';

import { useCanvasStore } from '../../store/canvasStore.ts';
import { useSimulationStore } from '../../store/simulationStore.ts';

const TAG_COLORS: Record<string, string> = {
  read: 'text-green-400',
  write: 'text-orange-400',
  api: 'text-blue-400',
  web: 'text-cyan-400',
  content: 'text-purple-400',
  search: 'text-yellow-400',
  default: 'text-slate-400',
};

type ViewMode = 'rps' | 'bw' | 'err';

const VIEW_LABELS: Record<ViewMode, string> = { rps: 'RPS', bw: 'MB/s', err: '% Err' };

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS.default;
}

function fmtRps(v: number): string {
  if (v >= 1_000_000) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function fmtBw(kbps: number): string {
  if (kbps >= 1_048_576) return `${(kbps / 1_048_576).toFixed(1)} GB/s`;
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
  if (kbps >= 100) return `${kbps.toFixed(0)} KB/s`;
  return `${kbps.toFixed(1)} KB/s`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** Merge all unique tags from req + resp, sorted alphabetically, stable across renders. */
function useSortedTags(req: Record<string, TagTraffic>, resp: Record<string, TagTraffic>): string[] {
  const prevRef = useRef<string[]>([]);
  const tags = Array.from(new Set([...Object.keys(req), ...Object.keys(resp)])).sort();
  // Stable: only update if set changed
  const prev = prevRef.current;
  if (tags.length !== prev.length || tags.some((t, i) => t !== prev[i])) {
    prevRef.current = tags;
    return tags;
  }
  return prev;
}

function cellVal(t: TagTraffic | undefined, mode: ViewMode): string {
  if (!t) return '-';
  switch (mode) {
    case 'rps': return `${fmtRps(t.rps)}/s`;
    case 'bw': return fmtBw(t.bytesPerSec);
    case 'err': return '-'; // error rate not tracked per-tag yet
  }
}

function totalVal(entries: Record<string, TagTraffic>, mode: ViewMode): string {
  const vals = Object.values(entries);
  if (vals.length === 0) return '-';
  switch (mode) {
    case 'rps': return `${fmtRps(vals.reduce((s, t) => s + t.rps, 0))}/s`;
    case 'bw': return fmtBw(vals.reduce((s, t) => s + t.bytesPerSec, 0));
    case 'err': return '-';
  }
}

const thClass = 'text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 px-2 py-1.5 text-right';
const tdClass = 'px-2 py-1.5 text-xs font-mono text-right text-slate-200';
const tdTotalClass = 'px-2 py-1.5 text-xs font-mono text-right text-blue-300 font-semibold';

function TrafficTable({ req, resp, mode }: {
  req: Record<string, TagTraffic>;
  resp: Record<string, TagTraffic>;
  mode: ViewMode;
}) {
  const tags = useSortedTags(req, resp);
  if (tags.length === 0) return <p className="text-xs text-slate-500">No traffic data</p>;

  return (
    <table className="w-full border-collapse table-fixed">
      <colgroup>
        <col />
        <col className="w-[5.5rem]" />
        <col className="w-[5.5rem]" />
      </colgroup>
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 px-2 py-1.5 text-left">Tag</th>
          <th className={thClass}>Req</th>
          <th className={thClass}>Resp</th>
        </tr>
      </thead>
      <tbody>
        {tags.map((tag) => (
          <tr key={tag} className="border-b border-[rgba(138,167,198,0.08)]">
            <td className={`px-2 py-1.5 text-xs font-medium ${getTagColor(tag)}`}>{tag}</td>
            <td className={tdClass}>{cellVal(req[tag], mode)}</td>
            <td className={tdClass}>{cellVal(resp[tag], mode)}</td>
          </tr>
        ))}
        <tr className="bg-blue-500/8 border-t border-blue-500/20">
          <td className="px-2 py-1.5 text-xs font-semibold text-blue-400">Total</td>
          <td className={tdTotalClass}>{totalVal(req, mode)}</td>
          <td className={tdTotalClass}>{totalVal(resp, mode)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ViewToggle({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const modes: ViewMode[] = ['rps', 'bw', 'err'];
  return (
    <div className="flex gap-0.5 rounded-lg border border-[var(--color-border)] bg-[rgba(6,13,19,0.52)] p-0.5">
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] rounded-md transition-colors ${
            mode === m
              ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)] shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {VIEW_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

function NodeTrafficView({ nodeId, traffic, mode }: { nodeId: string; traffic: NodeTagTraffic; mode: ViewMode }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const node = nodes.find((n) => n.id === nodeId);
  const label = node?.data?.label || nodeId;
  const currentMetrics = useSimulationStore((s) => s.currentMetrics);
  const connUtil = currentMetrics?.connectionUtilization?.[nodeId] ?? 0;
  const compUtil = currentMetrics?.componentUtilization?.[nodeId] ?? 0;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold text-slate-200">{label}</h4>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-[rgba(138,167,198,0.14)] bg-[rgba(10,18,28,0.6)] px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Load</div>
          <div className={`mt-0.5 text-sm font-mono font-semibold ${compUtil > 0.8 ? 'text-amber-300' : compUtil > 0.95 ? 'text-rose-300' : 'text-slate-100'}`}>{(compUtil * 100).toFixed(0)}%</div>
        </div>
        <div className="flex-1 rounded-lg border border-[rgba(138,167,198,0.14)] bg-[rgba(10,18,28,0.6)] px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Conn</div>
          <div className={`mt-0.5 text-sm font-mono font-semibold ${connUtil > 0.8 ? 'text-amber-300' : connUtil > 0.95 ? 'text-rose-300' : 'text-slate-100'}`}>{(connUtil * 100).toFixed(0)}%</div>
        </div>
      </div>
      <TrafficTable req={traffic.incoming} resp={traffic.responseOutgoing} mode={mode} />
    </div>
  );
}

function EdgeTrafficView({ edgeId, traffic, mode }: { edgeId: string; traffic: EdgeTagTraffic; mode: ViewMode }) {
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const edge = edges.find((e) => e.id === edgeId);
  const srcNode = nodes.find((n) => n.id === edge?.source);
  const tgtNode = nodes.find((n) => n.id === edge?.target);
  const srcLabel = srcNode?.data?.label || edge?.source || '?';
  const tgtLabel = tgtNode?.data?.label || edge?.target || '?';

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold text-slate-200">
        {srcLabel} <span className="text-slate-400 mx-1">&rarr;</span> {tgtLabel}
      </h4>
      <TrafficTable req={traffic.forward} resp={traffic.response} mode={mode} />
    </div>
  );
}

export function TrafficPanel() {
  const [mode, setMode] = useState<ViewMode>('rps');
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const nodeTagTraffic = useSimulationStore((s) => s.nodeTagTraffic);
  const edgeTagTraffic = useSimulationStore((s) => s.edgeTagTraffic);

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Traffic</h3>
      <ViewToggle mode={mode} setMode={setMode} />
    </div>
  );

  if (!isRunning) {
    return (
      <div className="p-4">
        {header}
        <p className="text-sm text-slate-400">Start simulation to see per-tag traffic stats.</p>
      </div>
    );
  }

  if (selectedEdgeId) {
    const traffic = edgeTagTraffic[selectedEdgeId];
    if (!traffic) {
      return <div className="p-4">{header}<p className="text-sm text-slate-400">No traffic data for this edge yet.</p></div>;
    }
    return (
      <div className="p-4 overflow-y-auto">
        {header}
        <EdgeTrafficView edgeId={selectedEdgeId} traffic={traffic} mode={mode} />
      </div>
    );
  }

  if (selectedNodeId) {
    const traffic = nodeTagTraffic[selectedNodeId];
    if (!traffic) {
      return <div className="p-4">{header}<p className="text-sm text-slate-400">No traffic data for this node yet.</p></div>;
    }
    return (
      <div className="p-4 overflow-y-auto">
        {header}
        <NodeTrafficView nodeId={selectedNodeId} traffic={traffic} mode={mode} />
      </div>
    );
  }

  return (
    <div className="p-4">
      {header}
      <p className="text-sm text-slate-400">Select a node or edge to see per-tag traffic breakdown.</p>
    </div>
  );
}
