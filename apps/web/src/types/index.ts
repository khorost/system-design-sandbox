import type { Edge,Node } from '@xyflow/react';

export type ComponentCategory =
  | 'clients'
  | 'network'
  | 'compute'
  | 'database'
  | 'cache'
  | 'messaging'
  | 'reliability'
  | 'security'
  | 'observability'
  | 'infrastructure'
  | 'storage';

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
  | 'service_container'
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

// ── Service Container Types ───────────────────────────────────────────────────

export interface DbPoolConfig {
  id: string;
  label: string;
  targetNodeId: string;
  poolSize: number;        // default 10
  queryDelay: number;      // ms, default 5
}

export interface PersistentConnConfig {
  id: string;
  label: string;
  targetNodeId: string;
  pipelined: boolean;
  cmdDelay: number;        // ms, default 0.5
}

export interface ProducerConfig {
  id: string;
  label: string;
  targetNodeId: string;
  topic: string;
  acks: 'none' | 'leader' | 'all';
  batchMode: boolean;
}

export interface OnDemandConnConfig {
  id: string;
  label: string;
  targetNodeId: string;
  setupDelay: number;      // ms, default 50
  keepAlive: boolean;
  requestDelay: number;    // ms, default 200
}

export type PipelineTrigger =
  | {
      kind: 'router';
      protocol: 'REST' | 'WS' | 'gRPC';
      port: number;
      acceptedTags: string[];
    }
  | {
      kind: 'consumer';
      sourceBrokerNodeId: string;
      topic: string;
      consumerGroup: string;
      concurrency: number;
      ackMode: 'auto' | 'manual';
    };

export type PipelineCall =
  | { kind: 'db';         resourceId: string; count: number; parallel: boolean; requestSizeKb?: number; responseSizeKb?: number }
  | { kind: 'persistent'; resourceId: string; count: number; requestSizeKb?: number; responseSizeKb?: number }
  | { kind: 'ondemand';   resourceId: string; requestSizeKb?: number; responseSizeKb?: number }
  | { kind: 'producer';   resourceId: string; payloadSize: number };

/** @deprecated Use PipelineStep.responseSizeKb instead. Kept for backward compat with saved schemas. */
export type PipelineResponse =
  | { kind: 'sync';  responseSize: number }
  | { kind: 'async'; returnDelay: number }
  | { kind: 'none' };

export interface PipelineStep {
  id: string;
  processingDelay: number;  // ms, default 0.2
  description: string;
  calls: PipelineCall[];
  /** @deprecated Use responseSizeKb instead */
  response?: PipelineResponse;
  /** If set, this step returns a response of this size (KB) to the caller.
   *  Processing of subsequent steps continues regardless. */
  responseSizeKb?: number;
}

export interface Pipeline {
  id: string;
  label: string;
  trigger: PipelineTrigger;
  steps: PipelineStep[];
}

export interface ServiceContainerConfig {
  dbPools: DbPoolConfig[];
  persistentConns: PersistentConnConfig[];
  producers: ProducerConfig[];
  onDemandConns: OnDemandConnConfig[];
  pipelines: Pipeline[];
  internalLatency: number;  // μs, default 2
  collapsed: boolean;
  rateLimitEnabled?: boolean;     // default false
  rateLimitRps?: number;          // per-instance RPS cap, default 1000
  rateLimitRedisNodeId?: string;  // required when replicas > 1; canvas node id of Redis
}

export const DISK_COMPONENT_TYPES = new Set(['local_ssd', 'nvme', 'network_disk', 'nfs']);

export const NETWORK_PROTOCOLS: ProtocolType[] = ['REST', 'gRPC', 'WebSocket', 'GraphQL', 'async', 'TCP'];
export const DISK_PROTOCOLS: ProtocolType[] = ['NVMe', 'SATA', 'iSCSI', 'NFS'];

export interface ComponentNodeData {
  label: string;
  componentType: ComponentType;
  category: ComponentCategory;
  icon: string;
  config: Record<string, unknown>;
  collapsed?: boolean;
  collapseMode?: 'spatial' | 'functional';
  [key: string]: unknown;
}

export interface EdgeRoutingRule {
  tag: string;
  weight: number;
  outTag?: string;
}

export interface EdgeData {
  protocol: ProtocolType;
  latencyMs: number;
  bandwidthMbps: number;
  timeoutMs: number;
  routingRules?: EdgeRoutingRule[];
  waypoints?: Array<{ x: number; y: number }>;
  orthoExplicit?: boolean;  // true = waypoints are literal bend coordinates (new segment model)
  circuitBreaker?: {
    enabled: boolean;
    errorThreshold: number;    // % errors to trip (default 50)
    timeoutMs: number;         // time in OPEN state (default 30000)
    halfOpenRequests: number;  // probe requests in HALF_OPEN (default 3)
  };
  retryPolicy?: {
    enabled: boolean;
    maxRetries: number;        // max retry attempts (default 2)
    backoffMs: number;         // backoff between retries (default 100)
  };
  [key: string]: unknown;
}

export const DEFAULT_EDGE_DATA: EdgeData = {
  protocol: 'REST',
  latencyMs: 1,
  bandwidthMbps: 1000,
  timeoutMs: 5000,
};

export type ComponentNode = Node<ComponentNodeData>;
export type ComponentEdge = Edge<EdgeData>;

export interface ArchitectureSchema {
  version: string;
  metadata: {
    name: string;
    description?: string;
    tags?: string[];
    createdAt: string;
    updatedAt: string;
  };
  nodes: ComponentNode[];
  edges: ComponentEdge[];
}

// Maps component types to node types used in React Flow
export const NODE_TYPE_MAP: Record<string, string> = {
  web_client: 'serviceNode',
  mobile_client: 'serviceNode',
  external_api: 'serviceNode',
  external_service: 'serviceNode',
  api_gateway: 'gatewayNode',
  load_balancer: 'loadBalancerNode',
  cdn: 'serviceNode',
  dns: 'serviceNode',
  waf: 'serviceNode',
  service: 'serviceNode',
  service_container: 'serviceNode',
  serverless_function: 'serviceNode',
  worker: 'serviceNode',
  cron_job: 'serviceNode',
  postgresql: 'databaseNode',
  mongodb: 'databaseNode',
  cassandra: 'databaseNode',
  mysql: 'databaseNode',
  clickhouse: 'databaseNode',
  redis: 'cacheNode',
  memcached: 'cacheNode',
  s3: 'databaseNode',
  nfs: 'databaseNode',
  etcd: 'databaseNode',
  elasticsearch: 'databaseNode',
  kafka: 'queueNode',
  rabbitmq: 'queueNode',
  nats: 'queueNode',
  circuit_breaker: 'serviceNode',
  rate_limiter: 'serviceNode',
  retry_policy: 'serviceNode',
  health_check: 'serviceNode',
  failover_controller: 'serviceNode',
  auth_service: 'serviceNode',
  tls_terminator: 'serviceNode',
  secret_manager: 'serviceNode',
  logging: 'serviceNode',
  metrics_collector: 'serviceNode',
  tracing: 'serviceNode',
  alerting: 'serviceNode',
  local_ssd: 'databaseNode',
  nvme: 'databaseNode',
  network_disk: 'databaseNode',
  region: 'serviceNode',
  availability_zone: 'serviceNode',
  vpc: 'serviceNode',
  docker_container: 'containerNode',
  kubernetes_pod: 'containerNode',
  vm_instance: 'containerNode',
  rack: 'containerNode',
  datacenter: 'containerNode',
};
