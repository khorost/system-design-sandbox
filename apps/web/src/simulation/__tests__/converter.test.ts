import { describe, it, expect } from 'vitest';
import type { ComponentNode, ComponentEdge } from '../../types/index.ts';
import type { ComponentType } from '../../types/index.ts';
import { convertNodesToComponents, convertEdgesToConnections, buildEdgeKeyToIdMap } from '../converter.ts';

function mkNode(
  id: string,
  componentType: ComponentType,
  config: Record<string, unknown> = {},
  parentId?: string,
): ComponentNode {
  return {
    id,
    type: 'serviceNode',
    position: { x: 0, y: 0 },
    data: {
      label: id,
      componentType,
      category: 'compute',
      icon: '',
      config,
    },
    ...(parentId ? { parentId } : {}),
  };
}

function mkEdge(source: string, target: string, data: Partial<ComponentEdge['data']> = {}): ComponentEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    data: {
      protocol: 'REST',
      latencyMs: 1,
      bandwidthMbps: 1000,
      timeoutMs: 5000,
      ...data,
    },
  };
}

describe('convertNodesToComponents', () => {
  it('client node gets generatedRps > 0', () => {
    const nodes = [mkNode('client', 'web_client', { concurrent_users_k: 2, requests_per_user: 0.5 })];
    const components = convertNodesToComponents(nodes);
    const client = components.get('client');

    expect(client).toBeDefined();
    // 2 * 1000 * 0.5 = 1000
    expect(client!.generatedRps).toBe(1000);
  });

  it('service node gets maxRps from config', () => {
    const nodes = [mkNode('svc', 'service', { max_rps_per_instance: 500, replicas: 2 })];
    const components = convertNodesToComponents(nodes);
    const svc = components.get('svc');

    expect(svc).toBeDefined();
    expect(svc!.maxRps).toBe(1000); // 500 * 2
    expect(svc!.generatedRps).toBe(0);
  });

  it('container nodes are skipped', () => {
    const nodes = [
      mkNode('dc', 'datacenter'),
      mkNode('rack', 'rack', {}, 'dc'),
      mkNode('svc', 'service', {}, 'rack'),
    ];
    const components = convertNodesToComponents(nodes);

    expect(components.has('dc')).toBe(false);
    expect(components.has('rack')).toBe(false);
    expect(components.has('svc')).toBe(true);
  });
});

describe('convertEdgesToConnections', () => {
  it('basic edge produces ConnectionModel', () => {
    const edges = [mkEdge('a', 'b')];
    const connections = convertEdgesToConnections(edges);

    expect(connections).toHaveLength(1);
    expect(connections[0].from).toBe('a');
    expect(connections[0].to).toBe('b');
    expect(connections[0].protocol).toBe('REST');
  });

  it('applies default bandwidth and timeout', () => {
    const edges = [mkEdge('a', 'b')];
    const connections = convertEdgesToConnections(edges);

    expect(connections[0].bandwidthMbps).toBe(1000);
    expect(connections[0].timeoutMs).toBe(5000);
  });

  it('filters out edges with missing source/target', () => {
    const edge: ComponentEdge = { id: 'broken', source: '', target: 'b' };
    const connections = convertEdgesToConnections([edge]);
    expect(connections).toHaveLength(0);
  });
});

describe('buildEdgeKeyToIdMap', () => {
  it('maps "source->target" to edge.id', () => {
    const edges = [mkEdge('a', 'b'), mkEdge('c', 'd')];
    const map = buildEdgeKeyToIdMap(edges);

    expect(map['a->b']).toBe('e-a-b');
    expect(map['c->d']).toBe('e-c-d');
  });
});
