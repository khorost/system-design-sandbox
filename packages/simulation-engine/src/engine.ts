import type { ComponentModel, ConnectionModel, SimulationMetrics, LoadProfile, FailureReport } from './models.js';

export function calculateLatency(component: ComponentModel): number {
  const utilization = component.currentLoad / component.maxRps;
  if (utilization >= 1.0) return Infinity;
  const queueDelay = component.baseLatencyMs * (utilization / (1 - utilization));
  return component.baseLatencyMs + queueDelay;
}

export function propagateFailure(
  components: Map<string, ComponentModel>,
  connections: ConnectionModel[],
  failedNodeId: string
): FailureReport {
  const affected: string[] = [];
  const getDependents = (nodeId: string) =>
    connections.filter((c) => c.to === nodeId).map((c) => c.from);

  const queue = getDependents(failedNodeId);
  const visited = new Set<string>([failedNodeId]);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = components.get(nodeId);
    if (!node) continue;

    node.currentLoad *= node.replicas / Math.max(node.replicas - 1, 1);
    if (node.currentLoad > node.maxRps) {
      affected.push(nodeId);
      queue.push(...getDependents(nodeId));
    }
  }

  return { failedNode: failedNodeId, cascadeDepth: affected.length, affected };
}

export interface SimulationEngine {
  start(profile: LoadProfile): void;
  stop(): void;
  tick(): SimulationMetrics;
  injectFailure(nodeId: string): FailureReport;
}

// Stub — will be implemented in Phase 2
export function createSimulationEngine(
  _components: Map<string, ComponentModel>,
  _connections: ConnectionModel[]
): SimulationEngine {
  return {
    start(_profile: LoadProfile) {
      // TODO: Phase 2
    },
    stop() {
      // TODO: Phase 2
    },
    tick(): SimulationMetrics {
      return {
        timestamp: Date.now(),
        latencyP50: 0,
        latencyP95: 0,
        latencyP99: 0,
        throughput: 0,
        errorRate: 0,
        componentUtilization: {},
        queueDepths: {},
      };
    },
    injectFailure(_nodeId: string): FailureReport {
      return { failedNode: _nodeId, cascadeDepth: 0, affected: [] };
    },
  };
}
