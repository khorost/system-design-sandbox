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
import type { ComponentNode, ComponentEdge, ArchitectureSchema } from '../types/index.ts';

const STORAGE_KEY = 'sds-architecture';

interface CanvasState {
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  selectedNodeId: string | null;

  onNodesChange: OnNodesChange<ComponentNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (node: ComponentNode) => void;
  removeNode: (id: string) => void;
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  selectNode: (id: string | null) => void;

  save: () => void;
  load: () => void;
  clear: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (connection: Connection) => {
    const edge: ComponentEdge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${Date.now()}`,
      type: 'default',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    };
    set({ edges: addEdge(edge, get().edges) });
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
    set({ selectedNodeId: id });
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
    set({ nodes: [], edges: [], selectedNodeId: null });
    localStorage.removeItem(STORAGE_KEY);
  },
}));
