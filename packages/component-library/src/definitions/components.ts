import type { ComponentType } from '@system-design-sandbox/simulation-engine';

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

export interface ComponentParam {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  default: unknown;
  options?: string[];
  min?: number;
  max?: number;
}

export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  category: ComponentCategory;
  icon: string;
  description: string;
  params: ComponentParam[];
  defaults: {
    maxRps: number;
    baseLatencyMs: number;
    replicas: number;
  };
}

export const componentDefinitions: ComponentDefinition[] = [
  // --- Clients ---
  {
    type: 'web_client',
    label: 'Web Client',
    category: 'clients',
    icon: '🌐',
    description: 'Browser-based client generating HTTP requests',
    params: [
      { key: 'requests_per_sec', label: 'Requests/sec', type: 'number', default: 100, min: 1 },
      { key: 'payload_size_kb', label: 'Payload (KB)', type: 'number', default: 10, min: 1 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'mobile_client',
    label: 'Mobile Client',
    category: 'clients',
    icon: '📱',
    description: 'Mobile app generating HTTP/WebSocket requests',
    params: [
      { key: 'requests_per_sec', label: 'Requests/sec', type: 'number', default: 50, min: 1 },
      { key: 'payload_size_kb', label: 'Payload (KB)', type: 'number', default: 5, min: 1 },
    ],
    defaults: { maxRps: 5000, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'external_api',
    label: 'External API Consumer',
    category: 'clients',
    icon: '🔗',
    description: 'Third-party API consumer',
    params: [
      { key: 'requests_per_sec', label: 'Requests/sec', type: 'number', default: 200, min: 1 },
      { key: 'auth_type', label: 'Auth Type', type: 'select', default: 'api_key', options: ['api_key', 'oauth2', 'basic'] },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 0, replicas: 1 },
  },

  // --- Network ---
  {
    type: 'api_gateway',
    label: 'API Gateway',
    category: 'network',
    icon: '🚪',
    description: 'API Gateway with rate limiting and auth',
    params: [
      { key: 'max_rps', label: 'Max RPS', type: 'number', default: 50000, min: 100 },
      { key: 'rate_limit', label: 'Rate Limit', type: 'number', default: 1000, min: 10 },
      { key: 'auth_enabled', label: 'Auth Enabled', type: 'boolean', default: true },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 5, replicas: 2 },
  },
  {
    type: 'load_balancer',
    label: 'Load Balancer',
    category: 'network',
    icon: '⚖️',
    description: 'Distributes traffic across service instances',
    params: [
      { key: 'algorithm', label: 'Algorithm', type: 'select', default: 'round_robin', options: ['round_robin', 'least_conn', 'ip_hash'] },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 100000, min: 100 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 1, replicas: 2 },
  },
  {
    type: 'cdn',
    label: 'CDN',
    category: 'network',
    icon: '🌍',
    description: 'Content Delivery Network for static assets',
    params: [
      { key: 'cache_hit_ratio', label: 'Cache Hit Ratio', type: 'number', default: 0.9, min: 0, max: 1 },
      { key: 'edge_locations', label: 'Edge Locations', type: 'number', default: 50, min: 1 },
      { key: 'ttl_sec', label: 'TTL (sec)', type: 'number', default: 3600, min: 1 },
    ],
    defaults: { maxRps: 1000000, baseLatencyMs: 10, replicas: 1 },
  },
  {
    type: 'dns',
    label: 'DNS',
    category: 'network',
    icon: '📡',
    description: 'DNS routing with various policies',
    params: [
      { key: 'routing_policy', label: 'Routing Policy', type: 'select', default: 'latency', options: ['latency', 'geo', 'weighted'] },
    ],
    defaults: { maxRps: 1000000, baseLatencyMs: 50, replicas: 1 },
  },
  {
    type: 'waf',
    label: 'WAF',
    category: 'network',
    icon: '🛡️',
    description: 'Web Application Firewall',
    params: [
      { key: 'rules_count', label: 'Rules Count', type: 'number', default: 100, min: 1 },
      { key: 'inspection_latency_ms', label: 'Inspection Latency (ms)', type: 'number', default: 2, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 2, replicas: 2 },
  },

  // --- Compute ---
  {
    type: 'service',
    label: 'Service',
    category: 'compute',
    icon: '⚙️',
    description: 'Application service with configurable resources',
    params: [
      { key: 'replicas', label: 'Replicas', type: 'number', default: 3, min: 1 },
      { key: 'cpu_cores', label: 'CPU Cores', type: 'number', default: 4, min: 1 },
      { key: 'memory_gb', label: 'Memory (GB)', type: 'number', default: 8, min: 1 },
      { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', default: 5000, min: 100 },
      { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', default: 10, min: 1 },
    ],
    defaults: { maxRps: 15000, baseLatencyMs: 10, replicas: 3 },
  },
  {
    type: 'serverless_function',
    label: 'Serverless Function',
    category: 'compute',
    icon: 'λ',
    description: 'Serverless compute with cold start',
    params: [
      { key: 'cold_start_ms', label: 'Cold Start (ms)', type: 'number', default: 200, min: 0 },
      { key: 'max_concurrent', label: 'Max Concurrent', type: 'number', default: 1000, min: 1 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 30000, min: 100 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 50, replicas: 1 },
  },
  {
    type: 'worker',
    label: 'Worker',
    category: 'compute',
    icon: '👷',
    description: 'Background worker processing async tasks',
    params: [
      { key: 'concurrency', label: 'Concurrency', type: 'number', default: 10, min: 1 },
      { key: 'poll_interval_ms', label: 'Poll Interval (ms)', type: 'number', default: 100, min: 10 },
    ],
    defaults: { maxRps: 1000, baseLatencyMs: 100, replicas: 2 },
  },
  {
    type: 'cron_job',
    label: 'Cron Job',
    category: 'compute',
    icon: '🕐',
    description: 'Scheduled task runner',
    params: [
      { key: 'schedule', label: 'Schedule', type: 'string', default: '*/5 * * * *' },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 60000, min: 1000 },
    ],
    defaults: { maxRps: 1, baseLatencyMs: 1000, replicas: 1 },
  },

  // --- Databases ---
  {
    type: 'postgresql',
    label: 'PostgreSQL',
    category: 'database',
    icon: '🐘',
    description: 'Relational database with ACID guarantees',
    params: [
      { key: 'replicas', label: 'Replicas', type: 'number', default: 1, min: 1 },
      { key: 'read_replicas', label: 'Read Replicas', type: 'number', default: 0, min: 0 },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 200, min: 10 },
      { key: 'storage_gb', label: 'Storage (GB)', type: 'number', default: 100, min: 10 },
      { key: 'iops', label: 'IOPS', type: 'number', default: 3000, min: 100 },
    ],
    defaults: { maxRps: 5000, baseLatencyMs: 5, replicas: 1 },
  },
  {
    type: 'mongodb',
    label: 'MongoDB',
    category: 'database',
    icon: '🍃',
    description: 'Document database with horizontal scaling',
    params: [
      { key: 'replicas', label: 'Replicas', type: 'number', default: 3, min: 1 },
      { key: 'shards', label: 'Shards', type: 'number', default: 1, min: 1 },
      { key: 'shard_key', label: 'Shard Key', type: 'string', default: '_id' },
      { key: 'storage_gb', label: 'Storage (GB)', type: 'number', default: 100, min: 10 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 3, replicas: 3 },
  },
  {
    type: 'cassandra',
    label: 'Cassandra',
    category: 'database',
    icon: '👁️',
    description: 'Wide-column store for high write throughput',
    params: [
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1 },
      { key: 'replication_factor', label: 'Replication Factor', type: 'number', default: 3, min: 1 },
      { key: 'consistency_level', label: 'Consistency', type: 'select', default: 'QUORUM', options: ['ONE', 'QUORUM', 'ALL'] },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 2, replicas: 3 },
  },

  // --- Cache ---
  {
    type: 'redis',
    label: 'Redis',
    category: 'cache',
    icon: '🔴',
    description: 'In-memory data store / cache',
    params: [
      { key: 'mode', label: 'Mode', type: 'select', default: 'standalone', options: ['standalone', 'cluster', 'sentinel'] },
      { key: 'memory_gb', label: 'Memory (GB)', type: 'number', default: 8, min: 1 },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 10000, min: 100 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 1, replicas: 1 },
  },
  {
    type: 'memcached',
    label: 'Memcached',
    category: 'cache',
    icon: '🟢',
    description: 'Distributed memory caching',
    params: [
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1 },
      { key: 'memory_gb', label: 'Memory (GB)', type: 'number', default: 4, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 1, replicas: 3 },
  },
  {
    type: 's3',
    label: 'Object Storage (S3)',
    category: 'database',
    icon: '🪣',
    description: 'Scalable object storage',
    params: [
      { key: 'storage_class', label: 'Storage Class', type: 'select', default: 'standard', options: ['standard', 'infrequent', 'glacier'] },
      { key: 'max_throughput_mbps', label: 'Max Throughput (Mbps)', type: 'number', default: 1000, min: 100 },
    ],
    defaults: { maxRps: 5000, baseLatencyMs: 20, replicas: 1 },
  },
  {
    type: 'elasticsearch',
    label: 'Elasticsearch',
    category: 'database',
    icon: '🔍',
    description: 'Full-text search and analytics engine',
    params: [
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1 },
      { key: 'shards', label: 'Shards', type: 'number', default: 5, min: 1 },
      { key: 'replicas', label: 'Replicas', type: 'number', default: 1, min: 0 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 10, replicas: 3 },
  },

  // --- Messaging ---
  {
    type: 'kafka',
    label: 'Kafka',
    category: 'messaging',
    icon: '📨',
    description: 'Distributed event streaming platform',
    params: [
      { key: 'brokers', label: 'Brokers', type: 'number', default: 3, min: 1 },
      { key: 'partitions', label: 'Partitions', type: 'number', default: 12, min: 1 },
      { key: 'replication_factor', label: 'Replication Factor', type: 'number', default: 3, min: 1 },
      { key: 'retention_hours', label: 'Retention (hours)', type: 'number', default: 168, min: 1 },
    ],
    defaults: { maxRps: 500000, baseLatencyMs: 5, replicas: 3 },
  },
  {
    type: 'rabbitmq',
    label: 'RabbitMQ',
    category: 'messaging',
    icon: '🐇',
    description: 'Message broker with flexible routing',
    params: [
      { key: 'queues', label: 'Queues', type: 'number', default: 10, min: 1 },
      { key: 'prefetch_count', label: 'Prefetch Count', type: 'number', default: 10, min: 1 },
      { key: 'ha_mode', label: 'HA Mode', type: 'boolean', default: true },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 2, replicas: 3 },
  },
  {
    type: 'event_bus',
    label: 'Event Bus',
    category: 'messaging',
    icon: '🚌',
    description: 'Pub/Sub event bus',
    params: [
      { key: 'type', label: 'Type', type: 'select', default: 'pub_sub', options: ['pub_sub', 'point_to_point'] },
      { key: 'max_throughput', label: 'Max Throughput', type: 'number', default: 100000, min: 1000 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 3, replicas: 1 },
  },

  // --- Reliability ---
  {
    type: 'circuit_breaker',
    label: 'Circuit Breaker',
    category: 'reliability',
    icon: '🔌',
    description: 'Prevents cascading failures',
    params: [
      { key: 'threshold', label: 'Threshold', type: 'number', default: 5, min: 1 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 30000, min: 1000 },
      { key: 'half_open_requests', label: 'Half-Open Requests', type: 'number', default: 3, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'rate_limiter',
    label: 'Rate Limiter',
    category: 'reliability',
    icon: '🚦',
    description: 'Controls request rate',
    params: [
      { key: 'algorithm', label: 'Algorithm', type: 'select', default: 'token_bucket', options: ['token_bucket', 'sliding_window'] },
      { key: 'limit', label: 'Limit', type: 'number', default: 1000, min: 1 },
      { key: 'window_sec', label: 'Window (sec)', type: 'number', default: 60, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'health_check',
    label: 'Health Check',
    category: 'reliability',
    icon: '💓',
    description: 'Monitors component health',
    params: [
      { key: 'interval_sec', label: 'Interval (sec)', type: 'number', default: 10, min: 1 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 5000, min: 100 },
      { key: 'unhealthy_threshold', label: 'Unhealthy Threshold', type: 'number', default: 3, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 0, replicas: 1 },
  },

  // --- Security ---
  {
    type: 'auth_service',
    label: 'Auth Service',
    category: 'security',
    icon: '🔐',
    description: 'Authentication & authorization service',
    params: [
      { key: 'protocol', label: 'Protocol', type: 'select', default: 'JWT', options: ['OAuth2', 'JWT', 'SAML'] },
      { key: 'token_ttl_sec', label: 'Token TTL (sec)', type: 'number', default: 3600, min: 60 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 15, replicas: 2 },
  },

  // --- Observability ---
  {
    type: 'logging',
    label: 'Logging (ELK)',
    category: 'observability',
    icon: '📋',
    description: 'Centralized logging stack',
    params: [
      { key: 'retention_days', label: 'Retention (days)', type: 'number', default: 30, min: 1 },
      { key: 'index_shards', label: 'Index Shards', type: 'number', default: 5, min: 1 },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 10, replicas: 3 },
  },
  {
    type: 'metrics_collector',
    label: 'Metrics (Prometheus)',
    category: 'observability',
    icon: '📊',
    description: 'Metrics collection and monitoring',
    params: [
      { key: 'scrape_interval_sec', label: 'Scrape Interval (sec)', type: 'number', default: 15, min: 5 },
      { key: 'retention_days', label: 'Retention (days)', type: 'number', default: 15, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 0, replicas: 2 },
  },
  {
    type: 'tracing',
    label: 'Tracing (Jaeger)',
    category: 'observability',
    icon: '🔎',
    description: 'Distributed tracing',
    params: [
      { key: 'sampling_rate', label: 'Sampling Rate', type: 'number', default: 0.1, min: 0, max: 1 },
      { key: 'retention_days', label: 'Retention (days)', type: 'number', default: 7, min: 1 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 0, replicas: 2 },
  },
];

export const categoryLabels: Record<ComponentCategory, string> = {
  clients: 'Clients & Entry Points',
  network: 'Network Layer',
  compute: 'Compute',
  database: 'Databases & Storage',
  cache: 'Cache',
  messaging: 'Messaging & Events',
  reliability: 'Reliability',
  security: 'Security',
  observability: 'Observability',
  infrastructure: 'Infrastructure',
};

export function getDefinition(type: ComponentType): ComponentDefinition | undefined {
  return componentDefinitions.find((d) => d.type === type);
}

export function getDefinitionsByCategory(category: ComponentCategory): ComponentDefinition[] {
  return componentDefinitions.filter((d) => d.category === category);
}
