import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { useSimulationStore } from '../../../store/simulationStore.ts';

export function FlowEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source } = props;

  const util = useSimulationStore((s) => s.nodeUtilization[source] ?? 0);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  let strokeColor = '#3b82f6';
  let strokeWidth = 2;
  let animationDuration = '1s';

  if (isRunning && util > 0) {
    if (util > 0.8) {
      strokeColor = '#ef4444';
    } else if (util > 0.5) {
      strokeColor = '#f59e0b';
    } else {
      strokeColor = '#22c55e';
    }
    strokeWidth = 2 + util * 2;
    animationDuration = `${Math.max(0.3, 1 - util * 0.7)}s`;
  }

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: isRunning && util > 0 ? '8 4' : undefined,
        animation: isRunning && util > 0 ? `flowAnimation ${animationDuration} linear infinite` : undefined,
      }}
    />
  );
}
