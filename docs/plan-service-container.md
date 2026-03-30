# План: Service Container — функциональные блоки и свёртка контейнеров

> Статус: проектирование
> Дата: 2026-03-28

---

## Контекст и цель

Текущий `Service`-узел — простая обёртка над `BaseNode` без внутренней структуры. Симуляция моделирует сервис как чёрный ящик с `baseLatencyMs` и `maxRps`.

**Цель**: превратить сервис в самостоятельную универсальную единицу, собираемую из функциональных блоков (Router, DB Pool, Persistent Conn, Producer, Consumer, On-demand Conn) с несколькими независимыми пайплайнами обработки. Параллельно — ввести универсальный механизм свёртки/развёртки для всех контейнеров.

---

## Содержание плана

1. [Функциональные блоки сервиса](#1-функциональные-блоки-сервиса)
2. [Структура сервиса: Shared Resources + Pipelines](#2-структура-сервиса)
3. [Data Model (TypeScript)](#3-data-model)
4. [Симуляционная модель](#4-симуляционная-модель)
5. [Универсальная свёртка контейнеров](#5-универсальная-свёртка-контейнеров)
6. [Визуализация collapsed-ноды сервиса](#6-визуализация-collapsed-ноды-сервиса)
7. [UI: Properties Panel для сервиса](#7-ui-properties-panel)
8. [Поэтапный план реализации](#8-поэтапный-план-реализации)
9. [Открытые вопросы](#9-открытые-вопросы)
10. [Обратная совместимость](#10-обратная-совместимость)

---

## 1. Функциональные блоки сервиса

### 1.1 Входящие (Inbound)

| Блок | Код | Назначение | Параметры |
|------|-----|-----------|-----------|
| **Router** | `router` | точка входа HTTP/WS/gRPC | `protocol`: REST\|WS\|gRPC, `port` (def. 8080), `tls`: bool, `acceptedTags: string[]` |
| **Consumer** | `consumer` | подписка на брокер | `sourceBrokerNodeId`, `topic`, `consumerGroup`, `concurrency` (def. 1), `ackMode`: auto\|manual |

> Один сервис может иметь несколько Router-ов (REST:8080 + gRPC:9090) и несколько Consumer-ов.

### 1.2 Исходящие (Outbound) — Shared Resources

| Блок | Код | Назначение | Параметры | Модель задержки |
|------|-----|-----------|-----------|----------------|
| **DB Pool** | `db_pool` | постоянный пул соединений | `targetNodeId`, `label`, `poolSize` (def. 10), `queryDelay` (мс, def. 5) | M/M/c: при `util→1` очередь растёт |
| **Persistent Conn** | `persistent_conn` | постоянный коннект (Redis, etcd) | `targetNodeId`, `pipelined`: bool, `cmdDelay` (мс, def. 0.5) | RTT + cmdDelay, без setup overhead |
| **Producer** | `producer` | отправка в брокер | `targetNodeId`, `topic`, `acks`: none\|leader\|all, `batchMode`: bool | none≈0.1мс, leader≈2мс, all≈10мс |
| **On-demand Conn** | `ondemand_conn` | коннект по запросу к внешнему узлу | `targetNodeId`, `setupDelay` (мс, def. 50), `keepAlive`: bool, `requestDelay` (мс, def. 200) | +setupDelay на каждый запрос если !keepAlive |

### 1.3 Обработка (Processing)

Неявный блок между inbound и outbound — **Pipeline Step**:
- `processingDelay` (мс, def. 0.2) — время CPU-обработки
- `description` — человекочитаемое описание логики
- `calls` — список вызовов к Shared Resources
- `response` — что возвращаем (sync ответ / async jobId / ничего)

---

## 2. Структура сервиса

```
Service Container
├── Shared Resources  (уровень сервиса, переиспользуются всеми пайплайнами)
│   ├── DB Pool × N          → ID узлов БД на канвасе
│   ├── Persistent Conn × N  → ID узлов Redis/etcd/...
│   ├── Producer × N         → ID узлов брокеров
│   └── On-demand Conn × N   → ID внешних узлов (SendGrid, Stripe, ...)
│
└── Pipelines × N
    ├── Trigger:  Router (protocol, port)
    │         | Consumer (sourceBroker, topic, consumerGroup, concurrency)
    ├── Steps × N:  processingDelay, description, calls[]
    └── Response:   sync (responseSize) | async (returnJobId) | none
```

### 2.1 Конкуренция за Shared Resources

Несколько пайплайнов делят один `DB Pool` — это ключевой обучающий момент:

```
util = Σ(rpsᵢ × queryDelay) / poolSize   для всех активных пайплайнов i
queueDelay = queryDelay × util / (1 - util)   // M/M/c
```

Студент видит, что два независимых пайплайна незаметно давят один пул.

### 2.2 Внутренние соединения

Задержка между блоками внутри сервиса: `internalLatency` (мкс, def. 2).
Диапазон: 1–10 мкс (inter-process call / shared memory).

### 2.3 Топология пайплайнов (примеры)

```
[а-1] Router → Step(0.2мс) → ответ клиенту

[а-2] Router → Step(1мс) → DB Pool × 2 (параллельно) → Step(0.5мс) → ответ

[б]   Router → Step → async Dispatcher → (jobId клиенту)
                              ↓
                           Worker Step → Producer(Kafka)

[в]   Consumer(orders.created) → Step(20мс) → DB Pool + Producer(notifications)

[д]   Router → Step → DB Pool(pg) + DB Pool(ch) → Step → ответ
```

---

## 3. Data Model

### 3.1 Основные типы

```typescript
// packages/component-library/src/types.ts (или apps/web/src/types/)

interface ServiceContainerConfig {
  // Shared Resources
  dbPools:         DbPoolConfig[];
  persistentConns: PersistentConnConfig[];
  producers:       ProducerConfig[];
  onDemandConns:   OnDemandConnConfig[];

  // Pipelines
  pipelines:       Pipeline[];

  // Internal wiring
  internalLatency: number;   // мкс, def. 2

  // View state
  collapsed:       boolean;  // def. true
}

// ── Shared Resources ────────────────────────────────────────────

interface DbPoolConfig {
  id:           string;
  label:        string;        // "pg-main", "ch-analytics"
  targetNodeId: string;        // ID узла БД на канвасе
  poolSize:     number;        // def. 10
  queryDelay:   number;        // мс, def. 5
}

interface PersistentConnConfig {
  id:           string;
  label:        string;
  targetNodeId: string;
  pipelined:    boolean;       // def. false
  cmdDelay:     number;        // мс, def. 0.5
}

interface ProducerConfig {
  id:           string;
  label:        string;
  targetNodeId: string;
  topic:        string;
  acks:         'none' | 'leader' | 'all';
  batchMode:    boolean;
}

interface OnDemandConnConfig {
  id:           string;
  label:        string;
  targetNodeId: string;        // внешний узел на канвасе
  setupDelay:   number;        // мс, def. 50
  keepAlive:    boolean;
  requestDelay: number;        // мс, def. 200
}

// ── Pipelines ────────────────────────────────────────────────────

type PipelineTrigger =
  | {
      kind:         'router';
      protocol:     'REST' | 'WS' | 'gRPC';
      port:         number;
      acceptedTags: string[];
    }
  | {
      kind:          'consumer';
      sourceBrokerNodeId: string;
      topic:         string;
      consumerGroup: string;
      concurrency:   number;   // def. 1
      ackMode:       'auto' | 'manual';
    };

type PipelineCall =
  | { kind: 'db';         resourceId: string; count: number; parallel: boolean }
  | { kind: 'persistent'; resourceId: string; count: number }
  | { kind: 'ondemand';   resourceId: string }
  | { kind: 'producer';   resourceId: string; payloadSize: number };  // KB

type PipelineResponse =
  | { kind: 'sync';  responseSize: number }  // KB, возврат клиенту через Router
  | { kind: 'async'; returnDelay: number }   // мс до возврата jobId, обработка продолжается
  | { kind: 'none' };                        // Consumer pipeline, без HTTP ответа

interface PipelineStep {
  id:              string;
  processingDelay: number;    // мс, def. 0.2
  description:     string;
  calls:           PipelineCall[];
  response?:       PipelineResponse;  // только последний шаг
}

interface Pipeline {
  id:       string;
  label:    string;           // "handle-order", "process-job"
  trigger:  PipelineTrigger;
  steps:    PipelineStep[];
}
```

### 3.2 Handle IDs (для React Flow)

Соглашение по именованию хендлов на collapsed-ноде:

```
Входящие (target handles, левый край):
  router:{id}      — Router
  consumer:{id}    — Consumer

Исходящие (source handles, правый край):
  dbpool:{id}      — DB Pool
  persistent:{id}  — Persistent Conn
  producer:{id}    — Producer
  ondemand:{id}    — On-demand Conn
```

---

## 4. Симуляционная модель

### 4.1 Конвертер (converter.ts)

Сервис с `ServiceContainerConfig` разворачивается в симуляционные компоненты:

1. **Сам сервис** → `ComponentModel` с агрегированными параметрами:
   - `baseLatencyMs` = среднее по пайплайнам (для обратной совместимости метрик)
   - `maxRps` = суммарная пропускная способность Router-ов

2. **Shared Resources** → отдельные `ComponentModel` или параметры вызовов внутри хопов:
   - `DB Pool` → добавляет M/M/c задержку к каждому вызову из Step
   - `Producer` → добавляет latency по `acks`-конфигу
   - `On-demand Conn` → добавляет `setupDelay` (если !keepAlive) + `requestDelay`
   - `Persistent Conn` → добавляет `cmdDelay`

3. **Pipelines** → разворачиваются в цепочки хопов движка:
   - Последовательные calls → sequential hops
   - Параллельные calls (parallel:true у DB) → fan-out + join

### 4.2 DB Pool — M/M/c конкуренция

```
// Для каждого тика
const activeQueries = pipelines
  .filter(p => p.isActive)
  .reduce((sum, p) => sum + p.currentDbCalls, 0);

const util = activeQueries / pool.poolSize;
const queueDelay = util < 1
  ? pool.queryDelay * (util / (1 - util))
  : pool.queryDelay * 10;  // cap при насыщении

effectiveQueryLatency = pool.queryDelay + queueDelay;
```

### 4.3 Consumer — back-pressure и lag

```
processingRate = concurrency / avgStepDuration   // сообщений/сек
incomingRate   = broker.publishRate(topic)

lagGrows = incomingRate > processingRate
lagMs    = lagQueue.length / processingRate * 1000

// Lag → задержка доставки (не обработки)
// При lagMs > threshold → алерт в метриках
```

### 4.4 Async Dispatcher

При `response.kind === 'async'`:
1. Немедленно возвращаем `jobId` клиенту через `returnDelay` мс
2. Продолжаем выполнение remaining steps в фоне (Worker model)
3. Метрики разделяются: `latency_sync` (до ответа) и `latency_total` (полный цикл)

### 4.5 Метрики сервиса

Добавить в `NodeTagTraffic` / `SimulationMetrics`:

```typescript
interface ServiceInternalMetrics {
  // Per pipeline
  pipelines: Record<string, {
    rps:      number;
    p99:      number;
    errors:   number;
  }>;
  // Per shared resource
  dbPools: Record<string, {
    utilization:  number;   // activeConnections / poolSize
    queueDepth:   number;
    avgQueryMs:   number;
  }>;
  consumers: Record<string, {
    lag:          number;   // сообщений в очереди
    lagMs:        number;
    processingRps: number;
  }>;
}
```

---

## 5. Универсальная свёртка контейнеров

### 5.1 Принцип

Механизм единый для **всех** контейнеров (`datacenter`, `rack`, `kubernetes_pod`, `docker_container`, `vm_instance`, и нового `service_container`). Два варианта свёртки:

| Режим | Применяется к | Collapsed показывает |
|-------|--------------|---------------------|
| **spatial** | Datacenter, Rack, K8s, VM, Docker | дочерние узлы сворачиваются, показываем счётчик (3 services, 2 DBs) |
| **functional** | Service Container | список функциональных блоков (Router, DB Pool, ...) |

### 5.2 Состояние в канвасе

```typescript
// В ComponentNodeData добавляем:
interface ComponentNodeData {
  // ...existing fields...
  collapsed?: boolean;           // def. false для spatial, def. true для functional
  collapseMode?: 'spatial' | 'functional';
}
```

### 5.3 Поведение при свёртке/развёртке

**Spatial (collapse):**
- Дочерние узлы получают `hidden: true` в React Flow
- Внешние рёбра к дочерним узлам перенаправляются на контейнер (floating handles)
- Контейнер сжимается до минимального размера (заголовок + счётчик)
- При развёртке: восстанавливаем оригинальные рёбра, снимаем hidden

**Functional (collapse):**
- Блоки внутри сервиса не являются отдельными React Flow узлами (они в `config`)
- Collapsed рендерит специальный `ServiceCollapsedNode`
- Expanded рендерит внутренний граф (subgraph) как отдельные React Flow узлы внутри контейнера

### 5.4 Кнопка свёртки

На заголовке контейнера — `⊟` / `⊞` (или шеврон). Тоггл `collapsed` в `canvasStore.updateNodeConfig()`.

### 5.5 Handle remapping при раскрытии

```
Collapsed handle: router:r1  →  Expanded: привязать ребро к внутреннему узлу router-r1
Collapsed handle: dbpool:d1  →  Expanded: привязать ребро к внутреннему узлу dbpool-d1
```

При переходе expanded→collapsed: обратное маппирование, фиксируем в edge.data.

---

## 6. Визуализация collapsed-ноды сервиса

### 6.1 Анатомия ноды

```
                   [collapsed ServiceNode]

   ──[router:r1]──┐                      ┌──[dbpool:d1]──
   ──[router:r2]──┤  ⚙ OrderService      ├──[dbpool:d2]──
   ──[consumer:c1]┤─────────────────────┤──[persistent:p1]──
                  │  → REST  :8080       ├──[producer:pr1]──
                  │  → gRPC  :9090       ├──[ondemand:o1]──
                  │  ✉ orders.created    │
                  │  ⇄ pg-main  (pool)   │
                  │  ⇄ ch-analytics      │
                  │  ··· +2 more         │
                  │──────────────────────│
                  │  ▓▓▓▓░░░  38%  24ms  │
                  └──────────────────────┘
```

### 6.2 Строки блоков (max 4 + «··· +N more»)

Порядок отображения в списке:
1. Router-ы (иконка `→`, `protocol:port`)
2. Consumer-ы (иконка `✉`, `topic`)
3. DB Pool-ы (иконка `⇄`, `label`)
4. Persistent Conn-ы (иконка `⚡`, `label`)
5. Producer-ы (иконка `📤`, `topic`)
6. On-demand Conn-ы (иконка `🌐`, `label`)

Если строк > 4 — показываем первые 4 в порядке выше + `··· +N more`.

### 6.3 Полоса метрик (нижняя)

```
▓▓▓▓░░░░  38%   p99: 24ms
```

- Цвет бара: зелёный (<60%), жёлтый (60–85%), красный (>85%) — как в BaseNode
- `%` — peak utilization по всем пайплайнам
- `p99` — worst pipeline p99 latency в текущий момент
- При симуляции остановлена: скрыта или `—`

### 6.4 Handle позиционирование

Хендлы распределяются равномерно по вертикали на краю ноды:
- Левый край: Router-хендлы сверху, Consumer-хендлы снизу
- Правый край: DB Pool → Persistent → Producer → On-demand (сверху вниз)
- Количество хендлов = количество сущностей (не ограничено 4-мя строками в списке)

---

## 7. UI: Properties Panel

### 7.1 Структура панели

```
[Service Container]
├── [Общее]  label, internalLatency, collapsed toggle
├── [Pipelines]  список + кнопка «+ Pipeline»
│   └── [Pipeline: handle-order]
│       ├── Trigger: Router ▾  |  REST  |  :8080  |  tags: [order, api]
│       └── Steps:
│           ├── [Step 1]  delay: 1мс  "validate request"
│           │   └── Calls: DB Pool pg-main × 2 (parallel)
│           └── [Step 2]  delay: 0.5мс  "build response"
│               └── Response: sync  0.5KB
├── [DB Pools]  список + кнопка «+ DB Pool»
│   └── pg-main  →  [PostgreSQL node]  poolSize:10  queryDelay:5мс
├── [Persistent Conns]
├── [Producers]
└── [On-demand Conns]
```

### 7.2 Ключевые взаимодействия

- **Добавить Pipeline**: дефолтный пайплайн — Router REST:8080, один Step (0.2мс), sync response 0.5KB
- **Изменить trigger**: выбор Router / Consumer, при Consumer → появляется `sourceBrokerNodeId` (дропдаун из узлов брокеров на канвасе)
- **Добавить Call в Step**: выбор типа (db/persistent/producer/ondemand) → выбор из созданных ресурсов
- **Добавить DB Pool**: дропдаун из узлов баз данных на канвасе + параметры
- **On-demand Conn target**: любой узел на канвасе (включая внешние сервисы типа Generic)

### 7.3 Валидация

- Pipeline без Steps → ошибка
- Consumer trigger → `sourceBrokerNodeId` обязателен
- DB Pool → `targetNodeId` должен быть типа DB/Cache
- Producer → `targetNodeId` должен быть типа Queue/Broker
- Duplicate port у двух Router-ов в одном сервисе → предупреждение

---

## 8. Поэтапный план реализации

### Этап 0 — Подготовка и типы ✅ DONE

- [x] Добавить `ServiceContainerConfig` и все sub-типы в `apps/web/src/types/index.ts`
- [x] Добавить `collapsed` / `collapseMode` в `ComponentNodeData`
- [x] Определить `Handle ID`-конвенцию (router:{id}, consumer:{id}, dbpool:{id}, persistent:{id}, producer:{id}, ondemand:{id})
- [x] Миграция: старые `service`-узлы автоматически получают дефолтный пайплайн при импорте (`importSchema()`)

### Этап 1 — Универсальная свёртка: spatial ✅ DONE

- [x] `ContainerNode.tsx`: кнопка `⊟/⊞` в заголовке, счётчик дочерних компонентов
- [x] `canvasStore`: `toggleContainerCollapse(nodeId)` — toggle `config.collapsed`, hide/show children, save/restore размеры
- [x] Размеры сохраняются в `config._expandedHeight/_expandedWidth` (не в DOM style)
- [ ] Edge remapping: при collapse → временный handle на контейнере; при expand → восстановление
- [ ] Тесты: collapse/expand сохраняется в localStorage, не ломает симуляцию

### Этап 2 — Service Container: collapsed-нода ✅ DONE

- [x] Новый компонент `ServiceContainerNode.tsx`
- [x] Рендер списка блоков (первые 4 + `··· +N more`)
- [x] Динамические хендлы по `ServiceContainerConfig` (router/consumer — левый край, dbpool/persistent/producer/ondemand — правый)
- [x] Вертикальное распределение хендлов по высоте ноды
- [x] Полоса метрик (utilization bar, цвет по порогам)
- [x] Диспетчер в `ServiceNode.tsx`: если `config.pipelines` → `ServiceContainerNode`, иначе → `BaseNode`

### Этап 3 — Service Container: expanded-нода ✅ DONE (CSS-версия)

- [x] При `collapsed: false` → рендерит `ExpandedView` компонент
- [x] Каждый пайплайн — горизонтальный flow: trigger-чип → step-чипы (delay badge) → response-чип
- [x] Shared resources — color-coded badges (DB=green, persistent=amber, producer=violet, on-demand=orange)
- [x] Те же именованные хендлы что и в collapsed → внешние рёбра не рвутся
- [x] Кнопка ⊟ в заголовке → collapse назад
- [ ] Full React Flow subgraph (в будущем, когда потребуется deep-dive в симуляцию)

### Этап 4 — Properties Panel ✅ DONE

- [x] `ServiceContainerPanel.tsx` — главная панель с секциями (Pipelines, DB Pools, Persistent, Producers, On-demand)
- [x] `PipelineEditor` (inline) — trigger (Router/Consumer) + Steps
- [x] `StepEditor` (inline) — delay, description, response type (sync/async/none)
- [x] `DbPoolsList`, `PersistentConnsList`, `ProducersList`, `OnDemandConnsList` — редакторы ресурсов с дропдаунами узлов канваса
- [x] `ServiceUpgradeButton` — кнопка конвертации обычного сервиса в контейнер
- [x] Кнопка "Convert back to simple service"
- [x] Интеграция в `PropertiesPanel.tsx`: early-return для service+pipelines, upgrade button в footer
- [x] Редактор Calls в шагах: dropdown «+ add call», CallRow с count/parallel/payloadSize per type
- [x] Валидация в реальном времени

### Этап 5 — Симуляционный движок ✅ DONE

- [x] `converter.ts`: детект `ServiceContainerConfig`, `baseLatencyMs` из среднего по steps
- [x] DB Pool M/M/c contention между пайплайнами (`serviceDbPools` → `engine.ts`)
- [x] Consumer back-pressure / lag (`consumerConfig` → `consumerLag` в engine)
- [x] Async Dispatcher: fast-path через `asyncDispatch.returnDelayMs`
- [x] On-demand Conn setup delay (per-request если !keepAlive, в `converter.ts`)
- [x] Producer latency по acks-конфигу (none=0.1ms, leader=2ms, all=10ms в `converter.ts`)
- [x] `ServiceInternalMetrics` в `SimulationMetrics` + `simulationStore`

### Этап 6 — Метрики и индикация ✅ DONE

- [x] В collapsed-ноде: live utilization bar из `simulationStore.nodeEma`
- [x] Статичный ~latency badge из суммы processingDelay по пайплайнам (всегда виден)
- [x] Миграция в `importSchema`: ServiceContainerConfig получает дефолты для недостающих полей
- [x] Per-pool utilization badge на строке DB Pool (зелёный/жёлтый/красный по порогам, tooltip с avg latency)
- [x] Consumer lag badge на строке Consumer (lag:Nk формат, цветовой алерт при > 1000 msg)
- [x] Per-node p99 из `nodeLatencyP99[nodeId]` (engine расширен, store обновлён)
- [x] Алерт при `dbPool.utilization > 0.9` → красный бейдж

### Этап 7 — Полировка и сценарии

- [x] Редактор Calls в PipelineStep
- [x] Валидация в реальном времени в ServiceContainerPanel (duplicate ports, missing broker/target, empty topic)
- [x] Новый сценарий «DB Pool Contention» (`lesson-db-pool-contention`) — в scenario-pack
- [x] Новый сценарий «Async Processing» (`lesson-async-processing`) — в scenario-pack
- [x] Export/import: ServiceContainerConfig совместим через config-объект
- [x] Обновить `spec.md` (§2.3 Service Container, §7.4 симуляционная модель, §8.1 пример схемы)

---

## 9. Открытые вопросы

| # | Вопрос | Статус |
|---|--------|--------|
| 1 | Expanded view: subgraph как embedded React Flow или просто layout внутри контейнера? | Открыт |
| 2 | При expanded — можно ли перетаскивать блоки (Router, Step) внутри? Или позиции фиксированы? | Открыт |
| 3 | Как показывать Async Worker в expanded? Как отдельный блок "Worker" или как часть Step? | Открыт |
| 4 | Consumer polling vs push: в симуляции — pull-based (каждый тик проверяем брокер) или push-based (брокер триггерит пайплайн)? | Открыт |
| 5 | Несколько On-demand Conn к одному внешнему узлу — допускать? | Открыт |

---

## 10. Обратная совместимость

Существующие `service`-узлы (без `ServiceContainerConfig`) должны продолжать работать.

**Стратегия миграции** в `importSchema()`:

```typescript
function migrateServiceNode(node: ComponentNode): ComponentNode {
  if (node.data.componentType !== 'service') return node;
  if (node.data.config.pipelines) return node;  // уже новый формат

  // Создаём дефолтный пайплайн из старых параметров
  const legacyLatency = node.data.config.baseLatencyMs ?? 10;
  const legacyTags    = node.data.config.acceptedTags ?? [];

  return {
    ...node,
    data: {
      ...node.data,
      config: {
        ...node.data.config,
        collapsed: true,
        internalLatency: 2,
        dbPools: [],
        persistentConns: [],
        producers: [],
        onDemandConns: [],
        pipelines: [{
          id:    'default',
          label: 'default',
          trigger: {
            kind:         'router',
            protocol:     'REST',
            port:         8080,
            acceptedTags: legacyTags,
          },
          steps: [{
            id:              's1',
            processingDelay: legacyLatency,
            description:     '',
            calls:           [],
            response:        { kind: 'sync', responseSize: 0.5 },
          }],
        }],
      },
    },
  };
}
```

**Правило**: при экспорте новый формат (`version: "1.1"`), при импорте старого `"1.0"` — автомиграция.

---

## Зависимости между этапами

```
Этап 0 (типы)
    ↓
Этап 1 (spatial collapse) ←── независим, можно параллельно с Этап 2
    ↓
Этап 2 (collapsed нода)
    ↓
Этап 3 (expanded нода)
    ↓
Этап 4 (properties panel)  +  Этап 5 (симуляция)  ← параллельно
    ↓
Этап 6 (метрики)
    ↓
Этап 7 (полировка)
```
