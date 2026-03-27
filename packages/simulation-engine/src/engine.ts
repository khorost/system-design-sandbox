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

/** Transmission delay (ms) for payload over a link: KB→Kbit / Mbps = ms */
function transmissionDelayMs(payloadKb: number, bandwidthMbps: number): number {
  if (bandwidthMbps <= 0) return 0;
  return (payloadKb * 8) / bandwidthMbps;
}

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

  // Circuit breaker state machine per connection
  interface CBState {
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failCount: number;
    successCount: number;
    totalCount: number;
    openedAtTick: number;
    halfOpenPassed: number;
  }
  const cbStates = new Map<string, CBState>();
  for (const conn of connections) {
    if (conn.circuitBreaker?.enabled) {
      cbStates.set(`${conn.from}->${conn.to}`, {
        state: 'CLOSED', failCount: 0, successCount: 0, totalCount: 0,
        openedAtTick: 0, halfOpenPassed: 0,
      });
    }
  }

  let activeRequests: SimRequest[] = [];
  let profile: LoadProfile | null = null;
  let tickCount = 0;

  function resetLoads() {
    for (const comp of components.values()) {
      comp.currentLoad = 0;
      comp.concurrentConnections = 0;
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
          totalInboundKBps: 0, totalOutboundKBps: 0,
          componentUtilization: {}, connectionUtilization: {}, queueDepths: {},
          edgeThroughput: {}, edgeLatency: {},
          nodeTagTraffic: {}, edgeTagTraffic: {}, nodeCacheStats: {},
          circuitBreakerStates: {},
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
          // Use per-tag requestSizeKb if available, else fall back to component-level payload
          const tagEntry = comp.tagDistribution?.find(t => t.tag === tag);
          const pKb = tagEntry?.requestSizeKb ?? (comp.payloadSizeKb || DEFAULT_PAYLOAD_SIZE_KB);
          activeRequests.push({
            id: `req-${++requestCounter}`,
            tag,
            currentNode: entryId,
            visited: [entryId],
            totalLatencyMs: 0,
            failed: false,
            payloadSizeKb: pKb,
          });
        }
        generated += newCount;
      }

      // 2. Reset current loads for this tick
      resetLoads();

      // Count load and concurrent connections per node from all active requests
      for (const req of activeRequests) {
        if (req.failed) continue;
        const comp = components.get(req.currentNode);
        if (comp) {
          comp.currentLoad += 1 / TICK_DURATION_SEC; // Convert per-tick count to RPS
          comp.concurrentConnections += 1; // Each active request = 1 connection
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
      // Per-tag failed request counts (propagated along full path)
      const failedNodeInCount: Record<string, Record<string, number>> = {};
      const failedNodeOutCount: Record<string, Record<string, number>> = {};
      const failedEdgeCount: Record<string, Record<string, number>> = {};
      // CDN cache hit/miss accumulators: nodeId → tag → { hits, misses }
      const cacheHits: Record<string, Record<string, number>> = {};
      const cacheMisses: Record<string, Record<string, number>> = {};

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
          // Rate limit check — hard threshold (immediate 429), before capacity check
          if (comp.rateLimitRps && comp.rateLimitRps > 0 && comp.currentLoad > comp.rateLimitRps) {
            req.failed = true;
            req.failureReason = `Rate limited (429)`;
            completed.push(req);
            continue;
          }

          // Auth overhead (API Gateway)
          if (comp.authEnabled) {
            req.totalLatencyMs += comp.authLatencyMs ?? 5;
            if (comp.authFailRate && comp.authFailRate > 0 && Math.random() < comp.authFailRate) {
              req.failed = true;
              req.failureReason = `Auth failed (401)`;
              completed.push(req);
              continue;
            }
          }

          // Check connection pool exhaustion
          if (comp.concurrentConnections > comp.maxConnections) {
            req.failed = true;
            req.failureReason = `Node ${req.currentNode} connections exhausted (${comp.concurrentConnections}/${comp.maxConnections})`;
            completed.push(req);
            continue;
          }

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

        // CDN cache logic: needs origin (outgoing hops) to function
        const currentComp = components.get(req.currentNode);

        // Resolve next hops first — needed to check if origin exists
        const hops = resolveNextHops(
          req.currentNode, req.tag, req.visited,
          adjacency, connectionMap, loadBalancerNodes, components,
        );

        if (currentComp?.cacheRules) {
          const cacheRule = currentComp.cacheRules.find(r => r.tag === req.tag);
          if (cacheRule) {
            // CDN without origin can't serve anything — cache can never be populated
            if (hops.length === 0) {
              req.failed = true;
              req.failureReason = `CDN ${req.currentNode}: no origin for tag '${req.tag}'`;
              (cacheMisses[req.currentNode] ??= {})[req.tag] = ((cacheMisses[req.currentNode])?.[req.tag] ?? 0) + 1;
              completed.push(req);
              continue;
            }

            if (Math.random() < cacheRule.hitRatio) {
              // Cache hit — respond immediately without going to origin
              (cacheHits[req.currentNode] ??= {})[req.tag] = ((cacheHits[req.currentNode])?.[req.tag] ?? 0) + 1;
              completed.push(req);
              continue;
            } else {
              // Cache miss — forward to origin
              (cacheMisses[req.currentNode] ??= {})[req.tag] = ((cacheMisses[req.currentNode])?.[req.tag] ?? 0) + 1;
            }
          }
        }

        if (hops.length === 0) {
          completed.push(req); // leaf node, done
          continue;
        }

        // Spawn requests for each hop
        for (const hop of hops) {
          const edgeKey = `${req.currentNode}->${hop.target}`;
          const conn = connectionMap.get(edgeKey);
          const edgeLat = conn?.latencyMs ?? 0;

          // Circuit breaker check
          const cbState = cbStates.get(edgeKey);
          if (cbState) {
            const cbConfig = conn?.circuitBreaker;
            if (cbConfig) {
              const tickTimeSec = tickCount * TICK_DURATION_SEC;
              const openDurationSec = (tickTimeSec - cbState.openedAtTick * TICK_DURATION_SEC);

              if (cbState.state === 'OPEN') {
                if (openDurationSec * 1000 >= cbConfig.timeoutMs) {
                  cbState.state = 'HALF_OPEN';
                  cbState.halfOpenPassed = 0;
                  cbState.successCount = 0;
                  cbState.failCount = 0;
                } else {
                  // Block all requests
                  req.failed = true;
                  req.failureReason = `Circuit breaker OPEN on ${edgeKey}`;
                  completed.push(req);
                  continue;
                }
              }

              if (cbState.state === 'HALF_OPEN') {
                if (cbState.halfOpenPassed >= cbConfig.halfOpenRequests) {
                  // All probe requests sent, check results
                  if (cbState.failCount > 0) {
                    cbState.state = 'OPEN';
                    cbState.openedAtTick = tickCount;
                    req.failed = true;
                    req.failureReason = `Circuit breaker re-OPENED on ${edgeKey}`;
                    completed.push(req);
                    continue;
                  } else {
                    cbState.state = 'CLOSED';
                    cbState.totalCount = 0;
                    cbState.failCount = 0;
                    cbState.successCount = 0;
                  }
                } else {
                  cbState.halfOpenPassed++;
                }
              }
            }
          }

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

            // Retry policy: connection-level takes priority, then source node-level (LB)
            const connRetry = conn?.retryPolicy;
            const srcComp = components.get(req.currentNode);
            const hasRetry = connRetry
              ? { retriesLeft: connRetry.maxRetries, retryFromNode: req.currentNode, retryBackoffMs: connRetry.backoffMs }
              : srcComp?.retryEnabled
                ? { retriesLeft: srcComp.retryMax ?? 2, retryFromNode: req.currentNode, retryBackoffMs: srcComp.retryBackoffMs ?? 100 }
                : null;
            nextActive.push({
              id: `req-${++requestCounter}`,
              tag: spawnedTag,
              currentNode: hop.target,
              visited: [...req.visited, hop.target],
              totalLatencyMs: req.totalLatencyMs + edgeLat + transmissionDelayMs(pKb, conn?.bandwidthMbps ?? 1000),
              failed: false,
              payloadSizeKb: pKb,
              ...(hasRetry ?? {}),
            });
          }
        }
        // Original request consumed (not in completed — it branched)
      }

      // Retry logic: re-enqueue failed requests that have retries left
      const retried: SimRequest[] = [];
      const finalCompleted: SimRequest[] = [];
      for (const req of completed) {
        if (req.failed && req.retriesLeft && req.retriesLeft > 0 && req.retryFromNode) {
          // Re-enqueue from the source node with decremented retry count
          retried.push(req);
          nextActive.push({
            id: `req-${++requestCounter}`,
            tag: req.tag,
            currentNode: req.retryFromNode,
            visited: req.visited.slice(0, req.visited.indexOf(req.retryFromNode) + 1),
            totalLatencyMs: req.totalLatencyMs + (req.retryBackoffMs ?? 100),
            failed: false,
            payloadSizeKb: req.payloadSizeKb,
            retriesLeft: req.retriesLeft - 1,
            retryFromNode: req.retryFromNode,
            retryBackoffMs: req.retryBackoffMs,
          });
        } else {
          finalCompleted.push(req);
        }
      }
      completed.length = 0;
      completed.push(...finalCompleted);
      // Track retry count for metrics
      const totalRetries = retried.length;

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

      const ERROR_RESPONSE_KB = 0.5; // HTTP error body (~500 bytes)

      for (const req of completed) {
        const visited = req.visited;
        if (visited.length < 2) continue;
        const leafComp = components.get(visited[visited.length - 1]);
        const tag = req.tag;

        // Failed requests still send error response (502/504 etc.) back to client
        let respKb: number;
        if (req.failed) {
          respKb = ERROR_RESPONSE_KB;
        } else {
          // Per-tag responseSizeKb takes priority, then component-level, then type default
          const respRule = leafComp?.responseRules?.find(r => r.tag === tag);
          const tagRespEntry = leafComp?.tagDistribution?.find(t => t.tag === tag);
          respKb = respRule?.responseSizeKb
            ?? tagRespEntry?.responseSizeKb
            ?? (leafComp?.responseSizeKb
            || DEFAULT_RESPONSE_SIZE_KB[leafComp?.type ?? '']
            || DEFAULT_RESPONSE_FALLBACK_KB);
        }

        // Response latency: traverse reverse path
        let responseLat = 0;
        for (let i = visited.length - 1; i > 0; i--) {
          const from = visited[i - 1];
          const to = visited[i];
          const ek = `${from}->${to}`; // use forward edge key
          const conn = connectionMap.get(ek);
          // Edge latency + transmission delay for response payload
          responseLat += (conn?.latencyMs ?? 0) + transmissionDelayMs(respKb, conn?.bandwidthMbps ?? 1000);
          // Intermediate node base latency (not leaf, not origin)
          if (i > 1) {
            const intermediary = components.get(from);
            if (intermediary && !CLIENT_TYPES.has(intermediary.type)) {
              responseLat += intermediary.baseLatencyMs;
            }
          }
          // Response byte tracking
          (respEdgeCount[ek] ??= {})[tag] = ((respEdgeCount[ek])?.[tag] ?? 0) + 1;
          (respEdgeBytes[ek] ??= {})[tag] = ((respEdgeBytes[ek])?.[tag] ?? 0) + respKb;
          (respNodeOutCount[to] ??= {})[tag] = ((respNodeOutCount[to])?.[tag] ?? 0) + 1;
          (respNodeOutBytes[to] ??= {})[tag] = ((respNodeOutBytes[to])?.[tag] ?? 0) + respKb;
          (respNodeInCount[from] ??= {})[tag] = ((respNodeInCount[from])?.[tag] ?? 0) + 1;
          (respNodeInBytes[from] ??= {})[tag] = ((respNodeInBytes[from])?.[tag] ?? 0) + respKb;
        }
        req.totalLatencyMs += responseLat;

        // Update circuit breaker states based on request outcome
        for (let i = 0; i < visited.length - 1; i++) {
          const ek = `${visited[i]}->${visited[i + 1]}`;
          const cb = cbStates.get(ek);
          if (cb && cb.state !== 'OPEN') {
            cb.totalCount++;
            if (req.failed) {
              cb.failCount++;
            } else {
              cb.successCount++;
            }
            // Check threshold in CLOSED state
            if (cb.state === 'CLOSED' && cb.totalCount >= 10) {
              const errRate = cb.failCount / cb.totalCount;
              const threshold = (connectionMap.get(ek)?.circuitBreaker?.errorThreshold ?? 50) / 100;
              if (errRate >= threshold) {
                cb.state = 'OPEN';
                cb.openedAtTick = tickCount;
              }
            }
          }
        }

        // Propagate failed status along the entire path (forward + response)
        if (req.failed) {
          for (const nid of visited) {
            (failedNodeInCount[nid] ??= {})[tag] = ((failedNodeInCount[nid])?.[tag] ?? 0) + 1;
            (failedNodeOutCount[nid] ??= {})[tag] = ((failedNodeOutCount[nid])?.[tag] ?? 0) + 1;
          }
          for (let i = 0; i < visited.length - 1; i++) {
            const ek = `${visited[i]}->${visited[i + 1]}`;
            (failedEdgeCount[ek] ??= {})[tag] = ((failedEdgeCount[ek])?.[tag] ?? 0) + 1;
          }
        }
      }

      // Build per-tag traffic maps
      function buildTagMap(
        counts: Record<string, number> | undefined,
        bytes: Record<string, number> | undefined,
        failed?: Record<string, number>,
      ): Record<string, TagTraffic> {
        const result: Record<string, TagTraffic> = {};
        if (!counts) return result;
        for (const tag of Object.keys(counts)) {
          result[tag] = {
            rps: TICK_DURATION_SEC > 0 ? counts[tag] / TICK_DURATION_SEC : 0,
            bytesPerSec: TICK_DURATION_SEC > 0 ? (bytes?.[tag] ?? 0) / TICK_DURATION_SEC : 0,
            failedRps: TICK_DURATION_SEC > 0 ? (failed?.[tag] ?? 0) / TICK_DURATION_SEC : 0,
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
          incoming: buildTagMap(fwdNodeInCount[nid], fwdNodeInBytes[nid], failedNodeInCount[nid]),
          outgoing: buildTagMap(fwdNodeOutCount[nid], fwdNodeOutBytes[nid], failedNodeOutCount[nid]),
          responseIncoming: buildTagMap(respNodeInCount[nid], respNodeInBytes[nid], failedNodeInCount[nid]),
          responseOutgoing: buildTagMap(respNodeOutCount[nid], respNodeOutBytes[nid], failedNodeOutCount[nid]),
        };
      }

      // Assemble edgeTagTraffic
      const allEdgeKeys = new Set([
        ...Object.keys(fwdEdgeCount), ...Object.keys(respEdgeCount),
      ]);
      const edgeTagTraffic: Record<string, EdgeTagTraffic> = {};
      for (const ek of allEdgeKeys) {
        edgeTagTraffic[ek] = {
          forward: buildTagMap(fwdEdgeCount[ek], fwdEdgeBytes[ek], failedEdgeCount[ek]),
          response: buildTagMap(respEdgeCount[ek], respEdgeBytes[ek], failedEdgeCount[ek]),
        };
      }

      const engineStats: EngineStats = {
        tickCount,
        activeRequests: activeRequests.length,
        requestsGenerated: generated,
        requestsCompleted: completed.length,
        tickDurationMs: 0, // measured by worker wrapper
        retriesThisTick: totalRetries,
      };

      const result = aggregateMetrics(completed, components, Date.now(), TICK_DURATION_SEC, edgeThroughput, edgeLatency);
      result.engineStats = engineStats;
      result.nodeTagTraffic = nodeTagTraffic;
      result.edgeTagTraffic = edgeTagTraffic;

      // Compute total inbound/outbound bandwidth across all nodes
      let totalIn = 0;
      let totalOut = 0;
      for (const ntt of Object.values(nodeTagTraffic)) {
        for (const t of Object.values(ntt.incoming)) totalIn += t.bytesPerSec;
        for (const t of Object.values(ntt.responseIncoming)) totalIn += t.bytesPerSec;
        for (const t of Object.values(ntt.outgoing)) totalOut += t.bytesPerSec;
        for (const t of Object.values(ntt.responseOutgoing)) totalOut += t.bytesPerSec;
      }
      result.totalInboundKBps = totalIn;
      result.totalOutboundKBps = totalOut;

      // CDN cache stats
      const nodeCacheStats: Record<string, Record<string, import('./models.js').CacheTagStats>> = {};
      const allCacheNodes = new Set([...Object.keys(cacheHits), ...Object.keys(cacheMisses)]);
      for (const nid of allCacheNodes) {
        const comp = components.get(nid);
        const allTags = new Set([...Object.keys(cacheHits[nid] ?? {}), ...Object.keys(cacheMisses[nid] ?? {})]);
        const tagStats: Record<string, import('./models.js').CacheTagStats> = {};
        for (const tag of allTags) {
          const hits = (cacheHits[nid]?.[tag] ?? 0);
          const misses = (cacheMisses[nid]?.[tag] ?? 0);
          const total = hits + misses;
          const rule = comp?.cacheRules?.find(r => r.tag === tag);
          // Estimate fill: cumulative misses * avg response size / capacity
          // Simplified: use miss rate * throughput as fill indicator
          const capacityMb = rule?.capacityMb ?? 1024;
          const missRateKBps = TICK_DURATION_SEC > 0 ? (misses * (DEFAULT_RESPONSE_SIZE_KB[comp?.type ?? ''] ?? 10)) / TICK_DURATION_SEC : 0;
          const fillMb = Math.min(capacityMb, missRateKBps * TICK_DURATION_SEC / 1024);
          tagStats[tag] = {
            hits: TICK_DURATION_SEC > 0 ? hits / TICK_DURATION_SEC : 0,
            misses: TICK_DURATION_SEC > 0 ? misses / TICK_DURATION_SEC : 0,
            hitRate: total > 0 ? hits / total : 0,
            fillMb,
          };
        }
        nodeCacheStats[nid] = tagStats;
      }
      result.nodeCacheStats = nodeCacheStats;

      // Circuit breaker states
      const circuitBreakerStates: Record<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'> = {};
      for (const [key, cb] of cbStates) {
        circuitBreakerStates[key] = cb.state;
      }
      result.circuitBreakerStates = circuitBreakerStates;

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
