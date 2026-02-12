import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';

interface BaseNodeProps {
  nodeProps: NodeProps<ComponentNode>;
  borderColor: string;
  bgColor: string;
}

export function BaseNode({ nodeProps, borderColor, bgColor }: BaseNodeProps) {
  const { id, data, selected } = nodeProps;
  const selectNode = useCanvasStore((s) => s.selectNode);

  return (
    <div
      onClick={() => selectNode(id)}
      className="rounded-lg shadow-lg min-w-[140px] cursor-pointer transition-all"
      style={{
        background: bgColor,
        border: `2px solid ${selected ? '#3b82f6' : borderColor}`,
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.5)' : undefined,
      }}
    >
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
