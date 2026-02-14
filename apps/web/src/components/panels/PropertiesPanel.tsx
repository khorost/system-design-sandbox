import { useState } from 'react';
import { useCanvasStore } from '../../store/canvasStore.ts';
import { paletteItems } from '../canvas/controls/paletteData.ts';
import { getDefinition } from '@system-design-sandbox/component-library';
import type { ProtocolType, EdgeRoutingRule } from '../../types/index.ts';
import { DISK_COMPONENT_TYPES, NETWORK_PROTOCOLS, DISK_PROTOCOLS } from '../../types/index.ts';
import { CONTAINER_TYPES, computeEffectiveLatency, isValidNesting } from '../../utils/networkLatency.ts';

interface TagWeightEntry {
  tag: string;
  weight: number;
}

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

const DEFAULT_BORDER_COLORS: Record<string, string> = {
  serviceNode: '#475569',
  databaseNode: '#854d0e',
  cacheNode: '#dc2626',
  queueNode: '#7c3aed',
  gatewayNode: '#059669',
  loadBalancerNode: '#0891b2',
  // containers
  docker_container: '#3b82f6',
  kubernetes_pod: '#8b5cf6',
  vm_instance: '#64748b',
  rack: '#22c55e',
  datacenter: '#f97316',
};

function getDefaultColor(componentType: string, nodeType?: string): string {
  return DEFAULT_BORDER_COLORS[componentType] ?? DEFAULT_BORDER_COLORS[nodeType ?? ''] ?? '#475569';
}

function getProtocolOptions(targetComponentType?: string): ProtocolType[] {
  if (targetComponentType && DISK_COMPONENT_TYPES.has(targetComponentType)) {
    return DISK_PROTOCOLS;
  }
  return NETWORK_PROTOCOLS;
}

