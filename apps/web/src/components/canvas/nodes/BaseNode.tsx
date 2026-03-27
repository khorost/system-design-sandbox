import { getDefinition } from '@system-design-sandbox/component-library';
import { Handle, type NodeProps, Position } from '@xyflow/react';

import { LANGUAGE_COLORS, LANGUAGE_ICONS } from '../../../constants/colors.ts';
import { CLIENT_TYPES } from '../../../constants/componentTypes.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { NodeEma } from '../../../store/simulationStore.ts';
import { useSimulationStore } from '../../../store/simulationStore.ts';
import type { ComponentNode, ComponentType } from '../../../types/index.ts';
import { ComponentIcon } from '../../ui/ComponentIcon.tsx';
import { getComponentIcon } from '../controls/paletteData.ts';

interface BaseNodeProps {
  nodeProps: NodeProps<ComponentNode>;
  borderColor: string;
  bgColor: string;
  hideTargetHandle?: boolean;
}

type UtilVisualState = {
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  tint: string;
  glow: string;
  label: string;
};

function getUtilState(util: number): UtilVisualState | null {
  if (util > 0.85) {
    return {
      badgeBg: 'rgba(248,113,113,0.96)',
      badgeBorder: 'rgba(254,202,202,0.46)',
      badgeText: '#fff7f7',
      tint: 'rgba(248,113,113,0.08)',
      glow: 'rgba(248,113,113,0.12)',
      label: 'overload',
    };
  }
  if (util > 0.6) {
    return {
      badgeBg: 'rgba(251,191,36,0.94)',
      badgeBorder: 'rgba(254,240,138,0.38)',
      badgeText: '#fff9eb',
      tint: 'rgba(251,191,36,0.07)',
      glow: 'rgba(251,191,36,0.10)',
      label: 'hot',
    };
  }
  if (util > 0.05) {
    return {
      badgeBg: 'rgba(34,197,94,0.94)',
      badgeBorder: 'rgba(187,247,208,0.34)',
      badgeText: '#f0fdf4',
      tint: 'rgba(34,197,94,0.05)',
      glow: 'rgba(34,197,94,0.08)',
      label: 'normal',
    };
  }
  return null;
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
  const maxRps = (v('max_rps_per_broker') ?? v('max_rps_per_node') ?? v('max_rps_per_instance')) as number | undefined;

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
      return [`${nodes ?? 3} nodes, ${v('queues')} queues${v('ha_mode') ? ', HA' : ''}`];
    case 'load_balancer':
      return [`${v('algorithm')}`, `${fmtK((v('max_connections') as number) ?? 0)} conn`];
    case 'api_gateway':
      return [`${fmtK(maxRps ?? 0)} rps, lim ${fmtK((v('rate_limit') as number) ?? 0)}`];
    case 'cdn': {
      const rules = (config.cacheRules ?? def?.defaultConfig?.cacheRules) as Array<{ tag: string; hitRatio: number }> | undefined;
      if (rules && rules.length > 0) {
        const parts = rules.map(r => `${r.tag} ${Math.round(r.hitRatio * 100)}%`);
        return [parts.join(', '), `${v('edge_locations')} edges`];
      }
      return [`${v('edge_locations')} edges`];
    }
    case 's3': {
      const rules = (config.responseRules ?? def?.defaultConfig?.responseRules) as Array<{ tag: string; responseSizeKb: number }> | undefined;
      if (rules && rules.length > 0) {
        const parts = rules.map(r => `${r.tag} ${fmtK(r.responseSizeKb)}B`);
        return [parts.join(', '), `${fmtK(maxRps ?? 0)} rps`];
      }
      return [`${fmtK(maxRps ?? 0)} rps`];
    }
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
  const nodeTraffic = useSimulationStore((s) => s.nodeTagTraffic[id]);

  const customColor = data.config.color as string | undefined;
  const customTextColor = data.config.textColor as string | undefined;
  const displayName = ((data.config.name as string | undefined)?.trim()) || data.label;
  const displayIcon = getComponentIcon(data.componentType as ComponentType, data.icon);
  const language = data.config.language as string | undefined;
  const maxEma = ema ? Math.max(ema.ema1, ema.ema5, ema.ema30) : 0;
  const utilState = isRunning ? getUtilState(maxEma) : null;

  // Compute node error rate from incoming traffic
  let nodeErrRate = 0;
  if (isRunning && nodeTraffic?.incoming) {
    let totalRps = 0, totalFailed = 0;
    for (const t of Object.values(nodeTraffic.incoming)) {
      totalRps += t.rps;
      totalFailed += t.failedRps;
    }
    if (totalRps > 0) nodeErrRate = totalFailed / totalRps;
  }

  const errBorder = isRunning && nodeErrRate > 0.01;
  const frameBorder = selected ? '#7ddcff' : errBorder ? '#ef4444' : (customColor || borderColor);
  const summaryLines = getNodeSummary(data.componentType, data.config);
  const def = getDefinition(data.componentType as Parameters<typeof getDefinition>[0]);
  const hasBrokersOrNodes = def?.params.some(p => p.key === 'brokers' || p.key === 'nodes');
  const replicas = hasBrokersOrNodes ? 1 : ((data.config.replicas as number) ?? def?.defaults?.replicas ?? 1);
  const isClient = CLIENT_TYPES.has(data.componentType as ComponentType);
  const showReplicas = !isClient && replicas > 1;

  return (
    <div
      onClick={() => selectNode(id)}
      className="min-w-[160px] max-w-[240px] cursor-pointer transition-all relative rounded-lg"
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.08)), ${utilState?.tint ?? 'rgba(0,0,0,0)'}, ${bgColor}`,
        border: `1px solid ${frameBorder}`,
        boxShadow: selected
          ? '0 0 0 2px rgba(125,220,255,0.72), 0 0 0 5px rgba(110,220,255,0.12), 0 0 20px rgba(92,141,255,0.22), 0 10px 20px rgba(3,8,14,0.24)'
          : utilState
            ? `0 0 0 1px ${utilState.glow}, 0 8px 14px ${utilState.glow}`
            : '0 8px 16px rgba(3,8,14,0.18)',
      }}
    >
      {selected ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(244,251,255,0.22)' }}
        />
      ) : null}
      {isRunning && ema && utilState && (
        <div
          className="absolute -top-2.5 right-2 z-10 flex items-center gap-1 rounded-md border px-1.5 py-0.5 shadow-sm"
          style={{ background: utilState.badgeBg, borderColor: utilState.badgeBorder, color: utilState.badgeText }}
        >
          <span className="text-[8px] font-semibold uppercase tracking-[0.08em] leading-none whitespace-nowrap">
            {utilState.label}
          </span>
          <span className="font-mono text-[8px] font-bold leading-none whitespace-nowrap">
            {Math.round(ema.ema1 * 100)}/{Math.round(ema.ema5 * 100)}/{Math.round(ema.ema30 * 100)}
          </span>
          {getTrendArrow(ema) && (
            <span className="text-[9px] leading-none">{getTrendArrow(ema)}</span>
          )}
        </div>
      )}
      {isRunning && nodeErrRate > 0.01 && (
        <div
          className="absolute -top-2.5 left-2 z-10 flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 shadow-sm"
          style={{
            background: nodeErrRate > 0.5 ? 'rgba(239,68,68,0.95)' : 'rgba(239,68,68,0.80)',
            borderColor: 'rgba(254,202,202,0.4)',
            color: '#fff',
          }}
        >
          <span className="text-[8px] font-bold leading-none whitespace-nowrap">
            ⚠ {nodeErrRate >= 1 ? '100' : nodeErrRate >= 0.1 ? Math.round(nodeErrRate * 100) : (nodeErrRate * 100).toFixed(1)}%
          </span>
        </div>
      )}
      {/* Target (input) — circle, teal */}
      {!hideTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className={`${selected ? '!w-2.5 !h-2.5 !bg-[rgba(153,246,228,0.92)] !border-[rgba(236,253,245,0.95)]' : '!w-2 !h-2 !bg-[rgba(109,215,216,0.72)] !border-[rgba(167,243,208,0.62)]'} !rounded-full hover:!bg-[rgba(153,246,228,0.88)] hover:!border-[rgba(204,251,241,0.88)] !transition-colors`}
        />
      )}
      <div className="pl-3 pr-3.5 py-2.5">
        <div className="flex items-start gap-1.5">
          <ComponentIcon icon={displayIcon} alt={displayName} className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[1.15rem] leading-none" imgClassName="h-6 w-6 object-contain" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold leading-tight truncate" style={{ color: customTextColor || '#edf4fb' }}>
                {displayName}
              </span>
              {showReplicas && (
                <span className="shrink-0 rounded border border-[rgba(110,220,255,0.25)] bg-[rgba(110,220,255,0.10)] px-1 py-px font-mono text-[9px] font-bold leading-none text-[var(--color-accent)]">
                  &times;{replicas}
                </span>
              )}
              {language && LANGUAGE_ICONS[language] && (
                <span
                  className="shrink-0 text-[8px] font-bold leading-none px-1 py-px rounded"
                  style={{ background: LANGUAGE_COLORS[language] + '30', color: LANGUAGE_COLORS[language] }}
                  title={language}
                >
                  {LANGUAGE_ICONS[language]}
                </span>
              )}
            </div>
            {summaryLines.length > 0 ? (
              <div className="mt-0.5 text-[9px] font-mono text-slate-300 leading-tight truncate">
                {summaryLines.join('  \u00b7  ')}
              </div>
            ) : (
              <div className="mt-0.5 text-[9px] text-slate-500">Ready for configuration</div>
            )}
            <div className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-slate-500 truncate">
              {formatComponentName(data.componentType)}
            </div>
          </div>
        </div>
      </div>
      {/* Source (output) — diamond, amber */}
      <Handle
        type="source"
        position={Position.Right}
        className={`${selected ? '!w-3 !h-3 !bg-[rgba(252,211,77,0.94)] !border-[rgba(254,240,138,0.95)]' : '!w-2.5 !h-2.5 !bg-[rgba(251,191,36,0.76)] !border-[rgba(253,224,71,0.66)]'} !rounded-sm !rotate-45 hover:!bg-[rgba(252,211,77,0.92)] hover:!border-[rgba(254,240,138,0.88)] !transition-colors`}
      />
    </div>
  );
}
