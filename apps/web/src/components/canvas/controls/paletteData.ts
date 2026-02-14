import type { ComponentType, ComponentCategory } from '../../../types/index.ts';

export interface PaletteItem {
  type: ComponentType;
  label: string;
  icon: string;
  category: ComponentCategory;
}

export interface PaletteCategoryMeta {
  key: ComponentCategory;
  label: string;
  icon: string;
  hint?: string;
}

export const paletteCategories: PaletteCategoryMeta[] = [
  { key: 'infrastructure', label: 'Containers', icon: '📦' },
  { key: 'clients', label: 'Clients', icon: '👤', hint: 'Generate load' },
  { key: 'network', label: 'Network', icon: '🌐' },
  { key: 'compute', label: 'Compute', icon: '⚙️' },
  { key: 'database', label: 'Databases', icon: '🗄️' },
  { key: 'cache', label: 'Cache', icon: '⚡' },
  { key: 'storage', label: 'Storage', icon: '💾' },
  { key: 'messaging', label: 'Messaging', icon: '📨' },
  { key: 'reliability', label: 'Reliability', icon: '🛡️' },
  { key: 'security', label: 'Security', icon: '🔐' },
  { key: 'observability', label: 'Observability', icon: '📊' },
];

export const paletteItems: PaletteItem[] = [
  // Clients
  { type: 'web_client', label: 'Web Client', icon: '🌐', category: 'clients' },
  { type: 'mobile_client', label: 'Mobile Client', icon: '📱', category: 'clients' },
  { type: 'external_api', label: 'External API', icon: '🔗', category: 'clients' },

  // Network
  { type: 'external_service', label: 'External Service', icon: '🔌', category: 'network' },
  { type: 'api_gateway', label: 'API Gateway', icon: '🚪', category: 'network' },
  { type: 'load_balancer', label: 'Load Balancer', icon: '⚖️', category: 'network' },
  { type: 'cdn', label: 'CDN', icon: '🌍', category: 'network' },
  { type: 'dns', label: 'DNS', icon: '📡', category: 'network' },
  { type: 'waf', label: 'WAF', icon: '🛡️', category: 'network' },

  // Compute
  { type: 'service', label: 'Service', icon: '⚙️', category: 'compute' },
  { type: 'serverless_function', label: 'Serverless', icon: 'λ', category: 'compute' },
  { type: 'worker', label: 'Worker', icon: '👷', category: 'compute' },
  { type: 'cron_job', label: 'Cron Job', icon: '🕐', category: 'compute' },

  // Databases
  { type: 'postgresql', label: 'PostgreSQL', icon: '🐘', category: 'database' },
  { type: 'mongodb', label: 'MongoDB', icon: '🍃', category: 'database' },
  { type: 'cassandra', label: 'Cassandra', icon: '👁️', category: 'database' },
  { type: 'mysql', label: 'MySQL', icon: '🐬', category: 'database' },
  { type: 'clickhouse', label: 'ClickHouse', icon: '🏠', category: 'database' },
  { type: 's3', label: 'Object Storage', icon: '🪣', category: 'database' },
  { type: 'etcd', label: 'etcd', icon: '🔑', category: 'database' },
  { type: 'elasticsearch', label: 'Elasticsearch', icon: '🔍', category: 'database' },

  // Cache
  { type: 'redis', label: 'Redis', icon: '🔴', category: 'cache' },
  { type: 'memcached', label: 'Memcached', icon: '🟢', category: 'cache' },

  // Messaging
  { type: 'kafka', label: 'Kafka', icon: '📨', category: 'messaging' },
  { type: 'rabbitmq', label: 'RabbitMQ', icon: '🐇', category: 'messaging' },
  { type: 'event_bus', label: 'Event Bus', icon: '🚌', category: 'messaging' },
  { type: 'nats', label: 'NATS', icon: '⚡', category: 'messaging' },

  // Storage
  { type: 'local_ssd', label: 'Local SSD', icon: '💾', category: 'storage' },
  { type: 'nvme', label: 'NVMe Storage', icon: '⚡', category: 'storage' },
  { type: 'network_disk', label: 'Network Disk', icon: '🌐💿', category: 'storage' },
  { type: 'nfs', label: 'NFS', icon: '📂', category: 'storage' },

  // Containers
  { type: 'datacenter', label: 'Datacenter', icon: '🏢', category: 'infrastructure' },
  { type: 'rack', label: 'Rack', icon: '🗄️', category: 'infrastructure' },
  { type: 'docker_container', label: 'Docker', icon: '🐳', category: 'infrastructure' },
  { type: 'kubernetes_pod', label: 'K8s Worker Node', icon: '☸️', category: 'infrastructure' },
  { type: 'vm_instance', label: 'VM Instance', icon: '🖥️', category: 'infrastructure' },

  // Reliability
  { type: 'circuit_breaker', label: 'Circuit Breaker', icon: '🔌', category: 'reliability' },
  { type: 'rate_limiter', label: 'Rate Limiter', icon: '🚦', category: 'reliability' },
  { type: 'health_check', label: 'Health Check', icon: '💓', category: 'reliability' },

  // Security
  { type: 'auth_service', label: 'Auth Service', icon: '🔐', category: 'security' },

  // Observability
  { type: 'logging', label: 'Logging (ELK)', icon: '📋', category: 'observability' },
  { type: 'metrics_collector', label: 'Metrics', icon: '📊', category: 'observability' },
  { type: 'tracing', label: 'Tracing', icon: '🔎', category: 'observability' },
];
