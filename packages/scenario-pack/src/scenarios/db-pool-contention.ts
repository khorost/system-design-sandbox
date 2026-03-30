import type { Scenario } from '../types.js';

/**
 * Сценарий: DB Pool Contention
 *
 * Учебная цель: показать, как два независимых пайплайна незаметно перегружают
 * один пул соединений к БД, и как это приводит к росту latency по M/M/c модели.
 *
 * Ключевой момент: студент добавляет второй пайплайн (фоновые отчёты) к уже
 * работающему OrderService. Сначала всё выглядит нормально, но при нагрузке
 * DB Pool начинает насыщаться — и latency основного пайплайна растёт.
 */
export const dbPoolContentionScenario: Scenario = {
  id: 'lesson-db-pool-contention',
  lessonNumber: 7,
  module: 2,
  title: 'DB Pool Contention — скрытый враг',
  description:
    'OrderService справляется с 2000 RPS при одном пайплайне. ' +
    'Добавьте фоновый пайплайн для генерации отчётов и запустите симуляцию. ' +
    'Почему latency растёт, хотя CPU сервиса не изменился?',
  goal: 'Понять M/M/c модель DB Pool и научиться диагностировать contention по утилизации пула',
  difficulty: 'intermediate',
  availableComponents: [
    'web_client',
    'load_balancer',
    'service',
    'postgresql',
    'redis',
  ],
  hints: [
    'Запусти симуляцию с одним пайплайном — посмотри на утилизацию DB Pool (зелёная)',
    'Добавь второй пайплайн (consumer или router) с вызовом того же DB Pool',
    'Снова запусти — DB Pool badge изменится с зелёного на жёлтый или красный',
    'M/M/c: при util=70% queueDelay=2×queryDelay, при util=90% queueDelay=9×queryDelay',
    'Решение: увеличь poolSize, или вынеси отчёты в отдельный read-replica сервис',
  ],
  successCriteria: {
    latency_p99: '<50ms',
    no_spof: true,
  },
  startingArchitecture: {
    components: [
      {
        id: 'client-1',
        type: 'web_client',
        position: { x: 50, y: 200 },
        config: { requests_per_sec: 2000, payload_size_kb: 1 },
      },
      {
        id: 'lb-1',
        type: 'load_balancer',
        position: { x: 250, y: 200 },
        config: { algorithm: 'round_robin', max_connections: 10000 },
      },
      {
        id: 'svc-order',
        type: 'service',
        position: { x: 480, y: 200 },
        config: {
          name: 'OrderService',
          replicas: 2,
          collapsed: true,
          internalLatency: 2,
          dbPools: [
            {
              id: 'dp-pg',
              label: 'pg-orders',
              targetNodeId: 'pg-1',
              poolSize: 10,
              queryDelay: 5,
            },
          ],
          persistentConns: [],
          producers: [],
          onDemandConns: [],
          pipelines: [
            {
              id: 'pipe-api',
              label: 'handle-order',
              trigger: {
                kind: 'router',
                protocol: 'REST',
                port: 8080,
                acceptedTags: [],
              },
              steps: [
                {
                  id: 'step-1',
                  processingDelay: 1,
                  description: 'validate & write order',
                  calls: [
                    { kind: 'db', resourceId: 'dp-pg', count: 2, parallel: false },
                  ],
                  response: { kind: 'sync', responseSize: 0.2 },
                },
              ],
            },
          ],
        },
      },
      {
        id: 'pg-1',
        type: 'postgresql',
        position: { x: 720, y: 200 },
        config: { replicas: 1, max_connections: 200, storage_gb: 100, iops: 3000 },
      },
    ],
    connections: [
      { id: 'conn-1', from: 'client-1', to: 'lb-1', protocol: 'REST' },
      { id: 'conn-2', from: 'lb-1', to: 'svc-order', protocol: 'REST' },
      { id: 'conn-3', from: 'svc-order', to: 'pg-1', protocol: 'REST' },
    ],
  },
  tags: ['db-pool', 'contention', 'latency', 'M/M/c', 'service-container'],
};
