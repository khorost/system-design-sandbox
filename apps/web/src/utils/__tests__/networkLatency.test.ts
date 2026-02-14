import { describe, it, expect } from 'vitest';
import type { ComponentNode } from '../../types/index.ts';
import type { ComponentType } from '../../types/index.ts';
import {
  isValidNesting,
  getAbsolutePosition,
  getNestingDepth,
  getAncestorChain,
  findLCA,
  computeEffectiveLatency,
  CLIENT_TO_DATACENTER_LATENCY_MS,
  INTER_DATACENTER_LATENCY_MS,
} from '../networkLatency.ts';

function mkNode(
  id: string,
  componentType: ComponentType,
  parentId?: string,
  position = { x: 0, y: 0 },
): ComponentNode {
  return {
    id,
    type: 'serviceNode',
    position,
    data: {
      label: id,
      componentType,
      category: 'compute',
      icon: '',
      config: {},
    },
    ...(parentId ? { parentId, extent: 'parent' as const } : {}),
  };
}

describe('isValidNesting', () => {
  it('leaf node can go into any container', () => {
    expect(isValidNesting('service', 'docker_container')).toBe(true);
    expect(isValidNesting('service', 'rack')).toBe(true);
    expect(isValidNesting('service', 'datacenter')).toBe(true);
  });

  it('docker cannot go into docker', () => {
    expect(isValidNesting('docker_container', 'docker_container')).toBe(false);
  });

  it('docker can go into rack', () => {
    expect(isValidNesting('docker_container', 'rack')).toBe(true);
  });

  it('non-container parent returns false', () => {
    expect(isValidNesting('service', 'service')).toBe(false);
  });

  it('rack can go into datacenter', () => {
    expect(isValidNesting('rack', 'datacenter')).toBe(true);
  });

  it('datacenter cannot go into rack', () => {
    expect(isValidNesting('datacenter', 'rack')).toBe(false);
  });
});

describe('getAbsolutePosition', () => {
  it('top-level node returns its own position', () => {
    const node = mkNode('a', 'service', undefined, { x: 100, y: 200 });
    const nodeMap = new Map([['a', node]]);
    expect(getAbsolutePosition(node, nodeMap)).toEqual({ x: 100, y: 200 });
  });

  it('nested 1 level adds parent position', () => {
    const parent = mkNode('dc', 'datacenter', undefined, { x: 50, y: 50 });
    const child = mkNode('svc', 'service', 'dc', { x: 10, y: 20 });
    const nodeMap = new Map([['dc', parent], ['svc', child]]);
    expect(getAbsolutePosition(child, nodeMap)).toEqual({ x: 60, y: 70 });
  });

  it('nested 2 levels sums all ancestor positions', () => {
    const dc = mkNode('dc', 'datacenter', undefined, { x: 100, y: 100 });
    const rack = mkNode('rack', 'rack', 'dc', { x: 10, y: 10 });
    const svc = mkNode('svc', 'service', 'rack', { x: 5, y: 5 });
    const nodeMap = new Map([['dc', dc], ['rack', rack], ['svc', svc]]);
    expect(getAbsolutePosition(svc, nodeMap)).toEqual({ x: 115, y: 115 });
  });
});

describe('getNestingDepth', () => {
  it('top-level node has depth 0', () => {
    const node = mkNode('a', 'service');
    const nodeMap = new Map([['a', node]]);
    expect(getNestingDepth(node, nodeMap)).toBe(0);
  });

  it('child has depth 1', () => {
    const parent = mkNode('dc', 'datacenter');
    const child = mkNode('svc', 'service', 'dc');
    const nodeMap = new Map([['dc', parent], ['svc', child]]);
    expect(getNestingDepth(child, nodeMap)).toBe(1);
  });

  it('grandchild has depth 2', () => {
    const dc = mkNode('dc', 'datacenter');
    const rack = mkNode('rack', 'rack', 'dc');
    const svc = mkNode('svc', 'service', 'rack');
    const nodeMap = new Map([['dc', dc], ['rack', rack], ['svc', svc]]);
    expect(getNestingDepth(svc, nodeMap)).toBe(2);
  });
});

