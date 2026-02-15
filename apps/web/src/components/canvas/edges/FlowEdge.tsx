import { BaseEdge, EdgeLabelRenderer, type EdgeProps,getBezierPath, useInternalNode } from '@xyflow/react';

import { useCanvasStore } from '../../../store/canvasStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import type { EdgeData } from '../../../types/index.ts';
import { getFloatingEdgeParams } from '../../../utils/floatingEdge.ts';
import { computeEffectiveLatency } from '../../../utils/networkLatency.ts';

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

function formatBytes(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} GB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} MB/s`;
  return `${bytesPerSec.toFixed(1)} KB/s`;
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
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const edgeLabelMode = useCanvasStore((s) => s.edgeLabelMode);
  const nodes = useCanvasStore((s) => s.nodes);
  const isSelected = selected || selectedEdgeId === id!;

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getFloatingEdgeParams(sourceNode, targetNode);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
  });

  const protocol = data?.protocol ?? 'REST';
  const userLatency = data?.latencyMs ?? 1;
  const hierarchyLatency = computeEffectiveLatency(source, target, nodes);
  // User override (changed from default 1) takes priority; otherwise use hierarchy
  const hasOverride = data?.latencyMs != null && data.latencyMs !== 1;
  const latencyMs = hasOverride ? userLatency : (hierarchyLatency > 0 ? hierarchyLatency : userLatency);
  const throughput = edgeEma?.ema1 ?? 0;

  // Sum bytesPerSec across all forward tags
  let totalBytesPerSec = 0;
  if (edgeTagTraffic?.forward) {
    for (const tag of Object.values(edgeTagTraffic.forward)) {
      totalBytesPerSec += tag.bytesPerSec;
    }
  }

  let strokeColor = '#3b82f6';
  let strokeWidth = getWidthByLatency(latencyMs);
  let strokeDasharray: string | undefined;
  let animation: string | undefined;
  let animationPlayState: 'running' | 'paused' | undefined;

  if (isRunning && throughput > 0) {
    const ratio = Math.min(throughput / 1000, 1);
    if (ratio > 0.5) {
      strokeColor = '#ef4444';
    } else if (ratio > 0.1) {
      strokeColor = '#f59e0b';
    } else {
      strokeColor = '#22c55e';
    }
    const anim = getAnimationByThroughput(throughput);
    strokeDasharray = anim.dasharray;
    animation = `flowAnimation ${anim.duration} linear infinite`;
    animationPlayState = isPaused ? 'paused' : 'running';
  }

  if (isSelected) {
    strokeWidth += 1;
  }

  // Determine effective display mode
  const effectiveMode = edgeLabelMode === 'auto'
    ? (isSelected ? (isRunning ? 'full' : 'protocol') : null)
    : edgeLabelMode;

  const showLabel = effectiveMode !== null;

  const effectiveColor = isSelected ? '#60a5fa' : strokeColor;
  const markerId = `edge-arrow-${id}`;
  const arrowSize = Math.max(8, strokeWidth * 2);

  // Build label content
  const protocolLine = <>{protocol} &middot; {Math.round(edgeLatency ?? latencyMs)}ms</>;
  const hasTrafficData = throughput > 0;
  const trafficLine = hasTrafficData
    ? <>{Math.round(throughput)} rps &middot; {formatBytes(totalBytesPerSec)}</>
    : <span className="text-slate-500">&mdash; rps &middot; &mdash; KB/s</span>;

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
          <path d="M 0 0 L 10 5 L 0 10 z" fill={effectiveColor} />
        </marker>
      </defs>
      <BaseEdge
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: effectiveColor,
          strokeWidth,
          strokeDasharray,
          animation,
          animationPlayState,
        }}
      />
      {showLabel && labelContent && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 4}px)`,
              pointerEvents: 'none',
              zIndex: 1000,
            }}
            className="text-[10px] font-mono leading-tight px-2.5 py-1.5 rounded bg-[var(--color-surface)]/90 border border-[var(--color-border)] text-slate-300 whitespace-nowrap"
          >
            {labelContent}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
