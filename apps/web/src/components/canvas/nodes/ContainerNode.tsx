import { NodeResizer, type NodeProps } from '@xyflow/react';
import type { ComponentNode } from '../../../types/index.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';

const CONTAINER_STYLES: Record<string, { border: string; bg: string; headerBg: string }> = {
  docker_container: { border: '#3b82f6', bg: 'rgba(59,130,246,0.06)', headerBg: 'rgba(59,130,246,0.15)' },
  kubernetes_pod: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', headerBg: 'rgba(139,92,246,0.15)' },
  vm_instance: { border: '#64748b', bg: 'rgba(100,116,139,0.06)', headerBg: 'rgba(100,116,139,0.15)' },
  rack: { border: '#22c55e', bg: 'rgba(34,197,94,0.06)', headerBg: 'rgba(34,197,94,0.15)' },
  datacenter: { border: '#f97316', bg: 'rgba(249,115,22,0.06)', headerBg: 'rgba(249,115,22,0.15)' },
};

function hexToStyle(hex: string): { border: string; bg: string; headerBg: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { border: hex, bg: `rgba(${r},${g},${b},0.06)`, headerBg: `rgba(${r},${g},${b},0.15)` };
}

export function ContainerNode(props: NodeProps<ComponentNode>) {
  const { id, data, selected } = props;
  const selectNode = useCanvasStore((s) => s.selectNode);

  const customColor = data.config.color as string | undefined;
  const style = customColor ? hexToStyle(customColor) : (CONTAINER_STYLES[data.componentType] ?? CONTAINER_STYLES.docker_container);
  const latencyMs = (data.config.internal_latency_ms as number) ?? 0.1;

  return (
    <div
      className="w-full h-full rounded-lg relative"
      style={{
        background: style.bg,
        border: `2px ${selected ? 'solid' : 'dashed'} ${selected ? '#3b82f6' : style.border}`,
        boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.5)' : undefined,
        minWidth: 300,
        minHeight: 200,
      }}
    >
      <NodeResizer
        minWidth={300}
        minHeight={200}
        isVisible={selected}
        lineClassName="!border-blue-500"
        handleClassName="!w-2.5 !h-2.5 !bg-blue-500 !border-blue-600"
      />

      {/* Header — drag handle for moving the container */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          selectNode(id);
        }}
        className="container-drag-handle flex items-center gap-2 px-3 py-2 rounded-t-md cursor-grab active:cursor-grabbing"
        style={{ background: style.headerBg }}
      >
        <span className="text-base">{data.icon}</span>
        <span className="text-xs font-semibold truncate" style={{ color: (data.config.textColor as string) || '#e2e8f0' }}>{data.label}</span>
        <span
          className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
          style={{ background: style.border + '30', color: style.border }}
        >
          {latencyMs}ms
        </span>
      </div>

    </div>
  );
}
