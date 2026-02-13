import type { ReactNode } from 'react';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { EdgeLabelMode } from '../../../store/canvasStore.ts';

/* ── tiny inline SVG icons (16×16, stroke-based) ── */
const s = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const IconSave = <svg {...s}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IconLoad = <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconTrash = <svg {...s}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconTag = <svg {...s}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;

const labelByMode: Record<EdgeLabelMode, string> = {
  auto: 'Auto',
  protocol: 'Protocol',
  traffic: 'Traffic',
  full: 'Full',
};

const tooltipByMode: Record<EdgeLabelMode, string> = {
  auto: 'Labels: Auto — show on select',
  protocol: 'Labels: Protocol & latency',
  traffic: 'Labels: Throughput & bandwidth',
  full: 'Labels: All info',
};

function TbBtn({ onClick, title, icon, children, variant = 'default' }: {
  onClick: () => void;
  title?: string;
  icon: ReactNode;
  children: ReactNode;
  variant?: 'default' | 'danger';
}) {
  const cls = variant === 'danger'
    ? 'px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors inline-flex items-center gap-1'
    : 'px-2 py-1 text-xs text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors inline-flex items-center gap-1';
  return (
    <button onClick={onClick} title={title} className={cls}>
      {icon}{children}
    </button>
  );
}

export function Toolbar() {
  const save = useCanvasStore((s) => s.save);
  const load = useCanvasStore((s) => s.load);
  const clear = useCanvasStore((s) => s.clear);
  const edgeLabelMode = useCanvasStore((s) => s.edgeLabelMode);
  const cycleEdgeLabelMode = useCanvasStore((s) => s.cycleEdgeLabelMode);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 shadow-lg">
      <span className="text-sm font-bold text-slate-200 mr-2">System Design Sandbox</span>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <TbBtn onClick={save} title="Save to localStorage" icon={IconSave}>Save</TbBtn>
      <TbBtn onClick={load} title="Load from localStorage" icon={IconLoad}>Load</TbBtn>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <TbBtn onClick={cycleEdgeLabelMode} title={tooltipByMode[edgeLabelMode]} icon={IconTag}>
        {labelByMode[edgeLabelMode]}
      </TbBtn>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <TbBtn onClick={clear} title="Clear canvas" icon={IconTrash} variant="danger">Clear</TbBtn>
    </div>
  );
}
