import type { Scenario } from '../types.js';

export const shardingScenario: Scenario = {
  id: 'lesson-17-sharding',
  lessonNumber: 17,
  module: 3,
  title: 'Database Sharding',
  description:
    'Your PostgreSQL cannot handle 50k writes/sec. Add sharding and choose the right shard key.',
  goal: 'Handle 50k writes/sec with proper shard key selection',
  difficulty: 'advanced',
  availableComponents: [
    'web_client',
    'load_balancer',
    'api_gateway',
    'service',
    'postgresql',
    'redis',
  ],
  hints: [
    'Wrong shard key = hot shard = system goes red!',
    'user_id: even distribution',
    'created_at: hot shard on current date!',
    'hash(user_id): even distribution, but no range queries',
  ],
  successCriteria: {
    min_rps: 50000,
    no_spof: true,
  },
  startingArchitecture: {
    components: [
      {
        id: 'client-1',
        type: 'web_client',
        position: { x: 50, y: 200 },
        config: { requests_per_sec: 50000 },
      },
      {
        id: 'lb-1',
        type: 'load_balancer',
        position: { x: 250, y: 200 },
        config: { algorithm: 'round_robin' },
      },
      {
        id: 'svc-1',
        type: 'service',
        position: { x: 450, y: 200 },
        config: { replicas: 5, max_rps_per_instance: 15000, base_latency_ms: 5 },
      },
      {
        id: 'pg-1',
        type: 'postgresql',
        position: { x: 650, y: 200 },
        config: { replicas: 1, max_connections: 200, storage_gb: 500, iops: 3000 },
      },
    ],
    connections: [
      { id: 'conn-1', from: 'client-1', to: 'lb-1', protocol: 'REST' },
      { id: 'conn-2', from: 'lb-1', to: 'svc-1', protocol: 'REST' },
      { id: 'conn-3', from: 'svc-1', to: 'pg-1', protocol: 'REST' },
    ],
  },
  tags: ['sharding', 'postgresql', 'database', 'scaling'],
};
