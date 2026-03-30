import { getDefinition } from '@system-design-sandbox/component-library';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import { create } from 'zustand';

import { CONFIG } from '../config/constants.ts';
import { autoLayout } from '../dsl/layout.ts';
import { parseDsl } from '../dsl/parser.ts';
import { exportDsl as serializeDsl } from '../dsl/serializer.ts';
import type { ArchitectureSchema, ComponentEdge, ComponentNode, EdgeData, ProtocolType } from '../types/index.ts';
import { DEFAULT_EDGE_DATA, DISK_COMPONENT_TYPES } from '../types/index.ts';
import { CONTAINER_TYPES, getAbsolutePosition } from '../utils/networkLatency.ts';
import { notify } from '../utils/notifications.ts';
import { sanitizeConfig,sanitizeLabel } from '../utils/sanitize.ts';
import { onTabMessage, postTabMessage } from '../utils/tabChannel.ts';

const DISK_DEFAULT_PROTOCOL: Record<string, ProtocolType> = {
  local_ssd: 'SATA',
  nvme: 'NVMe',
  network_disk: 'iSCSI',
  nfs: 'NFS',
};

const STORAGE_KEY = 'sds-architecture';
const DISPLAY_MODE_KEY = 'sds-canvas-display-mode';
const MAX_HISTORY = CONFIG.HISTORY.MAX_UNDO_ENTRIES;

type Snapshot = { nodes: ComponentNode[]; edges: ComponentEdge[] };

function pushHistory(get: () => CanvasState): Partial<CanvasState> {
  const { nodes, edges, _history } = get();
  const past = [..._history.past, { nodes, edges }];
  if (past.length > MAX_HISTORY) past.shift();
  return { _history: { past, future: [] } };
}

/**
 * Topological sort: parents always before children.
 * Also strips orphaned parentId references.
 */
function sortNodesParentFirst(nodes: ComponentNode[]): ComponentNode[] {
  const ids = new Set(nodes.map(n => n.id));

  // Clean orphaned parentId references
  const cleaned = nodes.map(n => {
    if (n.parentId && !ids.has(n.parentId)) {
      const { parentId: _p, extent: _e, ...rest } = n as ComponentNode & { extent?: string };
      void _p; void _e;
      return rest as ComponentNode;
    }
    return n;
  });

  // Topological sort by depth
  const depthOf = (node: ComponentNode, visited = new Set<string>()): number => {
    if (!node.parentId) return 0;
    if (visited.has(node.id)) return 0; // cycle guard
    visited.add(node.id);
    const parent = cleaned.find(n => n.id === node.parentId);
    return parent ? depthOf(parent, visited) + 1 : 0;
  };

  return [...cleaned].sort((a, b) => depthOf(a) - depthOf(b));
}

function clampPositionToContainer(_node: ComponentNode, _parent: ComponentNode, position: { x: number; y: number }) {
  // Only enforce minimum left/top padding; auto-expand handles right/bottom overflow.
  return {
    x: Math.max(CONFIG.CANVAS.CONTAINER_PADDING_LEFT, position.x),
    y: Math.max(CONFIG.CANVAS.CONTAINER_PADDING_TOP, position.y),
  };
}

function getNodeDimensions(node: ComponentNode): { w: number; h: number } {
  const isContainer = CONTAINER_TYPES.has(node.data.componentType);
  // Prefer measured (actual DOM size) over fallback. Fallback 280x90 is a safe upper bound for BaseNode.
  return {
    w: (node.style?.width as number) ?? node.measured?.width ?? node.width ?? (isContainer ? CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH : 280),
    h: (node.style?.height as number) ?? node.measured?.height ?? node.height ?? (isContainer ? CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT : 90),
  };
}

const CONTAINER_PADDING_RIGHT = 12;
const CONTAINER_PADDING_BOTTOM = 12;

/** Expand parent containers so all children fit inside. Cascades up the tree. */
function expandContainersToFitChildren(nodes: ComponentNode[]): ComponentNode[] {
  const result = nodes.map(n => ({ ...n }));
  const map = new Map(result.map(n => [n.id, n]));

  // Iterate until stable (max 10 passes for deeply nested hierarchies)
  for (let pass = 0; pass < 10; pass++) {
    let changed = false;

    // Group children by parentId
    const childrenOf = new Map<string, ComponentNode[]>();
    for (const n of result) {
      if (!n.parentId) continue;
      const arr = childrenOf.get(n.parentId) ?? [];
      arr.push(n);
      childrenOf.set(n.parentId, arr);
    }

    for (const [parentId, children] of childrenOf) {
      const parent = map.get(parentId);
      if (!parent) continue;

      const { w: pw, h: ph } = getNodeDimensions(parent);

      let requiredW = pw;
      let requiredH = ph;

      for (const child of children) {
        const { w: cw, h: ch } = getNodeDimensions(child);
        requiredW = Math.max(requiredW, child.position.x + cw + CONTAINER_PADDING_RIGHT);
        requiredH = Math.max(requiredH, child.position.y + ch + CONTAINER_PADDING_BOTTOM);
      }

      if (requiredW > pw || requiredH > ph) {
        const newW = Math.max(requiredW, CONFIG.CANVAS.CONTAINER_MIN_WIDTH);
        const newH = Math.max(requiredH, CONFIG.CANVAS.CONTAINER_MIN_HEIGHT);
        parent.style = { ...parent.style, width: newW, height: newH };
        parent.width = newW;
        parent.height = newH;
        if (parent.measured) {
          parent.measured = { ...parent.measured, width: newW, height: newH };
        }
        changed = true;
      }
    }

    if (!changed) break;
  }

  return result;
}

