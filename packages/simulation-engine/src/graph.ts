import type { ComponentModel, ConnectionModel, TagWeight } from './models.js';

export function buildAdjacencyList(connections: ConnectionModel[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const conn of connections) {
    const neighbors = adjacency.get(conn.from);
    if (neighbors) {
      neighbors.push(conn.to);
    } else {
      adjacency.set(conn.from, [conn.to]);
    }
  }
  return adjacency;
}

export function findEntryNodes(
  components: Map<string, ComponentModel>,
  connections: ConnectionModel[]
): string[] {
  const hasIncoming = new Set<string>();
  for (const conn of connections) {
    hasIncoming.add(conn.to);
  }

  const clientTypes = new Set(['web_client', 'mobile_client', 'external_api']);
  const entries: string[] = [];

  for (const [id, comp] of components) {
    if (!hasIncoming.has(id) || clientTypes.has(comp.type)) {
      entries.push(id);
    }
  }

  return entries.length > 0 ? entries : [...components.keys()].slice(0, 1);
}

export function resolveRequestPath(
  adjacency: Map<string, string[]>,
  entryNodeId: string
): string[] {
  const path: string[] = [entryNodeId];
  let current = entryNodeId;
  const visited = new Set<string>([entryNodeId]);

  while (true) {
    const neighbors = adjacency.get(current);
    if (!neighbors || neighbors.length === 0) break;

    const unvisited = neighbors.filter((n) => !visited.has(n));
    if (unvisited.length === 0) break;

    const next = unvisited[Math.floor(Math.random() * unvisited.length)];
    visited.add(next);
    path.push(next);
    current = next;
  }

  return path;
}

export function pickTag(distribution?: TagWeight[]): string {
  if (!distribution || distribution.length === 0) return 'default';
  const total = distribution.reduce((s, d) => s + d.weight, 0);
  if (total <= 0) return 'default';
  let r = Math.random() * total;
  for (const d of distribution) {
    r -= d.weight;
    if (r <= 0) return d.tag;
  }
  return distribution[distribution.length - 1].tag;
}

function spawnCount(weight: number): number {
  const guaranteed = Math.floor(weight);
  const fractional = weight - guaranteed;
  return guaranteed + (Math.random() < fractional ? 1 : 0);
}

export interface NextHop {
  target: string;
  count: number;
  outTag?: string; // tag for spawned requests
}

/**
 * For node `currentNode` and request with `tag`:
 * - load_balancer: 1 request → 1 random unvisited neighbor
 * - has routing rules for tag: fan-out by weight
 * - no rules: 1 request → 1 random unvisited neighbor (backward compat)
 */
export function resolveNextHops(
  currentNode: string,
  tag: string,
  visited: string[],
  adjacency: Map<string, string[]>,
  connectionLookup: Map<string, ConnectionModel>,
  loadBalancerNodes: Set<string>,
): NextHop[] {
  const neighbors = adjacency.get(currentNode);
  if (!neighbors || neighbors.length === 0) return [];

  const visitedSet = new Set(visited);
  const unvisited = neighbors.filter(n => !visitedSet.has(n));
  if (unvisited.length === 0) return [];

  // Load balancer: always 1 request, uniform random
  if (loadBalancerNodes.has(currentNode)) {
    const target = unvisited[Math.floor(Math.random() * unvisited.length)];
    return [{ target, count: 1 }];
  }

  // Check if any outgoing edge has routing rules for this tag
  let hasRulesForTag = false;
  const hops: NextHop[] = [];

  for (const neighbor of unvisited) {
    const conn = connectionLookup.get(`${currentNode}->${neighbor}`);
    const rule = conn?.routingRules?.find(r => r.tag === tag);
    if (rule && rule.weight > 0) {
      hasRulesForTag = true;
      const count = spawnCount(rule.weight);
      if (count > 0) hops.push({ target: neighbor, count, outTag: rule.outTag });
    }
  }

  // No rules for this tag: backward compat — 1 random neighbor
  if (!hasRulesForTag) {
    const target = unvisited[Math.floor(Math.random() * unvisited.length)];
    return [{ target, count: 1 }];
  }

  return hops;
}
