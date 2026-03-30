import type { Scenario } from '../types.js';

/**
 * Сценарий: Async Processing Pattern
 *
 * Учебная цель: понять паттерн async dispatcher — когда клиент немедленно
 * получает jobId, а тяжёлая обработка идёт в фоне через очередь и Consumer.
 *
 * Ключевой момент: студент видит два p99 — быстрый "sync leg" (ответ клиенту)
 * и медленный "worker leg" (реальная обработка). При росте нагрузки растёт
 * consumer lag, а не user-facing latency.
 */
export const asyncProcessingScenario: Scenario = {
  id: 'lesson-async-processing',
  lessonNumber: 9,
  module: 2,
  title: 'Async Processing — Dispatcher + Consumer',
  description:
    'Пользователи загружают видео. Конвертация занимает 10–30 секунд. ' +
    'Как ответить клиенту быстро и при этом не потерять задачи? ' +
    'Реализуй паттерн Async Dispatcher: сервис немедленно возвращает jobId, ' +
    'а Consumer обрабатывает задачи из очереди.',
  goal: 'p99 ответа клиенту < 100ms при любой нагрузке; consumer lag < 1000 задач',
  difficulty: 'intermediate',
  availableComponents: [
    'mobile_client',
    'api_gateway',
    'load_balancer',
    'service',
    'kafka',
    'postgresql',
    'redis',
  ],
  hints: [
    'Async Dispatcher: Pipeline с trigger=Router и response=async(returnDelay=50ms)',
    'В том же шаге используй Producer → Kafka как calls[]',
    'Consumer Pipeline: trigger=Consumer(broker=kafka, topic=video.upload)',
    'Запусти симуляцию — посмотри на consumer lag badge на Consumer строке',
    'Если lag растёт → увеличь concurrency Consumer или добавь реплики сервиса',
    'Отдельный DB Pool для Consumer — не конкурирует с API пайплайном',
  ],
  successCriteria: {
    latency_p99: '<100ms',
    no_spof: true,
  },
  startingArchitecture: {
    components: [
      {
        id: 'client-1',
        type: 'mobile_client',
        position: { x: 50, y: 250 },
        config: { requests_per_sec: 500, payload_size_kb: 10 },
      },
      {
        id: 'gw-1',
        type: 'api_gateway',
        position: { x: 260, y: 250 },
        config: { max_rps: 10000, auth_enabled: false },
      },
      {
        id: 'kafka-1',
        type: 'kafka',
        position: { x: 700, y: 100 },
        config: { brokers: 3, replication_factor: 2 },
      },
      {
        id: 'pg-1',
        type: 'postgresql',
        position: { x: 900, y: 300 },
        config: { replicas: 1, max_connections: 200, storage_gb: 1000, iops: 5000 },
      },
      {
        id: 'svc-video',
        type: 'service',
        position: { x: 500, y: 250 },
        config: {
          name: 'VideoService',
          replicas: 3,
          collapsed: true,
          internalLatency: 2,
          dbPools: [
            {
              id: 'dp-pg',
              label: 'pg-jobs',
              targetNodeId: 'pg-1',
              poolSize: 15,
              queryDelay: 5,
            },
          ],
          persistentConns: [],
          producers: [
            {
              id: 'prod-kafka',
              label: 'video-producer',
              targetNodeId: 'kafka-1',
              topic: 'video.upload',
              acks: 'leader',
              batchMode: false,
            },
          ],
          onDemandConns: [],
          pipelines: [
            {
              // Pipeline 1: API handler — returns jobId immediately
              id: 'pipe-api',
              label: 'upload-api',
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
                  description: 'validate & enqueue',
                  calls: [
                    { kind: 'producer', resourceId: 'prod-kafka', payloadSize: 0.5 },
                  ],
                  response: { kind: 'async', returnDelay: 50 },
                },
              ],
            },
            {
              // Pipeline 2: Consumer — processes jobs from Kafka
              id: 'pipe-consumer',
              label: 'process-video',
              trigger: {
                kind: 'consumer',
                sourceBrokerNodeId: 'kafka-1',
                topic: 'video.upload',
                consumerGroup: 'video-workers',
                concurrency: 5,
                ackMode: 'manual',
              },
              steps: [
                {
                  id: 'step-c1',
                  processingDelay: 20,
                  description: 'transcode video',
                  calls: [],
                },
                {
                  id: 'step-c2',
                  processingDelay: 2,
                  description: 'save metadata',
                  calls: [
                    { kind: 'db', resourceId: 'dp-pg', count: 1, parallel: false },
                  ],
                  response: { kind: 'none' },
                },
              ],
            },
          ],
        },
      },
    ],
    connections: [
      { id: 'conn-1', from: 'client-1', to: 'gw-1', protocol: 'REST' },
      { id: 'conn-2', from: 'gw-1', to: 'svc-video', protocol: 'REST' },
      { id: 'conn-3', from: 'svc-video', to: 'kafka-1', protocol: 'REST' },
      { id: 'conn-4', from: 'svc-video', to: 'pg-1', protocol: 'REST' },
    ],
  },
  tags: ['async', 'dispatcher', 'consumer', 'kafka', 'service-container', 'queue'],
};