function clampNodesToContainerPadding(nodes: ComponentNode[]): ComponentNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  // 1. Clamp positions (left/top minimum only)
  const clamped = nodes.map((node) => {
    if (!node.parentId) return node;
    const parent = nodeMap.get(node.parentId);
    if (!parent) return node;
    return {
      ...node,
      position: clampPositionToContainer(node, parent, node.position),
    };
  });

  // 2. Expand containers to fit children (cascades up)
  const expanded = expandContainersToFitChildren(clamped);

  // 3. Assign z-index by depth
  const expandedMap = new Map(expanded.map((node) => [node.id, node]));
  return expanded.map((node) => {
    let depth = 0;
    let current = node;
    while (current.parentId) {
      depth++;
      const parent = expandedMap.get(current.parentId);
      if (!parent) break;
      current = parent;
    }

    return {
      ...node,
      zIndex: CONTAINER_TYPES.has(node.data.componentType) ? -100 + depth * 10 : 100 + depth * 10,
    };
  });
}

/** Find free space inside a container for panel-based reparenting. */
function findFreeSpaceInContainer(
  node: ComponentNode,
  parent: ComponentNode,
  allNodes: ComponentNode[],
): { x: number; y: number } {
  const { w: nw, h: nh } = getNodeDimensions(node);
  const { w: pw, h: ph } = getNodeDimensions(parent);
  const gap = 15;
  const padL = CONFIG.CANVAS.CONTAINER_PADDING_LEFT;
  const padT = CONFIG.CANVAS.CONTAINER_PADDING_TOP;

  // Existing children (excluding the node being moved)
  const siblings = allNodes.filter(n => n.parentId === parent.id && n.id !== node.id);
  const rects = siblings.map(n => {
    const { w, h } = getNodeDimensions(n);
    return { x: n.position.x, y: n.position.y, w, h };
  });

  const overlaps = (x: number, y: number) =>
    rects.some(r =>
      x < r.x + r.w + gap && x + nw + gap > r.x &&
      y < r.y + r.h + gap && y + nh + gap > r.y,
    );

  // Scan grid positions within current container bounds
  for (let y = padT; y + nh <= ph - CONTAINER_PADDING_BOTTOM; y += gap) {
    for (let x = padL; x + nw <= pw - CONTAINER_PADDING_RIGHT; x += gap) {
      if (!overlaps(x, y)) return { x, y };
    }
  }

  // No space inside current bounds — place at bottom of content, auto-expand will handle it
  const maxBottom = rects.reduce((max: number, r) => Math.max(max, r.y + r.h + gap), padT as number);
  return { x: padL, y: maxBottom };
}

function attachNodeAtCanvasPosition(
  nodes: ComponentNode[],
  nodeId: string,
  parentId: string,
  position: { x: number; y: number },
): ComponentNode[] {
  const nodeMap = new Map(nodes.map(nd => [nd.id, nd]));

  return nodes.map((n) => {
    if (n.id !== nodeId) return n;

    const newParent = nodeMap.get(parentId);
    if (!newParent) return n;

    const parentAbs = getAbsolutePosition(newParent, nodeMap);
    return {
      ...n,
      parentId,
      position: clampPositionToContainer(n, newParent, {
        x: position.x - parentAbs.x,
        y: position.y - parentAbs.y,
      }),
    };
  });
}

function detachNodeAtCanvasPosition(
  nodes: ComponentNode[],
  nodeId: string,
  position: { x: number; y: number },
): ComponentNode[] {
  return nodes.map((n) => {
    if (n.id !== nodeId) return n;
    const { parentId: _p, extent: _e, ...rest } = n as ComponentNode & { extent?: string };
    void _p; void _e;
    return { ...rest, position } as ComponentNode;
  });
}

function loadInitialState(): { nodes: ComponentNode[]; edges: ComponentEdge[]; schemaName: string; schemaDescription: string; schemaTags: string[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], edges: [], schemaName: '', schemaDescription: '', schemaTags: [] };
    const schema: ArchitectureSchema = JSON.parse(raw);
    const normalizedNodes = clampNodesToContainerPadding(sortNodesParentFirst(schema.nodes ?? []));
    return {
      nodes: normalizedNodes,
      edges: schema.edges ?? [],
      schemaName: schema.metadata?.name ?? '',
      schemaDescription: schema.metadata?.description ?? '',
      schemaTags: schema.metadata?.tags ?? [],
    };
  } catch {
    return { nodes: [], edges: [], schemaName: '', schemaDescription: '', schemaTags: [] };
  }
}

function loadDisplayMode(): CanvasDisplayMode {
  // Always start in 2D — 3D/Iso is a view-only mode that distorts
  // handle measurements if active during initial layout.
  return '2d';
}

const initial = loadInitialState();

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { nodes, edges, schemaName, schemaDescription, schemaTags } = useCanvasStore.getState();
    const schema: ArchitectureSchema = {
      version: '1.0',
      metadata: {
        name: schemaName || 'My Architecture',
        description: schemaDescription,
        tags: schemaTags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      nodes,
      edges,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
    saveTimer = null;
  }, CONFIG.UI.DEBOUNCE_SAVE_MS);
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    const { nodes, edges, schemaName, schemaDescription, schemaTags } = useCanvasStore.getState();
    const schema: ArchitectureSchema = {
      version: '1.0',
      metadata: {
        name: schemaName || 'My Architecture',
        description: schemaDescription,
        tags: schemaTags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      nodes,
      edges,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
  }
}

export type EdgeLabelMode = 'auto' | 'protocol' | 'traffic' | 'full';
export type EdgeRoutingMode = 'bezier' | 'straight' | 'polyline';
export type CanvasDisplayMode = '2d' | '3d';

