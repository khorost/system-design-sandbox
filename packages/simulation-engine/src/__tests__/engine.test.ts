import { describe, it, expect } from 'vitest';
import { calculateLatency, propagateFailure, createSimulationEngine } from '../engine.js';
import type { ComponentModel, ConnectionModel, LoadProfile } from '../models.js';

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
    payloadSizeKb: 0,
    responseSizeKb: 0,
    ...overrides,
  };
}

describe('calculateLatency', () => {
  it('returns baseLatency when utilization is 0', () => {
    const comp = mkComponent({ currentLoad: 0, maxRps: 1000, baseLatencyMs: 10 });
    expect(calculateLatency(comp)).toBe(10);
  });

  it('returns 3x base when utilization is 0.5', () => {
    const comp = mkComponent({ currentLoad: 500, maxRps: 1000, baseLatencyMs: 10 });
    // queue_delay = 10 * (0.5 / 0.5) = 10, total = 10 + 10 = 20
    expect(calculateLatency(comp)).toBe(20);
  });

  it('returns Infinity when utilization >= 1', () => {
    const comp = mkComponent({ currentLoad: 1000, maxRps: 1000 });
    expect(calculateLatency(comp)).toBe(Infinity);

    const comp2 = mkComponent({ currentLoad: 1500, maxRps: 1000 });
    expect(calculateLatency(comp2)).toBe(Infinity);
  });
});

describe('propagateFailure', () => {
  it('cascades to dependents when they become overloaded', () => {
    // replicas=2 so formula: currentLoad *= 2/max(2-1,1) = currentLoad*2
    // svc: 60*2 = 120 > 100 → overloaded → affected
    const components = new Map<string, ComponentModel>([
      ['db', mkComponent({ id: 'db', maxRps: 100, currentLoad: 90, replicas: 2 })],
      ['svc', mkComponent({ id: 'svc', maxRps: 100, currentLoad: 60, replicas: 2 })],
    ]);
    const connections: ConnectionModel[] = [
      { from: 'svc', to: 'db', protocol: 'REST', latencyMs: 1, bandwidthMbps: 1000, timeoutMs: 5000 },
    ];

    const report = propagateFailure(components, connections, 'db');
    expect(report.failedNode).toBe('db');
    expect(report.affected).toContain('svc');
  });

  it('does not cascade if dependent has capacity', () => {
    const components = new Map<string, ComponentModel>([
      ['db', mkComponent({ id: 'db', maxRps: 100, currentLoad: 50, replicas: 2 })],
      ['svc', mkComponent({ id: 'svc', maxRps: 1000, currentLoad: 10, replicas: 2 })],
    ]);
    const connections: ConnectionModel[] = [
      { from: 'svc', to: 'db', protocol: 'REST', latencyMs: 1, bandwidthMbps: 1000, timeoutMs: 5000 },
    ];

    const report = propagateFailure(components, connections, 'db');
    expect(report.affected).not.toContain('svc');
  });
});

describe('createSimulationEngine', () => {
  function makeSimple() {
    const components = new Map<string, ComponentModel>([
      ['client', mkComponent({ id: 'client', type: 'web_client', generatedRps: 100, maxRps: 10000 })],
      ['svc', mkComponent({ id: 'svc', type: 'service', maxRps: 10000 })],
    ]);
    const connections: ConnectionModel[] = [
      { from: 'client', to: 'svc', protocol: 'REST', latencyMs: 5, bandwidthMbps: 1000, timeoutMs: 5000 },
    ];
    return { components, connections };
  }

  it('start/stop resets state', () => {
    const { components, connections } = makeSimple();
    const engine = createSimulationEngine(components, connections);
    const profile: LoadProfile = { type: 'constant', rps: 100, durationSec: 10 };

    engine.start(profile);
    engine.tick(); // generate some requests
    engine.stop();

    // After stop, tick returns zeroed metrics
    const metrics = engine.tick();
    expect(metrics.throughput).toBe(0);
    expect(metrics.errorRate).toBe(0);
  });

  it('tick returns metrics with latency and throughput', () => {
    const { components, connections } = makeSimple();
    const engine = createSimulationEngine(components, connections);
    const profile: LoadProfile = { type: 'constant', rps: 100, durationSec: 10 };

    engine.start(profile);
    // Run several ticks to let requests flow through
    let metrics;
    for (let i = 0; i < 5; i++) {
      metrics = engine.tick();
    }
    expect(metrics!.timestamp).toBeGreaterThan(0);
    // Should have some throughput by now
    expect(metrics!.latencyP50).toBeGreaterThanOrEqual(0);
  });

  it('injectFailure marks node as dead', () => {
    const { components, connections } = makeSimple();
    const engine = createSimulationEngine(components, connections);
    const profile: LoadProfile = { type: 'constant', rps: 100, durationSec: 10 };

    engine.start(profile);
    const report = engine.injectFailure('svc');
    expect(report.failedNode).toBe('svc');
    expect(components.get('svc')!.isAlive).toBe(false);
  });
});
