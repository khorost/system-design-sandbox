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
 * Proportional routing: each edge has a coefficient per tag (explicit rule weight, or default 1).
 * Traffic is routed to 1 random neighbor weighted by coefficients.
 * Weight 0 = blocked. Load balancers use the same weighted selection.
 */
export function resolveNextHops(
  currentNode: string,
  tag: string,
  visited: string[],
  adjacency: Map<string, string[]>,
  connectionLookup: Map<string, ConnectionModel>,
  _loadBalancerNodes: Set<string>,
): NextHop[] {
  const neighbors = adjacency.get(currentNode);
  if (!neighbors || neighbors.length === 0) return [];

  const visitedSet = new Set(visited);
  const unvisited = neighbors.filter(n => !visitedSet.has(n));
  if (unvisited.length === 0) return [];

  // Build candidates with per-tag coefficient
  const candidates: { target: string; coeff: number; outTag?: string }[] = [];
  for (const neighbor of unvisited) {
    const conn = connectionLookup.get(`${currentNode}->${neighbor}`);
    const rule = conn?.routingRules?.find(r => r.tag === tag);
    const coeff = rule != null ? rule.weight : 1; // explicit rule or default 1
    if (coeff > 0) {
      candidates.push({ target: neighbor, coeff, outTag: rule?.outTag });
    }
  }

  if (candidates.length === 0) return [];

  // Weighted random selection: 1 request → 1 target proportional to coefficients
  const totalCoeff = candidates.reduce((s, c) => s + c.coeff, 0);
  let rand = Math.random() * totalCoeff;
  for (const c of candidates) {
    rand -= c.coeff;
    if (rand <= 0) return [{ target: c.target, count: 1, outTag: c.outTag }];
  }
  return [{ target: candidates[candidates.length - 1].target, count: 1 }];
}
