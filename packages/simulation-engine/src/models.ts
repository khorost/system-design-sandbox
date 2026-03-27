export type ComponentType =
  | 'web_client'
  | 'mobile_client'
  | 'external_api'
  | 'external_service'
  | 'api_gateway'
  | 'load_balancer'
  | 'cdn'
  | 'dns'
  | 'waf'
  | 'service'
  | 'serverless_function'
  | 'worker'
  | 'cron_job'
  | 'postgresql'
  | 'mongodb'
  | 'cassandra'
  | 'mysql'
  | 'clickhouse'
  | 'redis'
  | 'memcached'
  | 's3'
  | 'nfs'
  | 'etcd'
  | 'elasticsearch'
  | 'kafka'
  | 'rabbitmq'
  | 'nats'
  | 'circuit_breaker'
  | 'rate_limiter'
  | 'retry_policy'
  | 'health_check'
  | 'failover_controller'
  | 'auth_service'
  | 'tls_terminator'
  | 'secret_manager'
  | 'logging'
  | 'metrics_collector'
  | 'tracing'
  | 'alerting'
  | 'local_ssd'
  | 'nvme'
  | 'network_disk'
  | 'region'
  | 'availability_zone'
  | 'vpc'
  | 'docker_container'
  | 'kubernetes_pod'
  | 'vm_instance'
  | 'rack'
  | 'datacenter';

export type ProtocolType = 'REST' | 'gRPC' | 'WebSocket' | 'GraphQL' | 'async' | 'TCP' | 'NVMe' | 'SATA' | 'iSCSI' | 'NFS';

export interface TagWeight {
  tag: string;
  weight: number; // relative weight, normalized to probability
  requestSizeKb?: number;  // outgoing request payload size for this tag
  responseSizeKb?: number; // response payload size for this tag (used by leaf/CDN nodes)
}

/** Per-tag cache rule for CDN-like components */
export interface CacheRule {
  tag: string;           // traffic tag to match (e.g. 'web', 'content', 'api')
  hitRatio: number;      // probability of cache hit (0..1)
  capacityMb: number;    // cache capacity allocated for this tag (MB)
}

/** Per-tag response rule for storage/origin components — defines what response size to return per tag */
export interface ResponseRule {
  tag: string;           // traffic tag to match
  responseSizeKb: number; // average response size for this tag (KB)
}

export interface ComponentModel {
  id: string;
  type: ComponentType;

  // Capacity
  maxRps: number;
  currentLoad: number;

  // Traffic generation (client nodes only)
  generatedRps: number;

  // Latency model: baseLatency + loadFactor * load^2
  baseLatencyMs: number;
  loadLatencyFactor: number;

  // Connection pool
  maxConnections: number;
  concurrentConnections: number;

  // Reliability
  failureRate: number;
  isAlive: boolean;
  replicas: number;

  // Queue (for async components)
  queueSize: number;
  queueCapacity: number;
  processingRate: number;

  // Tag-based traffic routing (entry/client nodes)
  tagDistribution?: TagWeight[];

  // CDN cache rules — per-tag hit ratio and capacity
  cacheRules?: CacheRule[];

  // Storage/origin response rules — per-tag response size
  responseRules?: ResponseRule[];

  // Explicit tags this node accepts (undefined = wildcard, accepts any tag)
  supportedTags?: string[];

  // Traffic sizing
  payloadSizeKb: number;
  responseSizeKb: number;
}

export interface RoutingRule {
  tag: string;
  weight: number; // 0..N, fan-out semantics
  outTag?: string; // if set, spawned requests get this tag instead of the original
}

export interface ConnectionModel {
  from: string;
  to: string;
  protocol: ProtocolType;
  latencyMs: number;
  bandwidthMbps: number;
  timeoutMs: number;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
  routingRules?: RoutingRule[];
}

export interface EngineStats {
  tickCount: number;
  activeRequests: number;
  requestsGenerated: number;
  requestsCompleted: number;
  tickDurationMs: number;
}

/** Per-tag cache statistics for CDN nodes */
export interface CacheTagStats {
  hits: number;      // requests served from cache this tick
  misses: number;    // requests forwarded to origin this tick
  hitRate: number;   // actual hit rate (0..1)
  fillMb: number;    // estimated cache fill (MB)
}

export interface SimulationMetrics {
  timestamp: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number;
  errorRate: number;
  totalInboundKBps: number;   // Total inbound traffic across all nodes (KB/s)
  totalOutboundKBps: number;  // Total outbound traffic across all nodes (KB/s)
  componentUtilization: Record<string, number>;
  connectionUtilization: Record<string, number>;
  queueDepths: Record<string, number>;
  edgeThroughput: Record<string, number>;
  edgeLatency: Record<string, number>;
  engineStats?: EngineStats;
  nodeTagTraffic: Record<string, NodeTagTraffic>;
  edgeTagTraffic: Record<string, EdgeTagTraffic>;
  nodeCacheStats: Record<string, Record<string, CacheTagStats>>; // nodeId → tag → stats
}

export interface FailureReport {
  failedNode: string;
  cascadeDepth: number;
  affected: string[];
}

export interface LoadProfile {
  type: 'constant' | 'ramp' | 'spike';
  rps: number;
  durationSec: number;
}

export interface SimRequest {
  id: string;
  tag: string;
  currentNode: string;
  visited: string[];
  totalLatencyMs: number;
  failed: boolean;
  failureReason?: string;
  payloadSizeKb: number;
}

export interface TagTraffic {
  rps: number;
  bytesPerSec: number; // KB/s
}

export interface NodeTagTraffic {
  incoming: Record<string, TagTraffic>;
  outgoing: Record<string, TagTraffic>;
  responseIncoming: Record<string, TagTraffic>;
  responseOutgoing: Record<string, TagTraffic>;
}

export interface EdgeTagTraffic {
  forward: Record<string, TagTraffic>;
  response: Record<string, TagTraffic>;
}
