import { getDefinition } from '@system-design-sandbox/component-library';
import type { ComponentModel, ComponentType as EngineComponentType, ConnectionModel, TagWeight } from '@system-design-sandbox/simulation-engine';

import { CLIENT_TYPES } from '../constants/componentTypes.ts';
import type { ComponentEdge, ComponentNode, EdgeRoutingRule } from '../types/index.ts';
import { computeEffectiveLatency, CONTAINER_TYPES } from '../utils/networkLatency.ts';

const DEFAULT_MAX_CONNECTIONS: Record<string, number> = {
  postgresql: 100, mysql: 150, mongodb: 500, cassandra: 256,
  elasticsearch: 500, clickhouse: 200,
  redis: 10000, memcached: 10000,
  service: 1000, api_gateway: 10000, load_balancer: 10000,
  cdn: 50000, dns: 50000,
  kafka: 5000, rabbitmq: 2000, sqs: 10000, nats: 50000,
  s3: 50000, nfs: 500, local_ssd: 1000, nvme: 10000, network_disk: 1000,
  web_client: Infinity, mobile_client: Infinity, external_api: Infinity,
};

export function convertNodesToComponents(nodes: ComponentNode[]): Map<string, ComponentModel> {
  const components = new Map<string, ComponentModel>();

  for (const node of nodes) {
    const compType = node.data.componentType as EngineComponentType;
    // Skip container nodes — they don't participate in simulation as components
    if (CONTAINER_TYPES.has(node.data.componentType)) continue;
    const def = getDefinition(compType);
    const config = node.data.config;

    const replicas = (config.replicas as number) || (config.brokers as number) || (config.nodes as number) || def?.defaults?.replicas || 1;
    const maxRpsPerInstance = (config.max_rps_per_broker as number) || (config.max_rps_per_node as number) || (config.max_rps_per_instance as number) || (config.max_rps as number) || def?.defaults?.maxRps || 1000;
    const maxRps = maxRpsPerInstance * replicas;
    // For service containers, derive baseLatencyMs from pipeline steps
    let baseLatencyMs: number;
    const engineDbPools: Array<{
      id: string;
      poolSize: number;
      queryDelay: number;
      callsPerRequest: number;
      parallel: boolean;
    }> = [];
    let engineConsumerConfig: { concurrency: number; processingDelayMs: number } | undefined;
    let engineAsyncDispatch: { returnDelayMs: number } | undefined;
    if (Array.isArray(config.pipelines)) {
      // Type-assert to ServiceContainerConfig-like structure for computation
      interface SvcPipelineStep {
        processingDelay?: number;
        calls?: Array<{
          kind: string;
          resourceId?: string;
          count?: number;
          parallel?: boolean;
          payloadSize?: number;
        }>;
        response?: { kind: string; returnDelay?: number };
      }
      interface SvcPipeline {
        trigger: { kind: string; concurrency?: number };
        steps: SvcPipelineStep[];
      }
      interface SvcConfig {
        pipelines: SvcPipeline[];
        dbPools?: Array<{ id: string; poolSize: number; queryDelay: number }>;
        persistentConns?: Array<{ id: string; cmdDelay: number }>;
        producers?: Array<{ id: string; acks: string }>;
        onDemandConns?: Array<{ id: string; setupDelay: number; keepAlive: boolean; requestDelay: number }>;
      }

      const svc = config as unknown as SvcConfig;
      const pipelines = svc.pipelines;

      // Build resource lookup maps
      const dbPoolMap = new Map((svc.dbPools ?? []).map(p => [p.id, p]));
      const persistentMap = new Map((svc.persistentConns ?? []).map(p => [p.id, p]));
      const producerMap = new Map((svc.producers ?? []).map(p => [p.id, p]));
      const onDemandMap = new Map((svc.onDemandConns ?? []).map(p => [p.id, p]));

      // Compute effective latency per pipeline (sum over steps, max or sum over calls per step)
      // approximating RPS at 50% load for utilization estimate
      const pipelineLatencies = pipelines.map(pipeline => {
        let pipelineLatency = 0;
        for (const step of pipeline.steps) {
          let stepLatency = step.processingDelay ?? 0.2;
          const calls = step.calls ?? [];

          const callDelays = calls.map(call => {
            if (call.kind === 'db' && call.resourceId) {
              const pool = dbPoolMap.get(call.resourceId);
              if (pool) {
                const count = call.count ?? 1;
                // Approximate util: assume service runs at 50% load for latency estimate
                const approxUtil = Math.min(0.8, (maxRps * 0.5 * (pool.queryDelay / 1000)) / pool.poolSize);
                const queueDelay = approxUtil < 1
                  ? pool.queryDelay * (approxUtil / (1 - approxUtil))
                  : pool.queryDelay * 10;
                const perQuery = pool.queryDelay + queueDelay;
                return call.parallel ? perQuery : perQuery * count;
              }
            }
            if (call.kind === 'persistent' && call.resourceId) {
              const conn = persistentMap.get(call.resourceId);
              if (conn) return conn.cmdDelay * (call.count ?? 1);
            }
            if (call.kind === 'producer' && call.resourceId) {
              const producer = producerMap.get(call.resourceId);
              if (producer) {
                const ackLatency = producer.acks === 'none' ? 0.1 : producer.acks === 'all' ? 10 : 2;
                return ackLatency;
              }
            }
            if (call.kind === 'ondemand' && call.resourceId) {
              const conn = onDemandMap.get(call.resourceId);
              if (conn) return (conn.keepAlive ? 0 : conn.setupDelay) + conn.requestDelay;
            }
            return 0;
          });

          // Add call latencies to step latency (sequential calls sum up)
          stepLatency += callDelays.reduce((a, b) => a + b, 0);
          pipelineLatency += stepLatency;
        }
        return pipelineLatency;
      });

      baseLatencyMs = pipelineLatencies.length > 0
        ? pipelineLatencies.reduce((a, b) => a + b, 0) / pipelineLatencies.length
        : (def?.defaults?.baseLatencyMs ?? 10);

      // Build serviceDbPools for real-time M/M/c contention

      // Aggregate DB calls across all pipelines for each pool
      const dbCallSums = new Map<string, { count: number; parallel: boolean }>();
      for (const pipeline of svc.pipelines) {
        for (const step of pipeline.steps) {
          for (const call of (step.calls ?? [])) {
            if (call.kind === 'db' && call.resourceId) {
              const existing = dbCallSums.get(call.resourceId) ?? { count: 0, parallel: false };
              dbCallSums.set(call.resourceId, {
                count: existing.count + (call.count ?? 1),
                parallel: call.parallel ?? false,
              });
            }
          }
        }
      }

      for (const pool of (svc.dbPools ?? [])) {
        const callInfo = dbCallSums.get(pool.id);
        if (callInfo && callInfo.count > 0) {
          engineDbPools.push({
            id: pool.id,
            poolSize: pool.poolSize,
            queryDelay: pool.queryDelay,
            callsPerRequest: callInfo.count,
            parallel: callInfo.parallel,
          });
        }
      }

      // Consumer config: aggregate from consumer-triggered pipelines
      const consumerPipelines = svc.pipelines.filter(p => p.trigger.kind === 'consumer');
      if (consumerPipelines.length > 0) {
        const totalConcurrency = consumerPipelines.reduce((sum, p) => {
          const t = p.trigger as { kind: 'consumer'; concurrency?: number };
          return sum + (t.concurrency ?? 1);
        }, 0);
        const allSteps = consumerPipelines.flatMap(p => p.steps);
        const avgStepDelay = allSteps.reduce((a, s) => a + (s.processingDelay ?? 0.2), 0) / Math.max(allSteps.length, 1);
        engineConsumerConfig = {
          concurrency: totalConcurrency,
          processingDelayMs: avgStepDelay,
        };
      }

      // Async dispatch config
      const asyncPipelines = svc.pipelines.filter(p =>
        p.steps.some(s => s.response?.kind === 'async')
      );
      if (asyncPipelines.length > 0) {
        const firstAsyncStep = asyncPipelines[0].steps.find(s => s.response?.kind === 'async');
        const resp = firstAsyncStep?.response as { kind: 'async'; returnDelay: number } | undefined;
        engineAsyncDispatch = { returnDelayMs: resp?.returnDelay ?? 0.05 };
      }
    } else {
      baseLatencyMs = (config.base_latency_ms as number) || def?.defaults?.baseLatencyMs || 10;
    }

    // Client nodes: compute RPS from concurrent_users_k * 1000 * requests_per_user
    // Backward compat: if requests_per_sec exists but concurrent_users_k doesn't, use old value
    let generatedRps = 0;
    if (CLIENT_TYPES.has(compType)) {
      if (config.concurrent_users_k != null) {
        const usersK = config.concurrent_users_k as number;
        const rpu = (config.requests_per_user as number) ??
          (def?.params?.find(p => p.key === 'requests_per_user')?.default as number ?? 0.1);
        generatedRps = usersK * 1000 * rpu;
      } else if (config.requests_per_sec != null) {
        generatedRps = config.requests_per_sec as number;
      } else {
        const defUsersK = (def?.params?.find(p => p.key === 'concurrent_users_k')?.default as number) ?? 1;
        const defRpu = (def?.params?.find(p => p.key === 'requests_per_user')?.default as number) ?? 0.1;
        generatedRps = defUsersK * 1000 * defRpu;
      }
    }

    const tagDist = config.tagDistribution as TagWeight[] | undefined;
    const defTagDist = def?.defaultConfig?.tagDistribution as TagWeight[] | undefined;
    const cacheRules = (config.cacheRules ?? def?.defaultConfig?.cacheRules) as Array<{ tag: string }> | undefined;
    const responseRules = (config.responseRules ?? def?.defaultConfig?.responseRules) as Array<{ tag: string; responseSizeKb: number }> | undefined;

    // Determine supported tags: explicit tags from tagDistribution, cacheRules or responseRules, or undefined (wildcard)
    let supportedTags: string[] | undefined;
    if (cacheRules && cacheRules.length > 0) {
      supportedTags = cacheRules.map(r => r.tag);
    } else if (responseRules && responseRules.length > 0) {
      supportedTags = responseRules.map(r => r.tag);
    } else {
      const effectiveTagDist = tagDist?.length ? tagDist : defTagDist;
      if (effectiveTagDist && effectiveTagDist.length > 0) {
        supportedTags = effectiveTagDist.map(t => t.tag);
      }
    }

    const maxConnectionsPerInstance = (config.max_connections as number) || DEFAULT_MAX_CONNECTIONS[compType] || 1000;
    const maxConnections = maxConnectionsPerInstance * replicas;
    components.set(node.id, {
      id: node.id,
      type: compType,
      maxRps,
      currentLoad: 0,
      maxConnections,
      concurrentConnections: 0,
      generatedRps,
      baseLatencyMs,
      loadLatencyFactor: 0.001,
      failureRate: 0,
      isAlive: true,
      replicas,
      queueSize: 0,
      queueCapacity: 10000,
      processingRate: maxRps,
      payloadSizeKb: CLIENT_TYPES.has(compType) ? ((config.payload_size_kb as number) || 10) : 0,
      responseSizeKb: (config.response_size_kb as number) || (def?.defaultConfig?.response_size_kb as number) || 0,
      ...(tagDist?.length ? { tagDistribution: tagDist } : {}),
      ...(cacheRules?.length ? { cacheRules: cacheRules as Array<{ tag: string; hitRatio: number; capacityMb: number }> } : {}),
      ...(responseRules?.length ? { responseRules } : {}),
      ...(supportedTags ? { supportedTags } : {}),
      ...(compType === 'load_balancer' && config.algorithm ? { lbAlgorithm: config.algorithm as 'round_robin' | 'least_conn' | 'ip_hash' } : {}),
      ...(config.retry_enabled ? { retryEnabled: true, retryMax: (config.retry_max as number) || 2, retryBackoffMs: (config.retry_backoff_ms as number) || 100 } : {}),
      ...((config.blockedTags as string[] | undefined)?.length ? { blockedTags: config.blockedTags as string[] } : {}),
      ...(config.rate_limit_enabled && (config.rate_limit as number) > 0 ? { rateLimitRps: config.rate_limit as number } : {}),
      // SC rate limiter — uses rateLimitEnabled/rateLimitRps instead of rate_limit_enabled/rate_limit
      ...(config.rateLimitEnabled && (config.rateLimitRps as number) > 0 ? { rateLimitRps: (config.rateLimitRps as number) * replicas } : {}),
      ...(config.auth_enabled ? {
        authEnabled: true,
        authLatencyMs: (config.auth_latency_ms as number) || 5,
        authFailRate: ((config.auth_fail_rate as number) || 0) / 100,
      } : {}),
      ...(engineDbPools.length > 0 ? { serviceDbPools: engineDbPools } : {}),
      ...(engineConsumerConfig ? { consumerConfig: engineConsumerConfig } : {}),
      ...(engineAsyncDispatch ? { asyncDispatch: engineAsyncDispatch } : {}),
    });
  }

  return components;
}