interface CanvasState {
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusNodeId: string | null;
  displayMode: CanvasDisplayMode;
  isoRotation: number;
  edgeLabelMode: EdgeLabelMode;
  edgeRoutingMode: EdgeRoutingMode;
  schemaName: string;
  schemaDescription: string;
  schemaTags: string[];
  dragSourceContainerId: string | null;
  dragTargetContainerId: string | null;
  dragBlockedContainerId: string | null;
  activeDragNodeId: string | null;
  dragOriginParentId: string | null;
  dragGrabOffset: { x: number; y: number } | null;
  dragBoundaryLocked: boolean;
  architectureId: string | null;
  isPublic: boolean;
  _history: { past: Snapshot[]; future: Snapshot[] };
  _skipAutoSave: boolean;

  onNodesChange: OnNodesChange<ComponentNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: ComponentNode) => void;
  removeNode: (id: string) => void;
  removeEdgesWhere: (predicate: (e: ComponentEdge) => boolean) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  toggleContainerCollapse: (nodeId: string) => void;
  selectNode: (id: string | null) => void;
  focusNode: (id: string) => void;
  clearFocus: () => void;
  selectEdge: (id: string | null) => void;
  updateEdgeData: (id: string, data: Partial<EdgeData>) => void;
  setNodeParent: (nodeId: string, parentId: string | null) => void;
  setNodeParentAtCanvasPosition: (nodeId: string, parentId: string, position: { x: number; y: number }) => void;
  liveSetNodeParentAtCanvasPosition: (nodeId: string, parentId: string, position: { x: number; y: number }) => void;
  detachNodeToCanvasPosition: (nodeId: string, position: { x: number; y: number }) => void;
  liveDetachNodeToCanvasPosition: (nodeId: string, position: { x: number; y: number }) => void;
  setDragContainerHints: (sourceId: string | null, targetId: string | null, blockedId?: string | null) => void;
  clearDragContainerHints: () => void;
  setActiveDrag: (nodeId: string, originParentId: string | null, grabOffset: { x: number; y: number }) => void;
  setDragBoundaryLocked: (locked: boolean) => void;
  clearActiveDrag: () => void;
  normalizeNodes: () => void;
  getChildren: (nodeId: string) => ComponentNode[];
  getAncestors: (nodeId: string) => string[];
  toggleDisplayMode: () => void;
  rotateIso: (dir: 1 | -1) => void;
  cycleEdgeLabelMode: () => void;
  cycleEdgeRoutingMode: () => void;
  updateEdgeWaypoints: (edgeId: string, waypoints: Array<{ x: number; y: number }>) => void;

  setSchemaName: (name: string) => void;
  setSchemaDescription: (desc: string) => void;
  setSchemaTags: (tags: string[]) => void;
  setIsPublic: (v: boolean) => void;
  setArchitectureId: (id: string | null) => void;

  exportSchema: () => string;
  importSchema: (json: string) => { ok: true } | { ok: false; error: string };
  exportDsl: () => string;
  importDsl: (text: string) => { ok: true } | { ok: false; error: string };

  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  save: () => void;
  load: () => void;
  loadFromStorage: () => void;
  clear: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  selectedEdgeId: null,
  focusNodeId: null,
  displayMode: loadDisplayMode(),
  isoRotation: 45,
  edgeLabelMode: 'auto',
  edgeRoutingMode: 'bezier',
  schemaName: initial.schemaName,
  schemaDescription: initial.schemaDescription,
  schemaTags: initial.schemaTags,
  dragSourceContainerId: null,
  dragTargetContainerId: null,
  dragBlockedContainerId: null,
  activeDragNodeId: null,
  dragOriginParentId: null,
  dragGrabOffset: null,
  dragBoundaryLocked: false,
  architectureId: null,
  isPublic: false,
  _history: { past: [], future: [] },
  _skipAutoSave: false,

  onNodesChange: (changes) => {
    const { activeDragNodeId } = get();
    if (activeDragNodeId) {
      // Suppress ALL position changes for the dragged node — we handle position in onNodeDrag
      changes = changes.filter(c =>
        !(c.type === 'position' && c.id === activeDragNodeId && c.position),
      );
    }
    let updated = applyNodeChanges(changes, get().nodes);
    // Re-run clamp/expand/z-index on structural changes
    const needsClamp = changes.some(c => c.type === 'select' || c.type === 'dimensions' || c.type === 'position');
    if (needsClamp) {
      updated = clampNodesToContainerPadding(updated);
    }
    set({ nodes: updated });
  },

  onEdgesChange: (changes) => {
    const hasRemoval = changes.some(c => c.type === 'remove');
    if (hasRemoval) set({ ...pushHistory(get) });

    // When an SC-resource edge is deleted, clear the corresponding targetNodeId
    // so the panel stays in sync with the canvas.
    if (hasRemoval) {
      const removedIds = new Set(changes.filter(c => c.type === 'remove').map(c => c.id));
      const edgesBefore = get().edges;
      for (const edge of edgesBefore) {
        if (!removedIds.has(edge.id)) continue;
        const sh = edge.sourceHandle;
        if (!sh) continue;
        const scNode = get().nodes.find(n => n.id === edge.source);
        if (!scNode || scNode.data.componentType !== 'service_container') continue;
        const cfg = scNode.data.config as unknown as import('../types/index.ts').ServiceContainerConfig;
        const patch: Record<string, unknown> = {};
        if (sh === 'ratelimit-redis') {
          patch.rateLimitRedisNodeId = '';
        } else {
          const match = sh.match(/^(dbpool|persistent|producer|ondemand):(.+)$/);
          if (!match) continue;
          const [, kind, resId] = match;
          if (kind === 'dbpool')     patch.dbPools = cfg.dbPools.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
          if (kind === 'persistent') patch.persistentConns = cfg.persistentConns.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
          if (kind === 'producer')   patch.producers = cfg.producers.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
          if (kind === 'ondemand')   patch.onDemandConns = cfg.onDemandConns.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
        }
        // Update the SC node config inline (history already pushed above)
        set({
          nodes: get().nodes.map(n =>
            n.id === edge.source ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
          ),
        });
      }
    }

    set({ edges: applyEdgeChanges(changes, get().edges) as ComponentEdge[] });
  },

  onConnect: (connection: Connection) => {
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    const targetNode = get().nodes.find(n => n.id === connection.target);
    const sourceType = sourceNode?.data.componentType;
    const targetType = targetNode?.data.componentType;

    const sourceName = (sourceNode?.data.config.name as string)?.trim() || sourceNode?.data.label || sourceType || '?';
    const targetName = (targetNode?.data.config.name as string)?.trim() || targetNode?.data.label || targetType || '?';

    // Reject duplicate (source, sourceHandle, target, targetHandle) — each port pair must be unique
    const isDuplicate = get().edges.some(e =>
      e.source === connection.source &&
      e.target === connection.target &&
      (e.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
      (e.targetHandle ?? null) === (connection.targetHandle ?? null),
    );
    if (isDuplicate) {
      notify.warn(`Connection ${sourceName} → ${targetName} already exists`);
      return;
    }

    // Validate SC consumer ports — only brokers (kafka, rabbitmq, nats) can connect to consumer handles
    if (connection.targetHandle?.startsWith('consumer:') && sourceType) {
      const SC_CONSUMER_ALLOWED_SOURCES = new Set(['kafka', 'rabbitmq', 'nats']);
      if (!SC_CONSUMER_ALLOWED_SOURCES.has(sourceType)) {
        notify.warn(`Consumer port accepts only message brokers (Kafka, RabbitMQ, NATS), not ${sourceType}`);
        return;
      }
    }

    // Validate LB targets — only compute/gateway nodes
    if (sourceType === 'load_balancer' && targetType) {
      const LB_ALLOWED_TARGETS = new Set(['service', 'service_container', 'api_gateway', 'auth_service', 'serverless_function']);
      if (!LB_ALLOWED_TARGETS.has(targetType)) {
        notify.warn(`Load Balancer can only route to compute nodes, not ${targetType}`);
        return;
      }
    }

    // Validate API Gateway targets — route to services, LB, CDN, auth, serverless
    if (sourceType === 'api_gateway' && targetType) {
      const GW_ALLOWED_TARGETS = new Set(['service', 'service_container', 'load_balancer', 'auth_service', 'serverless_function', 'cdn']);
      if (!GW_ALLOWED_TARGETS.has(targetType)) {
        notify.warn(`API Gateway can only route to services, LB or CDN, not ${targetType}`);
        return;
      }
    }

    let protocol: ProtocolType = 'REST';
    if (targetType && DISK_COMPONENT_TYPES.has(targetType)) {
      protocol = DISK_DEFAULT_PROTOCOL[targetType] ?? 'NVMe';
    }
    const edge: ComponentEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      type: 'flow',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      data: { ...DEFAULT_EDGE_DATA, protocol },
    };
    set({ ...pushHistory(get), edges: addEdge(edge, get().edges) as ComponentEdge[] });
  },

  addNode: (node) => {
    const hist = pushHistory(get);
    const nodes = get().nodes;
    if (node.parentId) {
      // Insert child right after its parent (React Flow requires parent before child)
      const parentIdx = nodes.findIndex(n => n.id === node.parentId);
      if (parentIdx !== -1) {
        const updated = [...nodes];
        // Find the last node that is a sibling or descendant of this parent
        let insertIdx = parentIdx + 1;
        while (insertIdx < updated.length && updated[insertIdx].parentId) {
          insertIdx++;
        }
        updated.splice(insertIdx, 0, node);
        set({ ...hist, nodes: clampNodesToContainerPadding(updated) });
        return;
      }
    }
    set({ ...hist, nodes: clampNodesToContainerPadding([...nodes, node]) });
  },

  removeNode: (id) => {
    // Collect all descendants recursively
    const toRemove = new Set<string>();
    const collect = (nodeId: string) => {
      toRemove.add(nodeId);
      for (const n of get().nodes) {
        if (n.parentId === nodeId) collect(n.id);
      }
    };
    collect(id);

    // Before removing edges, clear targetNodeId on SC resources whose edges are being removed.
    // This preserves the resource config (pool size, delays, etc.) — only the binding is cleared.
    let nodes = get().nodes;
    const removedEdges = get().edges.filter(e => toRemove.has(e.source) || toRemove.has(e.target));
    for (const edge of removedEdges) {
      const sh = edge.sourceHandle;
      if (!sh) continue;
      const match = sh.match(/^(dbpool|persistent|producer|ondemand):(.+)$/);
      if (!match) continue;
      const [, kind, resId] = match;
      const scNode = nodes.find(n => n.id === edge.source);
      if (!scNode || scNode.data.componentType !== 'service_container') continue;
      const cfg = scNode.data.config as unknown as import('../types/index.ts').ServiceContainerConfig;
      const patch: Record<string, unknown> = {};
      if (kind === 'dbpool')     patch.dbPools = cfg.dbPools.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
      if (kind === 'persistent') patch.persistentConns = cfg.persistentConns.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
      if (kind === 'producer')   patch.producers = cfg.producers.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
      if (kind === 'ondemand')   patch.onDemandConns = cfg.onDemandConns.map(r => r.id === resId ? { ...r, targetNodeId: '' } : r);
      nodes = nodes.map(n =>
        n.id === edge.source ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n,
      );
    }

    set({
      ...pushHistory(get),
      nodes: nodes.filter((n) => !toRemove.has(n.id)),
      edges: get().edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target)),
      selectedNodeId: toRemove.has(get().selectedNodeId ?? '') ? null : get().selectedNodeId,
    });
  },

  removeEdgesWhere: (predicate) => {
    const filtered = get().edges.filter((e) => !predicate(e));
    if (filtered.length === get().edges.length) return; // nothing changed
    set({ ...pushHistory(get), edges: filtered });
  },

  updateNodeConfig: (id, config) => {
    set({
      ...pushHistory(get),
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } } : n
      ),
    });
  },

  toggleContainerCollapse: (nodeId) => {
    set((state) => {
      const node = state.nodes.find(n => n.id === nodeId);
      if (!node) return {};

      const isCurrentlyCollapsed = !!(node.data.config.collapsed as boolean);
      const newCollapsed = !isCurrentlyCollapsed;

      // Update node config and size
      const HEADER_HEIGHT = 44; // CONFIG.CANVAS.CONTAINER_HEADER_HEIGHT
      const updatedNodes = state.nodes.map(n => {
        if (n.id === nodeId) {
          const currentStyle = n.style ?? {};
          const currentConfig = n.data.config;
          // Save/restore expanded dimensions in config (not style — style goes to DOM)
          const expandedH = newCollapsed
            ? ((currentStyle.height as number) ?? 300)
            : (currentConfig._expandedHeight as number | undefined);
          const expandedW = newCollapsed
            ? ((currentStyle.width as number) ?? 400)
            : (currentConfig._expandedWidth as number | undefined);
          return {
            ...n,
            data: {
              ...n.data,
              config: {
                ...currentConfig,
                collapsed: newCollapsed,
                ...(newCollapsed
                  ? { _expandedHeight: expandedH, _expandedWidth: expandedW }
                  : { _expandedHeight: undefined, _expandedWidth: undefined }
                ),
              },
            },
            style: newCollapsed
              ? { ...currentStyle, height: HEADER_HEIGHT }
              : { ...currentStyle, height: expandedH ?? 300, width: expandedW ?? 400 },
          };
        }
        // Hide/show direct children
        if (n.parentId === nodeId) {
          return { ...n, hidden: newCollapsed };
        }
        return n;
      });

      // Get IDs of direct children that are being hidden/shown
      const childIds = new Set(
        state.nodes
          .filter(n => n.parentId === nodeId)
          .map(n => n.id)
      );

      // Hide/show edges that connect to hidden children
      const updatedEdges = state.edges.map(e => {
        const touchesChild = childIds.has(e.source) || childIds.has(e.target);
        if (!touchesChild) return e;
        return { ...e, hidden: newCollapsed };
      });

      return {
        ...pushHistory(get),
        nodes: updatedNodes,
        edges: updatedEdges,
      };
    });
    debouncedSave();
  },

  selectNode: (id) => {
    set({
      selectedNodeId: id,
      selectedEdgeId: null,
      nodes: get().nodes.map(n => ({ ...n, selected: n.id === id })),
    });
  },

  focusNode: (id) => {
    set({
      selectedNodeId: id,
      selectedEdgeId: null,
      focusNodeId: id,
      nodes: get().nodes.map(n => ({ ...n, selected: n.id === id })),
    });
  },

  clearFocus: () => {
    set({ focusNodeId: null });
  },

  selectEdge: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: null });
  },

  updateEdgeData: (id, data) => {
    set({
      ...pushHistory(get),
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data ?? DEFAULT_EDGE_DATA), ...data } as EdgeData } : e
      ),
    });
  },

  setNodeParent: (nodeId, parentId) => {
    set({ ...pushHistory(get) });
    const nodes = get().nodes;
    const nodeMap = new Map(nodes.map(nd => [nd.id, nd]));

    const updated = nodes.map((n) => {
      if (n.id !== nodeId) return n;

      // Compute current absolute position (walk full parent chain)
      const abs = getAbsolutePosition(n, nodeMap);

      if (parentId === null) {
        // Detach: use absolute position
        const { parentId: _p, extent: _e, ...rest } = n as ComponentNode & { extent?: string };
        void _p; void _e;
        return { ...rest, position: { x: abs.x, y: abs.y } } as ComponentNode;
      }

      // Attach via panel: find free space inside the container
      const newParent = nodeMap.get(parentId);
      if (!newParent) return n;
      const pos = findFreeSpaceInContainer(n, newParent, nodes);
      return { ...n, parentId, position: pos };
    });

    // Re-sort to maintain parent-before-child ordering
    set({ nodes: clampNodesToContainerPadding(sortNodesParentFirst(updated)) });
  },

  setNodeParentAtCanvasPosition: (nodeId, parentId, position) => {
    set({ ...pushHistory(get) });
    const updated = attachNodeAtCanvasPosition(get().nodes, nodeId, parentId, position);
    set({ nodes: clampNodesToContainerPadding(sortNodesParentFirst(updated)) });
  },

  liveSetNodeParentAtCanvasPosition: (nodeId, parentId, position) => {
    const updated = attachNodeAtCanvasPosition(get().nodes, nodeId, parentId, position);
    set({ nodes: clampNodesToContainerPadding(sortNodesParentFirst(updated)) });
  },

  detachNodeToCanvasPosition: (nodeId, position) => {
    set({ ...pushHistory(get) });
    const updated = detachNodeAtCanvasPosition(get().nodes, nodeId, position);
    set({ nodes: clampNodesToContainerPadding(sortNodesParentFirst(updated)) });
  },

  liveDetachNodeToCanvasPosition: (nodeId, position) => {
    const updated = detachNodeAtCanvasPosition(get().nodes, nodeId, position);
    set({ nodes: clampNodesToContainerPadding(sortNodesParentFirst(updated)) });
  },

  setDragContainerHints: (sourceId, targetId, blockedId = null) => {
    set({ dragSourceContainerId: sourceId, dragTargetContainerId: targetId, dragBlockedContainerId: blockedId });
  },

  clearDragContainerHints: () => {
    set({ dragSourceContainerId: null, dragTargetContainerId: null, dragBlockedContainerId: null });
  },

  setActiveDrag: (nodeId, originParentId, grabOffset) => {
    set({ activeDragNodeId: nodeId, dragOriginParentId: originParentId, dragGrabOffset: grabOffset, dragBoundaryLocked: false });
  },

  setDragBoundaryLocked: (locked) => {
    set({ dragBoundaryLocked: locked });
  },

  clearActiveDrag: () => {
    set({ activeDragNodeId: null, dragOriginParentId: null, dragGrabOffset: null, dragBoundaryLocked: false });
  },

  normalizeNodes: () => {
    set({ nodes: clampNodesToContainerPadding(sortNodesParentFirst(get().nodes)) });
  },

  getChildren: (nodeId) => {
    return get().nodes.filter((n) => n.parentId === nodeId);
  },

  getAncestors: (nodeId) => {
    const ancestors: string[] = [];
    const nodeMap = new Map(get().nodes.map(n => [n.id, n]));
    let current = nodeMap.get(nodeId);
    while (current?.parentId) {
      ancestors.push(current.parentId);
      current = nodeMap.get(current.parentId);
    }
    return ancestors;
  },

  toggleDisplayMode: () => {
    set((state) => ({
      displayMode: state.displayMode === '2d' ? '3d' : '2d',
    }));
  },

  rotateIso: (dir) => {
    set((state) => ({
      isoRotation: state.isoRotation + dir * 15,
    }));
  },

  setSchemaName: (name) => {
    set({ schemaName: name });
  },

  setSchemaDescription: (desc) => {
    set({ schemaDescription: desc });
  },

  setSchemaTags: (tags) => {
    set({ schemaTags: tags });
  },

  setIsPublic: (v) => {
    set({ isPublic: v });
  },

  setArchitectureId: (id) => {
    set({ architectureId: id });
  },

  cycleEdgeLabelMode: () => {
    const order: EdgeLabelMode[] = ['auto', 'protocol', 'traffic', 'full'];
    const cur = get().edgeLabelMode;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    set({ edgeLabelMode: next });
  },

  cycleEdgeRoutingMode: () => {
    const order: EdgeRoutingMode[] = ['bezier', 'straight', 'polyline'];
    const cur = get().edgeRoutingMode;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    set({ edgeRoutingMode: next });
  },

  updateEdgeWaypoints: (edgeId, waypoints) => {
    const edges = get().edges.map(e =>
      e.id === edgeId ? { ...e, data: { ...(e.data ?? {}), waypoints } as ComponentEdge['data'] } : e,
    );
    set({ ...pushHistory(get), edges });
  },

  exportSchema: () => {
    const { nodes, edges, schemaName, schemaDescription, schemaTags } = get();
    const now = new Date().toISOString();

    // Strip React Flow runtime state from nodes, keep schema-relevant fields
    const cleanNodes = nodes.map(({ id, type, position, data, parentId, extent, style, width, height, dragHandle, zIndex }) => {
      const node: Record<string, unknown> = { id, type, position, data };
      if (parentId) { node.parentId = parentId; node.extent = extent; }
      if (style) node.style = style;
      if (width != null) node.width = width;
      if (height != null) node.height = height;
      if (dragHandle) node.dragHandle = dragHandle;
      if (zIndex != null) node.zIndex = zIndex;
      return node;
    });

    // Strip React Flow runtime state from edges
    const cleanEdges = edges.map(({ id, type, source, target, sourceHandle, targetHandle, data, style }) => {
      const edge: Record<string, unknown> = { id, source, target };
      if (type) edge.type = type;
      if (sourceHandle) edge.sourceHandle = sourceHandle;
      if (targetHandle) edge.targetHandle = targetHandle;
      if (data) edge.data = data;
      if (style) edge.style = style;
      return edge;
    });

    const schema = {
      version: '1.0',
      metadata: {
        name: schemaName || 'My Architecture',
        description: schemaDescription,
        tags: schemaTags,
        createdAt: now,
        updatedAt: now,
        exportedAt: now,
      },
      nodes: cleanNodes,
      edges: cleanEdges,
    };
    return JSON.stringify(schema, null, 2);
  },

  importSchema: (json: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false as const, error: 'Invalid JSON format.' };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false as const, error: 'JSON must be an object.' };
    }

    const schema = parsed as Record<string, unknown>;

    if (!schema.version) {
      return { ok: false as const, error: 'Missing "version" field.' };
    }
    if (!Array.isArray(schema.nodes)) {
      return { ok: false as const, error: '"nodes" must be an array.' };
    }
    if (!Array.isArray(schema.edges)) {
      return { ok: false as const, error: '"edges" must be an array.' };
    }

    const warnings: string[] = [];
    const nodes = schema.nodes as ComponentNode[];
    const edges = schema.edges as ComponentEdge[];

    // Validate and sanitize nodes
    for (const node of nodes) {
      if (!node.id || !node.position || !node.data?.componentType || !node.data?.label) {
        return { ok: false as const, error: `Node "${node.id ?? '?'}" missing required fields (id, position, data.componentType, data.label).` };
      }
      node.data.label = sanitizeLabel(node.data.label);
      if (node.data.config) {
        node.data.config = sanitizeConfig(node.data.config);
      }
      if (!getDefinition(node.data.componentType)) {
        warnings.push(`Unknown componentType "${node.data.componentType}" on node "${node.id}".`);
      }
    }

    // Migrate ServiceContainerConfig: fill missing optional fields with defaults
    for (const node of nodes) {
      if (node.data.componentType === 'service' && Array.isArray(node.data.config.pipelines)) {
        const cfg = node.data.config;
        if (cfg.dbPools === undefined)       cfg.dbPools = [];
        if (cfg.persistentConns === undefined) cfg.persistentConns = [];
        if (cfg.producers === undefined)     cfg.producers = [];
        if (cfg.onDemandConns === undefined) cfg.onDemandConns = [];
        if (cfg.internalLatency === undefined) cfg.internalLatency = 2;
        if (cfg.collapsed === undefined)     cfg.collapsed = true;
      }
    }

    // Validate edges — drop broken references and edges to/from containers
    const nodeIds = new Set(nodes.map(n => n.id));
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const validEdges = edges.filter(e => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
        warnings.push(`Dropped edge "${e.id}" — source or target node not found.`);
        return false;
      }
      const srcNode = nodeById.get(e.source);
      const tgtNode = nodeById.get(e.target);
      if (srcNode && CONTAINER_TYPES.has(srcNode.data.componentType)) {
        warnings.push(`Dropped edge "${e.id}" — source "${srcNode.data.label}" is a container node.`);
        return false;
      }
      if (tgtNode && CONTAINER_TYPES.has(tgtNode.data.componentType)) {
        warnings.push(`Dropped edge "${e.id}" — target "${tgtNode.data.label}" is a container node.`);
        return false;
      }
      return true;
    });

    if (warnings.length > 0) {
      notify.warn(warnings.join('\n'));
    }

    const metadata = (schema as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
    const importedName = (metadata?.name as string) ?? '';
    const importedDescription = (metadata?.description as string) ?? '';
    const importedTags = Array.isArray(metadata?.tags) ? (metadata.tags as string[]) : [];

    set({
      ...pushHistory(get),
      nodes: clampNodesToContainerPadding(sortNodesParentFirst(nodes)),
      edges: validEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
      schemaName: importedName,
      schemaDescription: importedDescription,
      schemaTags: importedTags,
      architectureId: null,
      isPublic: false,
    });

    return { ok: true as const };
  },

  exportDsl: () => {
    const { nodes, edges } = get();
    return serializeDsl(nodes, edges);
  },

  importDsl: (text: string) => {
    const result = parseDsl(text);
    if ('error' in result) {
      return { ok: false as const, error: result.error };
    }

    if (result.warnings.length > 0) {
      notify.warn(result.warnings.join('\n'));
    }

    const laid = autoLayout(result.nodes, result.edges);
    set({
      ...pushHistory(get),
      nodes: sortNodesParentFirst(laid),
      edges: result.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
    });

    return { ok: true as const };
  },

  pushSnapshot: () => {
    set({ ...pushHistory(get) });
  },

  undo: () => {
    const { _history, nodes, edges } = get();
    if (_history.past.length === 0) return;
    const prev = _history.past[_history.past.length - 1];
    set({
      _skipAutoSave: true,
      nodes: prev.nodes,
      edges: prev.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      _history: {
        past: _history.past.slice(0, -1),
        future: [{ nodes, edges }, ..._history.future],
      },
    });
    set({ _skipAutoSave: false });
  },

  redo: () => {
    const { _history, nodes, edges } = get();
    if (_history.future.length === 0) return;
    const next = _history.future[0];
    set({
      _skipAutoSave: true,
      nodes: next.nodes,
      edges: next.edges,
      selectedNodeId: null,
      selectedEdgeId: null,
      _history: {
        past: [..._history.past, { nodes, edges }],
        future: _history.future.slice(1),
      },
    });
    set({ _skipAutoSave: false });
  },

  save: () => {
    const { nodes, edges, schemaName, schemaDescription, schemaTags } = get();
    const schema: ArchitectureSchema = {
      version: '1.0',
      metadata: {
        name: schemaName || 'My Architecture',
        description: schemaDescription,
        tags: schemaTags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      nodes,
      edges,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
  },

  load: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const schema: ArchitectureSchema = JSON.parse(raw);
      set({ ...pushHistory(get), nodes: sortNodesParentFirst(schema.nodes), edges: schema.edges });
    } catch {
      // ignore corrupted data
    }
  },

  loadFromStorage: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const schema: ArchitectureSchema = JSON.parse(raw);
      set({
        _skipAutoSave: true,
        nodes: sortNodesParentFirst(schema.nodes ?? []),
        edges: schema.edges ?? [],
        schemaName: schema.metadata?.name ?? '',
        schemaDescription: schema.metadata?.description ?? '',
        schemaTags: schema.metadata?.tags ?? [],
      });
      set({ _skipAutoSave: false });
    } catch {
      // ignore corrupted data
    }
  },

  clear: () => {
    set({ ...pushHistory(get), nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null, schemaName: '', schemaDescription: '', schemaTags: [], architectureId: null, isPublic: false });
    localStorage.removeItem(STORAGE_KEY);
  },
}));

