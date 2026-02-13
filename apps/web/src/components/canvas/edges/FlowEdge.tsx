import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { EdgeData } from '../../../types/index.ts';

export function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const data = props.data as EdgeData | undefined;

  const edgeEma = useSimulationStore((s) => s.edgeEma[id!]);
  const edgeLatency = useSimulationStore((s) => s.edgeLatency[id!]);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const isSelected = selected || selectedEdgeId === id!;

  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const protocol = data?.protocol ?? 'REST';
  const latencyMs = data?.latencyMs ?? 1;
  const throughput = edgeEma?.ema1 ?? 0;

  let strokeColor = '#3b82f6';
  let strokeWidth = 2;
  let animationDuration = '1s';

  if (isRunning && throughput > 0) {
    // Color by absolute throughput: <100 green, <500 yellow, >500 red
    const ratio = Math.min(throughput / 1000, 1);
    if (ratio > 0.5) {
      strokeColor = '#ef4444';
    } else if (ratio > 0.1) {
      strokeColor = '#f59e0b';
    } else {
      strokeColor = '#22c55e';
    }
    strokeWidth = 2 + ratio * 3;
    animationDuration = `${Math.max(0.3, 1 - ratio * 0.7)}s`;
  }

  if (isSelected) {
    strokeWidth = Math.max(strokeWidth, 3);
  }

  const showLabel = isSelected || isRunning;

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: isSelected ? '#60a5fa' : strokeColor,
          strokeWidth,
          strokeDasharray: isRunning && throughput > 0 ? '8 4' : undefined,
          animation: isRunning && throughput > 0 ? `flowAnimation ${animationDuration} linear infinite` : undefined,
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