const COMPONENT_PARAMS: Record<string, { key: string; label: string; type: 'number' | 'text' | 'select'; options?: string[] }[]> = {
  web_client: [
    { key: 'concurrent_users_k', label: 'Concurrent Users (K)', type: 'number' },
    { key: 'requests_per_user', label: 'Requests/User/sec', type: 'number' },
    { key: 'payload_size_kb', label: 'Payload (KB)', type: 'number' },
  ],
  mobile_client: [
    { key: 'concurrent_users_k', label: 'Concurrent Users (K)', type: 'number' },
    { key: 'requests_per_user', label: 'Requests/User/sec', type: 'number' },
    { key: 'payload_size_kb', label: 'Payload (KB)', type: 'number' },
  ],
  external_api: [
    { key: 'concurrent_users_k', label: 'Consumers (K)', type: 'number' },
    { key: 'requests_per_user', label: 'Requests/Consumer/sec', type: 'number' },
    { key: 'auth_type', label: 'Auth Type', type: 'select', options: ['api_key', 'oauth2', 'basic'] },
  ],
  service: [
    { key: 'replicas', label: 'Replicas', type: 'number' },
    { key: 'cpu_cores', label: 'CPU Cores', type: 'number' },
    { key: 'memory_gb', label: 'Memory (GB)', type: 'number' },
    { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number' },
    { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number' },
    { key: 'language', label: 'Language', type: 'select', options: ['', 'go', 'java', 'python', 'rust', 'typescript', 'csharp', 'kotlin', 'ruby', 'php', 'cpp', 'scala', 'elixir'] },
  ],
  postgresql: [
    { key: 'replicas', label: 'Replicas', type: 'number' },
    { key: 'read_replicas', label: 'Read Replicas', type: 'number' },
    { key: 'max_connections', label: 'Max Connections', type: 'number' },
    { key: 'storage_gb', label: 'Storage (GB)', type: 'number' },
  ],
  redis: [
    { key: 'mode', label: 'Mode', type: 'select', options: ['standalone', 'cluster', 'sentinel'] },
    { key: 'memory_gb', label: 'Memory (GB)', type: 'number' },
    { key: 'max_connections', label: 'Max Connections', type: 'number' },
  ],
  kafka: [
    { key: 'brokers', label: 'Brokers', type: 'number' },
    { key: 'partitions', label: 'Partitions', type: 'number' },
    { key: 'replication_factor', label: 'Replication Factor', type: 'number' },
  ],
  load_balancer: [
    { key: 'algorithm', label: 'Algorithm', type: 'select', options: ['round_robin', 'least_conn', 'ip_hash'] },
    { key: 'max_connections', label: 'Max Connections', type: 'number' },
  ],
  api_gateway: [
    { key: 'max_rps', label: 'Max RPS', type: 'number' },
    { key: 'rate_limit', label: 'Rate Limit', type: 'number' },
  ],
  docker_container: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number' },
    { key: 'failure_probability', label: 'Failure Probability', type: 'number' },
  ],
  kubernetes_pod: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number' },
    { key: 'failure_probability', label: 'Failure Probability', type: 'number' },
  ],
  vm_instance: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number' },
    { key: 'failure_probability', label: 'Failure Probability', type: 'number' },
  ],
  rack: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number' },
    { key: 'power_redundancy', label: 'Power Redundancy', type: 'select', options: ['N', 'N+1', '2N'] },
  ],
  datacenter: [
    { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number' },
    { key: 'inter_rack_latency_ms', label: 'Inter-Rack Latency (ms)', type: 'number' },
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
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Protocol</label>
          <select
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
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Latency Override (ms)</label>
          <input
            type="number"
            min={0}
            value={data?.latencyMs ?? 1}
            onChange={(e) => updateEdgeData(edge.id, { latencyMs: Number(e.target.value) })}
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
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bandwidth (Mbps)</label>
          <input
            type="number"
            min={1}
            value={data?.bandwidthMbps ?? 1000}
            onChange={(e) => updateEdgeData(edge.id, { bandwidthMbps: Number(e.target.value) })}
            className={inputClass}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Timeout (ms)</label>
          <input
            type="number"
            min={0}
            value={data?.timeoutMs ?? 5000}
            onChange={(e) => updateEdgeData(edge.id, { timeoutMs: Number(e.target.value) })}
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
        <p className="text-xs text-slate-500">No rules — equal distribution</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={rule.tag}
                  placeholder="tag"
                  onChange={(e) => updateRule(idx, 'tag', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={rule.weight}
                  onChange={(e) => updateRule(idx, 'weight', Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => removeRule(idx)}
                  className="text-red-400 hover:text-red-300 text-xs px-1"
                >
                  x
                </button>
              </div>
              <div className="flex items-center gap-1 pl-1">
                <span className="text-[10px] text-slate-500">→</span>
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
      <span className="text-slate-500">&rarr;</span>
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
  const params = COMPONENT_PARAMS[selectedNode.data.componentType]
    ?? def?.params.map(p => ({
      key: p.key,
      label: p.label,
      type: p.type === 'boolean' ? 'select' as const : p.type === 'select' ? 'select' as const : p.type === 'string' ? 'text' as const : 'number' as const,
      ...(p.type === 'select' ? { options: p.options } : {}),
      ...(p.type === 'boolean' ? { options: ['true', 'false'] } : {}),
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
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={(config.name as string) || selectedNode.data.label}
            onChange={(e) => updateNodeConfig(selectedNode.id, { name: e.target.value })}
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
                    value={(config.color as string) || defaultColor}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { color: e.target.value })}
                    title="Border color"
                    className="w-7 h-7 rounded border border-[var(--color-border)] bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
                  />
                  <span className="text-[10px] text-slate-500">Border</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={(config.textColor as string) || defaultTextColor}
                    onChange={(e) => updateNodeConfig(selectedNode.id, { textColor: e.target.value })}
                    title="Text color"
                    className="w-7 h-7 rounded border border-[var(--color-border)] bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded"
                  />
                  <span className="text-[10px] text-slate-500">Text</span>
                </div>
                {(config.color != null || config.textColor != null) && (
                  <button
                    onClick={() => updateNodeConfig(selectedNode.id, { color: undefined, textColor: undefined })}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {param.label}
            </label>
            {param.type === 'select' ? (
              <select
                value={(configVal(param.key) as string) || param.options?.[0] || ''}
                onChange={(e) => updateNodeConfig(selectedNode.id, { [param.key]: e.target.value })}
                className={inputClass}
              >
                {param.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={param.type}
                value={(configVal(param.key) as string | number) ?? ''}
                onChange={(e) =>
                  updateNodeConfig(selectedNode.id, {
                    [param.key]: param.type === 'number' ? Number(e.target.value) : e.target.value,
                  })
                }
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
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent Container</label>
              {parentNode && (
                <div className="mt-1 mb-1 rounded border border-purple-500/20 bg-purple-500/10 overflow-hidden">
                  <NodeLink node={parentNode} onClick={() => focusNode(parentNode.id)} />
                </div>
              )}
              <select
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
          <p className="text-sm text-slate-500">No configurable parameters for this component type.</p>
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
        <p className="text-xs text-slate-500">All traffic tagged as 'default'</p>
      ) : (
        <div className="space-y-2">
          {tags.map((entry, idx) => {
            const pct = totalWeight > 0 ? ((entry.weight / totalWeight) * 100).toFixed(0) : '0';
            return (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={entry.tag}
                  placeholder="tag"
                  onChange={(e) => updateTag(idx, 'tag', e.target.value)}
                  className="flex-1 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={entry.weight}
                  onChange={(e) => updateTag(idx, 'weight', Number(e.target.value))}
                  className="w-16 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                <button
                  onClick={() => removeTag(idx)}
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
          value={newTag}
          placeholder="new tag name"
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag()}
          className="flex-1 px-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
        />
      </div>
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

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <p className="text-sm text-slate-500 text-center">Select a component or connection on the canvas to edit its properties</p>
    </div>
  );
}
