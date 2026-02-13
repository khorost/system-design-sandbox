import type { ComponentModel, ConnectionModel, ComponentType as EngineComponentType } from '@system-design-sandbox/simulation-engine';
import { getDefinition } from '@system-design-sandbox/component-library';
import type { ComponentNode, ComponentEdge } from '../types/index.ts';
import { computeEffectiveLatency, CONTAINER_TYPES } from '../utils/networkLatency.ts';

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

export function convertNodesToComponents(nodes: ComponentNode[]): Map<string, ComponentModel> {
  const components = new Map<string, ComponentModel>();

  for (const node of nodes) {
    const compType = node.data.componentType as EngineComponentType;
    // Skip container nodes — they don't participate in simulation as components
    if (CONTAINER_TYPES.has(node.data.componentType)) continue;
    const def = getDefinition(compType);
    const config = node.data.config;

    const replicas = (config.replicas as number) || def?.defaults?.replicas || 1;
    const maxRpsPerInstance = (config.max_rps_per_instance as number) || (config.max_rps as number) || def?.defaults?.maxRps || 1000;
    const maxRps = maxRpsPerInstance * replicas;
    const baseLatencyMs = (config.base_latency_ms as number) || def?.defaults?.baseLatencyMs || 10;

    // Client nodes: compute RPS from concurrent_users_k * 1000 * requests_per_user
    // Backward compat: if requests_per_sec exists but concurrent_users_k doesn't, use old value
    let generatedRps = 0;
    if (CLIENT_TYPES.has(compType)) {
      if (config.concurrent_users_k != null) {
        const usersK = config.concurrent_users_k as number;
        const rpu = (config.requests_per_user as number) ??
          (def?.params?.find(p => p.key === 'requests_per_user')?.default as number ?? 0.1);
        generatedRps = usersK * 1000 * rpu;
      } else if (config.requests_per_sec != null) {
        generatedRps = config.requests_per_sec as number;
      } else {
        const defUsersK = (def?.params?.find(p => p.key === 'concurrent_users_k')?.default as number) ?? 1;
        const defRpu = (def?.params?.find(p => p.key === 'requests_per_user')?.default as number) ?? 0.1;
        generatedRps = defUsersK * 1000 * defRpu;
      }
    }

    components.set(node.id, {
      id: node.id,
      type: compType,
      maxRps,
      currentLoad: 0,
      generatedRps,
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

export function convertEdgesToConnections(edges: ComponentEdge[], nodes?: ComponentNode[]): ConnectionModel[] {
  return edges
    .filter((e) => e.source && e.target)
    .map((e) => {
      const userLatency = e.data?.latencyMs ?? 1;
      const hasOverride = e.data?.latencyMs != null && e.data.latencyMs !== 1;
      const hierarchyLatency = nodes ? computeEffectiveLatency(e.source, e.target, nodes) : 0;
      const latencyMs = hasOverride ? userLatency : (hierarchyLatency > 0 ? hierarchyLatency : userLatency);
      return {
        from: e.source,
        to: e.target,
        protocol: e.data?.protocol ?? 'REST',
        latencyMs: latencyMs || 1,
        bandwidthMbps: e.data?.bandwidthMbps ?? 1000,
        timeoutMs: e.data?.timeoutMs ?? 5000,
      };
    });
}

/** Maps engine edge keys ("source->target") back to React Flow edge IDs */
export function buildEdgeKeyToIdMap(edges: ComponentEdge[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of edges) {
    if (e.source && e.target) {
      map[`${e.source}->${e.target}`] = e.id;
    }
  }
  return map;
}
