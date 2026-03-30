import type { ServiceNodeMetrics } from '@system-design-sandbox/simulation-engine';
import { Handle, type NodeProps, Position, useUpdateNodeInternals } from '@xyflow/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useCanvasStore } from '../../../store/canvasStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import type { ComponentNode, ServiceContainerConfig } from '../../../types/index.ts';

// ── Icons for each block type ─────────────────────────────────────────────────

const BLOCK_ICONS: Record<string, string> = {
  router:    '→',
  consumer:  '✉',
  db_pool:   '⇄',
  persistent:'⚡',
  producer:  '📤',
  ondemand:  '🌐',
  ratelimit: '🚦',
};

// ── Util state ────────────────────────────────────────────────────────────────

type UtilBar = { pct: number; color: string };

function getUtilBar(util: number): UtilBar {
  if (util > 0.85) return { pct: util, color: '#f87171' };
  if (util > 0.6)  return { pct: util, color: '#fbbf24' };
  if (util > 0.05) return { pct: util, color: '#22c55e' };
  return { pct: 0, color: '#22c55e' };
}

// ── Block row descriptor ──────────────────────────────────────────────────────

interface BlockRow {
  kind: string;
  id: string;
  label: string;
  handleId: string;
  handleType: 'target' | 'source';
}

