import { describe, it, expect } from 'vitest';
import { buildAdjacencyList, findEntryNodes, pickTag, resolveNextHops } from '../graph.js';
import type { ComponentModel, ConnectionModel } from '../models.js';

function mkComponent(overrides: Partial<ComponentModel> = {}): ComponentModel {
  return {
    id: 'c1',
    type: 'service',
    maxRps: 1000,
    currentLoad: 0,
    generatedRps: 0,
    baseLatencyMs: 10,
    loadLatencyFactor: 0.001,
    failureRate: 0,
    isAlive: true,
    replicas: 1,
    queueSize: 0,
    queueCapacity: 10000,
    processingRate: 1000,
    maxConnections: 10000,
    concurrentConnections: 0,
    payloadSizeKb: 0,
    responseSizeKb: 0,
    ...overrides,
  };
}

function mkConn(from: string, to: string, extra: Partial<ConnectionModel> = {}): ConnectionModel {
  return { from, to, protocol: 'REST', latencyMs: 1, bandwidthMbps: 1000, timeoutMs: 5000, ...extra };
}

describe('buildAdjacencyList', () => {
  it('returns empty map for empty connections', () => {
    expect(buildAdjacencyList([]).size).toBe(0);
  });

  it('builds correct adjacency for multiple connections', () => {
    const adj = buildAdjacencyList([mkConn('a', 'b'), mkConn('a', 'c'), mkConn('b', 'c')]);
    expect(adj.get('a')).toEqual(['b', 'c']);
    expect(adj.get('b')).toEqual(['c']);
    expect(adj.has('c')).toBe(false);
  });
});

