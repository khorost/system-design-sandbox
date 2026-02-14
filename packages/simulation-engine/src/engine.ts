import type { ComponentModel, ConnectionModel, SimulationMetrics, LoadProfile, FailureReport, SimRequest, EngineStats, TagTraffic, NodeTagTraffic, EdgeTagTraffic } from './models.js';
import { buildAdjacencyList, findEntryNodes, pickTag, resolveNextHops } from './graph.js';
import { poissonSample } from './generator.js';
import { aggregateMetrics } from './metrics.js';

const DEFAULT_RESPONSE_SIZE_KB: Record<string, number> = {
  service: 2, api_gateway: 1, cdn: 50,
  redis: 0.5, memcached: 0.5,
  postgresql: 4, mongodb: 4, cassandra: 4,
  elasticsearch: 8, s3: 100, nfs: 50,
  local_ssd: 20, nvme: 20, network_disk: 20,
};

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

const SPIKE_CYCLE_SEC = 10;
const SPIKE_NORMAL_PHASE_SEC = 5;
const SPIKE_MULTIPLIER = 3;
const DEFAULT_PAYLOAD_SIZE_KB = 10;
const DEFAULT_RESPONSE_FALLBACK_KB = 2;

const CLIENT_TYPES = new Set(['web_client', 'mobile_client', 'external_api']);

function isClientType(type: string): boolean {
  return CLIENT_TYPES.has(type);
}

let requestCounter = 0;

