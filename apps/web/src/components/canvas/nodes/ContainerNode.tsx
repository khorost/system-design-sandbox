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
  const displayMode = useCanvasStore((s) => s.displayMode);
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
  const toggleCollapse = useCanvasStore((s) => s.toggleContainerCollapse);
  const isCollapsed = !!(data.config.collapsed as boolean);
  const childCount = useCanvasStore((s) => s.nodes.filter(n => n.parentId === id).length);
  const borderColor = selected ? '#7ddcff' : style.border;
  const borderStyle = selected || isDragTarget ? 'solid' : 'dashed';
  const is3d = displayMode === '3d';
  const depthX = 10;
  const depthY = 10;
  const boxShadow = selected
    ? (is3d
      ? '0 0 0 3px rgba(125,220,255,0.74), 0 0 0 8px rgba(110,220,255,0.14), 0 16px 30px rgba(3,8,14,0.34)'
      : '0 0 0 3px rgba(125,220,255,0.74), 0 0 0 8px rgba(110,220,255,0.14), 0 0 36px rgba(92,141,255,0.22), 0 20px 34px rgba(3,8,14,0.26)')
    : isDragBlocked
      ? (is3d
        ? `0 0 0 5px ${style.border}55, 0 16px 28px rgba(3,8,14,0.28)`
        : `0 0 0 5px ${style.border}55, 0 0 36px ${style.border}2e, 0 18px 30px rgba(3,8,14,0.22)`)
      : isDragTarget
      ? (is3d
        ? `0 0 0 3px ${style.border}66, 0 14px 24px rgba(3,8,14,0.26)`
        : `0 0 0 3px ${style.border}66, 0 0 28px ${style.border}30, 0 16px 28px rgba(3,8,14,0.2)`)
      : isDragSource
        ? `0 0 0 3px ${style.border}4a, inset 0 0 0 1px rgba(255,255,255,0.03)`
        : is3d
          ? `0 ${depthY + 4}px 22px rgba(3,8,14,0.30), inset 0 0 0 1px rgba(255,255,255,0.02)`
          : 'inset 0 0 0 1px rgba(255,255,255,0.02)';

  return (
    <div
      className="w-full h-full rounded-lg relative overflow-visible"
      style={is3d ? { transform: 'translateZ(4px)' } : undefined}
    >
      {is3d && (
        <>
          {/* Bottom face (near wall) */}
          <div
            className="pointer-events-none absolute z-0"
            style={{
              left: 0,
              right: 0,
              bottom: -depthY,
              height: depthY + 1,
              background: `linear-gradient(0deg, ${borderColor}50, ${borderColor}28)`,
              transform: 'skewX(45deg)',
              transformOrigin: 'top left',
            }}
          />
          {/* Right face (side wall) */}
          <div
            className="pointer-events-none absolute z-0"
            style={{
              bottom: depthX - depthY,
              right: -depthX,
              top: 0,
              width: depthX + 1,
              background: `linear-gradient(0deg, ${borderColor}30, rgba(5,10,18,0.50) 50%, ${borderColor}18)`,
              transform: 'skewY(45deg)',
              transformOrigin: 'bottom left',
            }}
          />
          {/* Drop shadow */}
          <div
            className="pointer-events-none absolute z-[-1]"
            style={{
              inset: 0,
              transform: `translate(${depthX * 0.5}px, ${depthY + 4}px)`,
              borderRadius: 12,
              background: 'rgba(0,4,10,0.40)',
              filter: 'blur(16px)',
            }}
          />
        </>
      )}
      <div
        className="w-full h-full rounded-lg relative overflow-hidden"
        style={{
          background: is3d
            ? 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 30%, rgba(9,14,22,0.10) 60%, rgba(6,10,18,0.40) 100%), linear-gradient(180deg, rgba(18,24,35,0.96), rgba(11,16,24,0.94))'
            : 'linear-gradient(180deg, rgba(18,24,35,0.96), rgba(11,16,24,0.94))',
          border: `2px ${borderStyle} ${borderColor}`,
          boxShadow,
          transition: 'box-shadow 0.2s ease, border 0.2s ease',
          minWidth: CONFIG.CANVAS.CONTAINER_MIN_WIDTH,
          minHeight: isCollapsed ? CONFIG.CANVAS.CONTAINER_HEADER_HEIGHT : CONFIG.CANVAS.CONTAINER_MIN_HEIGHT,
        }}
      >
        {is3d ? (
          <div
            className="pointer-events-none absolute inset-[2px] rounded-[inherit]"
            style={{
              background: `linear-gradient(180deg, rgba(255,255,255,0.08), transparent 22%, transparent 78%, ${style.border}08)`,
            }}
          />
        ) : null}
        {selected ? (
          <div
            className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(244,251,255,0.24)' }}
          />
        ) : null}
        {!isCollapsed && (
          <>
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
          </>
        )}

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
            background: is3d
              ? `linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01) 40%, rgba(8,13,20,0.06) 100%), linear-gradient(180deg, rgba(20,27,39,0.985), rgba(18,24,35,0.97)), linear-gradient(180deg, ${isDragTarget ? style.border + '18' : style.headerBg}, ${isDragTarget ? style.border + '18' : style.headerBg})`
              : `linear-gradient(180deg, rgba(20,27,39,0.985), rgba(18,24,35,0.97)), linear-gradient(180deg, ${isDragTarget ? style.border + '18' : style.headerBg}, ${isDragTarget ? style.border + '18' : style.headerBg})`,
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
          <button
            onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
            className="ml-1 shrink-0 flex items-center justify-center w-5 h-5 rounded hover:bg-[rgba(255,255,255,0.08)] transition-colors cursor-pointer pointer-events-auto"
            title={isCollapsed ? 'Expand' : 'Collapse'}
            style={{ color: style.border }}
          >
            <span className="text-[10px] leading-none select-none">
              {isCollapsed ? '⊞' : '⊟'}
            </span>
          </button>
        </div>

        {isCollapsed && childCount > 0 && (
          <div
            className="pointer-events-none flex items-center gap-1.5 px-3 py-1"
            style={{ color: style.border + 'aa' }}
          >
            <span className="text-[9px] font-mono">
              {childCount} component{childCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {!isCollapsed && (
          <div className="pointer-events-none absolute inset-x-4 bottom-4 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />
        )}
      </div>
    </div>
  );
}
