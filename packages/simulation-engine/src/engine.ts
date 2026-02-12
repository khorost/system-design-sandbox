import type { ComponentModel, ConnectionModel, SimulationMetrics, LoadProfile, FailureReport, SimRequest } from './models.js';
import { buildAdjacencyList, findEntryNodes, resolveRequestPath } from './graph.js';
import { poissonSample } from './generator.js';
import { aggregateMetrics } from './metrics.js';

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

const TICK_DURATION_SEC = 0.1;

let requestCounter = 0;

export function createSimulationEngine(
  components: Map<string, ComponentModel>,
  connections: ConnectionModel[]
): SimulationEngine {
  const adjacency = buildAdjacencyList(connections);
  const entryNodes = findEntryNodes(components, connections);

  let activeRequests: SimRequest[] = [];
  let profile: LoadProfile | null = null;
  let tickCount = 0;

  function resetLoads() {
    for (const comp of components.values()) {
      comp.currentLoad = 0;
    }
  }

  return {
    start(loadProfile: LoadProfile) {
      profile = loadProfile;
      tickCount = 0;
      activeRequests = [];
      resetLoads();
      // Reset alive status
      for (const comp of components.values()) {
        comp.isAlive = true;
      }
    },

    stop() {
      profile = null;
      activeRequests = [];
      resetLoads();
    },

    tick(): SimulationMetrics {
      if (!profile) {
        return {
          timestamp: Date.now(),
          latencyP50: 0, latencyP95: 0, latencyP99: 0,
          throughput: 0, errorRate: 0,
          componentUtilization: {}, queueDepths: {},
        };
      }

      tickCount++;

      // Calculate current RPS based on load profile
      let currentRps = profile.rps;
      const elapsed = tickCount * TICK_DURATION_SEC;
      if (profile.type === 'ramp') {
        const progress = Math.min(elapsed / Math.max(profile.durationSec, 1), 1);
        currentRps = profile.rps * progress;
      } else if (profile.type === 'spike') {
        const cycle = elapsed % 10;
        currentRps = cycle < 5 ? profile.rps : profile.rps * 3;
      }

      // 1. Generate new requests (Poisson, lambda = rps * tickDuration)
      const lambda = currentRps * TICK_DURATION_SEC;
      const newCount = poissonSample(lambda);

      for (let i = 0; i < newCount; i++) {
        const entry = entryNodes[Math.floor(Math.random() * entryNodes.length)];
        const path = resolveRequestPath(adjacency, entry);
        activeRequests.push({
          id: `req-${++requestCounter}`,
          path,
          currentStep: 0,
          totalLatencyMs: 0,
          failed: false,
        });
      }

      // 2. Reset current loads for this tick
      resetLoads();

      // Count load per node from all active requests
      for (const req of activeRequests) {
        if (req.failed) continue;
        const nodeId = req.path[req.currentStep];
        if (!nodeId) continue;
        const comp = components.get(nodeId);
        if (comp) {
          comp.currentLoad += 1 / TICK_DURATION_SEC; // Convert per-tick count to RPS
        }
      }

      // 3. Process each active request: advance one hop
      const completed: SimRequest[] = [];

      for (const req of activeRequests) {
        if (req.failed) {
          completed.push(req);
          continue;
        }

        const nodeId = req.path[req.currentStep];
        if (!nodeId) {
          completed.push(req);
          continue;
        }

        const comp = components.get(nodeId);
        if (!comp) {
          req.failed = true;
          req.failureReason = `Node ${nodeId} not found`;
          completed.push(req);
          continue;
        }

        // Check if node is alive
        if (!comp.isAlive) {
          req.failed = true;
          req.failureReason = `Node ${nodeId} is down`;
          completed.push(req);
          continue;
        }

        // Check if overloaded
        if (comp.currentLoad > comp.maxRps) {
          // Probabilistic failure based on overload degree
          const overloadRatio = comp.currentLoad / comp.maxRps;
          if (Math.random() < (overloadRatio - 1) / overloadRatio) {
            req.failed = true;
            req.failureReason = `Node ${nodeId} overloaded`;
            completed.push(req);
            continue;
          }
        }

        // Calculate latency for this hop
        const hopLatency = calculateLatency(comp);
        if (hopLatency === Infinity) {
          req.failed = true;
          req.failureReason = `Node ${nodeId} at capacity`;
          completed.push(req);
          continue;
        }

        req.totalLatencyMs += hopLatency;

        // Advance to next step
        req.currentStep++;
        if (req.currentStep >= req.path.length) {
          completed.push(req);
        }
      }

      // Remove completed from active
      const completedIds = new Set(completed.map((r) => r.id));
      activeRequests = activeRequests.filter((r) => !completedIds.has(r.id));

      return aggregateMetrics(completed, components, Date.now(), TICK_DURATION_SEC);
    },

    injectFailure(nodeId: string): FailureReport {
      const comp = components.get(nodeId);
      if (comp) {
        comp.isAlive = false;
      }
      return propagateFailure(components, connections, nodeId);
    },
  };
}
