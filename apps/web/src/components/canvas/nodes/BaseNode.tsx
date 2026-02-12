import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';

interface BaseNodeProps {
  nodeProps: NodeProps<ComponentNode>;
  borderColor: string;
  bgColor: string;
}

function getUtilColor(util: number): string {
  if (util > 0.8) return '#ef4444';
  if (util > 0.5) return '#f59e0b';
  if (util > 0) return '#22c55e';
  return '';
}

export function BaseNode({ nodeProps, borderColor, bgColor }: BaseNodeProps) {
  const { id, data, selected } = nodeProps;
  const selectNode = useCanvasStore((s) => s.selectNode);
  const util = useSimulationStore((s) => s.nodeUtilization[id] ?? 0);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const utilColor = isRunning ? getUtilColor(util) : '';
  const activeBorder = selected ? '#3b82f6' : utilColor || borderColor;

  return (
    <div
      onClick={() => selectNode(id)}
      className="rounded-lg shadow-lg min-w-[140px] cursor-pointer transition-all relative"
      style={{
        background: bgColor,
        border: `2px solid ${activeBorder}`,
        boxShadow: selected
          ? '0 0 0 2px rgba(59,130,246,0.5)'
          : utilColor
            ? `0 0 8px ${utilColor}40`
            : undefined,
      }}
    >
      {isRunning && util > 0 && (
        <div
          className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white z-10"
          style={{ background: utilColor }}
        >
          {Math.round(util * 100)}%
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-blue-400 !border-blue-600" />
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{data.icon}</span>
          <span className="text-xs font-semibold text-slate-200 truncate max-w-[100px]">
            {data.label}
          </span>
        </div>
        <div className="text-[10px] text-slate-400">{data.componentType}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-blue-400 !border-blue-600" />
    </div>
  );
}