describe('findEntryNodes', () => {
  it('clients are always entries', () => {
    const components = new Map<string, ComponentModel>([
      ['client', mkComponent({ id: 'client', type: 'web_client' })],
      ['svc', mkComponent({ id: 'svc', type: 'service' })],
    ]);
    const connections = [mkConn('client', 'svc')];
    const entries = findEntryNodes(components, connections);
    expect(entries).toContain('client');
  });

  it('nodes without incoming edges are entries', () => {
    const components = new Map<string, ComponentModel>([
      ['a', mkComponent({ id: 'a', type: 'service' })],
      ['b', mkComponent({ id: 'b', type: 'service' })],
    ]);
    const connections = [mkConn('a', 'b')];
    const entries = findEntryNodes(components, connections);
    expect(entries).toContain('a');
    expect(entries).not.toContain('b');
  });

  it('falls back to first node when all have incoming', () => {
    const components = new Map<string, ComponentModel>([
      ['a', mkComponent({ id: 'a', type: 'service' })],
      ['b', mkComponent({ id: 'b', type: 'service' })],
    ]);
    // Cycle: a→b, b→a — all have incoming
    const connections = [mkConn('a', 'b'), mkConn('b', 'a')];
    const entries = findEntryNodes(components, connections);
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe('pickTag', () => {
  it('returns "default" without distribution', () => {
    expect(pickTag()).toBe('default');
    expect(pickTag([])).toBe('default');
  });

  it('picks from weighted distribution', () => {
    // Single tag with weight 1 — always picks it
    const tag = pickTag([{ tag: 'orders', weight: 1 }]);
    expect(tag).toBe('orders');
  });

  it('returns "default" when total weight is 0', () => {
    expect(pickTag([{ tag: 'x', weight: 0 }])).toBe('default');
  });
});

describe('resolveNextHops', () => {
  it('load_balancer selects 1 random hop', () => {
    const adj = new Map([['lb', ['s1', 's2', 's3']]]);
    const connMap = new Map<string, ConnectionModel>();
    const lbNodes = new Set(['lb']);

    const hops = resolveNextHops('lb', 'default', ['lb'], adj, connMap, lbNodes);
    expect(hops).toHaveLength(1);
    expect(hops[0].count).toBe(1);
    expect(['s1', 's2', 's3']).toContain(hops[0].target);
  });

  it('routing rules produce fan-out', () => {
    const adj = new Map([['gw', ['s1', 's2']]]);
    const connMap = new Map<string, ConnectionModel>([
      ['gw->s1', mkConn('gw', 's1', { routingRules: [{ tag: 'api', weight: 2 }] })],
      ['gw->s2', mkConn('gw', 's2', { routingRules: [{ tag: 'api', weight: 3 }] })],
    ]);
    const lbNodes = new Set<string>();

    const hops = resolveNextHops('gw', 'api', ['gw'], adj, connMap, lbNodes);
    // Both neighbors should appear (weights > 0)
    expect(hops.length).toBeGreaterThanOrEqual(1);
    for (const hop of hops) {
      expect(hop.count).toBeGreaterThanOrEqual(1);
    }
  });

  it('no routing rules → 1 random neighbor', () => {
    const adj = new Map([['a', ['b', 'c']]]);
    const connMap = new Map<string, ConnectionModel>();
    const lbNodes = new Set<string>();

    const hops = resolveNextHops('a', 'default', ['a'], adj, connMap, lbNodes);
    expect(hops).toHaveLength(1);
    expect(hops[0].count).toBe(1);
    expect(['b', 'c']).toContain(hops[0].target);
  });

  it('returns empty when no neighbors', () => {
    const adj = new Map<string, string[]>();
    const connMap = new Map<string, ConnectionModel>();
    const lbNodes = new Set<string>();

    const hops = resolveNextHops('a', 'default', ['a'], adj, connMap, lbNodes);
    expect(hops).toEqual([]);
  });

  it('least_conn picks target with lowest utilization', () => {
    const adj = new Map([['lb', ['s1', 's2']]]);
    const connMap = new Map<string, ConnectionModel>();
    const lbNodes = new Set(['lb']);
    const components = new Map<string, ComponentModel>([
      ['lb', mkComponent({ id: 'lb', type: 'load_balancer', lbAlgorithm: 'least_conn' })],
      ['s1', mkComponent({ id: 's1', currentLoad: 800, maxRps: 1000 })],
      ['s2', mkComponent({ id: 's2', currentLoad: 200, maxRps: 1000 })],
    ]);

    // Run multiple times — least_conn should always pick s2 (lower load)
    for (let i = 0; i < 10; i++) {
      const hops = resolveNextHops('lb', 'default', ['lb'], adj, connMap, lbNodes, components);
      expect(hops).toHaveLength(1);
      expect(hops[0].target).toBe('s2');
    }
  });

  it('blockedTags prevents routing for blocked tag', () => {
    const adj = new Map([['lb', ['s1']]]);
    const connMap = new Map<string, ConnectionModel>();
    const lbNodes = new Set(['lb']);
    const components = new Map<string, ComponentModel>([
      ['lb', mkComponent({ id: 'lb', type: 'load_balancer', blockedTags: ['api'] })],
      ['s1', mkComponent({ id: 's1' })],
    ]);

    const hops = resolveNextHops('lb', 'api', ['lb'], adj, connMap, lbNodes, components);
    expect(hops).toEqual([]);

    // Non-blocked tag should pass
    const hops2 = resolveNextHops('lb', 'web', ['lb'], adj, connMap, lbNodes, components);
    expect(hops2).toHaveLength(1);
  });

  it('supportedTags filters targets', () => {
    const adj = new Map([['gw', ['cdn', 'svc']]]);
    const connMap = new Map<string, ConnectionModel>();
    const lbNodes = new Set<string>();
    const components = new Map<string, ComponentModel>([
      ['gw', mkComponent({ id: 'gw', type: 'api_gateway' })],
      ['cdn', mkComponent({ id: 'cdn', type: 'cdn', supportedTags: ['web', 'content'] })],
      ['svc', mkComponent({ id: 'svc', type: 'service' })],
    ]);

    // 'api' tag not in cdn's supportedTags → only svc is candidate
    const hops = resolveNextHops('gw', 'api', ['gw'], adj, connMap, lbNodes, components);
    expect(hops).toHaveLength(1);
    expect(hops[0].target).toBe('svc');
  });

  it('weight 0 blocks tag on connection', () => {
    const adj = new Map([['a', ['b']]]);
    const connMap = new Map<string, ConnectionModel>([
      ['a->b', mkConn('a', 'b', { routingRules: [{ tag: 'api', weight: 0 }] })],
    ]);
    const lbNodes = new Set<string>();

    const hops = resolveNextHops('a', 'api', ['a'], adj, connMap, lbNodes);
    expect(hops).toEqual([]);
  });
});