// Auto-save + cross-tab broadcast on every change
const movedNodeIds = new Set<string>();
let moveTimer: ReturnType<typeof setTimeout> | null = null;

useCanvasStore.subscribe((state, prev) => {
  if (state._skipAutoSave) return;

  const nodesChanged = state.nodes !== prev.nodes;
  const edgesChanged = state.edges !== prev.edges;
  const metaChanged = state.schemaName !== prev.schemaName ||
    state.schemaDescription !== prev.schemaDescription ||
    state.schemaTags !== prev.schemaTags;

  // Debounced save to localStorage
  if (nodesChanged || edgesChanged || metaChanged) {
    debouncedSave();
  }

  // Cross-tab broadcast: nodes
  if (nodesChanged) {
    const prevMap = new Map(prev.nodes.map(n => [n.id, n]));
    const currMap = new Map(state.nodes.map(n => [n.id, n]));

    const upserted: ComponentNode[] = [];
    const removedIds: string[] = [];

    for (const [id, node] of currMap) {
      const prevNode = prevMap.get(id);
      if (!prevNode) {
        upserted.push(node);
      } else if (prevNode !== node) {
        // Structural change (data, parentId, style) → broadcast immediately
        // Position-only change → debounce
        if (prevNode.data !== node.data || prevNode.parentId !== node.parentId || prevNode.style !== node.style) {
          upserted.push(node);
        } else {
          movedNodeIds.add(id);
        }
      }
    }
    for (const id of prevMap.keys()) {
      if (!currMap.has(id)) removedIds.push(id);
    }

    if (upserted.length > 0) postTabMessage({ type: 'canvas:nodes-upserted', nodes: upserted });
    if (removedIds.length > 0) postTabMessage({ type: 'canvas:nodes-removed', ids: removedIds });

    // Debounced position broadcast (200ms)
    if (movedNodeIds.size > 0) {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of useCanvasStore.getState().nodes) {
          if (movedNodeIds.has(n.id)) positions[n.id] = n.position;
        }
        movedNodeIds.clear();
        moveTimer = null;
        if (Object.keys(positions).length > 0) {
          postTabMessage({ type: 'canvas:nodes-moved', positions });
        }
      }, 200);
    }
  }

  // Cross-tab broadcast: edges
  if (edgesChanged) {
    const prevMap = new Map(prev.edges.map(e => [e.id, e]));
    const currMap = new Map(state.edges.map(e => [e.id, e]));

    const upserted: ComponentEdge[] = [];
    const removedIds: string[] = [];

    for (const [id, edge] of currMap) {
      if (!prevMap.has(id) || prevMap.get(id) !== edge) {
        upserted.push(edge);
      }
    }
    for (const id of prevMap.keys()) {
      if (!currMap.has(id)) removedIds.push(id);
    }

    if (upserted.length > 0) postTabMessage({ type: 'canvas:edges-upserted', edges: upserted });
    if (removedIds.length > 0) postTabMessage({ type: 'canvas:edges-removed', ids: removedIds });
  }

  // Cross-tab broadcast: metadata
  if (metaChanged) {
    postTabMessage({ type: 'canvas:meta', name: state.schemaName, description: state.schemaDescription, tags: state.schemaTags });
  }

  if (state.displayMode !== prev.displayMode) {
    localStorage.setItem(DISPLAY_MODE_KEY, state.displayMode);
  }
});

