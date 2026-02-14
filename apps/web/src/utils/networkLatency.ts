import type { ComponentNode, ComponentType } from '../types/index.ts';
import { CLIENT_TYPES } from '../constants/componentTypes.ts';

/** Container types ordered by nesting level (innermost → outermost) */
export const CONTAINER_TYPES = new Set<ComponentType>([
  'docker_container',
  'kubernetes_pod',
  'vm_instance',
  'rack',
  'datacenter',
]);

/**
 * What each container type is allowed to contain.
 * Strict hierarchy: DC > Rack > K8s/VM > Docker > leaf nodes.
 */
const ALLOWED_CHILDREN: Record<string, Set<string>> = {
  datacenter: new Set(['rack', 'kubernetes_pod', 'vm_instance', 'docker_container']),
  rack: new Set(['kubernetes_pod', 'vm_instance', 'docker_container']),
  kubernetes_pod: new Set(['docker_container']),
  vm_instance: new Set(['docker_container']),
  docker_container: new Set(), // only leaf nodes
};

/** zIndex for each container level (outermost = lowest) */
export const CONTAINER_Z_INDEX: Record<string, number> = {
  datacenter: -50,
  rack: -40,
  kubernetes_pod: -30,
  vm_instance: -30,
  docker_container: -20,
};

/**
 * Validates whether a child type can be nested inside a parent type.
 * Leaf nodes (non-containers) can go into any container.
 * Containers follow strict hierarchy: DC > Rack > K8s/VM > Docker.
 */
export function isValidNesting(childType: ComponentType, parentType: ComponentType): boolean {
  if (!CONTAINER_TYPES.has(parentType)) return false;

  // Non-container child → can be placed inside any container
  if (!CONTAINER_TYPES.has(childType)) return true;

  const allowed = ALLOWED_CHILDREN[parentType];
  return allowed?.has(childType) ?? false;
}

/**
 * Computes absolute position of a node by walking the full parent chain.
 * React Flow stores positions relative to the parent.
 */
export function getAbsolutePosition(node: ComponentNode, nodeMap: Map<string, ComponentNode>): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let current = node;
  while (current.parentId) {
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    current = parent;
  }
  return { x, y };
}

/**
 * Returns the nesting depth of a node (0 = top-level, 1 = inside one container, etc.)
 */
export function getNestingDepth(node: ComponentNode, nodeMap: Map<string, ComponentNode>): number {
  let depth = 0;
  let current = node;
  while (current.parentId) {
    depth++;
    const parent = nodeMap.get(current.parentId);
    if (!parent) break;
    current = parent;
  }
  return depth;
}

/** Default internal latencies by container type (ms) */
export const DEFAULT_LATENCIES: Record<string, number> = {
  docker_container: 0.1,
  kubernetes_pod: 0.1,
  vm_instance: 0.2,
  rack: 1,
  datacenter: 5,
};

/** Default inter-datacenter latency (ms) */
export const INTER_DATACENTER_LATENCY_MS = 50;

/** Default client-to-datacenter latency (ms) */
export const CLIENT_TO_DATACENTER_LATENCY_MS = 100;

/**
 * Returns the ancestor chain for a node: [nodeId, parentId, grandparentId, ...]
 */
export function getAncestorChain(nodeId: string, nodes: ComponentNode[]): string[] {
  const chain: string[] = [nodeId];
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  let current = nodeMap.get(nodeId);
  while (current?.parentId) {
    chain.push(current.parentId);
    current = nodeMap.get(current.parentId);
  }
  return chain;
}

/**
 * Finds the Lowest Common Ancestor of two ancestor chains.
 * Returns the LCA node id or null if no common ancestor.
 */
export function findLCA(chainA: string[], chainB: string[]): string | null {
  const setB = new Set(chainB);
  for (const id of chainA) {
    if (setB.has(id)) return id;
  }
  return null;
}

/**
 * Gets the internal latency of a container node from its config.
 */
function getContainerLatency(node: ComponentNode): number {
  if (!CONTAINER_TYPES.has(node.data.componentType)) return 0;
  const val = node.data.config.internal_latency_ms;
  if (typeof val === 'number') return val;
  return DEFAULT_LATENCIES[node.data.componentType] ?? 0;
}

/**
 * Sum container latencies from a node up to (but not including) stopId.
 * If stopId is null, sums all containers up to root.
 */
function sumContainerLatencies(
  nodeId: string,
  stopId: string | null,
  chain: string[],
  nodeMap: Map<string, ComponentNode>,
): number {
  let total = 0;
  for (const id of chain) {
    if (id === stopId) break;
    if (id === nodeId) continue; // skip the leaf node itself
    const node = nodeMap.get(id);
    if (node) total += getContainerLatency(node);
  }
  return total;
}

/**
 * Computes the effective network latency between two nodes based on container hierarchy.
 *
 * Client → Service(docker, rack, dc):
 *   100ms (client→dc) + 5ms (dc) + 1ms (rack) + 0.1ms (docker) = 106.1ms
 *
 * ServiceA(docker1, rack1, dc1) → ServiceB(docker2, rack1, dc1):
 *   LCA = rack1 → docker1(0.1) + docker2(0.1) = 0.2ms
 *
 * Returns 0 if neither node is in a container (no hierarchy info → use edge default).
 */
export function computeEffectiveLatency(
  sourceId: string,
  targetId: string,
  nodes: ComponentNode[],
): number {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const sourceNode = nodeMap.get(sourceId);
  const targetNode = nodeMap.get(targetId);

  if (!sourceNode || !targetNode) return 0;

  const sourceIsClient = CLIENT_TYPES.has(sourceNode.data.componentType);
  const targetIsClient = CLIENT_TYPES.has(targetNode.data.componentType);

  const chainA = getAncestorChain(sourceId, nodes);
  const chainB = getAncestorChain(targetId, nodes);

  // Client → something: base client latency + all container hops on the non-client side
  if (sourceIsClient || targetIsClient) {
    const nonClientChain = sourceIsClient ? chainB : chainA;
    const nonClientId = sourceIsClient ? targetId : sourceId;
    // If non-client has no containers, just client latency
    if (nonClientChain.length <= 1) return CLIENT_TO_DATACENTER_LATENCY_MS;
    const containerSum = sumContainerLatencies(nonClientId, null, nonClientChain, nodeMap);
    return CLIENT_TO_DATACENTER_LATENCY_MS + containerSum;
  }

  // Neither node is in any container → no hierarchy overhead
  if (chainA.length <= 1 && chainB.length <= 1) return 0;

  const lca = findLCA(chainA, chainB);

  if (!lca) {
    // No common ancestor → inter-DC latency + full container traversal on both sides
    const sumA = sumContainerLatencies(sourceId, null, chainA, nodeMap);
    const sumB = sumContainerLatencies(targetId, null, chainB, nodeMap);
    return INTER_DATACENTER_LATENCY_MS + sumA + sumB;
  }

  // Same node (shouldn't happen but handle)
  if (lca === sourceId || lca === targetId) return 0;

  // Sum container latencies from each node up to LCA (exclusive)
  const sumA = sumContainerLatencies(sourceId, lca, chainA, nodeMap);
  const sumB = sumContainerLatencies(targetId, lca, chainB, nodeMap);
  return sumA + sumB;
}
