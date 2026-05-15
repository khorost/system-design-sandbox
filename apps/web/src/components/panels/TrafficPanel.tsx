import type { EdgeTagTraffic, NodeTagTraffic, TagTraffic } from '@system-design-sandbox/simulation-engine';
import { useEffect, useMemo, useState } from 'react';

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

/** Debounce delay for unit changes and tag removal (ms) */
const STABLE_DELAY_MS = 5000;

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS.default;
}

/* ---- Stable unit formatting ---- */

type RpsUnit = 'M' | 'K' | '';
type BwUnit = 'GB/s' | 'MB/s' | 'KB/s';

function pickRpsUnit(v: number): RpsUnit {
  if (v >= 1_000_000) return 'M';
  if (v >= 1_000) return 'K';
  return '';
}
function fmtRpsU(v: number, unit: RpsUnit): string {
  switch (unit) {
    case 'M': return `${(v / 1e6).toFixed(1)}M/s`;
    case 'K': return `${(v / 1000).toFixed(1)}K/s`;
    default:
      if (v >= 100) return `${v.toFixed(0)}/s`;
      if (v >= 10) return `${v.toFixed(1)}/s`;
      return `${v.toFixed(2)}/s`;
  }
}

function pickBwUnit(kb: number): BwUnit {
  if (kb >= 1024 * 1024) return 'GB/s';
  if (kb >= 1024) return 'MB/s';
  return 'KB/s';
}
function fmtBwU(kb: number, unit: BwUnit): string {
  switch (unit) {
    case 'GB/s': return `${(kb / (1024 * 1024)).toFixed(1)} GB/s`;
    case 'MB/s': return `${(kb / 1024).toFixed(1)} MB/s`;
    default: return `${kb.toFixed(1)} KB/s`;
  }
}

/** Would the value render with 6+ significant digits in the current unit? If so — switch immediately. */
function rpsOverflows(v: number, unit: RpsUnit): boolean {
  switch (unit) {
    case 'M': return false;
    case 'K': return v >= 1_000_000; // 1000K → M
    default: return v >= 10_000;      // 10000 → K
  }
}
function bwOverflows(kb: number, unit: BwUnit): boolean {
  switch (unit) {
    case 'GB/s': return false;
    case 'MB/s': return kb >= 1024 * 1024; // 1024 MB → GB
    default: return kb >= 10_240;           // 10 MB in KB → MB
  }
}

/** Hook: debounce unit changes per direction, but switch immediately on overflow (6+ digits) */
function useStableUnit(rpsVal: number, bwVal: number): { rpsU: RpsUnit; bwU: BwUnit } {
  const wantRps = pickRpsUnit(rpsVal);
  const wantBw = pickBwUnit(bwVal);
  const [locked, setLocked] = useState({ rpsU: wantRps, bwU: wantBw });

  useEffect(() => {
    if (wantRps === locked.rpsU && wantBw === locked.bwU) return;
    const immediate = rpsOverflows(rpsVal, locked.rpsU) || bwOverflows(bwVal, locked.bwU);
    const t = setTimeout(() => setLocked({ rpsU: wantRps, bwU: wantBw }), immediate ? 0 : STABLE_DELAY_MS);
    return () => clearTimeout(t);
  }, [wantRps, wantBw, locked.rpsU, locked.bwU, rpsVal, bwVal]);

  return locked;
}