// Receive cross-tab canvas operations
onTabMessage((msg) => {
  switch (msg.type) {
    case 'canvas:nodes-upserted': {
      const state = useCanvasStore.getState();
      const remoteMap = new Map(msg.nodes.map(n => [n.id, n]));
      const merged = state.nodes.map(n => remoteMap.get(n.id) ?? n);
      const localIds = new Set(state.nodes.map(n => n.id));
      const added = msg.nodes.filter(n => !localIds.has(n.id));
      useCanvasStore.setState({ _skipAutoSave: true, nodes: sortNodesParentFirst([...merged, ...added]) });
      useCanvasStore.setState({ _skipAutoSave: false });
      break;
    }
    case 'canvas:nodes-removed': {
      const ids = new Set(msg.ids);
      const state = useCanvasStore.getState();
      useCanvasStore.setState({
        _skipAutoSave: true,
        nodes: state.nodes.filter(n => !ids.has(n.id)),
        edges: state.edges.filter(e => !ids.has(e.source) && !ids.has(e.target)),
        selectedNodeId: ids.has(state.selectedNodeId ?? '') ? null : state.selectedNodeId,
      });
      useCanvasStore.setState({ _skipAutoSave: false });
      break;
    }
    case 'canvas:nodes-moved': {
      const state = useCanvasStore.getState();
      useCanvasStore.setState({
        _skipAutoSave: true,
        nodes: state.nodes.map(n => {
          const pos = msg.positions[n.id];
          return pos ? { ...n, position: pos } : n;
        }),
      });
      useCanvasStore.setState({ _skipAutoSave: false });
      break;
    }
    case 'canvas:edges-upserted': {
      const state = useCanvasStore.getState();
      const remoteMap = new Map(msg.edges.map(e => [e.id, e]));
      const merged = state.edges.map(e => (remoteMap.get(e.id) ?? e) as ComponentEdge);
      const localIds = new Set(state.edges.map(e => e.id));
      const added = msg.edges.filter(e => !localIds.has(e.id)) as ComponentEdge[];
      useCanvasStore.setState({ _skipAutoSave: true, edges: [...merged, ...added] });
      useCanvasStore.setState({ _skipAutoSave: false });
      break;
    }
    case 'canvas:edges-removed': {
      const ids = new Set(msg.ids);
      const state = useCanvasStore.getState();
      useCanvasStore.setState({
        _skipAutoSave: true,
        edges: state.edges.filter(e => !ids.has(e.id)),
        selectedEdgeId: ids.has(state.selectedEdgeId ?? '') ? null : state.selectedEdgeId,
      });
      useCanvasStore.setState({ _skipAutoSave: false });
      break;
    }
    case 'canvas:meta':
      useCanvasStore.setState({
        _skipAutoSave: true,
        schemaName: msg.name,
        schemaDescription: msg.description,
        schemaTags: msg.tags,
      });
      useCanvasStore.setState({ _skipAutoSave: false });
      break;
  }
});

// Flush pending save when tab goes to background
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave();
  });
}
