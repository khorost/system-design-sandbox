import type { Node, Edge } from '@xyflow/react';

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
  | 'event_bus'
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

export const DISK_COMPONENT_TYPES = new Set(['local_ssd', 'nvme', 'network_disk', 'nfs']);

export const NETWORK_PROTOCOLS: ProtocolType[] = ['REST', 'gRPC', 'WebSocket', 'GraphQL', 'async', 'TCP'];
export const DISK_PROTOCOLS: ProtocolType[] = ['NVMe', 'SATA', 'iSCSI', 'NFS'];

export interface ComponentNodeData {
  label: string;
  componentType: ComponentType;
  category: ComponentCategory;
  icon: string;
  config: Record<string, unknown>;
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
  event_bus: 'queueNode',
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
