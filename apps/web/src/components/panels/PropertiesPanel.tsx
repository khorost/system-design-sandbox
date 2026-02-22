import { getDefinition } from '@system-design-sandbox/component-library';
import { useState } from 'react';

import { createArchitecture, updateArchitecture } from '../../api/architectures.ts';
import { CONFIG } from '../../config/constants.ts';
import { DEFAULT_BORDER_COLORS } from '../../constants/colors.ts';
import { CLIENT_TYPES } from '../../constants/componentTypes.ts';
import { useAuthStore } from '../../store/authStore.ts';
import { useCanvasStore } from '../../store/canvasStore.ts';
import type { ArchitectureSchema } from '../../types/index.ts';
import type { EdgeRoutingRule,ProtocolType } from '../../types/index.ts';
import { DISK_COMPONENT_TYPES, DISK_PROTOCOLS,NETWORK_PROTOCOLS } from '../../types/index.ts';
import { computeEffectiveLatency, CONTAINER_TYPES, isValidNesting } from '../../utils/networkLatency.ts';
import { notify } from '../../utils/notifications.ts';
import { paletteItems } from '../canvas/controls/paletteData.ts';
import { SavedArchitecturesModal } from '../SavedArchitecturesModal.tsx';
import { NumberInput } from '../ui/NumberInput.tsx';

interface TagWeightEntry {
  tag: string;
  weight: number;
}

function getDefaultColor(componentType: string, nodeType?: string): string {
  return DEFAULT_BORDER_COLORS[componentType] ?? DEFAULT_BORDER_COLORS[nodeType ?? ''] ?? '#475569';
}

function getProtocolOptions(targetComponentType?: string): ProtocolType[] {
  if (targetComponentType && DISK_COMPONENT_TYPES.has(targetComponentType)) {
    return DISK_PROTOCOLS;
  }
  return NETWORK_PROTOCOLS;
}

