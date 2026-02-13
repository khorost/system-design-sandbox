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

export type ProtocolType = 'REST' | 'gRPC' | 'WebSocket' | 'GraphQL' | 'async' | 'TCP';

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

  // Reliability
  failureRate: number;
  isAlive: boolean;
  replicas: number;

  // Queue (for async components)
  queueSize: number;
  queueCapacity: number;
  processingRate: number;
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
}

export interface SimulationMetrics {
  timestamp: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number;
  errorRate: number;
  componentUtilization: Record<string, number>;
  queueDepths: Record<string, number>;
  edgeThroughput: Record<string, number>;
  edgeLatency: Record<string, number>;
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
  path: string[];
  currentStep: number;
  totalLatencyMs: number;
  failed: boolean;
  failureReason?: string;
}