describe('getAncestorChain', () => {
  it('returns full chain from leaf to root', () => {
    const dc = mkNode('dc', 'datacenter');
    const rack = mkNode('rack', 'rack', 'dc');
    const svc = mkNode('svc', 'service', 'rack');
    const nodes = [dc, rack, svc];

    const chain = getAncestorChain('svc', nodes);
    expect(chain).toEqual(['svc', 'rack', 'dc']);
  });

  it('top-level node chain is just itself', () => {
    const node = mkNode('a', 'service');
    expect(getAncestorChain('a', [node])).toEqual(['a']);
  });
});

describe('findLCA', () => {
  it('finds common ancestor', () => {
    const chainA = ['s1', 'rack1', 'dc1'];
    const chainB = ['s2', 'rack1', 'dc1'];
    expect(findLCA(chainA, chainB)).toBe('rack1');
  });

  it('returns null when no common ancestor', () => {
    const chainA = ['s1', 'dc1'];
    const chainB = ['s2', 'dc2'];
    expect(findLCA(chainA, chainB)).toBeNull();
  });

  it('same node is LCA of itself', () => {
    const chainA = ['s1', 'rack', 'dc'];
    const chainB = ['s1', 'rack', 'dc'];
    expect(findLCA(chainA, chainB)).toBe('s1');
  });
});

describe('computeEffectiveLatency', () => {
  it('client → service in DC returns client latency + container overhead', () => {
    const client = mkNode('client', 'web_client');
    const dc = mkNode('dc', 'datacenter');
    const rack = mkNode('rack', 'rack', 'dc');
    const docker = mkNode('docker', 'docker_container', 'rack');
    const svc = mkNode('svc', 'service', 'docker');
    const nodes = [client, dc, rack, docker, svc];

    const latency = computeEffectiveLatency('client', 'svc', nodes);
    // 100 (client→dc) + 5 (dc) + 1 (rack) + 0.1 (docker) = 106.1
    expect(latency).toBeCloseTo(CLIENT_TO_DATACENTER_LATENCY_MS + 5 + 1 + 0.1, 5);
  });

  it('service → service same rack', () => {
    const dc = mkNode('dc', 'datacenter');
    const rack = mkNode('rack', 'rack', 'dc');
    const d1 = mkNode('d1', 'docker_container', 'rack');
    const d2 = mkNode('d2', 'docker_container', 'rack');
    const s1 = mkNode('s1', 'service', 'd1');
    const s2 = mkNode('s2', 'service', 'd2');
    const nodes = [dc, rack, d1, d2, s1, s2];

    const latency = computeEffectiveLatency('s1', 's2', nodes);
    // LCA = rack, sum = d1(0.1) + d2(0.1) = 0.2
    expect(latency).toBeCloseTo(0.2, 5);
  });

  it('service → service cross-DC', () => {
    const dc1 = mkNode('dc1', 'datacenter');
    const dc2 = mkNode('dc2', 'datacenter');
    const s1 = mkNode('s1', 'service', 'dc1');
    const s2 = mkNode('s2', 'service', 'dc2');
    const nodes = [dc1, dc2, s1, s2];

    const latency = computeEffectiveLatency('s1', 's2', nodes);
    // No common ancestor → 50 (inter-DC) + dc1(5) + dc2(5) = 60
    expect(latency).toBeCloseTo(INTER_DATACENTER_LATENCY_MS + 5 + 5, 5);
  });

  it('no containers returns 0', () => {
    const s1 = mkNode('s1', 'service');
    const s2 = mkNode('s2', 'service');
    const nodes = [s1, s2];

    expect(computeEffectiveLatency('s1', 's2', nodes)).toBe(0);
  });
});
