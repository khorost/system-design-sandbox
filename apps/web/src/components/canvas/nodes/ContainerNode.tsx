import { type NodeProps, NodeResizer } from '@xyflow/react';

import { CONFIG } from '../../../config/constants.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { ComponentNode } from '../../../types/index.ts';
import { ComponentIcon } from '../../ui/ComponentIcon.tsx';
import { getComponentIcon } from '../controls/paletteData.ts';

const CONTAINER_STYLES: Record<string, { border: string; bg: string; headerBg: string }> = {
  docker_container: { border: '#3b82f6', bg: 'rgba(59,130,246,0.038)', headerBg: 'rgba(59,130,246,0.12)' },
  kubernetes_pod: { border: '#8b5cf6', bg: 'rgba(139,92,246,0.038)', headerBg: 'rgba(139,92,246,0.12)' },
  vm_instance: { border: '#64748b', bg: 'rgba(100,116,139,0.038)', headerBg: 'rgba(100,116,139,0.12)' },
  rack: { border: '#22c55e', bg: 'rgba(34,197,94,0.038)', headerBg: 'rgba(34,197,94,0.12)' },
  datacenter: { border: '#f97316', bg: 'rgba(249,115,22,0.038)', headerBg: 'rgba(249,115,22,0.12)' },
};

function hexToStyle(hex: string): { border: string; bg: string; headerBg: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { border: hex, bg: `rgba(${r},${g},${b},0.038)`, headerBg: `rgba(${r},${g},${b},0.12)` };
}

export function ContainerNode(props: NodeProps<ComponentNode>) {
  const { id, data, selected } = props;
  const selectNode = useCanvasStore((s) => s.selectNode);
  const depth = useCanvasStore((s) => s.getAncestors(id).length);
  const dragSourceContainerId = useCanvasStore((s) => s.dragSourceContainerId);
  const dragTargetContainerId = useCanvasStore((s) => s.dragTargetContainerId);
  const dragBlockedContainerId = useCanvasStore((s) => s.dragBlockedContainerId);

  const customColor = data.config.color as string | undefined;
  const displayName = ((data.config.name as string | undefined)?.trim()) || data.label;
  const displayIcon = getComponentIcon(data.componentType, data.icon);
  const style = customColor ? hexToStyle(customColor) : (CONTAINER_STYLES[data.componentType] ?? CONTAINER_STYLES.docker_container);
  const latencyMs = (data.config.internal_latency_ms as number) ?? 0.1;
  const stripeAngle = depth % 2 === 0 ? '135deg' : '45deg';
  const isDragSource = dragSourceContainerId === id;
  const isDragTarget = dragTargetContainerId === id;
  const isDragBlocked = dragBlockedContainerId === id;
  const borderColor = selected ? '#7ddcff' : style.border;
  const borderStyle = selected || isDragTarget ? 'solid' : 'dashed';
  const boxShadow = selected
    ? '0 0 0 3px rgba(125,220,255,0.74), 0 0 0 8px rgba(110,220,255,0.14), 0 0 36px rgba(92,141,255,0.22), 0 20px 34px rgba(3,8,14,0.26)'
    : isDragBlocked
      ? `0 0 0 5px ${style.border}55, 0 0 36px ${style.border}2e, 0 18px 30px rgba(3,8,14,0.22)`
    : isDragTarget
      ? `0 0 0 3px ${style.border}66, 0 0 28px ${style.border}30, 0 16px 28px rgba(3,8,14,0.2)`
      : isDragSource
        ? `0 0 0 3px ${style.border}4a, inset 0 0 0 1px rgba(255,255,255,0.03)`
        : 'inset 0 0 0 1px rgba(255,255,255,0.02)';

  return (
    <div
      className="w-full h-full rounded-lg relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(18,24,35,0.96), rgba(11,16,24,0.94))',
        border: `2px ${borderStyle} ${borderColor}`,
        boxShadow,
        transition: 'box-shadow 0.2s ease, border 0.2s ease',
        minWidth: CONFIG.CANVAS.CONTAINER_MIN_WIDTH,
        minHeight: CONFIG.CANVAS.CONTAINER_MIN_HEIGHT,
      }}
    >
      {selected ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(244,251,255,0.24)' }}
        />
      ) : null}
      <NodeResizer
        minWidth={CONFIG.CANVAS.CONTAINER_MIN_WIDTH}
        minHeight={CONFIG.CANVAS.CONTAINER_MIN_HEIGHT}
        isVisible={selected}
        lineClassName="container-resize-line"
        handleClassName="container-resize-handle"
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 rounded-b-[inherit]"
        style={{
          top: CONFIG.CANVAS.CONTAINER_HEADER_HEIGHT,
          background: `linear-gradient(180deg, rgba(14,20,29,0.96), rgba(11,16,24,0.94)), linear-gradient(180deg, ${style.bg}, ${style.bg})`,
        }}
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 rounded-b-[inherit]"
        style={{
          top: CONFIG.CANVAS.CONTAINER_HEADER_HEIGHT,
          backgroundImage: `repeating-linear-gradient(${stripeAngle}, ${style.border}10 0 26px, transparent 26px 68px)`,
        }}
      />

      {isDragTarget ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ boxShadow: `inset 0 0 0 2px ${style.border}77`, background: `${style.border}12` }}
        />
      ) : null}

      {isDragBlocked ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ boxShadow: `inset 0 0 0 3px ${style.border}88` }}
        />
      ) : null}

      {isDragSource ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ boxShadow: `inset 0 0 0 1px ${style.border}55` }}
        />
      ) : null}

      {/* Header — drag handle for moving the container */}
      <div
        onClick={() => selectNode(id)}
        className="container-drag-handle relative z-[1] flex items-center gap-2 px-3 cursor-grab active:cursor-grabbing border-b border-[rgba(255,255,255,0.05)]"
        style={{
          height: CONFIG.CANVAS.CONTAINER_HEADER_HEIGHT,
          background: `linear-gradient(180deg, rgba(20,27,39,0.985), rgba(18,24,35,0.97)), linear-gradient(180deg, ${isDragTarget ? style.border + '18' : style.headerBg}, ${isDragTarget ? style.border + '18' : style.headerBg})`,
        }}
      >
        <ComponentIcon icon={displayIcon} alt={displayName} className="flex h-5 w-5 shrink-0 items-center justify-center text-base leading-none" imgClassName="h-5 w-5 object-contain" />
        <span className="min-w-0 flex flex-col">
          <span className="text-sm font-semibold leading-none truncate" style={{ color: (data.config.textColor as string) || '#edf4fb' }}>{displayName}</span>
          <span className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{data.componentType.replaceAll('_', ' ')}</span>
        </span>
        <span
          className="ml-auto shrink-0 text-[9px] font-mono px-1.5 py-1 rounded-md leading-none"
          style={{ background: style.border + '30', color: style.border }}
        >
          {latencyMs}ms
        </span>
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />



    </div>
  );
}