export function convertEdgesToConnections(edges: ComponentEdge[], nodes?: ComponentNode[]): ConnectionModel[] {
  return edges
    .filter((e) => e.source && e.target)
    .map((e) => {
      const userLatency = e.data?.latencyMs ?? 1;
      const hasOverride = e.data?.latencyMs != null && e.data.latencyMs !== 1;
      const hierarchyLatency = nodes ? computeEffectiveLatency(e.source, e.target, nodes) : 0;
      const latencyMs = hasOverride ? userLatency : (hierarchyLatency > 0 ? hierarchyLatency : userLatency);
      const routingRules = e.data?.routingRules as EdgeRoutingRule[] | undefined;
      return {
        from: e.source,
        to: e.target,
        protocol: e.data?.protocol ?? 'REST',
        latencyMs: latencyMs || 1,
        bandwidthMbps: e.data?.bandwidthMbps ?? 1000,
        timeoutMs: e.data?.timeoutMs ?? 5000,
        ...(routingRules?.length ? { routingRules } : {}),
        ...(e.data?.circuitBreaker?.enabled ? { circuitBreaker: e.data.circuitBreaker as { enabled: boolean; errorThreshold: number; timeoutMs: number; halfOpenRequests: number } } : {}),
        ...(e.data?.retryPolicy?.enabled ? { retryPolicy: { maxRetries: e.data.retryPolicy.maxRetries ?? 2, backoffMs: e.data.retryPolicy.backoffMs ?? 100 } } : {}),
      };
    });
}

/** Maps engine edge keys ("source->target") back to React Flow edge IDs */
export function buildEdgeKeyToIdMap(edges: ComponentEdge[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of edges) {
    if (e.source && e.target) {
      map[`${e.source}->${e.target}`] = e.id;
    }
  }
  return map;
}
