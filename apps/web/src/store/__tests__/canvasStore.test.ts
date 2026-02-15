import { beforeEach,describe, expect, it } from 'vitest';

import type { ComponentEdge, ComponentNode, ComponentType } from '../../types/index.ts';
import { useCanvasStore } from '../canvasStore.ts';

function mkNode(id: string, componentType: ComponentType = 'service'): ComponentNode {
  return {
    id,
    type: 'serviceNode',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      componentType,
      category: 'compute' as const,
      icon: '',
      config: {},
    },
  };
}

function mkEdge(source: string, target: string): ComponentEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: 'flow',
    data: {
      protocol: 'REST' as const,
      latencyMs: 1,
      bandwidthMbps: 1000,
      timeoutMs: 5000,
    },
  };
}

beforeEach(() => {
  // Reset store to clean state
  useCanvasStore.setState({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    _history: { past: [], future: [] },
    _skipAutoSave: true,
  });
});

describe('addNode / removeNode', () => {
  it('addNode adds a node', () => {
    const { addNode } = useCanvasStore.getState();
    addNode(mkNode('n1'));

    const { nodes } = useCanvasStore.getState();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('n1');
  });

  it('removeNode removes a node and its edges', () => {
    const store = useCanvasStore.getState();
    store.addNode(mkNode('n1'));
    store.addNode(mkNode('n2'));
    useCanvasStore.setState({ edges: [mkEdge('n1', 'n2')] });

    useCanvasStore.getState().removeNode('n1');

    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('n2');
    expect(edges).toHaveLength(0);
  });
});

describe('undo / redo', () => {
  it('undo restores previous state', () => {
    const store = useCanvasStore.getState();

    // Push snapshot of empty state, then add node
    store.addNode(mkNode('n1')); // pushes history internally
    expect(useCanvasStore.getState().nodes).toHaveLength(1);

    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(0);
  });

  it('redo restores after undo', () => {
    useCanvasStore.getState().addNode(mkNode('n1'));
    useCanvasStore.getState().undo();
    expect(useCanvasStore.getState().nodes).toHaveLength(0);

    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0].id).toBe('n1');
  });
});

describe('exportSchema / importSchema', () => {
  it('roundtrip preserves nodes and edges', () => {
    const store = useCanvasStore.getState();
    store.addNode(mkNode('n1'));
    store.addNode(mkNode('n2'));
    useCanvasStore.setState({
      edges: [mkEdge('n1', 'n2')],
    });

    const json = useCanvasStore.getState().exportSchema();
    // Clear the store
    useCanvasStore.setState({ nodes: [], edges: [] });

    const result = useCanvasStore.getState().importSchema(json);
    expect(result.ok).toBe(true);

    const { nodes, edges } = useCanvasStore.getState();
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(nodes.map(n => n.id).sort()).toEqual(['n1', 'n2']);
  });

  it('invalid JSON returns ok: false', () => {
    const result = useCanvasStore.getState().importSchema('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid JSON');
    }
  });

  it('unknown componentType warns but succeeds', () => {
    const schema = {
      version: '1.0',
      metadata: { name: 'test', createdAt: '', updatedAt: '' },
      nodes: [{
        id: 'x',
        type: 'serviceNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'X',
          componentType: 'future_component',
          category: 'compute',
          icon: '',
          config: {},
        },
      }],
      edges: [],
    };

    const result = useCanvasStore.getState().importSchema(JSON.stringify(schema));
    // Should succeed even with unknown type (forward compatibility)
    expect(result.ok).toBe(true);
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
  });
});

describe('setNodeParent', () => {
  it('sets parent on a node', () => {
    const store = useCanvasStore.getState();
    const dc = mkNode('dc', 'datacenter');
    // Give the DC a size so clamping works
    (dc as ComponentNode & { width?: number; height?: number }).width = 400;
    (dc as ComponentNode & { style?: Record<string, unknown> }).style = { width: 400, height: 300 };

    store.addNode(dc);
    store.addNode(mkNode('svc'));

    useCanvasStore.getState().setNodeParent('svc', 'dc');

    const svc = useCanvasStore.getState().nodes.find(n => n.id === 'svc');
    expect(svc?.parentId).toBe('dc');
  });

  it('detach sets parentId to undefined', () => {
    const store = useCanvasStore.getState();
    const dc = mkNode('dc', 'datacenter');
    (dc as ComponentNode & { style?: Record<string, unknown> }).style = { width: 400, height: 300 };
    store.addNode(dc);

    const svc = mkNode('svc');
    (svc as ComponentNode).parentId = 'dc';
    store.addNode(svc);

    useCanvasStore.getState().setNodeParent('svc', null);

    const updated = useCanvasStore.getState().nodes.find(n => n.id === 'svc');
    expect(updated?.parentId).toBeUndefined();
  });
});
