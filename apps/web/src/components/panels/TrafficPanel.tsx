import type { EdgeTagTraffic,NodeTagTraffic, TagTraffic } from '@system-design-sandbox/simulation-engine';

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

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || TAG_COLORS.default;
}

function formatRps(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatBytes(kbPerSec: number): string {
  if (kbPerSec >= 1024) return `${(kbPerSec / 1024).toFixed(1)} MB/s`;
  if (kbPerSec >= 100) return `${kbPerSec.toFixed(0)} KB/s`;
  if (kbPerSec >= 10) return `${kbPerSec.toFixed(1)} KB/s`;
  return `${kbPerSec.toFixed(2)} KB/s`;
}

function TagTable({ title, tags }: { title: string; tags: Record<string, TagTraffic> }) {
  const entries = Object.entries(tags).sort((a, b) => b[1].rps - a[1].rps);
  if (entries.length === 0) return null;

  const totalRps = entries.reduce((s, [, t]) => s + t.rps, 0);
  const totalBytes = entries.reduce((s, [, t]) => s + t.bytesPerSec, 0);

  return (
    <div className="mb-3">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{title}</div>
      <div className="space-y-0.5">
        {entries.map(([tag, traffic]) => (
          <div key={tag} className="flex items-center justify-between px-2 py-1 bg-[var(--color-bg)] rounded text-xs">
            <span className={`font-medium ${getTagColor(tag)}`}>{tag}</span>
            <div className="flex gap-4">
              <span className="text-slate-300 font-mono w-16 text-right">{formatRps(traffic.rps)}/s</span>
              <span className="text-slate-400 font-mono w-20 text-right">{formatBytes(traffic.bytesPerSec)}</span>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between px-2 py-1 bg-blue-500/10 rounded text-xs border border-blue-500/20">
          <span className="font-semibold text-blue-400">Total</span>
          <div className="flex gap-4">
            <span className="text-blue-300 font-mono w-16 text-right">{formatRps(totalRps)}/s</span>
            <span className="text-blue-400/60 font-mono w-20 text-right">{formatBytes(totalBytes)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeTraffic({ nodeId, traffic }: { nodeId: string; traffic: NodeTagTraffic }) {
  const nodes = useCanvasStore((s) => s.nodes);
  const node = nodes.find((n) => n.id === nodeId);
  const label = node?.data?.label || nodeId;

  return (
    <div>
      <h4 className="text-sm font-bold text-slate-200 mb-3">{label}</h4>
      <TagTable title="Incoming (Request)" tags={traffic.incoming} />
      <TagTable title="Outgoing (Request)" tags={traffic.outgoing} />
      <TagTable title="Incoming (Response)" tags={traffic.responseIncoming} />
      <TagTable title="Outgoing (Response)" tags={traffic.responseOutgoing} />
    </div>
  );
}

function EdgeTraffic({ edgeId, traffic }: { edgeId: string; traffic: EdgeTagTraffic }) {
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const edge = edges.find((e) => e.id === edgeId);
  const srcNode = nodes.find((n) => n.id === edge?.source);
  const tgtNode = nodes.find((n) => n.id === edge?.target);
  const srcLabel = srcNode?.data?.label || edge?.source || '?';
  const tgtLabel = tgtNode?.data?.label || edge?.target || '?';

  return (
    <div>
      <h4 className="text-sm font-bold text-slate-200 mb-3">
        {srcLabel} <span className="text-slate-400 mx-1">&rarr;</span> {tgtLabel}
      </h4>
      <TagTable title="Forward Traffic" tags={traffic.forward} />
      <TagTable title="Response Traffic" tags={traffic.response} />
    </div>
  );
}

export function TrafficPanel() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const nodeTagTraffic = useSimulationStore((s) => s.nodeTagTraffic);
  const edgeTagTraffic = useSimulationStore((s) => s.edgeTagTraffic);

  if (!isRunning) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Traffic</h3>
        <p className="text-sm text-slate-400">Start simulation to see per-tag traffic stats.</p>
      </div>
    );
  }

  if (selectedEdgeId) {
    const traffic = edgeTagTraffic[selectedEdgeId];
    if (!traffic) {
      return (
        <div className="p-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Traffic</h3>
          <p className="text-sm text-slate-400">No traffic data for this edge yet.</p>
        </div>
      );
    }
    return (
      <div className="p-4 space-y-2 overflow-y-auto">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Traffic</h3>
        <EdgeTraffic edgeId={selectedEdgeId} traffic={traffic} />
      </div>
    );
  }

  if (selectedNodeId) {
    const traffic = nodeTagTraffic[selectedNodeId];
    if (!traffic) {
      return (
        <div className="p-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Traffic</h3>
          <p className="text-sm text-slate-400">No traffic data for this node yet.</p>
        </div>
      );
    }
    return (
      <div className="p-4 space-y-2 overflow-y-auto">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Traffic</h3>
        <NodeTraffic nodeId={selectedNodeId} traffic={traffic} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Traffic</h3>
      <p className="text-sm text-slate-400">Select a node or edge to see per-tag traffic breakdown.</p>
    </div>
  );
}
