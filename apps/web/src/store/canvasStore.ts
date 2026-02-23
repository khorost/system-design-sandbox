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

function loadInitialState(): { nodes: ComponentNode[]; edges: ComponentEdge[]; schemaName: string; schemaDescription: string; schemaTags: string[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], edges: [], schemaName: '', schemaDescription: '', schemaTags: [] };
    const schema: ArchitectureSchema = JSON.parse(raw);
    return {
      nodes: sortNodesParentFirst(schema.nodes ?? []),
      edges: schema.edges ?? [],
      schemaName: schema.metadata?.name ?? '',
      schemaDescription: schema.metadata?.description ?? '',
      schemaTags: schema.metadata?.tags ?? [],
    };
  } catch {
    return { nodes: [], edges: [], schemaName: '', schemaDescription: '', schemaTags: [] };
  }
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

interface CanvasState {
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusNodeId: string | null;
  edgeLabelMode: EdgeLabelMode;
  schemaName: string;
  schemaDescription: string;
  schemaTags: string[];
  architectureId: string | null;
  isPublic: boolean;
  _history: { past: Snapshot[]; future: Snapshot[] };
  _skipAutoSave: boolean;

  onNodesChange: OnNodesChange<ComponentNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: ComponentNode) => void;
  removeNode: (id: string) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  selectNode: (id: string | null) => void;
  focusNode: (id: string) => void;
  clearFocus: () => void;
  selectEdge: (id: string | null) => void;
  updateEdgeData: (id: string, data: Partial<EdgeData>) => void;
  setNodeParent: (nodeId: string, parentId: string | null) => void;
  getChildren: (nodeId: string) => ComponentNode[];
  getAncestors: (nodeId: string) => string[];
  cycleEdgeLabelMode: () => void;

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
  edgeLabelMode: 'auto',
  schemaName: initial.schemaName,
  schemaDescription: initial.schemaDescription,
  schemaTags: initial.schemaTags,
  architectureId: null,
  isPublic: false,
  _history: { past: [], future: [] },
  _skipAutoSave: false,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    const hasRemoval = changes.some(c => c.type === 'remove');
    if (hasRemoval) set({ ...pushHistory(get) });
    set({ edges: applyEdgeChanges(changes, get().edges) as ComponentEdge[] });
  },

  onConnect: (connection: Connection) => {
    const targetNode = get().nodes.find(n => n.id === connection.target);
    const targetType = targetNode?.data.componentType;
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
        set({ ...hist, nodes: updated });
        return;
      }
    }
    set({ ...hist, nodes: [...nodes, node] });
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
    set({
      ...pushHistory(get),
      nodes: get().nodes.filter((n) => !toRemove.has(n.id)),
      edges: get().edges.filter((e) => !toRemove.has(e.source) && !toRemove.has(e.target)),
      selectedNodeId: toRemove.has(get().selectedNodeId ?? '') ? null : get().selectedNodeId,
    });
  },

  updateNodeConfig: (id, config) => {
    set({
      ...pushHistory(get),
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } } : n
      ),
    });
  },

  selectNode: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null });
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

      // Attach: compute position relative to new parent's absolute position
      const newParent = nodeMap.get(parentId);
      if (!newParent) return n;
      const parentAbs = getAbsolutePosition(newParent, nodeMap);
      const relX = abs.x - parentAbs.x;
      const relY = abs.y - parentAbs.y;
      // Clamp inside parent with some padding (35px top for header)
      const pw = (newParent.style?.width as number) ?? (newParent.width ?? CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH);
      const ph = (newParent.style?.height as number) ?? (newParent.height ?? CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT);
      return {
        ...n,
        parentId,
        extent: 'parent' as const,
        position: {
          x: Math.max(CONFIG.CANVAS.CONTAINER_PADDING_LEFT, Math.min(relX, pw - 100)),
          y: Math.max(CONFIG.CANVAS.CONTAINER_PADDING_TOP, Math.min(relY, ph - 80)),
        },
      };
    });

    // Re-sort to maintain parent-before-child ordering
    set({ nodes: sortNodesParentFirst(updated) });
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
      nodes: sortNodesParentFirst(nodes),
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
