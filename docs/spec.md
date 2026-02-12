# System Design Interactive Constructor — Спецификация проекта

> Интерактивный конструктор для обучения системному дизайну: визуальный редактор архитектур с симуляцией нагрузки, Chaos Engineering и автоматическим аудитом.

## Оглавление

1. [Концепция](#1-концепция)
2. [Палитра компонентов](#2-палитра-компонентов)
3. [Движок симуляции](#3-движок-симуляции)
4. [Система сценариев](#4-система-сценариев-привязка-к-занятиям-курса)
5. [Анализатор слабых мест](#5-анализатор-слабых-мест)
6. [Технологический стек](#6-технологический-стек)
7. [Модель симуляции](#7-модель-симуляции)
8. [Модель данных](#8-модель-данных)
9. [Структура проекта](#9-структура-проекта)
10. [Дорожная карта (MVP)](#10-дорожная-карта-mvp)
11. [Геймификация](#11-что-делает-это-инженерной-игрушкой)
12. [Аналоги](#12-аналоги-для-вдохновения)
13. [Привязка к курсу](#13-привязка-к-курсу-otus-system-design-v22)

---

## 1. Концепция

**System Design Sandbox** — веб-приложение, в котором студенты:

1. **Строят** архитектуры из готовых компонентов (drag-and-drop)
2. **Конфигурируют** параметры (RPS, capacity, replicas, latency)
3. **Запускают симуляцию** нагрузки и наблюдают поведение системы
4. **Ломают** систему (Chaos Engineering) и смотрят каскадные эффекты
5. **Получают аудит** — автоматический отчёт о слабых местах
6. **Проходят сценарии** — задачи-челленджи, привязанные к темам занятий

Целевая аудитория: студенты курса System Design (middle+ разработчики).

---

## 2. Палитра компонентов

Компоненты сгруппированы по модулям курса.

### 2.1. Клиенты и точки входа

| Компонент | Иконка | Параметры |
|-----------|--------|-----------|
| Web Client | 🌐 | requests_per_sec, payload_size_kb |
| Mobile Client | 📱 | requests_per_sec, payload_size_kb |
| External API Consumer | 🔗 | requests_per_sec, auth_type |

### 2.2. Сетевой слой (Модуль 2)

| Компонент | Параметры |
|-----------|-----------|
| API Gateway | max_rps, rate_limit, auth_enabled, protocols[] |
| Load Balancer | algorithm (round_robin/least_conn/ip_hash), max_connections |
| CDN | cache_hit_ratio, edge_locations_count, ttl_sec |
| DNS | routing_policy (latency/geo/weighted) |
| WAF | rules_count, inspection_latency_ms |

### 2.3. Вычисления (Модуль 2)

| Компонент | Параметры |
|-----------|-----------|
| Service | replicas, cpu_cores, memory_gb, max_rps_per_instance, base_latency_ms |
| Serverless Function | cold_start_ms, max_concurrent, timeout_ms |
| Worker | concurrency, poll_interval_ms |
| Cron Job | schedule, timeout_ms |

### 2.4. Данные и хранение (Модуль 3)

| Компонент | Параметры |
|-----------|-----------|
| PostgreSQL | replicas, read_replicas, max_connections, storage_gb, iops |
| MongoDB | replicas, shards, shard_key, storage_gb |
| Cassandra | nodes, replication_factor, consistency_level (ONE/QUORUM/ALL) |
| Redis | mode (standalone/cluster/sentinel), memory_gb, max_connections |
| Memcached | nodes, memory_gb |
| S3 / Object Storage | storage_class, max_throughput_mbps |
| Elasticsearch | nodes, shards, replicas |

### 2.5. Сообщения и события (Модуль 3)

| Компонент | Параметры |
|-----------|-----------|
| Kafka | brokers, partitions, replication_factor, retention_hours |
| RabbitMQ | queues, prefetch_count, ha_mode |
| Event Bus | type (pub_sub/point_to_point), max_throughput |

### 2.6. Надёжность (Модуль 4)

| Компонент | Параметры |
|-----------|-----------|
| Circuit Breaker | threshold, timeout_ms, half_open_requests |
| Rate Limiter | algorithm (token_bucket/sliding_window), limit, window_sec |
| Retry Policy | max_retries, backoff_type (linear/exponential), base_delay_ms |
| Health Check | interval_sec, timeout_ms, unhealthy_threshold |
| Failover Controller | strategy (active_passive/active_active), detection_time_ms |

### 2.7. Безопасность (Модуль 5)

| Компонент | Параметры |
|-----------|-----------|
| Auth Service | protocol (OAuth2/JWT/SAML), token_ttl_sec |
| TLS Terminator | certificate_type, protocol_version |
| Secret Manager | rotation_interval_hours |

### 2.8. Observability (Модуль 5)

| Компонент | Параметры |
|-----------|-----------|
| Logging (ELK) | retention_days, index_shards |
| Metrics (Prometheus) | scrape_interval_sec, retention_days |
| Tracing (Jaeger) | sampling_rate, retention_days |
| Alerting | rules_count, notification_channels |

### 2.9. Инфраструктура

| Компонент | Параметры |
|-----------|-----------|
| Region | location, availability_zones |
| Availability Zone | — |
| VPC / Network | cidr, subnets |

### 2.10. Связи между компонентами

| Тип связи | Параметры |
|-----------|-----------|
| REST (HTTP) | method, timeout_ms, retry |
| gRPC | streaming (unary/server/client/bidi), timeout_ms |
| WebSocket | max_connections, heartbeat_sec |
| GraphQL | query_depth_limit, batch_enabled |
| Async (Queue) | через Kafka/RabbitMQ — связь опосредованная |
| TCP/UDP | bandwidth_mbps |

---

## 3. Движок симуляции

Три режима симуляции:

### 3.1. Load Simulation — нагрузочное моделирование

- Студент задаёт: **RPS, количество пользователей, размер данных**
- Система моделирует прохождение запросов по графу компонентов
- Визуализация: компоненты "краснеют" при перегрузке, очереди растут
- Метрики в реальном времени:
  - Latency: p50, p95, p99
  - Throughput: requests/sec на каждом узле
  - Error rate: % ошибок (timeouts, queue overflow, 5xx)
  - Saturation: % использования capacity каждого компонента

### 3.2. Failure Injection — Chaos Engineering

Привязка к Занятию 28 (Chaos Engineering) и ДЗ 5.

Типы инъекций:
- **Kill instance** — выключить один экземпляр сервиса / ноду БД
- **Kill zone** — выключить availability zone целиком
- **Network partition** — разорвать связь между компонентами
- **Latency injection** — добавить задержку на линк (100ms, 500ms, 2s)
- **Packet loss** — потеря % пакетов
- **Disk slow** — замедление I/O на storage
- **CPU spike** — перегрузка CPU на сервисе
- **Memory pressure** — OOM-эффект

Визуализация каскадных эффектов:
- Компонент стал недоступен → retry storm → перегрузка upstream → каскадный отказ
- Timeline: показать последовательность событий во времени

### 3.3. Cost Estimation — оценка стоимости

Привязка к Занятию 23 (Cost Estimation).

- Каждый компонент имеет модель стоимости (приближение к AWS/GCP pricing)
- Показывает $/месяц в реальном времени при изменении архитектуры
- Breakdown по категориям: compute, storage, network, managed services
- Рекомендации: "Reserved instances сэкономят 40%"

Примеры pricing-моделей:

```
Service (EC2-like):
  cost = replicas * (cpu_price * cpu_cores + memory_price * memory_gb) * hours

PostgreSQL (RDS-like):
  cost = instance_cost + storage_gb * storage_price + iops * iops_price

Redis (ElastiCache-like):
  cost = nodes * node_price_per_hour * hours

Kafka (MSK-like):
  cost = brokers * broker_price + storage_gb * storage_price

Network:
  cost = cross_az_traffic_gb * 0.01 + cross_region_traffic_gb * 0.09
```

---

## 4. Система сценариев (привязка к занятиям курса)

Каждое занятие курса → набор задач-челленджей.

### Модуль 1 — Погружение через примеры

**Занятие 2 — Messenger (WhatsApp/Telegram)**
```yaml
scenario: "Спроектируй доставку сообщений"
goal: "1M онлайн-пользователей, latency < 200ms, guaranteed delivery"
available_components: [WebSocket, Service, Kafka, PostgreSQL, Redis]
hints:
  - "Подумай о presence-сервисе"
  - "Как узнать, онлайн ли получатель?"
  - "Что если получатель офлайн? Где хранить недоставленные?"
success_criteria:
  - no_spof: true
  - latency_p99: "<200ms"
  - message_loss: "0%"
```

**Занятие 3 — News Feed (Facebook/VK)**
```yaml
scenario: "Спроектируй ленту новостей"
goal: "10M пользователей, < 500ms загрузка ленты"
challenge: "Выбери: push-модель или pull-модель? Обоснуй"
variants:
  - push: "Fan-out on write — предвычисленная лента в Redis"
  - pull: "Fan-out on read — собираем ленту в момент запроса"
  - hybrid: "Push для обычных, pull для celebrities"
```

**Занятие 4 — E-commerce (Wildberries/Ozon)**
```yaml
scenario: "Оформление заказа с оплатой"
goal: "Не потерять заказ, не списать деньги дважды"
focus: "Saga pattern, идемпотентность, eventual consistency"
failure_test: "Что если Payment Service упал после списания?"
```

**Занятие 5 — Video Streaming (YouTube/Netflix)**
```yaml
scenario: "Видео-стриминг на 5M одновременных зрителей"
goal: "Adaptive bitrate, < 2 sec start time"
focus: "CDN, transcoding pipeline, chunk-based delivery"
cost_challenge: "Уложись в $50k/месяц на CDN"
```

### Модуль 2 — Основы проектирования

**Занятие 8 — Архитектурные стили**
```yaml
scenario: "Рефакторинг монолита в микросервисы"
start_state: "Монолитное приложение (один Service с одной PostgreSQL)"
goal: "Разбей на 3+ сервисов, сохрани функциональность"
anti_pattern_check: "Не создай distributed monolith"
```

**Занятие 9 — Паттерны (CQRS, Event Sourcing, Saga)**
```yaml
scenario: "Система с 95% чтений и 5% записей"
goal: "Разделить read/write пути для масштабирования"
pattern: "CQRS"
metrics: "Read latency < 50ms при 100k RPS чтений"
```

**Занятие 10 — Event-Driven Architecture**
```yaml
scenario: "Заменить синхронные вызовы между 5 сервисами на события"
start_state: "Цепочка REST-вызовов A→B→C→D→E"
goal: "Event Bus, eventual consistency, < 1 sec end-to-end"
failure_test: "Consumer упал — сообщения не потеряны"
```

**Занятие 13 — API Gateway, Service Discovery, LB**
```yaml
scenario: "3 версии API одновременно, canary deployment"
goal: "Настрой routing: 90% → v2, 9% → v3, 1% → v3-canary"
components: [API Gateway, Load Balancer, Service x3]
```

### Модуль 3 — Данные и хранение

**Занятие 17 — Шардирование данных**
```yaml
scenario: "PostgreSQL не справляется с 50k writes/sec"
goal: "Добавь шардирование, выбери ключ"
trap: "Неправильный shard key → hot shard → система краснеет"
options:
  - user_id: "Равномерное распределение"
  - created_at: "Hot shard на текущую дату!"
  - hash(user_id): "Равномерно, но нет range-запросов"
```

**Занятие 18 — Кэширование**
```yaml
scenario: "Каталог товаров: 500k товаров, 200k RPS чтений"
goal: "Добавь кэширование, снизь нагрузку на БД до 5k RPS"
strategies:
  - cache_aside: "Приложение управляет кэшем"
  - read_through: "Кэш сам ходит в БД"
  - write_through: "Запись через кэш"
challenge: "Как инвалидировать кэш при обновлении товара?"
```

**Занятие 19 — Kafka vs RabbitMQ**
```yaml
scenario: "Система аналитики: 1M событий/сек"
goal: "Выбери message broker, обоснуй"
comparison_mode: true  # студент строит 2 варианта и сравнивает
```

### Модуль 4 — Производительность и надёжность

**Занятие 22 — Sizing**
```yaml
scenario: "Рассчитай инфраструктуру для Instagram-like"
inputs:
  dau: 10_000_000
  posts_per_day: 500_000
  avg_photo_size_mb: 2
  reads_to_writes_ratio: 100
goal: "Определи: RPS, storage/year, bandwidth, количество серверов"
calculator: true  # встроенный калькулятор sizing
```

**Занятие 25 — Масштабирование**
```yaml
scenario: "Сервис тормозит при росте нагрузки с 1k до 50k RPS"
start_state: "1 LB → 2 Service → 1 PostgreSQL"
goal: "Масштабируй до 50k RPS, latency < 100ms"
slider: "RPS от 1k до 100k — наблюдай деградацию в реальном времени"
```

**Занятие 26 — Отказоустойчивость**
```yaml
scenario: "Мастер-нода PostgreSQL упала"
goal: "Failover < 30 секунд, потеря данных = 0"
setup: "Настрой репликацию (sync/async) и failover"
simulation: "Система убивает мастер, замеряет RTO и RPO"
```

**Занятие 27 — Multi-region**
```yaml
scenario: "Пользователи в EU и US"
goal: "Latency < 100ms для обоих регионов"
challenge: "Как синхронизировать данные между регионами?"
options:
  - active_passive: "Один регион основной, другой DR"
  - active_active: "Оба пишут, conflict resolution"
cost_impact: true  # показать стоимость cross-region трафика
```

**Занятие 28 — Chaos Engineering**
```yaml
scenario: "Свободный режим — ломай всё"
tools: [kill_instance, network_partition, latency_injection, cpu_spike]
goal: "Найди 3 слабых места в своей архитектуре и исправь"
report: true  # автоматический Chaos Report
```

### Модуль 5 — Безопасность и эксплуатация

**Занятие 30 — Аутентификация**
```yaml
scenario: "Микросервисы без auth между собой"
attack: "Злоумышленник получил доступ к внутренней сети"
goal: "Добавь mTLS / JWT между сервисами"
```

**Занятие 31 — API Security**
```yaml
scenario: "DDoS-атака на API"
attack_rps: 1_000_000
goal: "Защити систему: WAF, rate limiting, auto-scaling"
success: "Легитимные запросы обслуживаются, атака отражена"
```

---

## 5. Анализатор слабых мест

Автоматические правила проверки архитектуры студента.

### 5.1. Категории проверок

#### Single Point of Failure (SPOF)
- [ ] Единственная БД без реплик
- [ ] Один API Gateway без резервного
- [ ] Сервис с replicas=1
- [ ] Отсутствие failover для stateful-компонентов
- [ ] Всё в одной availability zone

#### Bottleneck Detection
- [ ] Компонент с fan-in > 10 (слишком много входящих)
- [ ] Синхронная цепочка вызовов длиной > 3
- [ ] Компонент с utilization > 80%
- [ ] БД без read replicas при read-heavy нагрузке
- [ ] Отсутствие кэша для hot data

#### Anti-Patterns
- [ ] Distributed monolith (все сервисы синхронно зависят друг от друга)
- [ ] Shared database (несколько сервисов пишут в одну БД)
- [ ] Chatty services (> 5 вызовов между двумя сервисами на один запрос)
- [ ] God service (один сервис делает всё)
- [ ] Circular dependencies

#### Data Issues
- [ ] Нет бэкапов для основной БД
- [ ] Нет кэширования для read-heavy workload (read_ratio > 80%)
- [ ] Нет очереди для write-heavy workload (write_rps > db_capacity * 0.7)
- [ ] Неправильный shard key (hot shard detection)
- [ ] Нет retention policy для логов/метрик

#### Security Gaps
- [ ] Нет auth между внутренними сервисами
- [ ] Нет rate limiting на публичном API
- [ ] Нет WAF перед API Gateway
- [ ] Нет TLS на внешних endpoint-ах
- [ ] Секреты hardcoded (если задан Secret Manager — проверить, что сервисы его используют)

#### Cost Inefficiency
- [ ] Over-provisioning (utilization < 20% при пиковой нагрузке)
- [ ] Cross-region трафик при возможности локального
- [ ] Дорогой storage class для cold data
- [ ] Отсутствие CDN при высоком объёме статического контента

#### Sizing Mismatch
- [ ] Bandwidth линков не соответствует RPS * payload_size
- [ ] RAM Redis < working set size
- [ ] Disk IOPS < требуемый write throughput
- [ ] Число partitions Kafka < число consumers в группе

### 5.2. Формат отчёта

```
╔══════════════════════════════════════════════════════╗
║           ARCHITECTURE HEALTH REPORT                  ║
╠══════════════════════════════════════════════════════╣
║ Overall Score: 72/100                                 ║
╠══════════════════════════════════════════════════════╣
║ Reliability:    ██████████░░░░ 70%                    ║
║ Performance:    ████████████░░ 85%                    ║
║ Security:       ██████░░░░░░░░ 45%  ⚠ Critical       ║
║ Cost:           ██████████░░░░ 75%                    ║
║ Scalability:    █████████░░░░░ 65%                    ║
╠══════════════════════════════════════════════════════╣
║ CRITICAL ISSUES (2):                                  ║
║  🔴 SPOF: PostgreSQL has no replicas                  ║
║  🔴 Security: No authentication between services      ║
║                                                       ║
║ WARNINGS (3):                                         ║
║  🟡 Bottleneck: OrderService at 85% capacity          ║
║  🟡 Anti-pattern: Shared DB between Order and Payment  ║
║  🟡 Cost: Redis over-provisioned (15% utilization)    ║
║                                                       ║
║ SUGGESTIONS (2):                                      ║
║  💡 Add CDN for static assets (save ~30% latency)     ║
║  💡 Consider async for notification delivery           ║
╚══════════════════════════════════════════════════════╝
```

---

## 6. Технологический стек

### 6.1. Архитектура приложения

```
┌──────────────────────────────────────────────────────────┐
│                       Frontend                            │
│                                                           │
│  Framework:  React 18+ / Next.js                          │
│  Canvas:     React Flow (node-based graph editor)         │
│  UI Kit:     shadcn/ui + Tailwind CSS                     │
│  State:      Zustand (граф компонентов + симуляция)       │
│  Animation:  Framer Motion (визуализация потоков)         │
│  Charts:     Recharts (метрики симуляции)                 │
│                                                           │
└────────────────────────┬─────────────────────────────────┘
                         │ WebSocket (simulation stream)
                         │ REST (CRUD, scenarios, auth)
┌────────────────────────▼─────────────────────────────────┐
│                       Backend                             │
│                                                           │
│  Runtime:    Node.js / Bun                                │
│  Framework:  Fastify / Hono                               │
│  Simulation: Discrete Event Engine (TypeScript / Rust+WASM│
│  Auth:       Clerk / NextAuth / простой JWT               │
│  Validation: Zod                                          │
│                                                           │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│                      Storage                              │
│                                                           │
│  PostgreSQL:  пользователи, сценарии, результаты         │
│  Redis:       сессии, кэш, pub/sub для real-time         │
│  S3:          экспорт диаграмм (PNG/SVG)                 │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 6.2. Альтернатива: полностью клиентское приложение (для MVP)

Для быстрого старта — **без backend**:

```
┌──────────────────────────────────────────────────────────┐
│                  SPA (Static Site)                         │
│                                                           │
│  Framework:  React + Vite                                 │
│  Canvas:     React Flow                                   │
│  Simulation: WebWorker (discrete event engine)            │
│  Storage:    localStorage + IndexedDB                     │
│  Export:     JSON (архитектура), PNG (диаграмма)          │
│  Deploy:     Vercel / Netlify / GitHub Pages              │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

Преимущества: нулевая стоимость хостинга, мгновенный деплой, работает офлайн.

### 6.3. Выбор библиотеки для визуального графа

| Библиотека | Плюсы | Минусы | Рекомендация |
|------------|-------|--------|--------------|
| **React Flow** | Популярная, React-native, отличные docs, кастомные ноды | Менее гибкая для сложных анимаций | **Рекомендуется для MVP** |
| **Rete.js** | Заточена под node-based editors | Меньше community, сложнее кастомизация | Хороший выбор для v2 |
| **JointJS** | Мощная, диаграммы любой сложности | Коммерческая лицензия (Rappid) | Для enterprise |
| **D3.js** | Максимальная гибкость, любая визуализация | Всё с нуля, высокий порог | Только для custom визуализаций |
| **Cytoscape.js** | Хороша для графовых алгоритмов | UX слабее React Flow | Для аналитики графов |

---

## 7. Модель симуляции

### 7.1. Принцип — дискретно-событийная симуляция (DES)

Не нужно эмулировать реальные системы. Достаточно математической модели:

```typescript
// Каждый компонент описывается как узел с параметрами обработки
interface ComponentModel {
  id: string;
  type: ComponentType;

  // Capacity
  maxRps: number;              // максимальный throughput
  currentLoad: number;         // текущая нагрузка (0..1)

  // Latency model: baseLatency + loadFactor * load^2
  baseLatencyMs: number;       // latency без нагрузки
  loadLatencyFactor: number;   // как latency растёт с нагрузкой

  // Reliability
  failureRate: number;         // вероятность сбоя per hour
  isAlive: boolean;
  replicas: number;

  // Queue (для async-компонентов)
  queueSize: number;
  queueCapacity: number;
  processingRate: number;      // messages/sec
}

// Каждая связь — ребро графа
interface ConnectionModel {
  from: string;
  to: string;
  protocol: 'REST' | 'gRPC' | 'WebSocket' | 'GraphQL' | 'async';
  bandwidthMbps: number;
  timeoutMs: number;
  retryPolicy?: { maxRetries: number; backoffMs: number };
}
```

### 7.2. Алгоритм симуляции

```
1. GENERATE requests (Poisson process, configurable RPS)
2. For each request:
   a. ROUTE through the graph (LB → Service → DB, etc.)
   b. At each node:
      - Check: is node alive? → if not, try failover path
      - Check: current_load < max_rps? → if not, queue or reject
      - Calculate latency: base + f(load)
      - Random failure check: rand() < failure_rate?
      - Add latency to total request time
   c. Collect per-node metrics
3. AGGREGATE metrics every tick (100ms simulation time):
   - Latency distribution (p50, p95, p99)
   - Throughput per component
   - Error rate
   - Queue depths
   - Component utilization (load / capacity)
4. EMIT events for visualization:
   - Request flow animation
   - Component color (green → yellow → red)
   - Queue growth animation
   - Failure explosion effect
```

### 7.3. Модели нагрузки

```typescript
// Latency under load (M/M/c queue model simplified)
function calculateLatency(component: ComponentModel): number {
  const utilization = component.currentLoad / component.maxRps;
  if (utilization >= 1.0) return Infinity; // overloaded

  // Latency grows exponentially as utilization approaches 1.0
  const queueDelay = component.baseLatencyMs * (utilization / (1 - utilization));
  return component.baseLatencyMs + queueDelay;
}

// Cascading failure model
function propagateFailure(graph: Graph, failedNode: string): FailureReport {
  const affected = [];
  const queue = graph.getDependents(failedNode);

  while (queue.length > 0) {
    const node = queue.shift();
    // Retry storm: dependents increase load on remaining replicas
    node.currentLoad *= (node.replicas / (node.replicas - 1));
    if (node.currentLoad > node.maxRps) {
      affected.push(node);
      queue.push(...graph.getDependents(node.id));
    }
  }

  return { failedNode, cascadeDepth: affected.length, affected };
}
```

---

## 8. Модель данных

### 8.1. Architecture Schema (JSON)

Формат сохранения/загрузки архитектуры:

```json
{
  "version": "1.0",
  "metadata": {
    "name": "My Messenger Architecture",
    "author": "student@email.com",
    "createdAt": "2025-01-15T10:00:00Z",
    "scenario": "lesson-02-messenger",
    "tags": ["messenger", "websocket", "kafka"]
  },
  "canvas": {
    "zoom": 1.0,
    "position": { "x": 0, "y": 0 }
  },
  "components": [
    {
      "id": "lb-1",
      "type": "load_balancer",
      "position": { "x": 300, "y": 100 },
      "config": {
        "algorithm": "least_connections",
        "maxConnections": 100000
      }
    },
    {
      "id": "svc-chat",
      "type": "service",
      "position": { "x": 500, "y": 100 },
      "config": {
        "name": "ChatService",
        "replicas": 3,
        "cpuCores": 4,
        "memoryGb": 8,
        "maxRpsPerInstance": 5000,
        "baseLatencyMs": 10
      }
    },
    {
      "id": "redis-presence",
      "type": "redis",
      "position": { "x": 500, "y": 300 },
      "config": {
        "mode": "cluster",
        "memoryGb": 16,
        "maxConnections": 10000,
        "purpose": "User presence & online status"
      }
    }
  ],
  "connections": [
    {
      "id": "conn-1",
      "from": "lb-1",
      "to": "svc-chat",
      "protocol": "WebSocket",
      "config": {
        "maxConnections": 100000,
        "heartbeatSec": 30
      }
    },
    {
      "id": "conn-2",
      "from": "svc-chat",
      "to": "redis-presence",
      "protocol": "REST",
      "config": {
        "timeoutMs": 50,
        "retryPolicy": { "maxRetries": 2, "backoffMs": 100 }
      }
    }
  ],
  "regions": [
    {
      "id": "region-eu",
      "name": "EU West",
      "components": ["lb-1", "svc-chat", "redis-presence"],
      "availabilityZones": 3
    }
  ],
  "simulation": {
    "loadProfile": {
      "type": "constant",
      "rps": 50000,
      "durationSec": 300
    },
    "chaosEvents": [
      {
        "type": "kill_instance",
        "target": "svc-chat",
        "atSecond": 120
      }
    ]
  }
}
```

### 8.2. Database Schema (PostgreSQL, для backend-версии)

```sql
-- Пользователи
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Сохранённые архитектуры
CREATE TABLE architectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    scenario_id TEXT,                    -- привязка к сценарию
    data JSONB NOT NULL,                 -- полный JSON архитектуры
    thumbnail_url TEXT,                  -- превью
    is_public BOOLEAN DEFAULT false,     -- видимость
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Сценарии курса
CREATE TABLE scenarios (
    id TEXT PRIMARY KEY,                 -- 'lesson-02-messenger'
    lesson_number INT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    config JSONB NOT NULL,               -- параметры сценария
    difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    tags TEXT[]
);

-- Результаты симуляций
CREATE TABLE simulation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    architecture_id UUID REFERENCES architectures(id),
    user_id UUID REFERENCES users(id),
    scenario_id TEXT REFERENCES scenarios(id),
    score INT,                           -- 0..100
    report JSONB NOT NULL,               -- полный отчёт
    metrics JSONB NOT NULL,              -- latency, throughput, etc.
    duration_sec INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Лидерборд
CREATE VIEW leaderboard AS
SELECT
    u.name,
    s.scenario_id,
    s.score,
    s.created_at,
    RANK() OVER (PARTITION BY s.scenario_id ORDER BY s.score DESC) as rank
FROM simulation_results s
JOIN users u ON u.id = s.user_id;
```

---

## 9. Структура проекта

```
system-design-constructor/
├── README.md
├── package.json
├── tsconfig.json
├── .env.example
│
├── apps/
│   ├── web/                          # Frontend (React + Vite)
│   │   ├── src/
│   │   │   ├── app/                  # Роуты и layout
│   │   │   │   ├── App.tsx
│   │   │   │   ├── routes/
│   │   │   │   │   ├── editor/       # Основной редактор
│   │   │   │   │   ├── scenarios/    # Список сценариев
│   │   │   │   │   ├── gallery/      # Галерея архитектур
│   │   │   │   │   └── leaderboard/  # Таблица лидеров
│   │   │   │
│   │   │   ├── components/
│   │   │   │   ├── canvas/           # React Flow канва
│   │   │   │   │   ├── Canvas.tsx
│   │   │   │   │   ├── nodes/        # Кастомные ноды для каждого типа компонента
│   │   │   │   │   │   ├── ServiceNode.tsx
│   │   │   │   │   │   ├── DatabaseNode.tsx
│   │   │   │   │   │   ├── CacheNode.tsx
│   │   │   │   │   │   ├── QueueNode.tsx
│   │   │   │   │   │   ├── LoadBalancerNode.tsx
│   │   │   │   │   │   ├── GatewayNode.tsx
│   │   │   │   │   │   └── RegionNode.tsx
│   │   │   │   │   ├── edges/        # Кастомные связи
│   │   │   │   │   │   ├── AnimatedEdge.tsx      # Анимация потока запросов
│   │   │   │   │   │   └── ProtocolEdge.tsx       # Отображение протокола
│   │   │   │   │   └── controls/
│   │   │   │   │       ├── Toolbar.tsx            # Панель инструментов
│   │   │   │   │       └── ComponentPalette.tsx   # Палитра компонентов
│   │   │   │   │
│   │   │   │   ├── panels/           # Боковые панели
│   │   │   │   │   ├── PropertiesPanel.tsx        # Настройки компонента
│   │   │   │   │   ├── SimulationPanel.tsx        # Управление симуляцией
│   │   │   │   │   ├── MetricsPanel.tsx           # Графики метрик
│   │   │   │   │   ├── ChaosPanel.tsx             # Chaos Engineering tools
│   │   │   │   │   ├── CostPanel.tsx              # Оценка стоимости
│   │   │   │   │   └── HealthReport.tsx           # Отчёт о здоровье
│   │   │   │   │
│   │   │   │   └── ui/               # Переиспользуемые UI-компоненты
│   │   │   │
│   │   │   ├── simulation/           # Движок симуляции (client-side)
│   │   │   │   ├── engine.ts         # Основной движок DES
│   │   │   │   ├── models.ts         # Модели компонентов
│   │   │   │   ├── metrics.ts        # Сбор и агрегация метрик
│   │   │   │   ├── chaos.ts          # Failure injection
│   │   │   │   ├── cost.ts           # Cost calculator
│   │   │   │   └── worker.ts         # WebWorker для симуляции
│   │   │   │
│   │   │   ├── analysis/             # Анализатор слабых мест
│   │   │   │   ├── analyzer.ts       # Оркестратор анализа
│   │   │   │   ├── rules/
│   │   │   │   │   ├── spof.ts       # Single Point of Failure
│   │   │   │   │   ├── bottleneck.ts # Bottleneck detection
│   │   │   │   │   ├── antipattern.ts# Anti-pattern detection
│   │   │   │   │   ├── security.ts   # Security gaps
│   │   │   │   │   ├── cost.ts       # Cost inefficiency
│   │   │   │   │   └── sizing.ts     # Sizing mismatch
│   │   │   │   └── report.ts         # Генерация отчёта
│   │   │   │
│   │   │   ├── scenarios/            # Сценарии курса
│   │   │   │   ├── index.ts
│   │   │   │   ├── module1/          # Примеры (messenger, feed, etc.)
│   │   │   │   ├── module2/          # Основы (patterns, protocols)
│   │   │   │   ├── module3/          # Данные (sharding, caching)
│   │   │   │   ├── module4/          # Производительность
│   │   │   │   └── module5/          # Безопасность
│   │   │   │
│   │   │   ├── store/                # Zustand stores
│   │   │   │   ├── canvasStore.ts    # Состояние канвы
│   │   │   │   ├── simulationStore.ts# Состояние симуляции
│   │   │   │   └── scenarioStore.ts  # Текущий сценарий
│   │   │   │
│   │   │   ├── hooks/                # React hooks
│   │   │   ├── utils/                # Утилиты
│   │   │   └── types/                # TypeScript типы
│   │   │
│   │   ├── public/
│   │   │   └── icons/                # Иконки компонентов (SVG)
│   │   └── index.html
│   │
│   └── api/                          # Backend (опционально, для v2)
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── db/
│       │   │   ├── schema.sql
│       │   │   └── migrations/
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── simulation-engine/            # Shared simulation logic
│   │   ├── src/
│   │   │   ├── engine.ts
│   │   │   ├── models.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── component-library/            # Определения компонентов
│   │   ├── src/
│   │   │   ├── definitions/          # JSON-описания каждого типа
│   │   │   ├── pricing/              # Модели стоимости
│   │   │   ├── icons/                # SVG иконки
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── scenario-pack/                # Сценарии курса
│       ├── src/
│       │   ├── scenarios/            # YAML/JSON файлы сценариев
│       │   ├── templates/            # Шаблоны архитектур
│       │   └── index.ts
│       └── package.json
│
├── docs/
│   ├── architecture.md               # Архитектура самого конструктора
│   ├── simulation-model.md           # Описание математической модели
│   └── contributing.md
│
└── turbo.json / nx.json              # Monorepo config
```

---

## 10. Дорожная карта (MVP)

### Фаза 1 — Static Constructor (2-3 недели)

**Цель:** канва с компонентами и статический анализ.

Что делаем:
- [ ] Проект на React + Vite + React Flow
- [ ] 15 типов компонентов с кастомными нодами
- [ ] Drag-and-drop из палитры на канву
- [ ] Соединение компонентов стрелками с выбором протокола
- [ ] Панель свойств: настройка параметров выбранного компонента
- [ ] Статический анализ: SPOF-детектор, базовые anti-patterns
- [ ] Сохранение/загрузка архитектуры в JSON (localStorage)
- [ ] Экспорт в PNG

**Уже полезно для:** ДЗ 2 (Service Interaction), ДЗ 6 (Requirements + Architecture).

### Фаза 2 — Load Simulation (3-4 недели)

**Цель:** оживить архитектуру симуляцией нагрузки.

Что делаем:
- [ ] Discrete Event Engine в WebWorker
- [ ] Настройка нагрузки: RPS slider, payload size
- [ ] Визуализация "температуры" компонентов (green → yellow → red)
- [ ] Анимация потока запросов по стрелкам
- [ ] Панель метрик: latency, throughput, error rate графики
- [ ] Sizing calculator (RPS → необходимые ресурсы)
- [ ] Cost calculator (компоненты → $/месяц)
- [ ] Режим "что если": изменить параметр → мгновенно пересчитать

**Уже полезно для:** ДЗ 4 (Sizing + Cost), Занятия 22-23.

### Фаза 3 — Chaos Mode (2-3 недели)

**Цель:** Chaos Engineering в визуальном режиме.

Что делаем:
- [ ] Панель Chaos: кнопки kill / slow / partition
- [ ] Каскадные эффекты в реальном времени
- [ ] Timeline событий (что произошло и когда)
- [ ] Circuit Breaker визуализация (open / half-open / closed)
- [ ] Предустановленные chaos-сценарии
- [ ] Chaos Report: автоматический отчёт об устойчивости
- [ ] RTO/RPO measurement

**Уже полезно для:** ДЗ 5 (Reliability + Chaos), Занятие 26-28.

### Фаза 4 — Scenarios & Gamification (3-4 недели)

**Цель:** превратить в обучающую игру.

Что делаем:
- [ ] 15+ сценариев привязанных к занятиям курса
- [ ] Шаблоны реальных систем (Netflix, WhatsApp, Uber)
- [ ] Система оценок (Health Score 0-100)
- [ ] Hints / подсказки при застревании
- [ ] Сравнение с эталонной архитектурой
- [ ] Leaderboard (требует backend)
- [ ] Режим интервью: таймер + случайная задача
- [ ] Галерея студенческих решений

---

## 11. Что делает это "инженерной игрушкой"

1. **Мгновенная обратная связь** — подключил компонент, сразу видишь эффект на метрики
2. **Красивые анимации** — запросы "летят" по стрелкам, очереди пульсируют, падающие ноды вспыхивают красным
3. **Режим "а что если?"** — быстро перестроить и сравнить два варианта side-by-side
4. **Соревновательность** — "уложись в бюджет $5k", "переживи 3 сбоя", "обработай 100k RPS"
5. **Шаблоны реальных систем** — "загрузи Netflix" → посмотри как устроено → попробуй улучшить
6. **Режим интервью** — таймер 45 мин, случайная задача, автоматическая оценка
7. **Sandbox без последствий** — можно экспериментировать без страха, нет "правильного" ответа
8. **Прогрессия сложности** — от простого "добавь реплику" до "спроектируй multi-region с budget constraint"

---

## 12. Аналоги для вдохновения

| Проект | Что взять |
|--------|-----------|
| [Excalidraw](https://excalidraw.com) | Простота UX, мгновенная отзывчивость |
| [React Flow examples](https://reactflow.dev/examples) | Кастомные ноды, анимации |
| [Rete.js](https://rete.js.org) | Node-based visual programming |
| [SimPy](https://simpy.readthedocs.io) | Discrete-event simulation concepts |
| [Chaos Toolkit](https://chaostoolkit.org) | Fault injection patterns |
| [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/) | Иконки компонентов |
| [Figma](https://figma.com) | Collaborative canvas UX |
| [Eraser.io](https://eraser.io) | Architecture diagrams UX |
| [Cloudcraft](https://cloudcraft.co) | AWS architecture + cost estimation |
| [Codecrafters](https://codecrafters.io) | Gamification of engineering learning |

---

## 13. Привязка к курсу OTUS System Design v2.2

Маппинг занятий → возможности конструктора:

| Занятие | Тема | Функция конструктора |
|---------|------|---------------------|
| 2 | Messenger | Сценарий: WebSocket + presence + delivery |
| 3 | News Feed | Сценарий: push vs pull, fan-out |
| 4 | E-commerce | Сценарий: Saga, idempotency |
| 5 | Video Streaming | Сценарий: CDN, transcoding |
| 6 | Практика | Свободный конструктор по выбранной системе |
| 8 | Архитектурные стили | Шаблоны: монолит → микросервисы |
| 9 | CQRS, Event Sourcing | Паттерн: read/write split |
| 10 | EDA | Сценарий: sync → async migration |
| 11-12 | Протоколы, GraphQL | Выбор протокола на связях |
| 13 | API Gateway, LB | Компоненты: Gateway, LB, Service Discovery |
| 16-17 | БД, шардирование | Компоненты: PostgreSQL, MongoDB, sharding config |
| 18 | Кэширование | Компоненты: Redis, CDN, cache strategies |
| 19 | Kafka, RabbitMQ | Компоненты: message brokers |
| 22 | Sizing | Sizing calculator, RPS/storage/bandwidth |
| 23 | Cost Estimation | Cost panel, $/month breakdown |
| 25 | Масштабирование | Load slider, auto-scaling simulation |
| 26 | Отказоустойчивость | Failover simulation, RTO/RPO |
| 27 | Multi-region | Region containers, cross-region traffic |
| 28 | Chaos Engineering | Chaos panel, failure injection |
| 30-31 | Security | Auth components, WAF, rate limiting |
| 32 | Observability | Logging, metrics, tracing components |
| 39-41 | Интервью | Interview mode: timer + random problem |

| ДЗ | Тема | Как конструктор помогает |
|----|------|------------------------|
| 1 | Анализ референса | Загрузить шаблон Twitter/Uber, изучить |
| 2 | Service interaction | Построить граф сервисов, выбрать протоколы |
| 3 | Data storage | Добавить БД, кэши, очереди, проверить anti-patterns |
| 4 | Sizing + Cost | Sizing calculator + Cost panel |
| 5 | Reliability + Chaos | Chaos mode + Health Report |
| 6-8 | Проект | Полный цикл: построить → симулировать → оптимизировать |
