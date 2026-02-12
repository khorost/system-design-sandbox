import { useCanvasStore } from '../../store/canvasStore.ts';
import { paletteItems } from '../canvas/controls/paletteData.ts';

const COMPONENT_PARAMS: Record<string, { key: string; label: string; type: 'number' | 'text' | 'select'; options?: string[] }[]> = {
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
};

export function PropertiesPanel() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);
  const removeNode = useCanvasStore((s) => s.removeNode);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="w-64 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col">
        <div className="px-3 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-bold text-slate-200">Properties</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-slate-500 text-center">Select a component on the canvas to edit its properties</p>
        </div>
      </div>
    );
  }

  const paletteItem = paletteItems.find((i) => i.type === selectedNode.data.componentType);
  const params = COMPONENT_PARAMS[selectedNode.data.componentType] || [];
  const config = selectedNode.data.config;

  return (
    <div className="w-64 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className="text-lg">{paletteItem?.icon || selectedNode.data.icon}</span>
          <div>
            <h2 className="text-sm font-bold text-slate-200">{selectedNode.data.label}</h2>
            <p className="text-[10px] text-slate-400">{selectedNode.data.componentType}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={(config.name as string) || selectedNode.data.label}
            onChange={(e) => updateNodeConfig(selectedNode.id, { name: e.target.value })}
            className="w-full mt-1 px-2 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        {params.map((param) => (
          <div key={param.key}>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {param.label}
            </label>
            {param.type === 'select' ? (
              <select
                value={(config[param.key] as string) || param.options?.[0] || ''}
                onChange={(e) => updateNodeConfig(selectedNode.id, { [param.key]: e.target.value })}
                className="w-full mt-1 px-2 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
              >
                {param.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={param.type}
                value={(config[param.key] as string | number) ?? ''}
                onChange={(e) =>
                  updateNodeConfig(selectedNode.id, {
                    [param.key]: param.type === 'number' ? Number(e.target.value) : e.target.value,
                  })
                }
                className="w-full mt-1 px-2 py-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-slate-200 focus:outline-none focus:border-blue-500"
              />
            )}
          </div>
        ))}

        {params.length === 0 && (
          <p className="text-xs text-slate-500">No configurable parameters for this component type.</p>
        )}
      </div>

      <div className="p-3 border-t border-[var(--color-border)]">
        <button
          onClick={() => removeNode(selectedNode.id)}
          className="w-full px-3 py-1.5 text-xs text-red-400 border border-red-400/30 rounded hover:bg-red-400/10 transition-colors"
        >
          Delete Component
        </button>
      </div>
    </div>
  );
}
