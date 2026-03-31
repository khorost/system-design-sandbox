import { BaseEdge, EdgeLabelRenderer, type EdgeProps, useInternalNode } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import { useCanvasStore } from '../../../store/canvasStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import type { EdgeData } from '../../../types/index.ts';
import { buildBezierPath, buildOrthogonalFromBends, buildOrthogonalFromBendsPoints, buildOrthogonalPath, buildOrthogonalRoutePoints } from '../../../utils/edgePaths.ts';
import { orthoLog } from '../../../utils/orthoTelemetry.ts';
// import { getFloatingEdgeParams } from '../../../utils/floatingEdge.ts';
import { computeEffectiveLatency } from '../../../utils/networkLatency.ts';
import { WaypointOverlay } from './WaypointOverlay.tsx';

function getWidthByLatency(ms: number): number {
  if (ms <= 0.5) return 1;      // внутри docker/pod
  if (ms <= 2) return 1.5;      // внутри rack
  if (ms <= 10) return 2.5;     // внутри DC
  if (ms <= 50) return 4;       // между DC
  if (ms <= 100) return 6;      // клиент → DC
  if (ms <= 500) return 8;      // дальний клиент
  return 10;
}

function getAnimationByThroughput(rps: number): { dasharray: string; duration: string } {
  if (rps <= 10) return { dasharray: '12 8', duration: '1.6s' };
  if (rps <= 50) return { dasharray: '10 6', duration: '1.2s' };
  if (rps <= 100) return { dasharray: '8 5', duration: '0.9s' };
  if (rps <= 300) return { dasharray: '7 4', duration: '0.7s' };
  if (rps <= 500) return { dasharray: '6 3', duration: '0.5s' };
  if (rps <= 1000) return { dasharray: '5 2', duration: '0.35s' };
  return { dasharray: '4 2', duration: '0.25s' };
}

type Unit = 'M' | 'K' | '' ;

function pickRpsUnit(v: number): Unit {
  if (v >= 1_000_000) return 'M';
  if (v >= 1_000) return 'K';
  return '';
}

function formatRpsWithUnit(v: number, unit: Unit): string {
  switch (unit) {
    case 'M': return `${(v / 1e6).toFixed(1)}M`;
    case 'K': return `${(v / 1000).toFixed(1)}K`;
    default:
      if (v >= 100) return v.toFixed(0);
      if (v >= 10) return v.toFixed(1);
      return v.toFixed(2);
  }
}

type ByteUnit = 'GB/s' | 'MB/s' | 'KB/s';

function pickByteUnit(kb: number): ByteUnit {
  if (kb >= 1024 * 1024) return 'GB/s';
  if (kb >= 1024) return 'MB/s';
  return 'KB/s';
}

function formatBytesWithUnit(kb: number, unit: ByteUnit): string {
  switch (unit) {
    case 'GB/s': return `${(kb / (1024 * 1024)).toFixed(1)} GB/s`;
    case 'MB/s': return `${(kb / 1024).toFixed(1)} MB/s`;
    default: return `${kb.toFixed(1)} KB/s`;
  }
}

interface DirUnits {
  rps: Unit;
  bw: ByteUnit;
}

const UNIT_LOCK_MS = 5000;

/** Would value look bad in current unit (5+ raw digits)? Switch immediately. */
function rpsOverflows(v: number, unit: Unit): boolean {
  switch (unit) {
    case 'M': return false;
    case 'K': return v >= 1_000_000; // 1000K → M
    default: return v >= 10_000;      // 10000 → K
  }
}
function bwOverflows(kb: number, unit: ByteUnit): boolean {
  switch (unit) {
    case 'GB/s': return false;
    case 'MB/s': return kb >= 1024 * 1024; // 1024 MB → GB
    default: return kb >= 10_240;           // 10 MB in KB → MB
  }
}