interface ParamDef {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

const COMPONENT_PARAMS: Record<string, ParamDef[]> = {
  web_client: [
    { key: 'concurrent_users_k', label: 'Concurrent Users (K)', type: 'number', min: 0.001, max: 100000 },
    { key: 'requests_per_user', label: 'Requests/User/sec', type: 'number', min: 0.001, max: 1000 },
    { key: 'payload_size_kb', label: 'Payload (KB)', type: 'number', min: 0.1, max: 102400 },
  ],
  mobile_client: [
    { key: 'concurrent_users_k', label: 'Concurrent Users (K)', type: 'number', min: 0.001, max: 100000 },
    { key: 'requests_per_user', label: 'Requests/User/sec', type: 'number', min: 0.001, max: 1000 },
    { key: 'payload_size_kb', label: 'Payload (KB)', type: 'number', min: 0.1, max: 102400 },
  ],
  external_api: [
    { key: 'concurrent_users_k', label: 'Consumers (K)', type: 'number', min: 0.001, max: 100000 },
    { key: 'requests_per_user', label: 'Requests/Consumer/sec', type: 'number', min: 0.001, max: 1000 },
    { key: 'auth_type', label: 'Auth Type', type: 'select', options: ['api_key', 'oauth2', 'basic'] },
  ],
  service: [
    { key: 'replicas', label: 'Replicas', type: 'number', min: 1, max: 1000 },
    { key: 'cpu_cores', label: 'CPU Cores', type: 'number', min: 0.1, max: 1024 },
    { key: 'memory_gb', label: 'Memory (GB)', type: 'number', min: 0.064, max: 1024 },
    { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', min: 1, max: 10000000 },
    { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', min: 0, max: 60000 },
    { key: 'language', label: 'Language', type: 'select', options: ['', 'go', 'java', 'python', 'rust', 'typescript', 'csharp', 'kotlin', 'ruby', 'php', 'cpp', 'scala', 'elixir'] },
  ],
  postgresql: [
    { key: 'replicas', label: 'Replicas', type: 'number', min: 1, max: 1000 },
    { key: 'read_replicas', label: 'Read Replicas', type: 'number', min: 0, max: 100 },
    { key: 'max_connections', label: 'Max Connections', type: 'number', min: 1, max: 1000000 },
    { key: 'storage_gb', label: 'Storage (GB)', type: 'number', min: 1, max: 1000000 },
  ],
  redis: [
    { key: 'mode', label: 'Mode', type: 'select', options: ['standalone', 'cluster', 'sentinel'] },
    { key: 'memory_gb', label: 'Memory (GB)', type: 'number', min: 0.064, max: 1024 },
    { key: 'max_connections', label: 'Max Connections', type: 'number', min: 1, max: 1000000 },
  ],
  kafka: [
    { key: 'brokers', label: 'Brokers', type: 'number', min: 1, max: 1000 },
    { key: 'partitions', label: 'Partitions', type: 'number', min: 1, max: 100000 },
    { key: 'replication_factor', label: 'Replication Factor', type: 'number', min: 1, max: 10 },
  ],
  load_balancer: [
    { key: 'algorithm', label: 'Algorithm', type: 'select', options: ['round_robin', 'least_conn', 'ip_hash'] },
    { key: 'max_connections', label: 'Max Connections', type: 'number', min: 1, max: 1000000 },
  ],
  api_gateway: [
    { key: 'max_rps', label: 'Max RPS', type: 'number', min: 1, max: 10000000 },
    { key: 'rate_limit', label: 'Rate Limit', type: 'number', min: 1, max: 100000000 },
  ],
  docker_container: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', min: 0, max: 1000 },
    { key: 'failure_probability', label: 'Failure Probability', type: 'number', min: 0, max: 1, step: 0.01 },
  ],
  kubernetes_pod: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', min: 0, max: 1000 },
    { key: 'failure_probability', label: 'Failure Probability', type: 'number', min: 0, max: 1, step: 0.01 },
  ],
  vm_instance: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', min: 0, max: 1000 },
    { key: 'failure_probability', label: 'Failure Probability', type: 'number', min: 0, max: 1, step: 0.01 },
  ],
  rack: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', min: 0, max: 1000 },
    { key: 'power_redundancy', label: 'Power Redundancy', type: 'select', options: ['N', 'N+1', '2N'] },
  ],
  datacenter: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', min: 0, max: 1000 },
    { key: 'inter_rack_latency_ms', label: 'Inter-Rack Latency (ms)', type: 'number', min: 0, max: 100 },
    { key: 'region', label: 'Region', type: 'text' },
  ],
};

const inputClass = "w-full mt-1 px-3 py-2 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500";

