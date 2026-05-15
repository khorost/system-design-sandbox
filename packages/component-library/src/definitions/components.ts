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
  | 'infrastructure'
  | 'storage';

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
  /** Extra config values applied when the node is first created (e.g. tagDistribution). */
  defaultConfig?: Record<string, unknown>;
  /** Deprecated components are hidden from palette but still importable for backward compatibility. */
  deprecated?: boolean;
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
      { key: 'concurrent_users_k', label: 'Concurrent Users (K)', type: 'number', default: 1, min: 0.001, max: 100000 },
      { key: 'requests_per_user', label: 'Requests/User/sec', type: 'number', default: 5, min: 0.001, max: 1000 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 0, replicas: 1 },
    defaultConfig: {
      tagDistribution: [
        { tag: 'web', weight: 25, requestSizeKb: 0.1 },
        { tag: 'api', weight: 40, requestSizeKb: 0.2 },
        { tag: 'content', weight: 35, requestSizeKb: 0.1 },
      ],
    },
  },
  {
    type: 'mobile_client',
    label: 'Mobile Client',
    category: 'clients',
    icon: '📱',
    description: 'Mobile app generating HTTP/WebSocket requests',
    params: [
      { key: 'concurrent_users_k', label: 'Concurrent Users (K)', type: 'number', default: 1, min: 0.001, max: 100000 },
      { key: 'requests_per_user', label: 'Requests/User/sec', type: 'number', default: 5, min: 0.001, max: 1000 },
    ],
    defaults: { maxRps: 5000, baseLatencyMs: 0, replicas: 1 },
    defaultConfig: {
      tagDistribution: [
        { tag: 'web', weight: 5, requestSizeKb: 0.1 },
        { tag: 'api', weight: 65, requestSizeKb: 0.2 },
        { tag: 'content', weight: 30, requestSizeKb: 0.1 },
      ],
    },
  },
  {
    type: 'external_api',
    label: 'External API Consumer',
    category: 'clients',
    icon: '🔗',
    description: 'Third-party API consumer',
    params: [
      { key: 'concurrent_users_k', label: 'Consumers (K)', type: 'number', default: 0.5, min: 0.001, max: 100000 },
      { key: 'requests_per_user', label: 'Requests/Consumer/sec', type: 'number', default: 0.4, min: 0.001, max: 1000 },
      { key: 'auth_type', label: 'Auth Type', type: 'select', default: 'api_key', options: ['api_key', 'oauth2', 'basic'] },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 0, replicas: 1 },
    defaultConfig: {
      tagDistribution: [
        { tag: 'api', weight: 100, requestSizeKb: 0.2 },
      ],
    },
  },

  // --- External Services (downstream) ---
  {
    type: 'external_service',
    label: 'External Service',
    category: 'network',
    icon: '🔌',
    description: 'Third-party downstream service (payment gateway, SMS, email provider, etc.)',
    params: [
      { key: 'max_rps_per_instance', label: 'Rate Limit (RPS)', type: 'number', default: 500, min: 1, max: 10000000 },
      { key: 'base_latency_ms', label: 'Latency (ms)', type: 'number', default: 200, min: 0, max: 60000 },
      { key: 'error_rate', label: 'Error Rate (%)', type: 'number', default: 0.5, min: 0, max: 100 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 5000, min: 100, max: 300000 },
      { key: 'protocol', label: 'Protocol', type: 'select', default: 'REST', options: ['REST', 'gRPC', 'GraphQL', 'SOAP'] },
    ],
    defaults: { maxRps: 500, baseLatencyMs: 200, replicas: 1 },
  },

  // --- Network ---
  {
    type: 'api_gateway',
    label: 'API Gateway',
    category: 'network',
    icon: '🚪',
    description: 'API Gateway with rate limiting and auth',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', default: 25000, min: 1, max: 10000000 },
      { key: 'rate_limit_enabled', label: 'Rate Limit', type: 'boolean', default: false },
      { key: 'rate_limit', label: 'Rate Limit (req/s)', type: 'number', default: 1000, min: 1, max: 100000000 },
      { key: 'auth_enabled', label: 'Auth', type: 'boolean', default: true },
      { key: 'auth_latency_ms', label: 'Auth Latency (ms)', type: 'number', default: 5, min: 0, max: 1000 },
      { key: 'auth_fail_rate', label: 'Auth Fail Rate (%)', type: 'number', default: 2, min: 0, max: 100 },
      { key: 'retry_enabled', label: 'Retry', type: 'boolean', default: false },
      { key: 'retry_max', label: 'Max Retries', type: 'number', default: 2, min: 1, max: 10 },
      { key: 'retry_backoff_ms', label: 'Retry Backoff (ms)', type: 'number', default: 100, min: 10, max: 10000 },
    ],
    defaults: { maxRps: 25000, baseLatencyMs: 5, replicas: 2 },
  },
  {
    type: 'load_balancer',
    label: 'Load Balancer',
    category: 'network',
    icon: '⚖️',
    description: 'Distributes traffic across service instances',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', default: 50000, min: 1, max: 10000000 },
      { key: 'algorithm', label: 'Algorithm', type: 'select', default: 'round_robin', options: ['round_robin', 'least_conn', 'ip_hash'] },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 10000, min: 1, max: 1000000 },
      { key: 'retry_enabled', label: 'Retry', type: 'boolean', default: true },
      { key: 'retry_max', label: 'Max Retries', type: 'number', default: 2, min: 1, max: 10 },
      { key: 'retry_backoff_ms', label: 'Retry Backoff (ms)', type: 'number', default: 100, min: 10, max: 10000 },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 1, replicas: 2 },
  },
  {
    type: 'cdn',
    label: 'CDN',
    category: 'network',
    icon: '🌍',
    description: 'Content Delivery Network for static assets',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS', type: 'number', default: 500000, min: 1, max: 10000000 },
      { key: 'edge_locations', label: 'Edge Locations', type: 'number', default: 50, min: 1, max: 500 },
      { key: 'ttl_sec', label: 'TTL (sec)', type: 'number', default: 3600, min: 0, max: 31536000 },
    ],
    defaults: { maxRps: 500000, baseLatencyMs: 10, replicas: 1 },
    defaultConfig: {
      cacheRules: [
        { tag: 'web', hitRatio: 0.95, capacityMb: 512 },
        { tag: 'content', hitRatio: 0.70, capacityMb: 2048 },
      ],
    },
  },
  {
    type: 'dns',
    label: 'DNS',
    category: 'network',
    icon: '📡',
    description: 'DNS routing with various policies',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS', type: 'number', default: 200000, min: 1, max: 10000000 },
      { key: 'routing_policy', label: 'Routing Policy', type: 'select', default: 'latency', options: ['latency', 'geo', 'weighted'] },
    ],
    defaults: { maxRps: 200000, baseLatencyMs: 50, replicas: 1 },
  },
  {
    type: 'waf',
    label: 'WAF',
    category: 'network',
    icon: '🛡️',
    description: 'Web Application Firewall',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', default: 20000, min: 1, max: 10000000 },
      { key: 'rules_count', label: 'Rules Count', type: 'number', default: 100, min: 1, max: 10000 },
      { key: 'inspection_latency_ms', label: 'Inspection Latency (ms)', type: 'number', default: 2, min: 0, max: 1000 },
    ],
    defaults: { maxRps: 20000, baseLatencyMs: 2, replicas: 2 },
  },

  // --- Compute ---
  {
    type: 'service',
    label: 'Service',
    category: 'compute',
    icon: '⚙️',
    description: 'Application service with configurable resources',
    params: [
      { key: 'replicas', label: 'Replicas', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'cpu_cores', label: 'CPU Cores', type: 'number', default: 4, min: 0.1, max: 1024 },
      { key: 'memory_gb', label: 'Memory (GB)', type: 'number', default: 8, min: 0.064, max: 1024 },
      { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', default: 2000, min: 1, max: 10000000 },
      { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', default: 10, min: 0, max: 60000 },
      { key: 'language', label: 'Language', type: 'select', default: '', options: ['', 'go', 'java', 'python', 'rust', 'typescript', 'csharp', 'kotlin', 'ruby', 'php', 'cpp', 'scala', 'elixir'] },
      { key: 'rate_limit_enabled', label: 'Rate Limit', type: 'boolean', default: false },
      { key: 'rate_limit', label: 'Rate Limit (req/s)', type: 'number', default: 1000, min: 1, max: 10000000 },
    ],
    defaults: { maxRps: 2000, baseLatencyMs: 10, replicas: 3 },
  },
  {
    type: 'service_container' as ComponentType,
    label: 'Service Container',
    category: 'compute',
    icon: '⚙',
    description: 'Service with internal pipelines, DB pools, producers and consumers',
    params: [
      { key: 'replicas', label: 'Replicas', type: 'number', default: 1, min: 1, max: 1000 },
    ],
    defaults: { maxRps: 2000, baseLatencyMs: 10, replicas: 1 },
    defaultConfig: {
      collapsed: true,
      internalLatency: 2,
      dbPools: [],
      persistentConns: [],
      producers: [],
      onDemandConns: [],
      pipelines: [
        {
          id: 'default',
          label: 'default-pipeline',
          trigger: { kind: 'router', protocol: 'REST', port: 8080, acceptedTags: [] },
          steps: [
            {
              id: 'step-1',
              processingDelay: 1,
              description: '',
              calls: [],
              response: { kind: 'sync', responseSize: 0.5 },
            },
          ],
        },
      ],
    },
  },
  {
    type: 'serverless_function',
    label: 'Serverless Function',
    category: 'compute',
    icon: 'λ',
    description: 'Serverless compute with cold start',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS', type: 'number', default: 3000, min: 1, max: 10000000 },
      { key: 'cold_start_ms', label: 'Cold Start (ms)', type: 'number', default: 200, min: 0, max: 60000 },
      { key: 'max_concurrent', label: 'Max Concurrent', type: 'number', default: 1000, min: 1, max: 100000 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 30000, min: 100, max: 300000 },
      { key: 'language', label: 'Language', type: 'select', default: '', options: ['', 'go', 'java', 'python', 'rust', 'typescript', 'csharp', 'kotlin', 'ruby', 'php', 'cpp', 'scala', 'elixir'] },
    ],
    defaults: { maxRps: 3000, baseLatencyMs: 50, replicas: 1 },
  },
  {
    type: 'worker',
    label: 'Worker',
    category: 'compute',
    icon: '👷',
    description: 'Background worker processing async tasks',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Tasks/sec/Instance', type: 'number', default: 200, min: 1, max: 10000000 },
      { key: 'concurrency', label: 'Concurrency', type: 'number', default: 10, min: 1, max: 10000 },
      { key: 'poll_interval_ms', label: 'Poll Interval (ms)', type: 'number', default: 100, min: 1, max: 60000 },
      { key: 'language', label: 'Language', type: 'select', default: '', options: ['', 'go', 'java', 'python', 'rust', 'typescript', 'csharp', 'kotlin', 'ruby', 'php', 'cpp', 'scala', 'elixir'] },
      { key: 'rate_limit_enabled', label: 'Rate Limit', type: 'boolean', default: false },
      { key: 'rate_limit', label: 'Rate Limit (req/s)', type: 'number', default: 1000, min: 1, max: 10000000 },
    ],
    defaults: { maxRps: 200, baseLatencyMs: 100, replicas: 2 },
  },
  {
    type: 'cron_job',
    label: 'Cron Job',
    category: 'compute',
    icon: '🕐',
    description: 'Scheduled task runner',
    params: [
      { key: 'schedule', label: 'Schedule', type: 'string', default: '*/5 * * * *' },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 60000, min: 100, max: 300000 },
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
      { key: 'max_rps_per_instance', label: 'Max Queries/sec', type: 'number', default: 5000, min: 1, max: 10000000 },
      { key: 'replicas', label: 'Replicas', type: 'number', default: 1, min: 1, max: 1000 },
      { key: 'read_replicas', label: 'Read Replicas', type: 'number', default: 0, min: 0, max: 100 },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 200, min: 1, max: 1000000 },
      { key: 'storage_gb', label: 'Storage (GB)', type: 'number', default: 100, min: 1, max: 1000000 },
      { key: 'iops', label: 'IOPS', type: 'number', default: 3000, min: 100, max: 10000000 },
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
      { key: 'max_rps_per_instance', label: 'Max Ops/sec/Node', type: 'number', default: 10000, min: 1, max: 10000000 },
      { key: 'replicas', label: 'Replicas', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'shards', label: 'Shards', type: 'number', default: 1, min: 1, max: 1000 },
      { key: 'shard_key', label: 'Shard Key', type: 'string', default: '_id' },
      { key: 'storage_gb', label: 'Storage (GB)', type: 'number', default: 100, min: 1, max: 1000000 },
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
      { key: 'max_rps_per_instance', label: 'Max Ops/sec/Node', type: 'number', default: 20000, min: 1, max: 10000000 },
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'replication_factor', label: 'Replication Factor', type: 'number', default: 3, min: 1, max: 10 },
      { key: 'consistency_level', label: 'Consistency', type: 'select', default: 'QUORUM', options: ['ONE', 'QUORUM', 'ALL'] },
    ],
    defaults: { maxRps: 20000, baseLatencyMs: 2, replicas: 3 },
  },

  {
    type: 'mysql',
    label: 'MySQL',
    category: 'database',
    icon: '🐬',
    description: 'Relational database, widely used in web applications',
    params: [
      { key: 'max_rps_per_instance', label: 'Max QPS/Instance', type: 'number', default: 4000, min: 1, max: 10000000 },
      { key: 'replicas', label: 'Replicas', type: 'number', default: 1, min: 1, max: 1000 },
      { key: 'read_replicas', label: 'Read Replicas', type: 'number', default: 0, min: 0, max: 100 },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 151, min: 1, max: 1000000 },
      { key: 'storage_gb', label: 'Storage (GB)', type: 'number', default: 100, min: 1, max: 1000000 },
      { key: 'engine', label: 'Engine', type: 'select', default: 'InnoDB', options: ['InnoDB', 'MyISAM', 'NDB'] },
    ],
    defaults: { maxRps: 4000, baseLatencyMs: 3, replicas: 1 },
  },
  {
    type: 'clickhouse',
    label: 'ClickHouse',
    category: 'database',
    icon: '🏠',
    description: 'Column-oriented OLAP database for analytics and real-time queries',
    params: [
      { key: 'max_rps_per_instance', label: 'Max QPS/Node', type: 'number', default: 10000, min: 1, max: 10000000 },
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'shards', label: 'Shards', type: 'number', default: 1, min: 1, max: 1000 },
      { key: 'replication_factor', label: 'Replication Factor', type: 'number', default: 2, min: 1, max: 10 },
      { key: 'storage_tb', label: 'Storage (TB)', type: 'number', default: 1, min: 0.001, max: 10000 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 5, replicas: 3 },
  },

  // --- Cache ---
  {
    type: 'redis',
    label: 'Redis',
    category: 'cache',
    icon: '🔴',
    description: 'In-memory data store / cache',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Ops/sec', type: 'number', default: 100000, min: 1, max: 10000000 },
      { key: 'mode', label: 'Mode', type: 'select', default: 'standalone', options: ['standalone', 'cluster', 'sentinel'] },
      { key: 'memory_gb', label: 'Memory (GB)', type: 'number', default: 8, min: 0.064, max: 1024 },
      { key: 'max_connections', label: 'Max Connections', type: 'number', default: 10000, min: 1, max: 1000000 },
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
      { key: 'max_rps_per_instance', label: 'Max Ops/sec/Node', type: 'number', default: 50000, min: 1, max: 10000000 },
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'memory_gb', label: 'Memory (GB)', type: 'number', default: 4, min: 0.064, max: 1024 },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 1, replicas: 3 },
  },
  {
    type: 's3',
    label: 'Object Storage (S3)',
    category: 'database',
    icon: '🪣',
    description: 'Scalable object storage',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Req/sec', type: 'number', default: 5500, min: 1, max: 10000000 },
      { key: 'storage_class', label: 'Storage Class', type: 'select', default: 'standard', options: ['standard', 'infrequent', 'glacier'] },
      { key: 'max_throughput_mbps', label: 'Max Throughput (Mbps)', type: 'number', default: 1000, min: 1, max: 100000 },
    ],
    defaults: { maxRps: 5500, baseLatencyMs: 20, replicas: 1 },
    defaultConfig: {
      response_size_kb: 100,
      responseRules: [
        { tag: 'web', responseSizeKb: 2 },
        { tag: 'content', responseSizeKb: 400 },
      ],
    },
  },
  {
    type: 'nfs',
    label: 'NFS Storage',
    category: 'storage',
    icon: '📂',
    description: 'Network File System shared storage',
    params: [
      { key: 'max_rps_per_instance', label: 'Max IOPS', type: 'number', default: 3000, min: 1, max: 10000000 },
      { key: 'storage_tb', label: 'Storage (TB)', type: 'number', default: 1, min: 0.001, max: 10000 },
      { key: 'max_throughput_mbps', label: 'Max Throughput (Mbps)', type: 'number', default: 500, min: 1, max: 100000 },
    ],
    defaults: { maxRps: 3000, baseLatencyMs: 5, replicas: 1 },
  },
  {
    type: 'etcd',
    label: 'etcd',
    category: 'database',
    icon: '🔑',
    description: 'Distributed key-value store for configuration and service discovery',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Req/sec/Node', type: 'number', default: 10000, min: 1, max: 10000000 },
      { key: 'replicas', label: 'Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', default: 2, min: 0, max: 60000 },
    ],
    defaults: { maxRps: 10000, baseLatencyMs: 2, replicas: 3 },
  },
  {
    type: 'elasticsearch',
    label: 'Elasticsearch',
    category: 'database',
    icon: '🔍',
    description: 'Full-text search and analytics engine',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Queries/sec/Node', type: 'number', default: 5000, min: 1, max: 10000000 },
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'shards', label: 'Shards', type: 'number', default: 5, min: 1, max: 100000 },
      { key: 'replicas', label: 'Replicas', type: 'number', default: 1, min: 0, max: 1000 },
    ],
    defaults: { maxRps: 5000, baseLatencyMs: 10, replicas: 3 },
  },

  // --- Messaging ---
  {
    type: 'kafka',
    label: 'Kafka',
    category: 'messaging',
    icon: '📨',
    description: 'Distributed event streaming platform',
    params: [
      { key: 'brokers', label: 'Brokers', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'max_rps_per_broker', label: 'Max Msg/sec/Broker', type: 'number', default: 100000, min: 1, max: 10000000 },
      { key: 'partitions', label: 'Partitions', type: 'number', default: 12, min: 1, max: 100000 },
      { key: 'replication_factor', label: 'Replication Factor', type: 'number', default: 3, min: 1, max: 10 },
      { key: 'retention_hours', label: 'Retention (hours)', type: 'number', default: 168, min: 1, max: 8760 },
    ],
    defaults: { maxRps: 100000, baseLatencyMs: 5, replicas: 1 },
  },
  {
    type: 'rabbitmq',
    label: 'RabbitMQ',
    category: 'messaging',
    icon: '🐇',
    description: 'Message broker with flexible routing',
    params: [
      { key: 'nodes', label: 'Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'max_rps_per_node', label: 'Max Msg/sec/Node', type: 'number', default: 20000, min: 1, max: 10000000 },
      { key: 'queues', label: 'Queues', type: 'number', default: 10, min: 1, max: 100000 },
      { key: 'prefetch_count', label: 'Prefetch Count', type: 'number', default: 10, min: 1, max: 10000 },
      { key: 'ha_mode', label: 'HA Mode', type: 'boolean', default: true },
    ],
    defaults: { maxRps: 20000, baseLatencyMs: 2, replicas: 1 },
  },

  {
    type: 'nats',
    label: 'NATS',
    category: 'messaging',
    icon: '⚡',
    description: 'High-performance cloud-native messaging (NATS / NATS JetStream)',
    params: [
      { key: 'nodes', label: 'Cluster Nodes', type: 'number', default: 3, min: 1, max: 1000 },
      { key: 'max_rps_per_node', label: 'Max Msg/sec/Node', type: 'number', default: 200000, min: 1, max: 10000000 },
      { key: 'mode', label: 'Mode', type: 'select', default: 'core', options: ['core', 'jetstream'] },
      { key: 'max_payload_kb', label: 'Max Payload (KB)', type: 'number', default: 1024, min: 0.1, max: 102400 },
    ],
    defaults: { maxRps: 200000, baseLatencyMs: 0.5, replicas: 1 },
  },

  // --- Infrastructure / Containers ---
  {
    type: 'docker_container',
    label: 'Docker Container',
    category: 'infrastructure',
    icon: '🐳',
    description: 'Docker container runtime. Groups services sharing a network namespace with near-zero internal latency.',
    params: [
      { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', default: 0.1, min: 0.01, max: 1 },
      { key: 'failure_probability', label: 'Failure Probability', type: 'number', default: 0, min: 0, max: 1 },
    ],
    defaults: { maxRps: 0, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'kubernetes_pod',
    label: 'Kubernetes Pod',
    category: 'infrastructure',
    icon: '☸️',
    description: 'Kubernetes pod — a group of co-located containers sharing network and storage.',
    params: [
      { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', default: 0.1, min: 0.01, max: 1 },
      { key: 'failure_probability', label: 'Failure Probability', type: 'number', default: 0, min: 0, max: 1 },
    ],
    defaults: { maxRps: 0, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'vm_instance',
    label: 'VM Instance',
    category: 'infrastructure',
    icon: '🖥️',
    description: 'Virtual machine instance. Higher internal latency than containers due to hypervisor overhead.',
    params: [
      { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', default: 0.2, min: 0.01, max: 1 },
      { key: 'failure_probability', label: 'Failure Probability', type: 'number', default: 0, min: 0, max: 1 },
    ],
    defaults: { maxRps: 0, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'rack',
    label: 'Rack',
    category: 'infrastructure',
    icon: '🗄️',
    description: 'Server rack in a datacenter. Contains compute nodes connected via top-of-rack switch.',
    params: [
      { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', default: 1, min: 0.1, max: 10 },
      { key: 'power_redundancy', label: 'Power Redundancy', type: 'select', default: 'N+1', options: ['N', 'N+1', '2N'] },
    ],
    defaults: { maxRps: 0, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'datacenter',
    label: 'Datacenter',
    category: 'infrastructure',
    icon: '🏢',
    description: 'Datacenter (top-level container). Defines inter-rack latency and geographic region.',
    params: [
      { key: 'internal_latency_ms', label: 'Internal Latency (ms)', type: 'number', default: 5, min: 1, max: 50 },
      { key: 'inter_rack_latency_ms', label: 'Inter-Rack Latency (ms)', type: 'number', default: 5, min: 1, max: 50 },
      { key: 'region', label: 'Region', type: 'string', default: 'us-east-1' },
    ],
    defaults: { maxRps: 0, baseLatencyMs: 0, replicas: 1 },
  },

  // --- Storage ---
  {
    type: 'local_ssd',
    label: 'Local SSD',
    category: 'storage',
    icon: '💾',
    description: 'Local SSD disk attached to host. High IOPS, low latency, no network overhead. Data lost on instance termination.',
    params: [
      { key: 'max_rps_per_instance', label: 'Max IOPS', type: 'number', default: 80000, min: 100, max: 10000000 },
      { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', default: 0.1, min: 0, max: 60000 },
      { key: 'capacity_gb', label: 'Capacity (GB)', type: 'number', default: 500, min: 1, max: 1000000 },
      { key: 'throughput_mbps', label: 'Throughput (MB/s)', type: 'number', default: 3000, min: 1, max: 100000 },
    ],
    defaults: { maxRps: 80000, baseLatencyMs: 0.1, replicas: 1 },
  },
  {
    type: 'nvme',
    label: 'NVMe Storage',
    category: 'storage',
    icon: '⚡',
    description: 'NVMe SSD via PCIe. Ultra-high IOPS and throughput for latency-critical workloads.',
    params: [
      { key: 'max_rps_per_instance', label: 'Max IOPS', type: 'number', default: 200000, min: 100, max: 10000000 },
      { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', default: 0.05, min: 0, max: 60000 },
      { key: 'capacity_gb', label: 'Capacity (GB)', type: 'number', default: 1000, min: 1, max: 1000000 },
      { key: 'throughput_mbps', label: 'Throughput (MB/s)', type: 'number', default: 7000, min: 1, max: 100000 },
    ],
    defaults: { maxRps: 200000, baseLatencyMs: 0.05, replicas: 1 },
  },
  {
    type: 'network_disk',
    label: 'Network Disk (EBS/PD)',
    category: 'storage',
    icon: '🌐💿',
    description: 'Network-attached block storage (AWS EBS, GCP PD). Persistent, replicated, higher latency due to network hop.',
    params: [
      { key: 'max_rps_per_instance', label: 'Max IOPS', type: 'number', default: 16000, min: 100, max: 10000000 },
      { key: 'base_latency_ms', label: 'Base Latency (ms)', type: 'number', default: 1, min: 0, max: 60000 },
      { key: 'capacity_gb', label: 'Capacity (GB)', type: 'number', default: 500, min: 1, max: 1000000 },
      { key: 'throughput_mbps', label: 'Throughput (MB/s)', type: 'number', default: 1000, min: 1, max: 100000 },
      { key: 'disk_type', label: 'Disk Type', type: 'select', default: 'gp3', options: ['gp3', 'io2', 'st1', 'sc1'] },
    ],
    defaults: { maxRps: 16000, baseLatencyMs: 1, replicas: 1 },
  },

  // --- Reliability (passthrough, high capacity) ---
  {
    type: 'circuit_breaker',
    label: 'Circuit Breaker',
    category: 'reliability',
    icon: '🔌',
    description: 'Prevents cascading failures (use connection Circuit Breaker instead)',
    deprecated: true,
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS', type: 'number', default: 200000, min: 1, max: 10000000 },
      { key: 'threshold', label: 'Threshold', type: 'number', default: 5, min: 1, max: 1000 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 30000, min: 100, max: 300000 },
      { key: 'half_open_requests', label: 'Half-Open Requests', type: 'number', default: 3, min: 1, max: 1000 },
    ],
    defaults: { maxRps: 200000, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'rate_limiter',
    label: 'Rate Limiter',
    category: 'reliability',
    icon: '🚦',
    description: 'Controls request rate (use node Rate Limit parameter instead)',
    deprecated: true,
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS', type: 'number', default: 200000, min: 1, max: 10000000 },
      { key: 'algorithm', label: 'Algorithm', type: 'select', default: 'token_bucket', options: ['token_bucket', 'sliding_window'] },
      { key: 'limit', label: 'Limit', type: 'number', default: 1000, min: 1, max: 100000000 },
      { key: 'window_sec', label: 'Window (sec)', type: 'number', default: 60, min: 1, max: 86400 },
    ],
    defaults: { maxRps: 200000, baseLatencyMs: 0, replicas: 1 },
  },
  {
    type: 'health_check',
    label: 'Health Check',
    category: 'reliability',
    icon: '💓',
    description: 'Monitors component health',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS', type: 'number', default: 200000, min: 1, max: 10000000 },
      { key: 'interval_sec', label: 'Interval (sec)', type: 'number', default: 10, min: 1, max: 3600 },
      { key: 'timeout_ms', label: 'Timeout (ms)', type: 'number', default: 5000, min: 100, max: 300000 },
      { key: 'unhealthy_threshold', label: 'Unhealthy Threshold', type: 'number', default: 3, min: 1, max: 100 },
    ],
    defaults: { maxRps: 200000, baseLatencyMs: 0, replicas: 1 },
  },

  // --- Security ---
  {
    type: 'auth_service',
    label: 'Auth Service',
    category: 'security',
    icon: '🔐',
    description: 'Authentication & authorization service',
    params: [
      { key: 'max_rps_per_instance', label: 'Max RPS/Instance', type: 'number', default: 5000, min: 1, max: 10000000 },
      { key: 'protocol', label: 'Protocol', type: 'select', default: 'JWT', options: ['OAuth2', 'JWT', 'SAML'] },
      { key: 'token_ttl_sec', label: 'Token TTL (sec)', type: 'number', default: 3600, min: 1, max: 31536000 },
    ],
    defaults: { maxRps: 5000, baseLatencyMs: 15, replicas: 2 },
  },

  // --- Observability ---
  {
    type: 'logging',
    label: 'Logging (ELK)',
    category: 'observability',
    icon: '📋',
    description: 'Centralized logging stack',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Events/sec/Node', type: 'number', default: 20000, min: 1, max: 10000000 },
      { key: 'retention_days', label: 'Retention (days)', type: 'number', default: 30, min: 1, max: 3650 },
      { key: 'index_shards', label: 'Index Shards', type: 'number', default: 5, min: 1, max: 100000 },
    ],
    defaults: { maxRps: 20000, baseLatencyMs: 10, replicas: 3 },
  },
  {
    type: 'metrics_collector',
    label: 'Metrics (Prometheus)',
    category: 'observability',
    icon: '📊',
    description: 'Metrics collection and monitoring',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Samples/sec', type: 'number', default: 50000, min: 1, max: 10000000 },
      { key: 'scrape_interval_sec', label: 'Scrape Interval (sec)', type: 'number', default: 15, min: 1, max: 3600 },
      { key: 'retention_days', label: 'Retention (days)', type: 'number', default: 15, min: 1, max: 3650 },
    ],
    defaults: { maxRps: 50000, baseLatencyMs: 0, replicas: 2 },
  },
  {
    type: 'tracing',
    label: 'Tracing (Jaeger)',
    category: 'observability',
    icon: '🔎',
    description: 'Distributed tracing',
    params: [
      { key: 'max_rps_per_instance', label: 'Max Spans/sec', type: 'number', default: 30000, min: 1, max: 10000000 },
      { key: 'sampling_rate', label: 'Sampling Rate', type: 'number', default: 0.1, min: 0, max: 1 },
      { key: 'retention_days', label: 'Retention (days)', type: 'number', default: 7, min: 1, max: 3650 },
    ],
    defaults: { maxRps: 30000, baseLatencyMs: 0, replicas: 2 },
  },
];

export const categoryLabels: Record<ComponentCategory, string> = {
  clients: 'Clients & Entry Points',
  network: 'Network Layer',
  compute: 'Compute',
  database: 'Databases',
  cache: 'Cache',
  messaging: 'Messaging & Events',
  reliability: 'Reliability',
  security: 'Security',
  observability: 'Observability',
  infrastructure: 'Containers',
  storage: 'Storage',
};

export function getDefinition(type: ComponentType): ComponentDefinition | undefined {
  return componentDefinitions.find((d) => d.type === type);
}

export function getDefinitionsByCategory(category: ComponentCategory): ComponentDefinition[] {
  return componentDefinitions.filter((d) => d.category === category);
}
