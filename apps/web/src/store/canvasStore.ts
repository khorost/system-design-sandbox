import { create } from 'zustand';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type Connection,
} from '@xyflow/react';
import type { ComponentNode, ComponentEdge, ArchitectureSchema, EdgeData, ProtocolType } from '../types/index.ts';
import { DEFAULT_EDGE_DATA, DISK_COMPONENT_TYPES } from '../types/index.ts';
import { getAbsolutePosition } from '../utils/networkLatency.ts';
import { getDefinition } from '@system-design-sandbox/component-library';
import { exportDsl as serializeDsl } from '../dsl/serializer.ts';
import { parseDsl } from '../dsl/parser.ts';
import { autoLayout } from '../dsl/layout.ts';

const DISK_DEFAULT_PROTOCOL: Record<string, ProtocolType> = {
  local_ssd: 'SATA',
  nvme: 'NVMe',
  network_disk: 'iSCSI',
  nfs: 'NFS',
};

const STORAGE_KEY = 'sds-architecture';
const MAX_HISTORY = 100;

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

function loadInitialState(): { nodes: ComponentNode[]; edges: ComponentEdge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], edges: [] };
    const schema: ArchitectureSchema = JSON.parse(raw);
    return { nodes: sortNodesParentFirst(schema.nodes ?? []), edges: schema.edges ?? [] };
  } catch {
    return { nodes: [], edges: [] };
  }
}

const initial = loadInitialState();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(nodes: ComponentNode[], edges: ComponentEdge[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const schema: ArchitectureSchema = {
      version: '1.0',
      metadata: {
        name: 'My Architecture',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      nodes,
      edges,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schema));
  }, 500);
}

export type EdgeLabelMode = 'auto' | 'protocol' | 'traffic' | 'full';

interface CanvasState {
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusNodeId: string | null;
  edgeLabelMode: EdgeLabelMode;
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

  exportSchema: () => string;
  importSchema: (json: string) => { ok: true } | { ok: false; error: string };
  exportDsl: () => string;
  importDsl: (text: string) => { ok: true } | { ok: false; error: string };

  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  save: () => void;
  load: () => void;
  clear: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  selectedEdgeId: null,
  focusNodeId: null,
  edgeLabelMode: 'auto',
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
      const pw = (newParent.style?.width as number) ?? (newParent.width ?? 400);
      const ph = (newParent.style?.height as number) ?? (newParent.height ?? 300);
      return {
        ...n,
        parentId,
        extent: 'parent' as const,
        position: {
          x: Math.max(10, Math.min(relX, pw - 100)),
          y: Math.max(35, Math.min(relY, ph - 80)),
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

  cycleEdgeLabelMode: () => {
    const order: EdgeLabelMode[] = ['auto', 'protocol', 'traffic', 'full'];
    const cur = get().edgeLabelMode;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    set({ edgeLabelMode: next });
  },

  exportSchema: () => {
    const { nodes, edges } = get();
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
        name: 'My Architecture',
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

    // Validate nodes
    for (const node of nodes) {
      if (!node.id || !node.position || !node.data?.componentType || !node.data?.label) {
        return { ok: false as const, error: `Node "${node.id ?? '?'}" missing required fields (id, position, data.componentType, data.label).` };
      }
      if (!getDefinition(node.data.componentType)) {
        warnings.push(`Unknown componentType "${node.data.componentType}" on node "${node.id}".`);
      }
    }

    // Validate edges — drop broken references
    const nodeIds = new Set(nodes.map(n => n.id));
    const validEdges = edges.filter(e => {
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
        warnings.push(`Dropped edge "${e.id}" — source or target node not found.`);
        return false;
      }
      return true;
    });

    if (warnings.length > 0) {
      console.warn('[importSchema]', warnings.join('\n'));
    }

    set({
      ...pushHistory(get),
      nodes: sortNodesParentFirst(nodes),
      edges: validEdges,
      selectedNodeId: null,
      selectedEdgeId: null,
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
      console.warn('[importDsl]', result.warnings.join('\n'));
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
    const { nodes, edges } = get();
    const schema: ArchitectureSchema = {
      version: '1.0',
      metadata: {
        name: 'My Architecture',
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

  clear: () => {
    set({ ...pushHistory(get), nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));

// Auto-save on every nodes/edges change (debounced 500ms)
useCanvasStore.subscribe((state, prev) => {
  if (state._skipAutoSave) return;
  if (state.nodes !== prev.nodes || state.edges !== prev.edges) {
    debouncedSave(state.nodes, state.edges);
  }
});