function buildBlockRows(cfg: ServiceContainerConfig): BlockRow[] {
  const rows: BlockRow[] = [];
  for (const p of cfg.pipelines) {
    if (p.trigger.kind === 'router') {
      rows.push({ kind: 'router', id: `router-${p.id}`, label: `${p.trigger.protocol}:${p.trigger.port}`, handleId: `router:${p.id}`, handleType: 'target' });
    }
  }
  for (const p of cfg.pipelines) {
    if (p.trigger.kind === 'consumer') {
      rows.push({ kind: 'consumer', id: `consumer-${p.id}`, label: p.trigger.topic || 'consumer', handleId: `consumer:${p.id}`, handleType: 'target' });
    }
  }
  for (const d of cfg.dbPools)        rows.push({ kind: 'db_pool',   id: `dbpool-${d.id}`,     label: d.label,        handleId: `dbpool:${d.id}`,     handleType: 'source' });
  for (const p of cfg.persistentConns) rows.push({ kind: 'persistent', id: `persistent-${p.id}`, label: p.label,        handleId: `persistent:${p.id}`, handleType: 'source' });
  for (const p of cfg.producers)       rows.push({ kind: 'producer',   id: `producer-${p.id}`,   label: p.topic||p.label,handleId: `producer:${p.id}`,   handleType: 'source' });
  for (const o of cfg.onDemandConns)   rows.push({ kind: 'ondemand',   id: `ondemand-${o.id}`,   label: o.label,        handleId: `ondemand:${o.id}`,   handleType: 'source' });
  // Rate-limiter → Redis connection (only when RL is enabled and Redis is selected)
  if (cfg.rateLimitEnabled && cfg.rateLimitRedisNodeId) {
    rows.push({ kind: 'ratelimit', id: 'ratelimit-redis', label: 'RL→Redis', handleId: 'ratelimit-redis', handleType: 'source' });
  }
  return rows;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BORDER_COLOR = '#475569';
const BG_COLOR     = '#1e293b';
const ACCENT       = '#7ddcff';

// ── Handle alignment hook ─────────────────────────────────────────────────────
// Measures each block-row's vertical center and returns it as a %-based top value
// so handles are pixel-accurate aligned with their corresponding rows.

function useHandleAlignment(rowCount: number, nodeId: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs      = useRef(new Map<string, HTMLElement>());
  const [tops, setTops] = useState<Record<string, string>>({});
  const updateNodeInternals = useUpdateNodeInternals();

  const setRowRef = useCallback(
    (handleId: string) => (el: HTMLElement | null) => {
      if (el) rowRefs.current.set(handleId, el);
      else    rowRefs.current.delete(handleId);
    },
    [],
  );

  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const cBox = c.getBoundingClientRect();
    if (cBox.height < 4) return;
    const next: Record<string, string> = {};
    for (const [id, el] of rowRefs.current) {
      const box = el.getBoundingClientRect();
      const pct = ((box.top - cBox.top + box.height / 2) / cBox.height) * 100;
      next[id] = `${Math.max(2, Math.min(98, pct)).toFixed(1)}%`;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTops(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [rowCount]); // rowCount change triggers re-measurement; rowRefs/containerRef are stable refs

  // After handle CSS positions are committed to the DOM, tell React Flow to
  // re-measure handle bounding boxes so edges connect at the correct points.
  // Must run AFTER the browser paints and React Flow processes its own updates,
  // hence requestAnimationFrame inside useEffect.
  useEffect(() => {
    if (Object.keys(tops).length > 0) {
      const raf = requestAnimationFrame(() => {
        updateNodeInternals(nodeId);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [tops, nodeId, updateNodeInternals]);

  return { containerRef, setRowRef, tops };
}

// ── Handle rendering helpers ──────────────────────────────────────────────────

/** Compact port label that floats OUTSIDE the node boundary at each handle's height.
 *  Positioned fully ABOVE the handle center so it never sits on the connection line.
 *  zIndex:10 ensures it renders on top of edge SVGs when they cross. */
function PortLabel({ top, side, label }: { top: string; side: 'left' | 'right'; label: string }) {
  if (!top) return null;
  return (
    <span
      className="pointer-events-none absolute font-mono whitespace-nowrap"
      style={{
        top,
        ...(side === 'left'
          ? { right: 'calc(100% + 6px)', textAlign: 'right' }
          : { left:  'calc(100% + 6px)', textAlign: 'left'  }),
        // translateY(-100%) puts the label bottom at the handle center;
        // the extra -4px lifts it above any edge line that crosses through.
        transform: 'translateY(calc(-100% - 4px))',
        zIndex: 10,
        fontSize: 7,
        lineHeight: 1,
        color: side === 'left' ? 'rgba(109,215,216,0.65)' : 'rgba(251,191,36,0.65)',
        background: 'rgba(7,12,19,0.82)',
        border: `1px solid ${side === 'left' ? 'rgba(109,215,216,0.25)' : 'rgba(251,191,36,0.25)'}`,
        borderRadius: 2,
        padding: '1px 3px',
        maxWidth: 70,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
  );
}

/** index / total are used for the initial fallback position (before layout measurement),
 *  distributing handles evenly so no two ports collide at 50% on first render. */
function TargetHandle({ row, top, index, total, volumetric }: { row: BlockRow; top: string; index: number; total: number; volumetric: boolean }) {
  const fallback = `${((index + 1) / (total + 1)) * 100}%`;
  const t = top || fallback;
  return (
    <>
      <Handle
        id={row.handleId}
        type="target"
        position={Position.Left}
        title={row.label}
        style={{
          top: t,
          background: 'rgba(109,215,216,0.80)',
          border: '1.5px solid rgba(167,243,208,0.75)',
          width: 9, height: 9,
          borderRadius: '50%',
          boxShadow: volumetric ? '0 2px 6px rgba(5,10,18,0.42)' : undefined,
        }}
      />
      <PortLabel top={t} side="left" label={row.label} />
    </>
  );
}

function SourceHandle({ row, top, index, total, volumetric }: { row: BlockRow; top: string; index: number; total: number; volumetric: boolean }) {
  const fallback = `${((index + 1) / (total + 1)) * 100}%`;
  const t = top || fallback;
  return (
    <>
      <Handle
        id={row.handleId}
        type="source"
        position={Position.Right}
        title={row.label}
        style={{
          top: t,
          background: 'rgba(251,191,36,0.82)',
          border: '1.5px solid rgba(253,224,71,0.72)',
          width: 10, height: 10,
          borderRadius: 2,
          // translate(50%,-50%) keeps the diamond center exactly at the node boundary;
          // rotate(45deg) makes it a diamond shape.
          transform: 'translate(50%, -50%) rotate(45deg)',
          boxShadow: volumetric ? '0 2px 6px rgba(5,10,18,0.42)' : undefined,
        }}
      />
      <PortLabel top={t} side="right" label={row.label} />
    </>
  );
}

// ── Expanded view ─────────────────────────────────────────────────────────────

function ExpandedView({ id, data, selected, cfg, displayMode }: {
  id: string;
  data: ComponentNode['data'];
  cfg: ServiceContainerConfig;
  selected: boolean;
  displayMode: '2d' | '3d';
}) {
  const selectNode      = useCanvasStore(s => s.selectNode);
  const updateNodeConfig = useCanvasStore(s => s.updateNodeConfig);

  const allRows      = buildBlockRows(cfg);
  const targetHandles = allRows.filter(r => r.handleType === 'target');
  const sourceHandles = allRows.filter(r => r.handleType === 'source');

  const displayName = ((data.config.name as string | undefined)?.trim()) || data.label;
  const replicas    = (data.config.replicas as number) ?? 1;
  const frameBorder = selected ? ACCENT : BORDER_COLOR;
  const is3d = displayMode === '3d';
  const depthX = 14;
  const depthY = 14;

  const { containerRef, setRowRef, tops } = useHandleAlignment(allRows.length, id);

  // Returns the handleId for a pipeline's trigger
  const pipelineHandleId = (p: ServiceContainerConfig['pipelines'][number]) =>
    `${p.trigger.kind === 'router' ? 'router' : 'consumer'}:${p.id}`;

  return (
    <div
      ref={containerRef}
      onClick={() => selectNode(id)}
      className="cursor-pointer transition-all relative overflow-visible"
    >
      {is3d && (
        <>
          <div
            className="pointer-events-none absolute z-0"
            style={{
              left: 0,
              right: 0,
              bottom: -depthY,
              height: depthY + 1,
              background: `linear-gradient(0deg, ${frameBorder}50, ${frameBorder}28)`,
              transform: 'skewX(45deg)',
              transformOrigin: 'top left',
            }}
          />
          <div
            className="pointer-events-none absolute z-0"
            style={{
              bottom: depthX - depthY,
              right: -depthX,
              top: 0,
              width: depthX + 1,
              background: `linear-gradient(0deg, ${frameBorder}30, rgba(6,10,18,0.55) 50%, ${frameBorder}18)`,
              transform: 'skewY(45deg)',
              transformOrigin: 'bottom left',
            }}
          />
          <div
            className="pointer-events-none absolute z-[-1]"
            style={{
              inset: 0,
              transform: `translate(${depthX * 0.5}px, ${depthY + 4}px)`,
              borderRadius: 10,
              background: 'rgba(0,4,10,0.45)',
              filter: 'blur(14px)',
            }}
          />
        </>
      )}
      <div
        className="relative z-[1] rounded-lg"
        style={{
          minWidth: 300,
          background: is3d
            ? `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 40%, rgba(4,8,15,0.06) 100%), ${BG_COLOR}`
            : `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.08)), ${BG_COLOR}`,
          border: `1.5px solid ${frameBorder}`,
          boxShadow: selected
            ? (is3d
              ? '0 0 0 2px rgba(125,220,255,0.72), 0 0 0 5px rgba(110,220,255,0.12), 0 14px 26px rgba(3,8,14,0.34)'
              : `0 0 0 2px rgba(125,220,255,0.72), 0 0 0 5px rgba(110,220,255,0.12), 0 0 20px rgba(92,141,255,0.22)`)
            : (is3d ? `0 ${depthY + 4}px 22px rgba(3,8,14,0.30)` : '0 8px 16px rgba(3,8,14,0.18)'),
        }}
      >
        {selected && (
          <div className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(244,251,255,0.22)' }} />
        )}

        {/* Handles — aligned to their pipeline / resource rows */}
        {targetHandles.map((row, idx) => (
          <TargetHandle key={row.handleId} row={row} top={tops[row.handleId] ?? ''} index={idx} total={targetHandles.length} volumetric={is3d} />
        ))}
        {sourceHandles.map((row, idx) => (
          <SourceHandle key={row.handleId} row={row} top={tops[row.handleId] ?? ''} index={idx} total={sourceHandles.length} volumetric={is3d} />
        ))}

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-base leading-none">⚙</span>
          <span className="text-sm font-semibold leading-tight truncate flex-1" style={{ color: '#edf4fb' }}>
            {displayName}
          </span>
          {replicas > 1 && (
            <span className="shrink-0 rounded border px-1 py-px font-mono text-[9px] font-bold leading-none"
              style={{ color: ACCENT, background: 'rgba(110,220,255,0.10)', borderColor: 'rgba(110,220,255,0.25)' }}>
              ×{replicas}
            </span>
          )}
          <span className="text-[8px] font-mono text-slate-500 mr-1">
            {cfg.internalLatency ?? 2}μs internal
          </span>
          <button
            onClick={e => { e.stopPropagation(); updateNodeConfig(id, { ...data.config, collapsed: true }); }}
            className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors"
            style={{ color: BORDER_COLOR, background: BORDER_COLOR + '20' }}
            title="Collapse service"
          >⊟</button>
        </div>

        {/* Pipelines — each block gets a ref for handle alignment */}
        <div className="px-3 pt-2 pb-1 space-y-2">
        <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600 font-semibold">Pipelines</div>
        {cfg.pipelines.map(pipeline => (
          <div
            key={pipeline.id}
            ref={el => setRowRef(pipelineHandleId(pipeline))(el)}
            className="rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.15)] p-1.5"
          >
            <div className="text-[9px] font-mono text-slate-400 mb-1 truncate">{pipeline.label}</div>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
                style={{ background: 'rgba(109,215,216,0.12)', border: '1px solid rgba(109,215,216,0.25)', color: '#6dd7d8' }}>
                {pipeline.trigger.kind === 'router'
                  ? `${pipeline.trigger.protocol}:${pipeline.trigger.port}`
                  : `✉ ${pipeline.trigger.topic || 'consumer'}`}
              </div>
              {pipeline.steps.map((step, si) => (
                <div key={step.id} className="flex items-center gap-1">
                  <span className="text-[8px] text-slate-600">→</span>
                  <div className="px-1.5 py-0.5 rounded text-[9px] font-mono"
                    style={{ background: 'rgba(71,85,105,0.3)', border: '1px solid rgba(71,85,105,0.5)', color: '#94a3b8' }}>
                    {step.description || `step${si + 1}`}
                    <span className="text-[8px] text-slate-500 ml-1">{step.processingDelay}ms</span>
                  </div>
                </div>
              ))}
              {pipeline.steps.at(-1)?.response?.kind === 'sync' && (
                <div className="flex items-center gap-1">
                  <span className="text-[8px] text-slate-600">→</span>
                  <div className="px-1 py-0.5 rounded text-[8px] text-slate-500"
                    style={{ border: '1px solid rgba(71,85,105,0.3)' }}>
                    {(pipeline.steps.at(-1)?.response as { kind: 'sync'; responseSize: number } | undefined)?.responseSize ?? 0.5}KB
                  </div>
                </div>
              )}
              {pipeline.steps.at(-1)?.response?.kind === 'async' && (
                <span className="text-[8px] text-slate-500 italic">→ jobId</span>
              )}
            </div>
          </div>
        ))}
        </div>

      {/* Resources — as rows (consistent with collapsed view, enables per-row handle alignment) */}
        {sourceHandles.length > 0 && (
          <div className="px-3 pt-1 pb-2">
          <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600 font-semibold mb-1">Resources</div>
          <div className="flex flex-col gap-0.5">
            {sourceHandles.map(row => {
              const colors: Record<string, { bg: string; border: string; text: string }> = {
                db_pool:    { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: '#4ade80' },
                persistent: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', text: '#fbbf24' },
                producer:   { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.2)', text: '#a78bfa' },
                ondemand:   { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', text: '#fb923c' },
                ratelimit:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  text: '#f87171' },
              };
              const c = colors[row.kind] ?? colors.ondemand;
              return (
                <div
                  key={row.handleId}
                  ref={el => setRowRef(row.handleId)(el)}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 rounded"
                  style={{ background: c.bg, border: `1px solid ${c.border}` }}
                >
                  <span className="shrink-0 text-[10px]" style={{ color: c.text }}>
                    {BLOCK_ICONS[row.kind]}
                  </span>
                  <span className="text-[9px] font-mono truncate" style={{ color: c.text }}>
                    {row.label}
                  </span>
                </div>
              );
            })}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component (collapsed) ────────────────────────────────────────────────

function estimatePipelineLatencyMs(cfg: ServiceContainerConfig): number {
  if (!cfg.pipelines?.length) return 0;
  const perPipeline = cfg.pipelines.map(p =>
    p.steps.reduce((sum, s) => sum + (s.processingDelay ?? 0.2), 0),
  );
  return perPipeline.reduce((a, b) => a + b, 0) / perPipeline.length;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms >= 1)    return `${ms.toFixed(1)}ms`;
  return `${(ms * 1000).toFixed(0)}μs`;
}

export function ServiceContainerNode({ id, data, selected }: NodeProps<ComponentNode>) {
  const selectNode       = useCanvasStore((s) => s.selectNode);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);
  const displayMode      = useCanvasStore((s) => s.displayMode);
  const ema              = useSimulationStore((s) => s.nodeEma[id]);
  const isRunning        = useSimulationStore((s) => s.isRunning);
  const currentMetrics   = useSimulationStore((s) => s.currentMetrics);
  const internalMetrics: ServiceNodeMetrics | undefined = useSimulationStore((s) => s.serviceInternalMetrics[id]);
  const nodeLatencyP99   = useSimulationStore((s) => s.nodeLatencyP99[id]);

  const cfg           = data.config as unknown as ServiceContainerConfig;
  const displayName   = ((data.config.name as string | undefined)?.trim()) || data.label;
  const replicas      = (data.config.replicas as number) ?? 1;
  const estimatedLatency = estimatePipelineLatencyMs(cfg);
  const isCollapsed   = cfg.collapsed !== false;

  const allRows     = buildBlockRows(cfg);
  const MAX_VISIBLE = 4;
  const visibleRows = allRows.slice(0, MAX_VISIBLE);
  const hiddenCount = allRows.length - MAX_VISIBLE;

  // Only create handles for visible rows (handles for overflow rows require expanding)
  const targetHandles = visibleRows.filter(r => r.handleType === 'target');
  const sourceHandles = visibleRows.filter(r => r.handleType === 'source');

  const { containerRef, setRowRef, tops } = useHandleAlignment(visibleRows.length, id);

  const maxUtil = ema ? Math.max(ema.ema1, ema.ema5, ema.ema30) : 0;
  const bar = isRunning ? getUtilBar(maxUtil) : null;
  const frameBorder = selected ? ACCENT : BORDER_COLOR;
  const is3d = displayMode === '3d';
  const depthX = 14;
  const depthY = 14;

  if (!isCollapsed) {
    return <ExpandedView id={id} data={data} cfg={cfg} selected={selected ?? false} displayMode={displayMode} />;
  }

  return (
    <div
      ref={containerRef}
      onClick={() => selectNode(id)}
      className="cursor-pointer transition-all relative overflow-visible"
    >
      {is3d && (
        <>
          <div
            className="pointer-events-none absolute z-0"
            style={{
              left: 0,
              right: 0,
              bottom: -depthY,
              height: depthY + 1,
              background: `linear-gradient(0deg, ${frameBorder}50, ${frameBorder}28)`,
              transform: 'skewX(45deg)',
              transformOrigin: 'top left',
            }}
          />
          <div
            className="pointer-events-none absolute z-0"
            style={{
              bottom: depthX - depthY,
              right: -depthX,
              top: 0,
              width: depthX + 1,
              background: `linear-gradient(0deg, ${frameBorder}30, rgba(6,10,18,0.55) 50%, ${frameBorder}18)`,
              transform: 'skewY(45deg)',
              transformOrigin: 'bottom left',
            }}
          />
          <div
            className="pointer-events-none absolute z-[-1]"
            style={{
              inset: 0,
              transform: `translate(${depthX * 0.5}px, ${depthY + 4}px)`,
              borderRadius: 10,
              background: 'rgba(0,4,10,0.45)',
              filter: 'blur(14px)',
            }}
          />
        </>
      )}
      <div
        className="relative z-[1] rounded-lg"
        style={{
          minWidth: 200,
          background: is3d
            ? `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 40%, rgba(4,8,15,0.06) 100%), ${BG_COLOR}`
            : `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.08)), ${BG_COLOR}`,
          border: `1px solid ${frameBorder}`,
          boxShadow: selected
            ? (is3d
              ? '0 0 0 2px rgba(125,220,255,0.72), 0 0 0 5px rgba(110,220,255,0.12), 0 14px 26px rgba(3,8,14,0.34)'
              : `0 0 0 2px rgba(125,220,255,0.72), 0 0 0 5px rgba(110,220,255,0.12), 0 0 20px rgba(92,141,255,0.22), 0 10px 20px rgba(3,8,14,0.24)`)
            : (is3d ? `0 ${depthY + 4}px 22px rgba(3,8,14,0.30)` : '0 8px 16px rgba(3,8,14,0.18)'),
        }}
      >
        {selected && (
          <div className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(244,251,255,0.22)' }} />
        )}

        {/* Handles — aligned to their block rows */}
        {targetHandles.map((row, idx) => (
          <TargetHandle key={row.handleId} row={row} top={tops[row.handleId] ?? ''} index={idx} total={targetHandles.length} volumetric={is3d} />
        ))}
        {sourceHandles.map((row, idx) => (
          <SourceHandle key={row.handleId} row={row} top={tops[row.handleId] ?? ''} index={idx} total={sourceHandles.length} volumetric={is3d} />
        ))}

        {/* Header */}
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span className="text-base leading-none">⚙</span>
        <span className="text-sm font-semibold leading-tight truncate flex-1" style={{ color: '#edf4fb' }}>
          {displayName}
        </span>
        {replicas > 1 && (
          <span className="shrink-0 rounded border px-1 py-px font-mono text-[9px] font-bold leading-none"
            style={{ color: ACCENT, background: 'rgba(110,220,255,0.10)', borderColor: 'rgba(110,220,255,0.25)' }}>
            ×{replicas}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); updateNodeConfig(id, { ...data.config, collapsed: false }); }}
          className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors"
          style={{ color: BORDER_COLOR, background: BORDER_COLOR + '20' }}
          title="Expand service"
        >⊞</button>
        </div>

        <div className="mx-3 h-px bg-[rgba(255,255,255,0.06)]" />

        {/* Block rows — each row gets a ref so its handle aligns with it */}
        <div className="px-3 py-1.5 flex flex-col gap-0.5">
        {visibleRows.map(row => {
          let metricBadge: ReactNode = null;
          if (isRunning && internalMetrics) {
            if (row.kind === 'db_pool') {
              const poolId = row.handleId.replace('dbpool:', '');
              const poolMetrics = internalMetrics.dbPools[poolId];
              if (poolMetrics) {
                const pct = Math.round(poolMetrics.utilization * 100);
                const color = poolMetrics.utilization > 0.9 ? '#f87171'
                  : poolMetrics.utilization > 0.7 ? '#fbbf24' : '#4ade80';
                metricBadge = (
                  <span className="ml-auto shrink-0 text-[9px] font-mono px-1 py-0.5 rounded"
                    style={{ color, background: color + '18', border: `1px solid ${color}40` }}
                    title={`Pool util: ${pct}%  avg latency: ${poolMetrics.avgLatencyMs.toFixed(1)}ms`}>
                    {pct}%
                  </span>
                );
              }
            } else if (row.kind === 'consumer') {
              const lag = internalMetrics.consumerLag;
              if (lag > 0) {
                const color = lag > 1000 ? '#f87171' : lag > 100 ? '#fbbf24' : '#94a3b8';
                metricBadge = (
                  <span className="ml-auto shrink-0 text-[9px] font-mono px-1 py-0.5 rounded"
                    style={{ color, background: color + '18', border: `1px solid ${color}40` }}
                    title={`Consumer lag: ${lag} messages`}>
                    lag:{lag > 999 ? `${(lag / 1000).toFixed(1)}k` : lag}
                  </span>
                );
              }
            }
          }

          return (
            <div
              key={row.id}
              ref={el => setRowRef(row.handleId)(el)}
              className="flex items-center gap-1.5 text-[11px]"
            >
              <span className="w-3 shrink-0 text-center leading-none" style={{ fontSize: 10 }}>
                {BLOCK_ICONS[row.kind] ?? '·'}
              </span>
              <span className="font-mono text-slate-300 truncate">{row.label}</span>
              {metricBadge}
            </div>
          );
        })}
        {hiddenCount > 0 && (
          <div className="text-[10px] text-slate-500 pl-4">··· +{hiddenCount} more (expand to connect)</div>
        )}
        </div>

        <div className="mx-3 h-px bg-[rgba(255,255,255,0.06)]" />

        {/* Footer */}
        <div className="px-3 py-1.5 flex items-center gap-2">
        {estimatedLatency > 0 && (
          <span className="text-[9px] font-mono text-slate-500 shrink-0">~{fmtMs(estimatedLatency)}</span>
        )}
        {isRunning && bar && bar.pct > 0.05 ? (
          <>
            <div className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(bar.pct * 100, 100)}%`, background: bar.color }} />
            </div>
            <span className="text-[9px] font-mono shrink-0" style={{ color: bar.color }}>
              {Math.round(bar.pct * 100)}%
            </span>
            {(nodeLatencyP99 ?? currentMetrics?.latencyP99) != null && (
              <span className="text-[9px] font-mono text-slate-500 shrink-0">
                p99:{fmtMs(nodeLatencyP99 ?? currentMetrics?.latencyP99)}
              </span>
            )}
          </>
        ) : (
          <div className="flex-1" />
        )}
        </div>
      </div>
    </div>
  );
}