// Fallback formatters (no unit lock) for simple displays
function fmtRps(v: number): string {
  if (v >= 1_000_000) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/**
 * Merge unique tags from req + resp, keep tags that recently had data for STABLE_DELAY_MS
 * to prevent flickering when a tag temporarily drops to zero.
 */
function useSortedTags(req: Record<string, TagTraffic>, resp: Record<string, TagTraffic>): string[] {
  const currentTags = useMemo(() => {
    return Array.from(new Set([...Object.keys(req), ...Object.keys(resp)])).sort();
  }, [req, resp]);

  const [stableTags, setStableTags] = useState<string[]>(currentTags);

  // Immediately add new tags; delay-remove disappeared tags
  useEffect(() => {
    // Add new tags immediately
    const merged = Array.from(new Set([...stableTags, ...currentTags])).sort();
    if (merged.length !== stableTags.length || merged.some((t, i) => t !== stableTags[i])) {
      setStableTags(merged);
    }
    // Schedule removal of disappeared tags
    const disappeared = stableTags.filter(t => !currentTags.includes(t));
    if (disappeared.length === 0) return;
    const timer = setTimeout(() => {
      setStableTags(prev => prev.filter(t => currentTags.includes(t)));
    }, STABLE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTags.join(',')]);

  return stableTags;
}

function fmtErrRate(failed: number, total: number): string {
  if (total <= 0) return '-';
  const pct = (failed / total) * 100;
  if (pct <= 0) return '0%';
  if (pct >= 100) return '100%';
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function cellVal(t: TagTraffic | undefined, mode: ViewMode, rpsU: RpsUnit, bwU: BwUnit): string {
  if (!t) return '-';
  switch (mode) {
    case 'rps': return fmtRpsU(t.rps, rpsU);
    case 'bw': return fmtBwU(t.bytesPerSec, bwU);
    case 'err': return fmtErrRate(t.failedRps, t.rps);
  }
}

function totalVal(entries: Record<string, TagTraffic>, mode: ViewMode, rpsU: RpsUnit, bwU: BwUnit): string {
  const vals = Object.values(entries);
  if (vals.length === 0) return '-';
  switch (mode) {
    case 'rps': return fmtRpsU(vals.reduce((s, t) => s + t.rps, 0), rpsU);
    case 'bw': return fmtBwU(vals.reduce((s, t) => s + t.bytesPerSec, 0), bwU);
    case 'err': {
      const totalRps = vals.reduce((s, t) => s + t.rps, 0);
      const totalFailed = vals.reduce((s, t) => s + t.failedRps, 0);
      return fmtErrRate(totalFailed, totalRps);
    }
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

  // Separate stable units per direction (req vs resp)
  const reqVals = Object.values(req);
  const respVals = Object.values(resp);
  const reqMaxRps = reqVals.reduce((m, t) => Math.max(m, t.rps), 0);
  const reqMaxBw = reqVals.reduce((m, t) => Math.max(m, t.bytesPerSec), 0);
  const respMaxRps = respVals.reduce((m, t) => Math.max(m, t.rps), 0);
  const respMaxBw = respVals.reduce((m, t) => Math.max(m, t.bytesPerSec), 0);
  const reqU = useStableUnit(reqMaxRps, reqMaxBw);
  const respU = useStableUnit(respMaxRps, respMaxBw);

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
            <td className={tdClass}>{cellVal(req[tag], mode, reqU.rpsU, reqU.bwU)}</td>
            <td className={tdClass}>{cellVal(resp[tag], mode, respU.rpsU, respU.bwU)}</td>
          </tr>
        ))}
        <tr className="bg-blue-500/8 border-t border-blue-500/20">
          <td className="px-2 py-1.5 text-xs font-semibold text-blue-400">Total</td>
          <td className={tdTotalClass}>{totalVal(req, mode, reqU.rpsU, reqU.bwU)}</td>
          <td className={tdTotalClass}>{totalVal(resp, mode, respU.rpsU, respU.bwU)}</td>
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
  const cacheStats = useSimulationStore((s) => s.nodeCacheStats[nodeId]);
  const isCdn = node?.data?.componentType === 'cdn';

  const replicas = (node?.data?.config?.replicas as number) ?? 1;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-bold text-slate-200">{label}</h4>
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-[rgba(138,167,198,0.14)] bg-[rgba(10,18,28,0.6)] px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Inst</div>
          <div className="mt-0.5 text-sm font-mono font-semibold text-slate-100">{replicas}</div>
        </div>
        <div className="flex-1 rounded-lg border border-[rgba(138,167,198,0.14)] bg-[rgba(10,18,28,0.6)] px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Load</div>
          <div className={`mt-0.5 text-sm font-mono font-semibold ${compUtil > 0.95 ? 'text-rose-300' : compUtil > 0.8 ? 'text-amber-300' : 'text-slate-100'}`}>{(compUtil * 100).toFixed(0)}%</div>
        </div>
        <div className="flex-1 rounded-lg border border-[rgba(138,167,198,0.14)] bg-[rgba(10,18,28,0.6)] px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Conn</div>
          <div className={`mt-0.5 text-sm font-mono font-semibold ${connUtil > 0.95 ? 'text-rose-300' : connUtil > 0.8 ? 'text-amber-300' : 'text-slate-100'}`}>{(connUtil * 100).toFixed(0)}%</div>
        </div>
      </div>

      {isCdn && cacheStats && Object.keys(cacheStats).length > 0 && (
        <CacheStatsTable stats={cacheStats} config={node?.data?.config} />
      )}

      <TrafficTable req={traffic.incoming} resp={traffic.responseOutgoing} mode={mode} />
    </div>
  );
}

