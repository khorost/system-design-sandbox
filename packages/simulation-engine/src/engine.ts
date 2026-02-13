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
  updateProfile(profile: LoadProfile): void;
  stop(): void;
  tick(): SimulationMetrics;
  injectFailure(nodeId: string): FailureReport;
}

const TICK_DURATION_SEC = 0.1;

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

function isClientType(type: string): boolean {
  return CLIENT_TYPES.has(type);
}

let requestCounter = 0;

export function createSimulationEngine(
  components: Map<string, ComponentModel>,
  connections: ConnectionModel[]
): SimulationEngine {
  const adjacency = buildAdjacencyList(connections);
  const entryNodes = findEntryNodes(components, connections);

  // Build connection lookup: "from->to" → ConnectionModel
  const connectionMap = new Map<string, ConnectionModel>();
  for (const conn of connections) {
    connectionMap.set(`${conn.from}->${conn.to}`, conn);
  }

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

    updateProfile(loadProfile: LoadProfile) {
      profile = loadProfile;
      // Don't reset tickCount/activeRequests — seamless transition
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
          edgeThroughput: {}, edgeLatency: {},
        };
      }

      tickCount++;

      // Calculate load multiplier based on profile type
      const elapsed = tickCount * TICK_DURATION_SEC;
      let multiplier = 1;
      if (profile.type === 'ramp') {
        multiplier = Math.min(elapsed / Math.max(profile.durationSec, 1), 1);
      } else if (profile.type === 'spike') {
        const cycle = elapsed % 10;
        multiplier = cycle < 5 ? 1 : 3;
      }

      // 1. Generate requests per entry node based on each node's generatedRps
      for (const entryId of entryNodes) {
        const comp = components.get(entryId);
        if (!comp || comp.generatedRps <= 0) continue;

        const nodeRps = comp.generatedRps * multiplier;
        const lambda = nodeRps * TICK_DURATION_SEC;
        const newCount = poissonSample(lambda);

        for (let i = 0; i < newCount; i++) {
          const path = resolveRequestPath(adjacency, entryId);
          activeRequests.push({
            id: `req-${++requestCounter}`,
            path,
            currentStep: 0,
            totalLatencyMs: 0,
            failed: false,
          });
        }
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
      const edgeCounts: Record<string, number> = {};
      const edgeLatencySum: Record<string, number> = {};

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

        // Client nodes are traffic sources — skip capacity/latency checks
        if (!isClientType(comp.type)) {
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
        }

        // Advance to next step
        req.currentStep++;

        // Track edge transition: previous node → current node
        if (req.currentStep > 0 && req.currentStep <= req.path.length) {
          const prevNodeId = req.path[req.currentStep - 1];
          const nextNodeId = req.path[req.currentStep];
          if (prevNodeId && nextNodeId) {
            const edgeKey = `${prevNodeId}->${nextNodeId}`;
            edgeCounts[edgeKey] = (edgeCounts[edgeKey] || 0) + 1;

            // Add network latency from connection
            const conn = connectionMap.get(edgeKey);
            if (conn) {
              req.totalLatencyMs += conn.latencyMs;
              edgeLatencySum[edgeKey] = (edgeLatencySum[edgeKey] || 0) + conn.latencyMs;
            }
          }
        }

        if (req.currentStep >= req.path.length) {
          completed.push(req);
        }
      }

      // Remove completed from active
      const completedIds = new Set(completed.map((r) => r.id));
      activeRequests = activeRequests.filter((r) => !completedIds.has(r.id));

      // Compute edge metrics
      const edgeThroughput: Record<string, number> = {};
      const edgeLatency: Record<string, number> = {};
      for (const key of Object.keys(edgeCounts)) {
        edgeThroughput[key] = TICK_DURATION_SEC > 0 ? edgeCounts[key] / TICK_DURATION_SEC : 0;
        edgeLatency[key] = edgeCounts[key] > 0 ? edgeLatencySum[key] / edgeCounts[key] : 0;
      }

      return aggregateMetrics(completed, components, Date.now(), TICK_DURATION_SEC, edgeThroughput, edgeLatency);
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
