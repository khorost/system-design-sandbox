import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { EdgeData } from '../../../types/index.ts';
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

export function FlowEdge(props: EdgeProps) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const data = props.data as EdgeData | undefined;

  const edgeEma = useSimulationStore((s) => s.edgeEma[id!]);
  const edgeLatency = useSimulationStore((s) => s.edgeLatency[id!]);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const isSelected = selected || selectedEdgeId === id!;

  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const protocol = data?.protocol ?? 'REST';
  const userLatency = data?.latencyMs ?? 1;
  const hierarchyLatency = computeEffectiveLatency(source, target, nodes);
  // User override (changed from default 1) takes priority; otherwise use hierarchy
  const hasOverride = data?.latencyMs != null && data.latencyMs !== 1;
  const latencyMs = hasOverride ? userLatency : (hierarchyLatency > 0 ? hierarchyLatency : userLatency);
  const throughput = edgeEma?.ema1 ?? 0;

  let strokeColor = '#3b82f6';
  let strokeWidth = getWidthByLatency(latencyMs);
  let strokeDasharray: string | undefined;
  let animation: string | undefined;

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
  }

  if (isSelected) {
    strokeWidth += 1;
  }

  const showLabel = isSelected || isRunning;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: isSelected ? '#60a5fa' : strokeColor,
          strokeWidth,
          strokeDasharray,
          animation,
        }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
            }}
            className="text-[10px] font-mono leading-tight px-1.5 py-0.5 rounded bg-[var(--color-surface)]/90 border border-[var(--color-border)] text-slate-300 whitespace-nowrap"
          >
            {isRunning && throughput > 0 ? (
              <>{Math.round(throughput)} rps &middot; {Math.round(edgeLatency ?? latencyMs)}ms</>
            ) : (
              <>{protocol} &middot; {latencyMs}ms</>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
