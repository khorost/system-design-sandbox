import type { ComponentType, ComponentCategory } from '../../../types/index.ts';

export interface PaletteItem {
  type: ComponentType;
  label: string;
  icon: string;
  category: ComponentCategory;
}

export const paletteCategories: { key: ComponentCategory; label: string }[] = [
  { key: 'clients', label: 'Clients' },
  { key: 'network', label: 'Network' },
  { key: 'compute', label: 'Compute' },
  { key: 'database', label: 'Databases' },
  { key: 'cache', label: 'Cache' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'security', label: 'Security' },
  { key: 'observability', label: 'Observability' },
];

export const paletteItems: PaletteItem[] = [
  // Clients
  { type: 'web_client', label: 'Web Client', icon: '🌐', category: 'clients' },
  { type: 'mobile_client', label: 'Mobile Client', icon: '📱', category: 'clients' },
  { type: 'external_api', label: 'External API', icon: '🔗', category: 'clients' },

  // Network
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
  { type: 's3', label: 'Object Storage', icon: '🪣', category: 'database' },
  { type: 'elasticsearch', label: 'Elasticsearch', icon: '🔍', category: 'database' },

  // Cache
  { type: 'redis', label: 'Redis', icon: '🔴', category: 'cache' },
  { type: 'memcached', label: 'Memcached', icon: '🟢', category: 'cache' },

  // Messaging
  { type: 'kafka', label: 'Kafka', icon: '📨', category: 'messaging' },
  { type: 'rabbitmq', label: 'RabbitMQ', icon: '🐇', category: 'messaging' },
  { type: 'event_bus', label: 'Event Bus', icon: '🚌', category: 'messaging' },

  // Infrastructure / Storage
  { type: 'local_ssd', label: 'Local SSD', icon: '💾', category: 'infrastructure' },
  { type: 'nvme', label: 'NVMe Storage', icon: '⚡', category: 'infrastructure' },
  { type: 'network_disk', label: 'Network Disk', icon: '🌐💿', category: 'infrastructure' },

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