function CacheStatsTable({ stats, config }: { stats: Record<string, import('@system-design-sandbox/simulation-engine').CacheTagStats>; config?: Record<string, unknown> }) {
  const cacheRules = (config?.cacheRules as Array<{ tag: string; capacityMb: number }> | undefined) ?? [];
  const tags = Object.keys(stats).sort();
  const totalHits = tags.reduce((s, t) => s + stats[t].hits, 0);
  const totalMisses = tags.reduce((s, t) => s + stats[t].misses, 0);
  const totalRate = (totalHits + totalMisses) > 0 ? totalHits / (totalHits + totalMisses) : 0;

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 mb-1">Cache</div>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 px-1 py-1 text-left">Tag</th>
            <th className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 px-1 py-1 text-right">Hit/s</th>
            <th className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 px-1 py-1 text-right">Miss/s</th>
            <th className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 px-1 py-1 text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => {
            const s = stats[tag];
            const rule = cacheRules.find(r => r.tag === tag);
            const hitColor = s.hitRate > 0.9 ? 'text-emerald-300' : s.hitRate > 0.7 ? 'text-amber-300' : 'text-rose-300';
            return (
              <tr key={tag} className="border-b border-[rgba(138,167,198,0.08)]">
                <td className="px-1 py-1 font-medium text-slate-200">
                  {tag}
                  {rule && <span className="ml-1 text-[9px] text-slate-500">{rule.capacityMb}MB</span>}
                </td>
                <td className="px-1 py-1 text-right font-mono text-emerald-400">{fmtRps(s.hits)}</td>
                <td className="px-1 py-1 text-right font-mono text-rose-400">{fmtRps(s.misses)}</td>
                <td className={`px-1 py-1 text-right font-mono font-semibold ${hitColor}`}>{(s.hitRate * 100).toFixed(0)}%</td>
              </tr>
            );
          })}
          {tags.length > 1 && (
            <tr className="border-t border-blue-500/20">
              <td className="px-1 py-1 font-semibold text-blue-400">Total</td>
              <td className="px-1 py-1 text-right font-mono font-semibold text-emerald-300">{fmtRps(totalHits)}</td>
              <td className="px-1 py-1 text-right font-mono font-semibold text-rose-300">{fmtRps(totalMisses)}</td>
              <td className={`px-1 py-1 text-right font-mono font-semibold ${totalRate > 0.9 ? 'text-emerald-300' : totalRate > 0.7 ? 'text-amber-300' : 'text-rose-300'}`}>{(totalRate * 100).toFixed(0)}%</td>
            </tr>
          )}
        </tbody>
      </table>
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
