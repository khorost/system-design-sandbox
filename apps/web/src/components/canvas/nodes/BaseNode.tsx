import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentNode, ComponentType } from '../../../types/index.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import type { NodeEma } from '../../../store/simulationStore.ts';
import { getDefinition } from '@system-design-sandbox/component-library';
import { CLIENT_TYPES } from '../../../constants/componentTypes.ts';
import { LANGUAGE_ICONS, LANGUAGE_COLORS } from '../../../constants/colors.ts';

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
  const language = data.config.language as string | undefined;
  const maxEma = ema ? Math.max(ema.ema1, ema.ema5, ema.ema30) : 0;
  const utilColor = isRunning ? getUtilColor(maxEma) : '';
  const activeBorder = selected ? '#3b82f6' : utilColor || customColor || borderColor;
  const summaryLines = getNodeSummary(data.componentType, data.config);

  return (
    <div
      onClick={() => selectNode(id)}
      className="rounded shadow-lg min-w-[170px] cursor-pointer transition-all relative"
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
      {isRunning && ema && maxEma > 0 && (
        <div
          className="absolute -top-5 -right-5 rounded flex items-center gap-1.5 px-3 py-2 text-white z-10 shadow-md"
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
          className="!w-2.5 !h-2.5 !rounded-full !bg-teal-500 !border-teal-400 hover:!bg-teal-300 hover:!border-teal-200 !transition-colors"
        />
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{data.icon}</span>
          <span className="text-sm font-semibold truncate max-w-[120px]" style={{ color: customTextColor || '#e2e8f0' }}>
            {data.label}
          </span>
          {language && LANGUAGE_ICONS[language] && (
            <span
              className="text-[9px] font-bold leading-none px-1.5 py-0.5 rounded"
              style={{ background: LANGUAGE_COLORS[language] + '30', color: LANGUAGE_COLORS[language] }}
              title={language}
            >
              {LANGUAGE_ICONS[language]}
            </span>
          )}
        </div>
        {summaryLines.length > 0 && (
          <div className="space-y-1 mb-2 pl-1">
            {summaryLines.map((line, i) => (
              <div key={i} className="text-[11px] font-mono text-slate-400 leading-snug">{line}</div>
            ))}
          </div>
        )}
        <div className="text-[10px] text-slate-500 mt-1">{data.componentType}</div>
      </div>
      {/* Source (output) — diamond, amber */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !rounded-sm !rotate-45 !bg-amber-500 !border-amber-400 hover:!bg-amber-300 hover:!border-amber-200 !transition-colors"
      />
    </div>
  );
}