function EdgeProperties() {
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const selectEdge = useCanvasStore((s) => s.selectEdge);

  const edge = edges.find((e) => e.id === selectedEdgeId);
  if (!edge) return null;

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const data = edge.data;

  const allowedProtocols = getProtocolOptions(targetNode?.data.componentType);
  const currentProtocol = data?.protocol ?? 'REST';
  const effectiveProtocol = allowedProtocols.includes(currentProtocol) ? currentProtocol : allowedProtocols[0];

  // Auto-correct protocol if it's not in the allowed list
  if (effectiveProtocol !== currentProtocol) {
    updateEdgeData(edge.id, { protocol: effectiveProtocol });
  }

  const handleDelete = () => {
    onEdgesChange([{ id: edge.id, type: 'remove' }]);
    selectEdge(null);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xl">{'🔗'}</span>
          <div>
            <h2 className="text-base font-bold text-slate-200">Connection</h2>
            <p className="text-xs text-slate-400 truncate">
              {sourceNode?.data.label ?? edge.source} → {targetNode?.data.label ?? edge.target}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label htmlFor={`edge-${edge.id}-protocol`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Protocol</label>
          <select
            id={`edge-${edge.id}-protocol`}
            value={effectiveProtocol}
            onChange={(e) => updateEdgeData(edge.id, { protocol: e.target.value as ProtocolType })}
            className={inputClass}
          >
            {allowedProtocols.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`edge-${edge.id}-latency`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latency Override (ms)</label>
          <NumberInput
            id={`edge-${edge.id}-latency`}
            value={data?.latencyMs ?? 1}
            onChange={(n) => updateEdgeData(edge.id, { latencyMs: n })}
            min={0}
            max={60000}
            className={inputClass}
          />
        </div>

        {(() => {
          const effLatency = computeEffectiveLatency(edge.source, edge.target, nodes);
          return effLatency > 0 ? (
            <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 rounded border border-blue-500/20">
              <span className="text-xs font-semibold text-slate-300">Effective Latency (auto)</span>
              <span className="text-sm font-mono font-bold text-blue-400">{effLatency.toFixed(2)} ms</span>
            </div>
          ) : null;
        })()}

        <div>
          <label htmlFor={`edge-${edge.id}-bandwidth`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bandwidth (Mbps)</label>
          <NumberInput
            id={`edge-${edge.id}-bandwidth`}
            value={data?.bandwidthMbps ?? 1000}
            onChange={(n) => updateEdgeData(edge.id, { bandwidthMbps: n })}
            min={1}
            max={100000}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={`edge-${edge.id}-timeout`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeout (ms)</label>
          <NumberInput
            id={`edge-${edge.id}-timeout`}
            value={data?.timeoutMs ?? 5000}
            onChange={(n) => updateEdgeData(edge.id, { timeoutMs: n })}
            min={100}
            max={300000}
            className={inputClass}
          />
        </div>

        <EdgeRoutingRulesEditor edgeId={edge.id} rules={(data?.routingRules as EdgeRoutingRule[] | undefined) ?? []} updateEdgeData={updateEdgeData} />
      </div>

      <div className="p-4 border-t border-[var(--color-border)]">
        <button
          onClick={handleDelete}
          className="w-full px-4 py-2 text-sm text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
        >
          Delete Connection
        </button>
      </div>
    </div>
  );
}

function EdgeRoutingRulesEditor({ edgeId, rules, updateEdgeData }: {
  edgeId: string;
  rules: EdgeRoutingRule[];
  updateEdgeData: (id: string, data: Record<string, unknown>) => void;
}) {
  const [newTag, setNewTag] = useState('');

  const update = (updated: EdgeRoutingRule[]) => {
    updateEdgeData(edgeId, { routingRules: updated.length > 0 ? updated : undefined });
  };

  const addRule = () => {
    const tag = newTag.trim() || 'default';
    if (rules.some(r => r.tag === tag)) return;
    update([...rules, { tag, weight: 1.0 }]);
    setNewTag('');
  };

  const removeRule = (idx: number) => {
    update(rules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, field: 'tag' | 'weight' | 'outTag', value: string | number) => {
    const updated = rules.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'outTag' && value === '') {
        const { outTag: _, ...rest } = r;
        return rest;
      }
      return { ...r, [field]: value };
    });
    update(updated);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Routing Rules</label>
        <button
          onClick={addRule}
          className="text-xs px-2 py-0.5 text-blue-400 border border-blue-400/30 rounded hover:bg-blue-400/10 transition-colors"
        >
          + Add Rule
        </button>
      </div>
      {rules.length === 0 ? (
        <p className="text-xs text-slate-400">No rules — equal distribution</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  id={`edge-${edgeId}-rule-${idx}-tag`}
                  value={rule.tag}
                  placeholder="tag"
                  aria-label={`Rule ${idx + 1} tag`}
                  onChange={(e) => updateRule(idx, 'tag', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  id={`edge-${edgeId}-rule-${idx}-weight`}
                  min={0}
                  step={0.1}
                  value={rule.weight}
                  aria-label={`Rule ${idx + 1} weight`}
                  onChange={(e) => updateRule(idx, 'weight', Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => removeRule(idx)}
                  aria-label={`Remove rule ${idx + 1}`}
                  className="text-red-400 hover:text-red-300 text-xs px-1"
                >
                  x
                </button>
              </div>
              <div className="flex items-center gap-1 pl-1">
                <span className="text-[10px] text-slate-400">→</span>
                <input
                  type="text"
                  value={rule.outTag ?? ''}
                  placeholder="rewrite tag"
                  onChange={(e) => updateRule(idx, 'outTag', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-0.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={newTag}
          placeholder="new tag name"
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRule()}
          className="flex-1 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}

function NodeLink({ node, onClick }: { node: { data: { icon: string; label: string } }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors">
      <span>{node.data.icon}</span>
      <span className="flex-1 text-left truncate">{node.data.label}</span>
      <span className="text-slate-400">&rarr;</span>
    </button>
  );
}

function NodeProperties() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const setNodeParent = useCanvasStore((s) => s.setNodeParent);
  const focusNode = useCanvasStore((s) => s.focusNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  if (!selectedNode) return null;

  const paletteItem = paletteItems.find((i) => i.type === selectedNode.data.componentType);
  const def = getDefinition(selectedNode.data.componentType);
  const params: ParamDef[] = COMPONENT_PARAMS[selectedNode.data.componentType]
    ?? def?.params.map(p => ({
      key: p.key,
      label: p.label,
      type: p.type === 'boolean' ? 'select' as const : p.type === 'select' ? 'select' as const : p.type === 'string' ? 'text' as const : 'number' as const,
      ...(p.type === 'select' ? { options: p.options } : {}),
      ...(p.type === 'boolean' ? { options: ['true', 'false'] } : {}),
      ...(p.min != null ? { min: p.min } : {}),
      ...(p.max != null ? { max: p.max } : {}),
    }))
    ?? [];
  const config = selectedNode.data.config;

  const configVal = (key: string): unknown => {
    if (config[key] != null) return config[key];
    return def?.params.find(p => p.key === key)?.default;
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xl">{paletteItem?.icon || selectedNode.data.icon}</span>
          <div>
            <h2 className="text-base font-bold text-slate-200">{selectedNode.data.label}</h2>
            <p className="text-xs text-slate-400">{selectedNode.data.componentType}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label htmlFor={`node-${selectedNode.id}-name`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</label>
          <input
            type="text"
            id={`node-${selectedNode.id}-name`}
            value={(config.name as string) || selectedNode.data.label}
            onChange={(e) => updateNodeConfig(selectedNode.id, { name: e.target.value })}
            maxLength={CONFIG.UI.LABEL_MAX_LENGTH}
            className={inputClass}
          />
        </div>

        {(() => {
          const defaultColor = getDefaultColor(selectedNode.data.componentType, selectedNode.type);
          const defaultTextColor = '#e2e8f0';
          return (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Colors</label>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    id={`node-${selectedNode.id}-borderColor`}
                    value={(config.color as string) || defaultColor}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { color: e.target.value })}
                    title="Border color"
                    aria-label="Border color"
                    className="w-7 h-7 rounded border border-[var(--color-border)] bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
                  />
                  <span className="text-[10px] text-slate-400">Border</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    id={`node-${selectedNode.id}-textColor`}
                    value={(config.textColor as string) || defaultTextColor}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { textColor: e.target.value })}
                    title="Text color"
                    aria-label="Text color"
                    className="w-7 h-7 rounded border border-[var(--color-border)] bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
                  />
                  <span className="text-[10px] text-slate-400">Text</span>
                </div>
                {(config.color != null || config.textColor != null) && (
                  <button
                    onClick={() => updateNodeConfig(selectedNode.id, { color: undefined, textColor: undefined })}
                    className="ml-auto text-xs text-slate-400 hover:text-slate-300 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {params.map((param) => (
          <div key={param.key}>
            <label htmlFor={`node-${selectedNode.id}-param-${param.key}`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {param.label}
            </label>
            {param.type === 'select' ? (
              <select
                id={`node-${selectedNode.id}-param-${param.key}`}
                value={(configVal(param.key) as string) || param.options?.[0] || ''}
                onChange={(e) => updateNodeConfig(selectedNode.id, { [param.key]: e.target.value })}
                className={inputClass}
              >
                {param.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : param.type === 'number' ? (
              <NumberInput
                id={`node-${selectedNode.id}-param-${param.key}`}
                value={(configVal(param.key) as number) ?? 0}
                onChange={(n) => updateNodeConfig(selectedNode.id, { [param.key]: n })}
                min={param.min}
                max={param.max}
                step={param.step}
                className={inputClass}
              />
            ) : (
              <input
                type={param.type}
                id={`node-${selectedNode.id}-param-${param.key}`}
                value={(configVal(param.key) as string) ?? ''}
                onChange={(e) => updateNodeConfig(selectedNode.id, { [param.key]: e.target.value })}
                maxLength={CONFIG.UI.CONFIG_VALUE_MAX_LENGTH}
                className={inputClass}
              />
            )}
          </div>
        ))}

        {/* Container children list */}
        {CONTAINER_TYPES.has(selectedNode.data.componentType) && (() => {
          const children = nodes.filter(n => n.parentId === selectedNode.id);
          return (
            <div className="rounded border border-purple-500/20 bg-purple-500/10 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-semibold text-slate-300">Children</span>
                <span className="text-sm font-mono font-bold text-purple-400">{children.length}</span>
              </div>
              {children.length > 0 && (
                <div className="border-t border-purple-500/20">
                  {children.map(child => (
                    <NodeLink key={child.id} node={child} onClick={() => focusNode(child.id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Parent container dropdown — for all node types */}
        {(() => {
          const validParents = nodes.filter(n =>
            CONTAINER_TYPES.has(n.data.componentType) &&
            n.id !== selectedNode.id &&
            isValidNesting(selectedNode.data.componentType, n.data.componentType)
          );
          const parentNode = selectedNode.parentId ? nodes.find(n => n.id === selectedNode.parentId) : undefined;
          return validParents.length > 0 ? (
            <div>
              <label htmlFor={`node-${selectedNode.id}-parent`} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent Container</label>
              {parentNode && (
                <div className="mt-1 mb-1 rounded border border-purple-500/20 bg-purple-500/10 overflow-hidden">
                  <NodeLink node={parentNode} onClick={() => focusNode(parentNode.id)} />
                </div>
              )}
              <select
                id={`node-${selectedNode.id}-parent`}
                value={selectedNode.parentId ?? ''}
                onChange={(e) => setNodeParent(selectedNode.id, e.target.value || null)}
                className={inputClass}
              >
                <option value="">None (top-level)</option>
                {validParents.map((c) => (
                  <option key={c.id} value={c.id}>{c.data.icon} {c.data.label} ({c.data.componentType})</option>
                ))}
              </select>
            </div>
          ) : null;
        })()}

        {CLIENT_TYPES.has(selectedNode.data.componentType) && (() => {
          const usersK = (configVal('concurrent_users_k') as number) ?? 1;
          const rpu = (configVal('requests_per_user') as number) ?? 0.1;
          const effectiveRps = usersK * 1000 * rpu;
          return (
            <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 rounded border border-blue-500/20">
              <span className="text-xs font-semibold text-slate-300">Effective RPS</span>
              <span className="text-sm font-mono font-bold text-blue-400">{Math.round(effectiveRps)}/s</span>
            </div>
          );
        })()}

        {CLIENT_TYPES.has(selectedNode.data.componentType) && (
          <TagDistributionEditor
            nodeId={selectedNode.id}
            tags={(config.tagDistribution as TagWeightEntry[] | undefined) ?? []}
            updateNodeConfig={updateNodeConfig}
          />
        )}

        {params.length === 0 && (
          <p className="text-sm text-slate-400">No configurable parameters for this component type.</p>
        )}
      </div>

      <div className="p-4 border-t border-[var(--color-border)]">
        <button
          onClick={() => removeNode(selectedNode.id)}
          className="w-full px-4 py-2 text-sm text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
        >
          Delete Component
        </button>
      </div>
    </div>
  );
}

function TagDistributionEditor({ nodeId, tags, updateNodeConfig }: {
  nodeId: string;
  tags: TagWeightEntry[];
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
}) {
  const [newTag, setNewTag] = useState('');

  const update = (updated: TagWeightEntry[]) => {
    updateNodeConfig(nodeId, { tagDistribution: updated.length > 0 ? updated : undefined });
  };

  const addTag = () => {
    const tag = newTag.trim() || 'read';
    if (tags.some(t => t.tag === tag)) return;
    update([...tags, { tag, weight: 1.0 }]);
    setNewTag('');
  };

  const removeTag = (idx: number) => {
    update(tags.filter((_, i) => i !== idx));
  };

  const updateTag = (idx: number, field: 'tag' | 'weight', value: string | number) => {
    const updated = tags.map((t, i) => i === idx ? { ...t, [field]: value } : t);
    update(updated);
  };

  const totalWeight = tags.reduce((s, t) => s + t.weight, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Traffic Tags</label>
        <button
          onClick={addTag}
          className="text-xs px-2 py-0.5 text-blue-400 border border-blue-400/30 rounded hover:bg-blue-400/10 transition-colors"
        >
          + Add Tag
        </button>
      </div>
      {tags.length === 0 ? (
        <p className="text-xs text-slate-400">All traffic tagged as 'default'</p>
      ) : (
        <div className="space-y-2">
          {tags.map((entry, idx) => {
            const pct = totalWeight > 0 ? ((entry.weight / totalWeight) * 100).toFixed(0) : '0';
            return (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  id={`node-${nodeId}-dist-tag-${idx}`}
                  value={entry.tag}
                  placeholder="tag"
                  aria-label={`Tag ${idx + 1} name`}
                  onChange={(e) => updateTag(idx, 'tag', e.target.value)}
                  className="flex-1 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  id={`node-${nodeId}-dist-weight-${idx}`}
                  min={0}
                  step={0.1}
                  value={entry.weight}
                  aria-label={`Tag ${idx + 1} weight`}
                  onChange={(e) => updateTag(idx, 'weight', Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                <button
                  onClick={() => removeTag(idx)}
                  aria-label={`Remove tag ${idx + 1}`}
                  className="text-red-400 hover:text-red-300 text-xs px-1"
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          id={`node-${nodeId}-dist-new-tag`}
          value={newTag}
          placeholder="new tag name"
          aria-label="New tag name"
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag()}
          className="flex-1 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
}

function buildSchema(nodes: import('../../types/index.ts').ComponentNode[], edges: import('../../types/index.ts').ComponentEdge[], schemaName: string): ArchitectureSchema {
  const now = new Date().toISOString();
  return {
    version: '1.0',
    metadata: { name: schemaName || 'My Architecture', createdAt: now, updatedAt: now },
    nodes,
    edges,
  };
}

function SchemaProperties() {
  const user = useAuthStore((s) => s.user);
  const schemaName = useCanvasStore((s) => s.schemaName);
  const schemaDescription = useCanvasStore((s) => s.schemaDescription);
  const schemaTags = useCanvasStore((s) => s.schemaTags);
  const isPublic = useCanvasStore((s) => s.isPublic);
  const architectureId = useCanvasStore((s) => s.architectureId);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setSchemaName = useCanvasStore((s) => s.setSchemaName);
  const setSchemaDescription = useCanvasStore((s) => s.setSchemaDescription);
  const setSchemaTags = useCanvasStore((s) => s.setSchemaTags);
  const setIsPublic = useCanvasStore((s) => s.setIsPublic);
  const setArchitectureId = useCanvasStore((s) => s.setArchitectureId);

  const [saving, setSaving] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const isAuthenticated = !!user;
  const canSave = isAuthenticated && schemaName.trim().length > 0;

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag || schemaTags.includes(tag)) return;
    setSchemaTags([...schemaTags, tag]);
  };

  const removeTag = (tag: string) => {
    setSchemaTags(schemaTags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && schemaTags.length > 0) {
      removeTag(schemaTags[schemaTags.length - 1]);
    }
  };

  const handleSave = async () => {
    if (!user || !schemaName.trim()) return;
    setSaving(true);
    try {
      const data = buildSchema(nodes, edges, schemaName);
      if (architectureId) {
        await updateArchitecture(architectureId, schemaName, schemaDescription, data, isPublic, schemaTags);
        notify.success('Saved');
      } else {
        const result = await createArchitecture(user.id, schemaName, schemaDescription, data, isPublic, schemaTags);
        setArchitectureId(result.id);
        notify.success('Saved');
      }
    } catch (e) {
      notify.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!user || !saveAsName.trim()) return;
    setSaving(true);
    try {
      const data = buildSchema(nodes, edges, saveAsName);
      const result = await createArchitecture(user.id, saveAsName, schemaDescription, data, isPublic, schemaTags);
      setArchitectureId(result.id);
      setSchemaName(saveAsName);
      setShowSaveAs(false);
      setSaveAsName('');
      notify.success('Saved as new copy');
    } catch (e) {
      notify.error(`Save failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xl">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-200">Architecture</h2>
            <p className="text-xs text-slate-400">Schema properties</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label htmlFor="schema-name" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</label>
          <input
            type="text"
            id="schema-name"
            value={schemaName}
            onChange={(e) => setSchemaName(e.target.value)}
            placeholder="My Architecture"
            maxLength={CONFIG.UI.LABEL_MAX_LENGTH}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="schema-description" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Description</label>
          <textarea
            id="schema-description"
            value={schemaDescription}
            onChange={(e) => setSchemaDescription(e.target.value)}
            placeholder="What does this architecture do?"
            rows={3}
            maxLength={2000}
            className={`${inputClass} resize-y min-h-[60px]`}
          />
        </div>

        <div>
          <label htmlFor="schema-tags" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tags</label>
          <div className="mt-1 flex flex-wrap gap-1 p-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded min-h-[34px]">
            {schemaTags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded">
                {tag}
                <button onClick={() => removeTag(tag)} className="text-blue-400/60 hover:text-blue-300 ml-0.5">&times;</button>
              </span>
            ))}
            <input
              type="text"
              id="schema-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => { if (tagInput.trim()) { addTag(tagInput); setTagInput(''); } }}
              placeholder={schemaTags.length === 0 ? 'Add tags...' : ''}
              className="flex-1 min-w-[60px] bg-transparent text-xs text-slate-200 outline-none px-1 py-0.5"
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Press Enter or comma to add</p>
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="schema-public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-slate-600 bg-[var(--color-bg)] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />
            <label htmlFor="schema-public" className="text-xs text-slate-300">Public</label>
          </div>
        )}

        <div className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
            <span className="text-xs font-semibold text-slate-400">Nodes</span>
            <span className="text-sm font-mono font-bold text-slate-200">{nodes.length}</span>
          </div>
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold text-slate-400">Connections</span>
            <span className="text-sm font-mono font-bold text-slate-200">{edges.length}</span>
          </div>
        </div>

        {isAuthenticated ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cloud Storage</div>

            {architectureId && (
              <p className="text-xs text-slate-400 truncate" title={architectureId}>
                ID: {architectureId.slice(0, 8)}...
              </p>
            )}

            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="w-full px-3 py-2 text-sm text-slate-200 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
            >
              {saving ? 'Saving...' : architectureId ? 'Save' : 'Save to server'}
            </button>

            {!schemaName.trim() && (
              <p className="text-xs text-amber-400">Enter a name to save</p>
            )}

            {showSaveAs ? (
              <div className="space-y-2 p-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
                <input
                  type="text"
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="Name for the copy"
                  maxLength={CONFIG.UI.LABEL_MAX_LENGTH}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAs(); if (e.key === 'Escape') setShowSaveAs(false); }}
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveAs}
                    disabled={!saveAsName.trim() || saving}
                    className="flex-1 px-2 py-1.5 text-xs text-slate-200 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                  >
                    Save copy
                  </button>
                  <button
                    onClick={() => setShowSaveAs(false)}
                    className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-[var(--color-border)] rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setSaveAsName(schemaName); setShowSaveAs(true); }}
                className="w-full px-3 py-2 text-sm text-slate-300 border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
              >
                Save As...
              </button>
            )}

            <button
              onClick={() => setShowOpenModal(true)}
              className="w-full px-3 py-2 text-sm text-slate-300 border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] rounded transition-colors"
            >
              Open from server...
            </button>
          </div>
        ) : (
          <div className="px-3 py-3 rounded border border-blue-500/20 bg-blue-500/5">
            <p className="text-xs text-slate-400">Sign in to save to cloud</p>
          </div>
        )}
      </div>

      {showOpenModal && <SavedArchitecturesModal onClose={() => setShowOpenModal(false)} />}
    </div>
  );
}

export function PropertiesPanel() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);

  if (selectedEdgeId) {
    return <EdgeProperties />;
  }

  if (selectedNodeId) {
    return <NodeProperties />;
  }

  return <SchemaProperties />;
}
