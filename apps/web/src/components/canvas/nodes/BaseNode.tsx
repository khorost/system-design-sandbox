import { getDefinition } from '@system-design-sandbox/component-library';
import { Handle, type NodeProps,Position } from '@xyflow/react';

import { LANGUAGE_COLORS,LANGUAGE_ICONS } from '../../../constants/colors.ts';
import { CLIENT_TYPES } from '../../../constants/componentTypes.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { NodeEma } from '../../../store/simulationStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import type { ComponentNode, ComponentType } from '../../../types/index.ts';

interface BaseNodeProps {
  nodeProps: NodeProps<ComponentNode>;
  borderColor: string;
  bgColor: string;
  hideTargetHandle?: boolean;
}

function getUtilColor(util: number): string {
  if (util > 0.8) return '#ef4444';
  if (util > 0.5) return '#f59e0b';
  if (util > 0) return '#22c55e';
  return '';
}

function getTrendArrow(ema: NodeEma): string {
  const diff = ema.ema1 - ema.ema5;
  if (diff > 0.05) return '\u2191';
  if (diff < -0.05) return '\u2193';
  return '';
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatComponentName(componentType: string): string {
  return componentType.replaceAll('_', ' ');
}

function getNodeSummary(componentType: string, config: Record<string, unknown>): string[] {
  const def = getDefinition(componentType as Parameters<typeof getDefinition>[0]);
  const v = (key: string): unknown => config[key] ?? def?.params.find(p => p.key === key)?.default;

  if (CLIENT_TYPES.has(componentType as ComponentType)) {
    const usersK = (v('concurrent_users_k') as number) ?? 1;
    const rpu = (v('requests_per_user') as number) ?? 0.1;
    const rps = usersK * 1000 * rpu;
    return [`${usersK}K users \u00d7 ${rpu}/s`, `\u2192 ${fmtK(Math.round(rps))} rps`];
  }

  const replicas = v('replicas') as number | undefined;
  const nodes = v('nodes') as number | undefined;
  const brokers = v('brokers') as number | undefined;
  const maxRps = v('max_rps_per_instance') as number | undefined;

  switch (componentType) {
    case 'external_service':
      return [`${fmtK(maxRps ?? 0)} rps, ${v('base_latency_ms')}ms`];
    case 'nats':
      return [`${nodes ?? 3} nodes, ${v('mode')}`];
    case 'service':
    case 'worker':
    case 'auth_service':
      return [`${replicas ?? 1}\u00d7 @ ${fmtK(maxRps ?? 0)} rps`];
    case 'serverless_function':
      return [`${fmtK(maxRps ?? 0)} rps, ${v('max_concurrent')} conc`];
    case 'postgresql':
      return [`${replicas ?? 1}+${v('read_replicas') ?? 0}R`, `${v('max_connections')} conn`];
    case 'mongodb':
      return [`${replicas ?? 3}\u00d7 RS, ${v('shards')} shards`];
    case 'cassandra':
      return [`${nodes ?? 3} nodes, ${v('consistency_level')}`];
    case 'redis':
      return [`${v('mode')}, ${v('memory_gb')}GB`];
    case 'memcached':
      return [`${nodes ?? 3} nodes, ${v('memory_gb')}GB`];
    case 'kafka':
      return [`${brokers ?? 3} brkrs, ${v('partitions')} parts`];
    case 'rabbitmq':
      return [`${v('queues')} queues${v('ha_mode') ? ', HA' : ''}`];
    case 'load_balancer':
      return [`${v('algorithm')}`, `${fmtK((v('max_connections') as number) ?? 0)} conn`];
    case 'api_gateway':
      return [`${fmtK(maxRps ?? 0)} rps, lim ${fmtK((v('rate_limit') as number) ?? 0)}`];
    case 'cdn':
      return [`${Math.round(((v('cache_hit_ratio') as number) ?? 0.9) * 100)}% hit, ${v('edge_locations')} edges`];
    default: {
      const r = replicas ?? nodes ?? brokers;
      if (r && r > 1 && maxRps) return [`${r}\u00d7 @ ${fmtK(maxRps)} rps`];
      if (maxRps) return [`${fmtK(maxRps)} rps`];
      return [];
    }
  }
}

export function BaseNode({ nodeProps, borderColor, bgColor, hideTargetHandle }: BaseNodeProps) {
  const { id, data, selected } = nodeProps;
  const selectNode = useCanvasStore((s) => s.selectNode);
  const ema = useSimulationStore((s) => s.nodeEma[id]);
  const isRunning = useSimulationStore((s) => s.isRunning);

  const customColor = data.config.color as string | undefined;
  const customTextColor = data.config.textColor as string | undefined;
  const displayName = ((data.config.name as string | undefined)?.trim()) || data.label;
  const language = data.config.language as string | undefined;
  const maxEma = ema ? Math.max(ema.ema1, ema.ema5, ema.ema30) : 0;
  const utilColor = isRunning ? getUtilColor(maxEma) : '';
  const activeBorder = utilColor || customColor || borderColor;
  const frameBorder = selected ? '#7ddcff' : activeBorder;
  const summaryLines = getNodeSummary(data.componentType, data.config);

  return (
    <div
      onClick={() => selectNode(id)}
      className="min-w-[214px] cursor-pointer transition-all relative rounded-xl overflow-hidden"
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.10)), ${bgColor}`,
        border: `1px solid ${frameBorder}`,
        boxShadow: selected
          ? '0 0 0 2px rgba(125,220,255,0.72), 0 0 0 6px rgba(110,220,255,0.14), 0 0 28px rgba(92,141,255,0.28), 0 16px 30px rgba(3,8,14,0.28)'
          : utilColor
            ? `0 0 0 1px ${utilColor}10, 0 10px 18px ${utilColor}10`
            : '0 10px 22px rgba(3,8,14,0.20)',
      }}
    >
      {selected ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(244,251,255,0.26)' }}
        />
      ) : null}
      {isRunning && ema && maxEma > 0 && (
        <div
          className="absolute -top-3 right-3 rounded-md flex items-center gap-1.5 px-3 py-1.5 text-white z-10 shadow-md"
          style={{ background: utilColor }}
        >
          <span className="font-mono text-[9px] font-bold leading-none whitespace-nowrap">
            {Math.round(ema.ema1 * 100)}/{Math.round(ema.ema5 * 100)}/{Math.round(ema.ema30 * 100)}
          </span>
          {getTrendArrow(ema) && (
            <span className="text-[11px] leading-none">{getTrendArrow(ema)}</span>
          )}
        </div>
      )}
      {/* Target (input) — circle, teal */}
      {!hideTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className={`${selected ? '!w-2.5 !h-2.5 !bg-[rgba(153,246,228,0.98)] !border-[rgba(236,253,245,1)]' : '!w-2 !h-2 !bg-[rgba(109,215,216,0.86)] !border-[rgba(167,243,208,0.78)]'} !rounded-full hover:!bg-[rgba(153,246,228,0.95)] hover:!border-[rgba(204,251,241,0.95)] !transition-colors`}
        />
      )}
      <div className="pl-6 pr-8 pt-4 pb-4.5">
        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-1 [grid-template-areas:'icon_name''icon_summary''icon_class'] items-start">
          <span className="[grid-area:icon] flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden text-[1.15rem] leading-none self-start">
            {data.icon}
          </span>
          <div className="[grid-area:name] flex items-center gap-2 min-w-0 self-center pr-2">
            <span className="max-w-full text-[18px] font-semibold leading-none truncate" style={{ color: customTextColor || '#edf4fb' }}>
              {displayName}
            </span>
            {language && LANGUAGE_ICONS[language] && (
              <span
                className="shrink-0 text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-md"
                style={{ background: LANGUAGE_COLORS[language] + '30', color: LANGUAGE_COLORS[language] }}
                title={language}
              >
                {LANGUAGE_ICONS[language]}
              </span>
            )}
          </div>
          {summaryLines.length > 0 ? (
            <div className="[grid-area:summary] max-w-full pr-2 pt-0.5 text-[10px] font-mono text-slate-200 leading-tight break-words">
              {summaryLines.join('  ·  ')}
            </div>
          ) : (
            <div className="[grid-area:summary] max-w-full pr-2 pt-0.5 text-[10px] text-slate-500">Ready for configuration</div>
          )}
          <div className="[grid-area:class] max-w-full pr-2 pt-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-500 truncate">
            {formatComponentName(data.componentType)}
          </div>
        </div>
      </div>
      {/* Source (output) — diamond, amber */}
      <Handle
        type="source"
        position={Position.Right}
        className={`${selected ? '!w-3 !h-3 !bg-[rgba(252,211,77,0.98)] !border-[rgba(254,240,138,1)]' : '!w-2.5 !h-2.5 !bg-[rgba(251,191,36,0.88)] !border-[rgba(253,224,71,0.80)]'} !rounded-sm !rotate-45 hover:!bg-[rgba(252,211,77,0.96)] hover:!border-[rgba(254,240,138,0.95)] !transition-colors`}
      />
    </div>
  );
}
