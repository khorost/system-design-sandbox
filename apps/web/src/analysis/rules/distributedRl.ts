import type { ComponentEdge, ComponentNode, ServiceContainerConfig } from '../../types/index.ts';
import type { AnalysisWarning } from './spof.ts';

/**
 * Detects Service Containers with distributed rate limiting (replicas > 1)
 * that don't have a Redis node selected for shared RL state.
 */
export function detectMissingRlRedis(
  nodes: ComponentNode[],
  _edges: ComponentEdge[],
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  for (const node of nodes) {
    if (node.data.componentType !== 'service_container') continue;

    const cfg = node.data.config as unknown as ServiceContainerConfig;
    if (!cfg.rateLimitEnabled) continue;

    const replicas = (node.data.config.replicas as number) ?? 1;
    if (replicas <= 1) continue;

    if (!cfg.rateLimitRedisNodeId) {
      warnings.push({
        severity: 'warning',
        nodeId: node.id,
        message: `${node.data.config.name || node.data.label} has distributed rate limiting with ${replicas} replicas but no Redis`,
        suggestion: 'Add a Redis node and select it in the Rate Limiting section for shared state across replicas',
      });
    }
  }

  return warnings;
}