const MAX_ACTIVE = 100_000;

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

  // Set of load_balancer nodes for special routing
  const loadBalancerNodes = new Set<string>();
  for (const [id, comp] of components) {
    if (comp.type === 'load_balancer') loadBalancerNodes.add(id);
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
          nodeTagTraffic: {}, edgeTagTraffic: {},
        };
      }

      tickCount++;

      // Calculate load multiplier based on profile type
      const elapsed = tickCount * TICK_DURATION_SEC;
      let multiplier = 1;
      if (profile.type === 'ramp') {
        multiplier = Math.min(elapsed / Math.max(profile.durationSec, 1), 1);
      } else if (profile.type === 'spike') {
        const cycle = elapsed % SPIKE_CYCLE_SEC;
        multiplier = cycle < SPIKE_NORMAL_PHASE_SEC ? 1 : SPIKE_MULTIPLIER;
      }

      // 1. Generate requests per entry node based on each node's generatedRps
      let generated = 0;
      for (const entryId of entryNodes) {
        const comp = components.get(entryId);
        if (!comp || comp.generatedRps <= 0) continue;

        const nodeRps = comp.generatedRps * multiplier;
        const lambda = nodeRps * TICK_DURATION_SEC;
        const newCount = poissonSample(lambda);

        for (let i = 0; i < newCount; i++) {
          const tag = pickTag(comp.tagDistribution);
          activeRequests.push({
            id: `req-${++requestCounter}`,
            tag,
            currentNode: entryId,
            visited: [entryId],
            totalLatencyMs: 0,
            failed: false,
            payloadSizeKb: comp.payloadSizeKb || DEFAULT_PAYLOAD_SIZE_KB,
          });
        }
        generated += newCount;
      }

      // 2. Reset current loads for this tick
      resetLoads();

      // Count load per node from all active requests
      for (const req of activeRequests) {
        if (req.failed) continue;
        const comp = components.get(req.currentNode);
        if (comp) {
          comp.currentLoad += 1 / TICK_DURATION_SEC; // Convert per-tick count to RPS
        }
      }

      // 3. Process each active request: hop-by-hop with fan-out
      const nextActive: SimRequest[] = [];
      const completed: SimRequest[] = [];
      const edgeCounts: Record<string, number> = {};
      const edgeLatencySum: Record<string, number> = {};

      // Per-tag forward accumulators: nodeId/edgeKey → tag → count/bytes
      const fwdNodeInCount: Record<string, Record<string, number>> = {};
      const fwdNodeInBytes: Record<string, Record<string, number>> = {};
      const fwdNodeOutCount: Record<string, Record<string, number>> = {};
      const fwdNodeOutBytes: Record<string, Record<string, number>> = {};
      const fwdEdgeCount: Record<string, Record<string, number>> = {};
      const fwdEdgeBytes: Record<string, Record<string, number>> = {};

      for (const req of activeRequests) {
        if (req.failed) {
          completed.push(req);
          continue;
        }

        const comp = components.get(req.currentNode);
        if (!comp) {
          req.failed = true;
          req.failureReason = `Node ${req.currentNode} not found`;
          completed.push(req);
          continue;
        }

        // Check if node is alive
        if (!comp.isAlive) {
          req.failed = true;
          req.failureReason = `Node ${req.currentNode} is down`;
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
              req.failureReason = `Node ${req.currentNode} overloaded`;
              completed.push(req);
              continue;
            }
          }

          // Calculate latency for this hop
          const hopLatency = calculateLatency(comp);
          if (hopLatency === Infinity) {
            req.failed = true;
            req.failureReason = `Node ${req.currentNode} at capacity`;
            completed.push(req);
            continue;
          }

          req.totalLatencyMs += hopLatency;
        }

        // Resolve next hops with fan-out
        const hops = resolveNextHops(
          req.currentNode, req.tag, req.visited,
          adjacency, connectionMap, loadBalancerNodes,
        );

        if (hops.length === 0) {
          completed.push(req); // leaf node, done
          continue;
        }

        // Spawn requests for each hop
        for (const hop of hops) {
          const edgeKey = `${req.currentNode}->${hop.target}`;
          const conn = connectionMap.get(edgeKey);
          const edgeLat = conn?.latencyMs ?? 0;

          for (let i = 0; i < hop.count; i++) {
            edgeCounts[edgeKey] = (edgeCounts[edgeKey] || 0) + 1;
            edgeLatencySum[edgeKey] = (edgeLatencySum[edgeKey] || 0) + edgeLat;

            // Per-tag forward tracking
            const spawnedTag = hop.outTag ?? req.tag;
            const pKb = req.payloadSizeKb;
            // Node outgoing
            (fwdNodeOutCount[req.currentNode] ??= {})[spawnedTag] = ((fwdNodeOutCount[req.currentNode])?.[spawnedTag] ?? 0) + 1;
            (fwdNodeOutBytes[req.currentNode] ??= {})[spawnedTag] = ((fwdNodeOutBytes[req.currentNode])?.[spawnedTag] ?? 0) + pKb;
            // Node incoming
            (fwdNodeInCount[hop.target] ??= {})[spawnedTag] = ((fwdNodeInCount[hop.target])?.[spawnedTag] ?? 0) + 1;
            (fwdNodeInBytes[hop.target] ??= {})[spawnedTag] = ((fwdNodeInBytes[hop.target])?.[spawnedTag] ?? 0) + pKb;
            // Edge forward
            (fwdEdgeCount[edgeKey] ??= {})[spawnedTag] = ((fwdEdgeCount[edgeKey])?.[spawnedTag] ?? 0) + 1;
            (fwdEdgeBytes[edgeKey] ??= {})[spawnedTag] = ((fwdEdgeBytes[edgeKey])?.[spawnedTag] ?? 0) + pKb;

            nextActive.push({
              id: `req-${++requestCounter}`,
              tag: spawnedTag,
              currentNode: hop.target,
              visited: [...req.visited, hop.target],
              totalLatencyMs: req.totalLatencyMs + edgeLat,
              failed: false,
              payloadSizeKb: pKb,
            });
          }
        }
        // Original request consumed (not in completed — it branched)
      }

      // Safety: cap active requests to prevent exponential blowup
      activeRequests = nextActive.length <= MAX_ACTIVE
        ? nextActive
        : nextActive.slice(0, MAX_ACTIVE);

      // Compute edge metrics
      const edgeThroughput: Record<string, number> = {};
      const edgeLatency: Record<string, number> = {};
      for (const key of Object.keys(edgeCounts)) {
        edgeThroughput[key] = TICK_DURATION_SEC > 0 ? edgeCounts[key] / TICK_DURATION_SEC : 0;
        edgeLatency[key] = edgeCounts[key] > 0 ? edgeLatencySum[key] / edgeCounts[key] : 0;
      }

      // Response traffic: reverse-traverse completed (successful) requests
      const respNodeInCount: Record<string, Record<string, number>> = {};
      const respNodeInBytes: Record<string, Record<string, number>> = {};
      const respNodeOutCount: Record<string, Record<string, number>> = {};
      const respNodeOutBytes: Record<string, Record<string, number>> = {};
      const respEdgeCount: Record<string, Record<string, number>> = {};
      const respEdgeBytes: Record<string, Record<string, number>> = {};

      for (const req of completed) {
        if (req.failed) continue;
        const visited = req.visited;
        if (visited.length < 2) continue;
        const leafComp = components.get(visited[visited.length - 1]);
        const respKb = leafComp?.responseSizeKb
          || DEFAULT_RESPONSE_SIZE_KB[leafComp?.type ?? '']
          || DEFAULT_RESPONSE_FALLBACK_KB;
        const tag = req.tag;

        for (let i = visited.length - 1; i > 0; i--) {
          const from = visited[i - 1];
          const to = visited[i];
          const ek = `${from}->${to}`; // use forward edge key
          // Response edge
          (respEdgeCount[ek] ??= {})[tag] = ((respEdgeCount[ek])?.[tag] ?? 0) + 1;
          (respEdgeBytes[ek] ??= {})[tag] = ((respEdgeBytes[ek])?.[tag] ?? 0) + respKb;
          // Response: outgoing from `to`, incoming to `from`
          (respNodeOutCount[to] ??= {})[tag] = ((respNodeOutCount[to])?.[tag] ?? 0) + 1;
          (respNodeOutBytes[to] ??= {})[tag] = ((respNodeOutBytes[to])?.[tag] ?? 0) + respKb;
          (respNodeInCount[from] ??= {})[tag] = ((respNodeInCount[from])?.[tag] ?? 0) + 1;
          (respNodeInBytes[from] ??= {})[tag] = ((respNodeInBytes[from])?.[tag] ?? 0) + respKb;
        }
      }

      // Build per-tag traffic maps
      function buildTagMap(counts: Record<string, number> | undefined, bytes: Record<string, number> | undefined): Record<string, TagTraffic> {
        const result: Record<string, TagTraffic> = {};
        if (!counts) return result;
        for (const tag of Object.keys(counts)) {
          result[tag] = {
            rps: TICK_DURATION_SEC > 0 ? counts[tag] / TICK_DURATION_SEC : 0,
            bytesPerSec: TICK_DURATION_SEC > 0 ? (bytes?.[tag] ?? 0) / TICK_DURATION_SEC : 0,
          };
        }
        return result;
      }

      // Assemble nodeTagTraffic
      const allNodeIds = new Set([
        ...Object.keys(fwdNodeInCount), ...Object.keys(fwdNodeOutCount),
        ...Object.keys(respNodeInCount), ...Object.keys(respNodeOutCount),
      ]);
      const nodeTagTraffic: Record<string, NodeTagTraffic> = {};
      for (const nid of allNodeIds) {
        nodeTagTraffic[nid] = {
          incoming: buildTagMap(fwdNodeInCount[nid], fwdNodeInBytes[nid]),
          outgoing: buildTagMap(fwdNodeOutCount[nid], fwdNodeOutBytes[nid]),
          responseIncoming: buildTagMap(respNodeInCount[nid], respNodeInBytes[nid]),
          responseOutgoing: buildTagMap(respNodeOutCount[nid], respNodeOutBytes[nid]),
        };
      }

      // Assemble edgeTagTraffic
      const allEdgeKeys = new Set([
        ...Object.keys(fwdEdgeCount), ...Object.keys(respEdgeCount),
      ]);
      const edgeTagTraffic: Record<string, EdgeTagTraffic> = {};
      for (const ek of allEdgeKeys) {
        edgeTagTraffic[ek] = {
          forward: buildTagMap(fwdEdgeCount[ek], fwdEdgeBytes[ek]),
          response: buildTagMap(respEdgeCount[ek], respEdgeBytes[ek]),
        };
      }

      const engineStats: EngineStats = {
        tickCount,
        activeRequests: activeRequests.length,
        requestsGenerated: generated,
        requestsCompleted: completed.length,
        tickDurationMs: 0, // measured by worker wrapper
      };

      const result = aggregateMetrics(completed, components, Date.now(), TICK_DURATION_SEC, edgeThroughput, edgeLatency);
      result.engineStats = engineStats;
      result.nodeTagTraffic = nodeTagTraffic;
      result.edgeTagTraffic = edgeTagTraffic;
      return result;
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
