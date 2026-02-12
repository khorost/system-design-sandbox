import type { ComponentModel, ConnectionModel, ComponentType as EngineComponentType } from '@system-design-sandbox/simulation-engine';
import { getDefinition } from '@system-design-sandbox/component-library';
import type { ComponentNode, ComponentEdge } from '../types/index.ts';

export function convertNodesToComponents(nodes: ComponentNode[]): Map<string, ComponentModel> {
  const components = new Map<string, ComponentModel>();

  for (const node of nodes) {
    const compType = node.data.componentType as EngineComponentType;
    const def = getDefinition(compType);
    const config = node.data.config;

    const replicas = (config.replicas as number) || def?.defaults.replicas || 1;
    const maxRpsPerInstance = (config.max_rps_per_instance as number) || (config.max_rps as number) || def?.defaults.maxRps || 1000;
    const maxRps = maxRpsPerInstance * replicas;
    const baseLatencyMs = (config.base_latency_ms as number) || def?.defaults.baseLatencyMs || 10;

    components.set(node.id, {
      id: node.id,
      type: compType,
      maxRps,
      currentLoad: 0,
      baseLatencyMs,
      loadLatencyFactor: 0.001,
      failureRate: 0,
      isAlive: true,
      replicas,
      queueSize: 0,
      queueCapacity: 10000,
      processingRate: maxRps,
    });
  }

  return components;
}

export function convertEdgesToConnections(edges: ComponentEdge[]): ConnectionModel[] {
  return edges
    .filter((e) => e.source && e.target)
    .map((e) => ({
      from: e.source,
      to: e.target,
      protocol: ((e.data as Record<string, unknown>)?.protocol as ConnectionModel['protocol']) || 'REST',
      bandwidthMbps: ((e.data as Record<string, unknown>)?.bandwidth as number) || 1000,
      timeoutMs: ((e.data as Record<string, unknown>)?.timeout as number) || 5000,
    }));
}
