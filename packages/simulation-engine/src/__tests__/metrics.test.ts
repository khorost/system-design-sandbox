import { describe, it, expect } from 'vitest';
import { aggregateMetrics } from '../metrics.js';
import type { SimRequest, ComponentModel } from '../models.js';

function mkRequest(overrides: Partial<SimRequest> = {}): SimRequest {
  return {
    id: 'r1',
    tag: 'default',
    currentNode: 'svc',
    visited: ['client', 'svc'],
    totalLatencyMs: 15,
    failed: false,
    payloadSizeKb: 10,
    ...overrides,
  };
}

function mkComponent(id: string, overrides: Partial<ComponentModel> = {}): ComponentModel {
  return {
    id,
    type: 'service',
    maxRps: 1000,
    currentLoad: 500,
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

describe('aggregateMetrics', () => {
  it('returns zeros for empty request list', () => {
    const components = new Map<string, ComponentModel>();
    const result = aggregateMetrics([], components, 1000, 0.1);

    expect(result.latencyP50).toBe(0);
    expect(result.latencyP95).toBe(0);
    expect(result.latencyP99).toBe(0);
    expect(result.throughput).toBe(0);
    expect(result.errorRate).toBe(0);
  });

  it('computes correct percentiles and errorRate', () => {
    const requests: SimRequest[] = [
      mkRequest({ id: 'r1', totalLatencyMs: 10, failed: false }),
      mkRequest({ id: 'r2', totalLatencyMs: 20, failed: false }),
      mkRequest({ id: 'r3', totalLatencyMs: 30, failed: false }),
      mkRequest({ id: 'r4', totalLatencyMs: 40, failed: false }),
      mkRequest({ id: 'r5', totalLatencyMs: 50, failed: true }),
    ];
    const components = new Map([['svc', mkComponent('svc')]]);
    const result = aggregateMetrics(requests, components, 1000, 0.1);

    // 4 successful, sorted latencies: [10,20,30,40]
    // P50: idx = ceil(0.5*4)-1 = 1 → 20
    expect(result.latencyP50).toBe(20);
    // P95: idx = ceil(0.95*4)-1 = 3 → 40
    expect(result.latencyP95).toBe(40);
    // P99: idx = ceil(0.99*4)-1 = 3 → 40
    expect(result.latencyP99).toBe(40);
    // throughput: 4 succeeded / 0.1s = 40
    expect(result.throughput).toBe(40);
    // errorRate: 1/5 = 0.2
    expect(result.errorRate).toBe(0.2);
  });

  it('reports component utilization', () => {
    const components = new Map([
      ['svc', mkComponent('svc', { currentLoad: 500, maxRps: 1000 })],
    ]);
    const result = aggregateMetrics([], components, 1000, 0.1);
    expect(result.componentUtilization['svc']).toBe(0.5);
  });

  it('client nodes always show 0% utilization', () => {
    const components = new Map([
      ['client', mkComponent('client', { type: 'web_client', currentLoad: 100, maxRps: 1000 })],
    ]);
    const result = aggregateMetrics([], components, 1000, 0.1);
    expect(result.componentUtilization['client']).toBe(0);
  });
});
