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
  | 'infrastructure';

export type ComponentType =
  | 'web_client'
  | 'mobile_client'
  | 'external_api'
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
  | 'redis'
  | 'memcached'
  | 's3'
  | 'elasticsearch'
  | 'kafka'
  | 'rabbitmq'
  | 'event_bus'
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
  | 'region'
  | 'availability_zone'
  | 'vpc';

export type ProtocolType = 'REST' | 'gRPC' | 'WebSocket' | 'GraphQL' | 'async' | 'TCP';

export interface ComponentNodeData {
  label: string;
  componentType: ComponentType;
  category: ComponentCategory;
  icon: string;
  config: Record<string, unknown>;
  [key: string]: unknown;
}

export type ComponentNode = Node<ComponentNodeData>;
export type ComponentEdge = Edge;

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
  redis: 'cacheNode',
  memcached: 'cacheNode',
  s3: 'databaseNode',
  elasticsearch: 'databaseNode',
  kafka: 'queueNode',
  rabbitmq: 'queueNode',
  event_bus: 'queueNode',
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
  region: 'serviceNode',
  availability_zone: 'serviceNode',
  vpc: 'serviceNode',
};
