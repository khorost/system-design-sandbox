import type { ComponentEdge, ComponentNode } from '../../types/index.ts';

export interface AnalysisWarning {
  severity: 'info' | 'warning' | 'error';
  nodeId: string;
  message: string;
  suggestion: string;
}

const MULTI_REPLICA_TYPES = new Set([
  'service', 'worker', 'serverless_function',
]);

/**
 * Detects multi-replica services without a load balancer in front.
 * A service with replicas > 1 should have incoming traffic routed through an LB.
 */
export function detectMissingLoadBalancer(
  nodes: ComponentNode[],
  edges: ComponentEdge[],
): AnalysisWarning[] {
  const warnings: AnalysisWarning[] = [];

  // Build incoming edges map: nodeId → source componentTypes
  const incomingSources = new Map<string, Set<string>>();
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    if (!sourceNode) continue;
    if (!incomingSources.has(edge.target)) incomingSources.set(edge.target, new Set());
    incomingSources.get(edge.target)!.add(sourceNode.data.componentType);
  }

  for (const node of nodes) {
    if (!MULTI_REPLICA_TYPES.has(node.data.componentType)) continue;

    const replicas = (node.data.config.replicas as number) ?? 1;
    if (replicas <= 1) continue;

    // Check if any incoming source is a load_balancer
    const sources = incomingSources.get(node.id);
    const hasLB = sources?.has('load_balancer') ?? false;

    if (!hasLB) {
      warnings.push({
        severity: 'warning',
        nodeId: node.id,
        message: `${node.data.config.name || node.data.label} has ${replicas} replicas but no Load Balancer`,
        suggestion: 'Add a Load Balancer in front to distribute traffic across replicas evenly',
      });
    }
  }

  return warnings;
}
