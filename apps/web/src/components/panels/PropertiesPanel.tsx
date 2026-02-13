import { useCanvasStore } from '../../store/canvasStore.ts';
import { paletteItems } from '../canvas/controls/paletteData.ts';
import { getDefinition } from '@system-design-sandbox/component-library';
import type { ProtocolType } from '../../types/index.ts';
import { CONTAINER_TYPES, computeEffectiveLatency, isValidNesting } from '../../utils/networkLatency.ts';

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

const PROTOCOL_OPTIONS: ProtocolType[] = ['REST', 'gRPC', 'WebSocket', 'GraphQL', 'async', 'TCP'];

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
            value={data?.protocol ?? 'REST'}
            onChange={(e) => updateEdgeData(edge.id, { protocol: e.target.value as ProtocolType })}
            className={inputClass}
          >
            {PROTOCOL_OPTIONS.map((p) => (
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

function NodeProperties() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);
  const removeNode = useCanvasStore((s) => s.removeNode);
  const setNodeParent = useCanvasStore((s) => s.setNodeParent);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  if (!selectedNode) return null;

  const paletteItem = paletteItems.find((i) => i.type === selectedNode.data.componentType);
  const def = getDefinition(selectedNode.data.componentType);
  const params = COMPONENT_PARAMS[selectedNode.data.componentType] || [];
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

        {/* Container children count */}
        {CONTAINER_TYPES.has(selectedNode.data.componentType) && (() => {
          const children = nodes.filter(n => n.parentId === selectedNode.id);
          return (
            <div className="flex items-center justify-between px-3 py-2 bg-purple-500/10 rounded border border-purple-500/20">
              <span className="text-xs font-semibold text-slate-300">Children</span>
              <span className="text-sm font-mono font-bold text-purple-400">{children.length}</span>
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
          return validParents.length > 0 ? (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent Container</label>
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