export function FlowEdge(props: EdgeProps) {
  const { id, source, target, selected } = props;
  const data = props.data as EdgeData | undefined;

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const edgeEma = useSimulationStore((s) => s.edgeEma[id!]);
  const edgeLatency = useSimulationStore((s) => s.edgeLatency[id!]);
  const edgeTagTraffic = useSimulationStore((s) => s.edgeTagTraffic[id!]);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const cbState = useSimulationStore((s) => s.circuitBreakerStates[`${source}->${target}`]);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const edgeLabelMode = useCanvasStore((s) => s.edgeLabelMode);
  const edgeRoutingMode = useCanvasStore((s) => s.edgeRoutingMode);
  const displayMode = useCanvasStore((s) => s.displayMode);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateEdgeWaypoints = useCanvasStore((s) => s.updateEdgeWaypoints);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);
  const isSelected = selected || selectedEdgeId === id!;
  const anyEdgeSelected = selectedEdgeId != null;
  const isDimmed = anyEdgeSelected && !isSelected;
  const is3d = displayMode === '3d';
  const prevSelectedRef = useRef(isSelected);
  // Non-hook: reads edges snapshot directly — safe from infinite re-render
  // const parallelInfo = getParallelEdgeInfo(id!, source, target);

  // Sum forward (out) and response (in) traffic — must be before early return for hooks
  let fwdRps = 0, fwdBytes = 0, respRps = 0, respBytes = 0;
  if (edgeTagTraffic?.forward) {
    for (const tag of Object.values(edgeTagTraffic.forward)) {
      fwdRps += tag.rps; fwdBytes += tag.bytesPerSec;
    }
  }
  if (edgeTagTraffic?.response) {
    for (const tag of Object.values(edgeTagTraffic.response)) {
      respRps += tag.rps; respBytes += tag.bytesPerSec;
    }
  }

  // Stable unit locking per direction — debounce unit changes independently
  const wantFwdRps = pickRpsUnit(fwdRps), wantFwdBw = pickByteUnit(fwdBytes);
  const wantRespRps = pickRpsUnit(respRps), wantRespBw = pickByteUnit(respBytes);
  const [fwdU, setFwdU] = useState<DirUnits>({ rps: wantFwdRps, bw: wantFwdBw });
  const [respU, setRespU] = useState<DirUnits>({ rps: wantRespRps, bw: wantRespBw });
  useEffect(() => {
    if (wantFwdRps === fwdU.rps && wantFwdBw === fwdU.bw) return;
    const immediate = rpsOverflows(fwdRps, fwdU.rps) || bwOverflows(fwdBytes, fwdU.bw);
    const t = setTimeout(() => setFwdU({ rps: wantFwdRps, bw: wantFwdBw }), immediate ? 0 : UNIT_LOCK_MS);
    return () => clearTimeout(t);
  }, [wantFwdRps, wantFwdBw, fwdU.rps, fwdU.bw, fwdRps, fwdBytes]);
  useEffect(() => {
    if (wantRespRps === respU.rps && wantRespBw === respU.bw) return;
    const immediate = rpsOverflows(respRps, respU.rps) || bwOverflows(respBytes, respU.bw);
    const t = setTimeout(() => setRespU({ rps: wantRespRps, bw: wantRespBw }), immediate ? 0 : UNIT_LOCK_MS);
    return () => clearTimeout(t);
  }, [wantRespRps, wantRespBw, respU.rps, respU.bw, respRps, respBytes]);

  // Deselection cleanup: merge collinear bends when edge loses focus (Rule 6)
  useEffect(() => {
    const wasSelected = prevSelectedRef.current;
    prevSelectedRef.current = isSelected;
    if (wasSelected && !isSelected && data?.orthoExplicit && data.waypoints?.length && edgeRoutingMode === 'orthogonal') {
      const sourcePosition = props.sourcePosition;
      const targetPosition = props.targetPosition;
      const pts = buildOrthogonalFromBendsPoints(
        props.sourceX, props.sourceY, props.targetX, props.targetY,
        sourcePosition, targetPosition, data.waypoints,
      );
      // Only remove truly redundant interior bends (collinear with neighbors).
      // Preserve stubs (first 2, last 2 points) — only check interior range.
      const newBends: Array<{ x: number; y: number }> = [];
      for (let i = 2; i < pts.length - 2; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const next = pts[i + 1];
        const sameX = Math.abs(prev.x - curr.x) < 2 && Math.abs(curr.x - next.x) < 2;
        const sameY = Math.abs(prev.y - curr.y) < 2 && Math.abs(curr.y - next.y) < 2;
        if (!sameX && !sameY) newBends.push(curr); // keep non-collinear bends
      }
      if (newBends.length !== data.waypoints.length) {
        updateEdgeWaypoints(id!, newBends);
      }
    }
  }, [isSelected]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only track selection

  // Auto-bake: when in orthogonal mode, auto-convert legacy edges to orthoExplicit
  // so that node movement only affects the nearest segment (Rule 5).
  useEffect(() => {
    if (edgeRoutingMode !== 'orthogonal' || data?.orthoExplicit || !sourceNode || !targetNode) return;
    const sPos = props.sourcePosition;
    const tPos = props.targetPosition;
    const orthoPoints = buildOrthogonalRoutePoints(
      props.sourceX, props.sourceY, props.targetX, props.targetY,
      sPos, tPos, data?.waypoints?.length ? data.waypoints : undefined,
    );
    // Extract interior bends and remove collinear redundancies
    const rawBends = orthoPoints.slice(2, -2);
    const bends: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < rawBends.length; i++) {
      const prev = i > 0 ? rawBends[i - 1] : orthoPoints[1]; // stubS
      const curr = rawBends[i];
      const next = i < rawBends.length - 1 ? rawBends[i + 1] : orthoPoints[orthoPoints.length - 2]; // stubT
      const sameX = Math.abs(prev.x - curr.x) < 2 && Math.abs(curr.x - next.x) < 2;
      const sameY = Math.abs(prev.y - curr.y) < 2 && Math.abs(curr.y - next.y) < 2;
      if (!sameX && !sameY) bends.push(curr);
    }
    orthoLog('bake', id, {
      sx: props.sourceX, sy: props.sourceY, tx: props.targetX, ty: props.targetY,
      sPos, tPos, orthoPoints, rawBends, bends,
    });
    updateEdgeData(id!, { orthoExplicit: true, waypoints: bends } as Partial<EdgeData>);
  }, [edgeRoutingMode]); // eslint-disable-line react-hooks/exhaustive-deps -- bake once on mode switch

  if (!sourceNode || !targetNode) return null;

  // Always use React Flow's handle-based positions for accurate port targeting.
  const sx = props.sourceX;
  const sy = props.sourceY;
  const tx = props.targetX;
  const ty = props.targetY;
  const sourcePos = props.sourcePosition;
  const targetPos = props.targetPosition;

  let edgePath: string, labelX: number, labelY: number;
  if (edgeRoutingMode === 'orthogonal') {
    if (data?.orthoExplicit) {
      [edgePath, labelX, labelY] = buildOrthogonalFromBends(sx, sy, tx, ty, sourcePos, targetPos, data.waypoints ?? []);
    } else {
      [edgePath, labelX, labelY] = buildOrthogonalPath(sx, sy, tx, ty, sourcePos, targetPos, data?.waypoints);
    }
  } else {
    [edgePath, labelX, labelY] = buildBezierPath(sx, sy, tx, ty, sourcePos, targetPos);
  }

  const protocol = data?.protocol ?? 'REST';
  const userLatency = data?.latencyMs ?? 1;
  const hierarchyLatency = computeEffectiveLatency(source, target, nodes);
  const hasOverride = data?.latencyMs != null && data.latencyMs !== 1;
  const latencyMs = hasOverride ? userLatency : (hierarchyLatency > 0 ? hierarchyLatency : userLatency);
  const throughput = edgeEma?.ema1 ?? 0;

  // Compute edge error rate from forward traffic
  let edgeErrRate = 0;
  if (fwdRps > 0) {
    let fwdFailed = 0;
    if (edgeTagTraffic?.forward) {
      for (const tag of Object.values(edgeTagTraffic.forward)) {
        fwdFailed += tag.failedRps;
      }
    }
    edgeErrRate = fwdFailed / fwdRps;
  }

  let strokeColor = '#38bdf8';
  let strokeWidth = getWidthByLatency(latencyMs);
  let strokeDasharray: string | undefined;
  let animationName: string | undefined;
  let animationDuration: string | undefined;
  let animationTimingFunction: string | undefined;
  let animationIterationCount: string | undefined;
  let animationPlayState: 'running' | 'paused' | undefined;

  if (isRunning && throughput > 0) {
    // Error rate takes priority over throughput coloring
    if (edgeErrRate > 0.5) {
      strokeColor = '#ef4444'; // red-500 — majority errors
    } else if (edgeErrRate > 0.05) {
      strokeColor = '#f97316'; // orange-500 — some errors
    } else {
      const ratio = Math.min(throughput / 1000, 1);
      if (ratio > 0.55) {
        strokeColor = '#f87171';
      } else if (ratio > 0.18) {
        strokeColor = '#fbbf24';
      } else {
        strokeColor = '#38bdf8';
      }
    }
    const anim = getAnimationByThroughput(throughput);
    strokeDasharray = anim.dasharray;
    animationName = 'flowAnimation';
    animationDuration = anim.duration;
    animationTimingFunction = 'linear';
    animationIterationCount = 'infinite';
    animationPlayState = isPaused ? 'paused' : 'running';
  }

  if (isSelected) {
    strokeWidth += 1;
  }

  const edgeFilter = is3d ? 'drop-shadow(4px 5px 6px rgba(4,8,15,0.34))' : undefined;
  const edgeHighlightWidth = is3d ? Math.max(1, strokeWidth * 0.35) : 0;
  const labelStyle = {
    position: 'absolute' as const,
    transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 4}px)`,
    pointerEvents: 'none' as const,
    zIndex: 1000,
    background: is3d ? 'linear-gradient(145deg, rgba(41,58,74,0.96), rgba(15,23,33,0.92))' : 'rgba(15,23,33,0.9)',
    boxShadow: is3d ? '6px 8px 0 rgba(5,10,18,0.28), 0 14px 20px rgba(3,8,14,0.22)' : undefined,
    opacity: isDimmed ? 0.1 : undefined,
    transition: 'opacity 0.2s ease',
  };

  // Determine effective display mode
  const effectiveMode = edgeLabelMode === 'auto'
    ? (isSelected ? (isRunning ? 'full' : 'protocol') : null)
    : edgeLabelMode;

  const showLabel = effectiveMode !== null;

  const isCBOpen = cbState === 'OPEN' || cbState === 'HALF_OPEN';
  // Selected edge keeps its simulation color (red/orange/yellow/blue) — no override to light-blue
  const effectiveColor = isCBOpen ? '#f97316' : strokeColor;
  const markerId = `edge-arrow-${id}`;
  const arrowSize = Math.max(8, strokeWidth * 2);

  // Build label content
  const cbLabel = isCBOpen ? <span className="text-orange-400 font-bold">CB {cbState}</span> : null;
  const protocolLine = <>{protocol} &middot; {Math.round(edgeLatency ?? latencyMs)}ms {cbLabel}</>;
  const hasTrafficData = throughput > 0;
  const hasResponse = respRps > 0;
  const trafficLine = hasTrafficData
    ? (
      <>
        <span className="text-emerald-400">↑</span>{formatRpsWithUnit(fwdRps, fwdU.rps)} rps &middot; {formatBytesWithUnit(fwdBytes, fwdU.bw)}
        {hasResponse && (
          <>
            <br />
            <span className="text-amber-400">↓</span>{formatRpsWithUnit(respRps, respU.rps)} rps &middot; {formatBytesWithUnit(respBytes, respU.bw)}
          </>
        )}
      </>
    )
    : <span className="text-slate-400">&mdash; rps &middot; &mdash; KB/s</span>;

  let labelContent: React.ReactNode = null;
  if (showLabel) {
    switch (effectiveMode) {
      case 'protocol':
        labelContent = protocolLine;
        break;
      case 'traffic':
        labelContent = trafficLine;
        break;
      case 'full':
        labelContent = <>{protocolLine}<br />{trafficLine}</>;
        break;
    }
  }

  return (
    <>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth={arrowSize}
          markerHeight={arrowSize}
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={effectiveColor} opacity={isDimmed ? 0.15 : 1} />
        </marker>
      </defs>
      {is3d && (
        <BaseEdge
          path={edgePath}
          style={{
            stroke: 'rgba(255,255,255,0.18)',
            strokeWidth: edgeHighlightWidth,
            pointerEvents: 'none',
          }}
        />
      )}
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: effectiveColor,
          strokeWidth,
          strokeDasharray,
          animationName,
          animationDuration,
          animationTimingFunction,
          animationIterationCount,
          animationPlayState,
          filter: edgeFilter,
          opacity: isDimmed ? 0.15 : undefined,
          transition: 'opacity 0.2s ease',
        }}
      />
      {showLabel && labelContent && (
        <EdgeLabelRenderer>
          <div
            style={labelStyle}
            className="text-[10px] font-mono leading-tight px-2.5 py-1.5 rounded border border-[var(--color-border)] text-slate-300 whitespace-nowrap"
          >
            {labelContent}
          </div>
        </EdgeLabelRenderer>
      )}
      {edgeRoutingMode === 'orthogonal' && isSelected && (
        <EdgeLabelRenderer>
          <WaypointOverlay
            edgeId={id!}
            sx={sx} sy={sy} tx={tx} ty={ty}
            waypoints={data?.waypoints ?? []}
            sourcePos={sourcePos}
            targetPos={targetPos}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}
