import type { ComponentNode, ComponentEdge } from '../types/index.ts';
import { CONTAINER_TYPES } from '../utils/networkLatency.ts';

// Must match or exceed actual rendered sizes:
// - BaseNode has min-w-[170px] + padding → ~200px
// - ContainerNode has minWidth: 300, minHeight: 200
const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const CONTAINER_MIN_WIDTH = 300;
const CONTAINER_MIN_HEIGHT = 200;
const GAP_X = 40;
const GAP_Y = 40;
const CONTAINER_PAD_LEFT = 15;
const CONTAINER_PAD_RIGHT = 20;
const CONTAINER_PAD_TOP = 45;
const CONTAINER_PAD_BOTTOM = 20;

/** Get all descendant node IDs of a given node */
function getDescendantIds(nodeId: string, nodes: ComponentNode[]): Set<string> {
  const result = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const n of nodes) {
      if (n.parentId === cur && !result.has(n.id)) {
        result.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return result;
}

/**
 * Build "lifted" directed adjacency between sibling nodes.
 * An edge A→B exists at this level if any descendant-or-self of A
 * connects to any descendant-or-self of B via a real edge.
 */
function buildLiftedAdj(
  siblingIds: string[],
  edges: ComponentEdge[],
  allNodes: ComponentNode[],
): Map<string, Set<string>> {
  const nodeToSibling = new Map<string, string>();
  for (const sid of siblingIds) {
    nodeToSibling.set(sid, sid);
    for (const d of getDescendantIds(sid, allNodes)) {
      nodeToSibling.set(d, sid);
    }
  }

  const adj = new Map<string, Set<string>>();
  for (const sid of siblingIds) adj.set(sid, new Set());

  for (const edge of edges) {
    const src = nodeToSibling.get(edge.source);
    const tgt = nodeToSibling.get(edge.target);
    if (src && tgt && src !== tgt) {
      adj.get(src)!.add(tgt);
    }
  }

  return adj;
}

/**
 * Assign layer indices via longest-path from source nodes (in-degree 0).
 * Connected nodes end up in adjacent/nearby layers, minimizing long-range edges.
 */
function assignLayers(
  ids: string[],
  adj: Map<string, Set<string>>,
): Map<string, number> {
  const inDeg = new Map<string, number>();
  for (const id of ids) inDeg.set(id, 0);
  for (const [, tgts] of adj) {
    for (const t of tgts) {
      inDeg.set(t, (inDeg.get(t) ?? 0) + 1);
    }
  }

  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids) {
    if ((inDeg.get(id) ?? 0) === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  if (queue.length === 0) {
    for (const id of ids) layers.set(id, 0);
    return layers;
  }

  const maxIter = ids.length * ids.length + ids.length;
  let iter = 0;
  while (queue.length > 0 && iter++ < maxIter) {
    const cur = queue.shift()!;
    const curLayer = layers.get(cur)!;
    for (const next of adj.get(cur) ?? []) {
      const prev = layers.get(next) ?? -1;
      if (curLayer + 1 > prev) {
        layers.set(next, curLayer + 1);
        queue.push(next);
      }
    }
  }

  for (const id of ids) {
    if (!layers.has(id)) layers.set(id, 0);
  }

  return layers;
}

/** Group node IDs by layer index */
function groupByLayer(ids: string[], layers: Map<string, number>): string[][] {
  if (ids.length === 0) return [];
  const max = Math.max(...ids.map(id => layers.get(id) ?? 0));
  const result: string[][] = [];
  for (let i = 0; i <= max; i++) {
    const layer = ids.filter(id => (layers.get(id) ?? 0) === i);
    if (layer.length > 0) result.push(layer);
  }
  return result;
}

interface LayoutResult {
  nodes: ComponentNode[];
  width: number;
  height: number;
}

/**
 * Recursively layout a group of sibling nodes in topology-aware layers.
 * Nodes with no incoming edges (sources) go to layer 0.
 * Each layer is a horizontal row; layers stack vertically.
 */
function layoutGroup(
  siblingIds: string[],
  allNodes: ComponentNode[],
  edges: ComponentEdge[],
  startX: number,
  startY: number,
): LayoutResult {
  if (siblingIds.length === 0) return { nodes: [], width: 0, height: 0 };

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const adj = buildLiftedAdj(siblingIds, edges, allNodes);
  const layerMap = assignLayers(siblingIds, adj);
  const layers = groupByLayer(siblingIds, layerMap);

  const result: ComponentNode[] = [];
  let y = startY;
  let maxContentRight = startX;

  for (const layer of layers) {
    let x = startX;
    let layerMaxH = 0;

    for (const nodeId of layer) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const isContainer = CONTAINER_TYPES.has(node.data.componentType);

      if (isContainer) {
        const childIds = allNodes.filter(n => n.parentId === nodeId).map(n => n.id);
        const inner = layoutGroup(childIds, allNodes, edges, CONTAINER_PAD_LEFT, CONTAINER_PAD_TOP);

        const cw = Math.max(
          CONTAINER_MIN_WIDTH,
          CONTAINER_PAD_LEFT + inner.width + CONTAINER_PAD_RIGHT,
        );
        const ch = Math.max(
          CONTAINER_MIN_HEIGHT,
          CONTAINER_PAD_TOP + inner.height + CONTAINER_PAD_BOTTOM,
        );

        result.push({
          ...node,
          position: { x, y },
          style: { ...node.style, width: cw, height: ch },
        });
        result.push(...inner.nodes);

        layerMaxH = Math.max(layerMaxH, ch);
        x += cw + GAP_X;
      } else {
        result.push({ ...node, position: { x, y } });
        layerMaxH = Math.max(layerMaxH, NODE_HEIGHT);
        x += NODE_WIDTH + GAP_X;
      }
    }

    maxContentRight = Math.max(maxContentRight, x - GAP_X);
    y += layerMaxH + GAP_Y;
  }

  return {
    nodes: result,
    width: Math.max(maxContentRight - startX, 0),
    height: Math.max(y - startY - GAP_Y, 0),
  };
}

/**
 * Bottom-up safety pass: ensure every container fully contains its children.
 * Handles cases where actual rendered node sizes exceed NODE_WIDTH/NODE_HEIGHT estimates.
 */
function ensureChildrenFit(nodes: ComponentNode[]): ComponentNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Build children lookup
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const list = childrenOf.get(n.parentId) ?? [];
      list.push(n.id);
      childrenOf.set(n.parentId, list);
    }
  }

  // Compute nesting depth for bottom-up ordering
  const depthOf = (id: string, visited = new Set<string>()): number => {
    const node = nodeMap.get(id);
    if (!node?.parentId || visited.has(id)) return 0;
    visited.add(id);
    return depthOf(node.parentId, visited) + 1;
  };

  // Process containers deepest-first
  const containers = nodes
    .filter(n => CONTAINER_TYPES.has(n.data.componentType))
    .sort((a, b) => depthOf(b.id) - depthOf(a.id));

  for (const container of containers) {
    const childIds = childrenOf.get(container.id);
    if (!childIds || childIds.length === 0) continue;

    let maxRight = 0;
    let maxBottom = 0;

    for (const cid of childIds) {
      const child = nodeMap.get(cid);
      if (!child) continue;
      const cw = (child.style?.width as number) ?? NODE_WIDTH;
      const ch = (child.style?.height as number) ?? NODE_HEIGHT;
      maxRight = Math.max(maxRight, child.position.x + cw);
      maxBottom = Math.max(maxBottom, child.position.y + ch);
    }

    const neededWidth = Math.max(maxRight + CONTAINER_PAD_RIGHT, CONTAINER_MIN_WIDTH);
    const neededHeight = Math.max(maxBottom + CONTAINER_PAD_BOTTOM, CONTAINER_MIN_HEIGHT);

    const cur = nodeMap.get(container.id)!;
    const curWidth = (cur.style?.width as number) ?? CONTAINER_MIN_WIDTH;
    const curHeight = (cur.style?.height as number) ?? CONTAINER_MIN_HEIGHT;

    if (neededWidth > curWidth || neededHeight > curHeight) {
      nodeMap.set(container.id, {
        ...cur,
        style: {
          ...cur.style,
          width: Math.max(curWidth, neededWidth),
          height: Math.max(curHeight, neededHeight),
        },
      });
    }
  }

  return nodes.map(n => nodeMap.get(n.id) ?? n);
}

export function autoLayout(nodes: ComponentNode[], edges: ComponentEdge[]): ComponentNode[] {
  if (nodes.length === 0) return [];
  const topIds = nodes.filter(n => !n.parentId).map(n => n.id);
  const laid = layoutGroup(topIds, nodes, edges, 50, 50).nodes;
  return ensureChildrenFit(laid);
}
