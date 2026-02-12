import type { ComponentModel, ConnectionModel } from './models.js';

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
