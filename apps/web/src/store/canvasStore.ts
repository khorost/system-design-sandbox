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
import type { ComponentNode, ComponentEdge, ArchitectureSchema, EdgeData } from '../types/index.ts';
import { DEFAULT_EDGE_DATA } from '../types/index.ts';

const STORAGE_KEY = 'sds-architecture';

function loadInitialState(): { nodes: ComponentNode[]; edges: ComponentEdge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nodes: [], edges: [] };
    const schema: ArchitectureSchema = JSON.parse(raw);
    return { nodes: schema.nodes ?? [], edges: schema.edges ?? [] };
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

interface CanvasState {
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  onNodesChange: OnNodesChange<ComponentNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: ComponentNode) => void;
  removeNode: (id: string) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  updateEdgeData: (id: string, data: Partial<EdgeData>) => void;

  save: () => void;
  load: () => void;
  clear: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: initial.nodes,
  edges: initial.edges,
  selectedNodeId: null,
  selectedEdgeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) as ComponentEdge[] });
  },

  onConnect: (connection: Connection) => {
    const edge: ComponentEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      type: 'flow',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      data: { ...DEFAULT_EDGE_DATA },
    };
    set({ edges: addEdge(edge, get().edges) as ComponentEdge[] });
  },

  addNode: (node) => {
    set({ nodes: [...get().nodes, node] });
  },

  removeNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  updateNodeConfig: (id, config) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...config } } } : n
      ),
    });
  },

  selectNode: (id) => {
    set({ selectedNodeId: id, selectedEdgeId: null });
  },

  selectEdge: (id) => {
    set({ selectedEdgeId: id, selectedNodeId: null });
  },

  updateEdgeData: (id, data) => {
    set({
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data ?? DEFAULT_EDGE_DATA), ...data } as EdgeData } : e
      ),
    });
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
      set({ nodes: schema.nodes, edges: schema.edges });
    } catch {
      // ignore corrupted data
    }
  },

  clear: () => {
    set({ nodes: [], edges: [], selectedNodeId: null, selectedEdgeId: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));

// Auto-save on every nodes/edges change (debounced 500ms)
useCanvasStore.subscribe((state, prev) => {
  if (state.nodes !== prev.nodes || state.edges !== prev.edges) {
    debouncedSave(state.nodes, state.edges);
  }
});
