# Tech Debt / Backlog

| # | Название | Приоритет |
|---|----------|-----------|
| [TD-001](#td-001-экспорт-метрик-симуляции-в-prometheusgrafana) | Экспорт метрик симуляции в Prometheus/Grafana | Medium |
| [TD-002](#td-002-экспортимпорт-схемы-в-текстовый-файл) | Экспорт/импорт схемы в текстовый файл | High |
| [TD-003](#td-003-экспорт-схемы-в-c4-model-context-container-component) | Экспорт схемы в C4 Model | Medium |
| [TD-004](#td-004-каталог-схем-с-шарингом-и-og-превью) | Каталог схем с шарингом и OG-превью | High |
| [TD-005](#td-005-совместное-редактирование-схемы-real-time-collaboration) | Совместное редактирование (Real-time Collaboration) | Medium |
| [TD-006](#td-006-визуализация-реплик-на-узлах-с-интерактивным-управлением) | Визуализация реплик на узлах с интерактивным управлением | High |
| [TD-007](#td-007-статический-анализ-архитектуры-spof-anti-patterns-health-report) | Статический анализ архитектуры (SPOF, anti-patterns, health report) | High |
| [TD-008](#td-008-экспорт-схемы-в-png) | Экспорт схемы в PNG | Medium |
| [TD-009](#td-009-sizing-calculator) | Sizing Calculator (RPS → ресурсы) | Medium |
| [TD-010](#td-010-фаза-3--chaos-engineering) | Фаза 3 — Chaos Engineering | High |

---

## TD-001: Экспорт метрик симуляции в Prometheus/Grafana

**Приоритет:** Medium
**Компоненты:** apps/web, apps/server

### Описание

Сейчас метрики симуляции (latency p50/p95/p99, throughput, error rate, component utilization, edge throughput) живут только в браузере. Нужен пайплайн экспорта в Prometheus для визуализации в Grafana.

### Архитектура (вариант 1: Browser → Go → Prometheus)

```
Browser (SimulationStore) --POST /api/metrics--> Go backend --GET /metrics--> Prometheus --> Grafana
```

1. **Frontend:** отправлять снапшот `SimulationMetrics` на бэкенд раз в N секунд (настраиваемый интервал)
2. **Go backend:** принимать POST `/api/metrics`, хранить последний снапшот в памяти
3. **Go backend:** выставить GET `/metrics` в Prometheus exposition format (`prometheus/client_golang`)
4. **Docker Compose:** добавить Prometheus + Grafana сервисы, scrape config на Go backend

### Метрики для экспорта

| Метрика | Prometheus type | Labels |
|---------|----------------|--------|
| `sim_latency_p50_ms` | Gauge | — |
| `sim_latency_p95_ms` | Gauge | — |
| `sim_latency_p99_ms` | Gauge | — |
| `sim_throughput_rps` | Gauge | — |
| `sim_error_rate` | Gauge | — |
| `sim_component_utilization` | Gauge | `component_id` |
| `sim_edge_throughput_rps` | Gauge | `edge` |

### Задачи

- [ ] Go: endpoint POST `/api/metrics` (принимает JSON SimulationMetrics)
- [ ] Go: endpoint GET `/metrics` (Prometheus format, `promhttp.Handler`)
- [ ] Frontend: периодическая отправка метрик (опционально, toggle в UI)
- [ ] Docker Compose: Prometheus + Grafana + scrape config
- [ ] Grafana: дашборд-шаблон для симуляции

---

## TD-002: Экспорт/импорт схемы в текстовый файл

**Приоритет:** High
**Компоненты:** apps/web

### Описание

Сейчас схема сохраняется только в localStorage. Нужна возможность экспортировать схему в текстовый файл (JSON) и импортировать обратно — для переноса между браузерами, шаринга, бэкапов и версионирования в git.

### Формат файла

```jsonc
{
  "version": 1,
  "name": "My Architecture",
  "exportedAt": "2026-02-14T12:00:00Z",
  "nodes": [
    {
      "id": "node-1",
      "type": "serviceNode",
      "position": { "x": 100, "y": 200 },
      "data": {
        "label": "API Gateway",
        "componentType": "api_gateway",
        "config": { "max_rps": 10000 },
        "icon": "🌐"
        // ...остальные поля из NodeData
      }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "data": { "protocol": "https", "latencyMs": 5 }
    }
  ]
}
```

Формат — сериализация `nodes` и `edges` из `canvasStore`, совместимая с React Flow. При импорте — валидация и восстановление в стор.

### Задачи

- [ ] Определить JSON-схему формата (version, nodes, edges, мета)
- [ ] `exportSchema()` в `canvasStore` — сериализация текущего состояния в JSON-строку
- [ ] `importSchema(json)` в `canvasStore` — парсинг, валидация, загрузка в стор
- [ ] Валидация при импорте: проверка version, наличие обязательных полей, существование componentType в библиотеке
- [ ] UI: кнопка "Export" — скачивание `.json` файла через `URL.createObjectURL` / `<a download>`
- [ ] UI: кнопка "Import" — `<input type="file">` с чтением через `FileReader`
- [ ] Обработка ошибок: невалидный JSON, несовместимая версия, битые ссылки edge→node

---

## TD-003: Экспорт схемы в C4 Model (Context, Container, Component)

**Приоритет:** Medium
**Компоненты:** apps/web, packages/component-library

### Описание

Экспорт текущей схемы из канваса в три уровня C4-диаграмм (C1 Context, C2 Container, C3 Component) в формате Structurizr DSL (`.dsl`) и/или PlantUML C4. Это позволит генерировать стандартные архитектурные диаграммы из визуального редактора для документации и ревью.

### Маппинг категорий компонентов на C4

| Категория component-library | C4-уровень | C4-элемент |
|------------------------------|------------|------------|
| `clients` (web_client, mobile_client, external_api) | C1 Person / External System | `person` или `softwareSystem` |
| `network` (api_gateway, load_balancer, cdn, dns, service_mesh) | C2 Container | `container` (infrastructure) |
| `compute` (service, serverless_function, worker, cron_job) | C2 Container / C3 Component | `container` или `component` |
| `database` (postgresql, mongodb, clickhouse, elasticsearch, ...) | C2 Container | `container` (datastore) |
| `cache` (redis, memcached) | C2 Container | `container` (datastore) |
| `messaging` (kafka, rabbitmq, sqs) | C2 Container | `container` (queue) |
| `storage` (s3) | C2 Container | `container` (datastore) |
| `infrastructure` (datacenter, rack, kubernetes_cluster, ...) | Boundary / DeploymentNode | `deploymentNode` / `container_boundary` |

### C1 — System Context

Самый высокоуровневый вид. Группирует все внутренние узлы в единую `softwareSystem`, клиенты — как `person`/`softwareSystem` снаружи.

```dsl
workspace {
  model {
    user = person "Web Client"
    system = softwareSystem "My Architecture" {
      // всё, что не clients
    }
    user -> system "Uses" "HTTPS"
  }
  views {
    systemContext system "C1" { include * autoLayout }
  }
}
```

### C2 — Container

Каждый узел (кроме infrastructure-границ) — `container` внутри `softwareSystem`. Infrastructure-узлы (`datacenter`, `kubernetes_cluster`, etc.) становятся `container_boundary` или `deploymentNode`. Edges маппятся в `->` relationship с протоколом из `edge.data.protocol`.

```dsl
system = softwareSystem "My Architecture" {
  gw = container "API Gateway" "Nginx" "api_gateway"
  svc = container "Order Service" "Go" "service"
  db = container "PostgreSQL" "Database" "postgresql" "Database"
  gw -> svc "Routes" "HTTPS"
  svc -> db "Reads/Writes" "TCP"
}
```

### C3 — Component

Актуален, если узел типа `service` содержит вложенные узлы (через parentId / infrastructure containers). Дочерние узлы сервиса становятся `component` внутри его `container`.

### Формат выхода

- **Structurizr DSL** (`.dsl`) — основной формат, совместим с Structurizr Lite/Cloud/CLI
- **PlantUML C4** (опционально) — через `!include C4_Context/C4_Container/C4_Component`

### Задачи

- [ ] Маппинг `componentType` → C4 element type (таблица выше, в конфиге или в `component-library`)
- [ ] `exportC4Dsl(nodes, edges, level: 'C1' | 'C2' | 'C3'): string` — генератор Structurizr DSL
- [ ] C1: агрегация внутренних компонентов в softwareSystem, клиенты → person/external
- [ ] C2: каждый узел → container, infrastructure → boundary, edges → relationships с protocol
- [ ] C3: вложенные узлы (parentId) → component внутри container
- [ ] Экранирование спецсимволов в именах и описаниях
- [ ] UI: кнопка/меню "Export C4" с выбором уровня (C1/C2/C3), скачивание `.dsl` файла
- [ ] (Опционально) Генерация PlantUML C4 как альтернативный формат

---

## TD-004: Каталог схем с шарингом и OG-превью

**Приоритет:** High
**Компоненты:** apps/web, apps/server, infra

### Описание

Пользователь может сохранить свою схему в публичный каталог на сервере. Каждая схема получает уникальный slug (короткую ссылку), автогенерированное превью-изображение и описание. При шаринге ссылки в Telegram, Slack, Twitter и т.д. отображается OG-карточка с превью схемы, названием и описанием.

### Пользовательский сценарий

1. Пользователь строит схему на канвасе
2. Нажимает "Publish to Catalog"
3. Заполняет: название, описание (опционально — авто из состава компонентов)
4. Система генерирует превью (скриншот канваса), сохраняет схему на сервер
5. Получает ссылку вида `sdsandbox.ru/s/<slug>`
6. При вставке ссылки в Telegram/Slack/Twitter — рендерится OG-карточка с превью

### Архитектура

```
┌─────────────┐   POST /api/schemas     ┌──────────────┐
│  Browser     │ ──────────────────────► │  Go Backend   │
│  (React)     │  {name, desc, nodes,   │               │
│              │   edges, preview_png}   │  PostgreSQL   │
│  html2canvas │                         │  S3 / MinIO   │
└─────────────┘                          └──────┬───────┘
                                                │
      GET /s/<slug>                             │
      ─────────────────────────────────────────►│
      ◄── HTML с OG-тегами + SPA redirect       │
```

### Модель данных (PostgreSQL)

```sql
CREATE TABLE schemas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(12) UNIQUE NOT NULL,  -- nanoid, URL-safe
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  author      VARCHAR(255),                 -- опционально, без auth
  nodes       JSONB NOT NULL,
  edges       JSONB NOT NULL,
  preview_url TEXT,                          -- S3/MinIO path
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  view_count  INTEGER DEFAULT 0
);

CREATE INDEX idx_schemas_slug ON schemas (slug);
CREATE INDEX idx_schemas_created_at ON schemas (created_at DESC);
```

### Генерация превью

На клиенте — `html2canvas` или `@xyflow/react` встроенный `toImage()`:

```typescript
import { getViewportForBounds } from '@xyflow/react';

async function generatePreview(nodes, edges): Promise<Blob> {
  // React Flow предоставляет .toObject() и viewport utils
  // Рендерим канвас в offscreen, экспортируем как PNG
  const canvas = document.querySelector('.react-flow__viewport');
  // html2canvas(canvas, { width: 1200, height: 630 }) — OG-размер
}
```

Размер: **1200x630px** — стандарт OG image для соцсетей.

### OG-теги и SSR-маршрут

Go-бэкенд на `GET /s/<slug>` отдаёт минимальный HTML с OG-мета (для краулеров), а для браузеров — redirect на SPA:

```html
<meta property="og:title" content="{{.Name}}" />
<meta property="og:description" content="{{.Description}}" />
<meta property="og:image" content="https://sdsandbox.ru/previews/{{.Slug}}.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="https://sdsandbox.ru/s/{{.Slug}}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```

Детект бота vs. браузера — по `User-Agent` (Telegram: `TelegramBot`, Twitter: `Twitterbot`, Slack: `Slackbot`, и т.д.). Боты получают HTML с OG, браузеры — redirect на `/#/s/<slug>` (SPA загружает схему через API).

### API

| Метод | Путь | Описание |
|-------|------|----------|
| `POST` | `/api/schemas` | Создание: `{name, description?, nodes, edges, preview}` (preview — base64 PNG). Возвращает `{slug, url}` |
| `GET` | `/api/schemas/:slug` | JSON схемы (nodes, edges, meta) для загрузки в SPA |
| `GET` | `/api/schemas?page=1&limit=20` | Каталог: список схем с превью, сортировка по дате |
| `GET` | `/s/:slug` | OG-маршрут (HTML для краулеров, redirect для браузеров) |
| `PUT` | `/api/schemas/:slug` | Обновление (по edit_token) |
| `DELETE` | `/api/schemas/:slug` | Удаление (по edit_token) |

Авторизации нет, но при создании генерируется `edit_token` (UUID), который хранится в localStorage и передаётся для PUT/DELETE.

### Каталог (Browse)

Страница `/catalog` в SPA — сетка карточек с превью-картинками, названиями, описаниями. Пагинация, сортировка (newest, most viewed). Клик — открывает схему в канвасе (read-only или "Fork to edit").

### Хранение превью

- **Dev/self-hosted:** MinIO (S3-совместимый), контейнер в Docker Compose
- **Prod:** S3 bucket или R2 (Cloudflare), CDN перед ним

### Задачи

**Backend (Go):**
- [ ] Миграция: таблица `schemas`
- [ ] `POST /api/schemas` — сохранение JSON + upload превью в S3/MinIO
- [ ] `GET /api/schemas/:slug` — отдача JSON схемы
- [ ] `GET /api/schemas` — листинг с пагинацией
- [ ] `GET /s/:slug` — OG HTML для ботов, redirect для браузеров (User-Agent detection)
- [ ] `PUT /api/schemas/:slug` + `DELETE` с edit_token
- [ ] Генерация slug (nanoid 8-12 символов, URL-safe)

**Frontend (React):**
- [ ] "Publish to Catalog" — модалка с name/description, генерация превью через `html2canvas`
- [ ] Загрузка схемы по slug (`/s/:slug` → SPA → fetch `/api/schemas/:slug` → load в canvasStore)
- [ ] Страница каталога `/catalog` — сетка карточек, пагинация
- [ ] "Fork" — загрузка чужой схемы как своей копии для редактирования
- [ ] Хранение `edit_token` в localStorage для своих схем

**Infra:**
- [ ] MinIO в Docker Compose для dev
- [ ] S3 bucket / R2 для prod
- [ ] CDN для превью-картинок

---

## TD-005: Совместное редактирование схемы (Real-time Collaboration)

**Приоритет:** Medium
**Компоненты:** apps/web, apps/server

### Описание

Несколько пользователей одновременно редактируют одну схему: видят курсоры друг друга, изменения синхронизируются в реальном времени без конфликтов. Текущая архитектура — Zustand стор с localStorage — не поддерживает многопользовательский режим.

### Подход: Yjs (CRDT)

CRDT (Conflict-free Replicated Data Types) — оптимальный выбор для совместного редактирования графов. Каждый клиент хранит локальную реплику, изменения мержатся автоматически без центрального арбитра.

```
Browser A  ──►  WebSocket Server  ◄──  Browser B
  Yjs Doc    (y-websocket relay)     Yjs Doc
  Zustand        persistence         Zustand
  React Flow                         React Flow
```

### Стек

| Слой | Технология | Назначение |
|------|-----------|------------|
| CRDT | `yjs` | Shared-документ с автоматическим мержем |
| Транспорт | `y-websocket` (Node) или Go-реализация | Relay + persistence |
| Awareness | Yjs Awareness protocol | Курсоры, имена, присутствие |
| Persistence | `y-leveldb` или PostgreSQL snapshot | Сохранение между сессиями |

### Модель данных (Yjs)

```typescript
const ydoc = new Y.Doc();
const yNodes = ydoc.getMap('nodes');   // nodeId → Y.Map (node data)
const yEdges = ydoc.getMap('edges');   // edgeId → Y.Map (edge data)
const awareness = provider.awareness;   // cursor positions, user info
```

### Ключевое изменение: инверсия потока данных

Сейчас:
```
User action → Zustand (мутация) → React (рендер) → localStorage
```

Нужно:
```
User action → Yjs Doc (мутация) → observe → Zustand (read-only проекция) → React (рендер)
```

`canvasStore.ts` перестаёт быть source-of-truth — им становится Yjs-документ. Zustand подписывается на `yNodes.observe()` / `yEdges.observe()` и обновляет своё состояние.

### Awareness (курсоры)

```typescript
awareness.setLocalStateField('user', { name, color });
awareness.setLocalStateField('cursor', { x, y });  // viewport coords
awareness.setLocalStateField('selected', nodeId);   // подсветка выделения
```

React Flow рендерит чужие курсоры поверх канваса (отдельный слой).

### Комнаты

Каждая схема — отдельная комната (`room`). URL: `sdsandbox.ru/collab/<room-id>`. При подключении клиент получает полный Yjs-документ, далее — инкрементальные обновления.

### Этапы реализации

**Этап 1 — P2P (без сервера):**
- [ ] Добавить `yjs` + `y-webrtc`
- [ ] Обёртка `YjsSyncProvider` — связывает Yjs ↔ canvasStore
- [ ] Шаринг по ссылке с room-id (WebRTC signaling через публичный сервер)
- [ ] Ограничение: 2-5 человек, нет persistence

**Этап 2 — WebSocket сервер:**
- [ ] Развернуть `y-websocket` (Node.js ~50 строк) или встроить в Go-бэкенд
- [ ] Persistence: сохранение Yjs-документа в PostgreSQL при каждом изменении
- [ ] Масштабирование: sticky sessions или Redis pub/sub между инстансами

**Этап 3 — Awareness UI:**
- [ ] Рендер курсоров других пользователей на канвасе
- [ ] Список участников (аватары/цвета)
- [ ] Подсветка выделенного чужого узла
- [ ] Индикатор «кто сейчас редактирует» на node/edge

**Этап 4 — Права доступа:**
- [ ] Роли: owner / editor / viewer (read-only)
- [ ] Приглашение по ссылке с ролью
- [ ] Требует auth на бэкенде (TD для отдельного тикета)

---

## TD-006: Визуализация реплик на узлах с интерактивным управлением

**Приоритет:** High
**Компоненты:** apps/web, packages/simulation-engine

### Описание

Реплики компонента отображаются как цветные квадраты по нижней кромке узла. Каждый квадрат — отдельная реплика со своим состоянием. Пользователь кликом может вручную включать/выключать реплики, влияя на симуляцию в реальном времени.

### Состояния реплик

```
  🟩 healthy        🟥 overloaded       ⬜ stopped         🟨 starting
  ┌──┐              ┌──┐                ┌──┐               ┌──┐
  │  │  ← норма     │  │  ← перегружен  │  │  ← выключен   │  │  ← загрузка
  └──┘              └──┘                └──┘               └──┘
```

| Состояние | Цвет | Принимает трафик | Генерирует трафик | Потребляет ресурсы |
|-----------|------|------------------|-------------------|--------------------|
| `healthy` | Зелёный | Да | Да | Да |
| `overloaded` | Красный | Да (с ошибками) | Да | Да |
| `stopped` | Серый | Нет | Нет | Да (ресурсы выделены) |
| `starting` | Жёлтый | Нет | Нет | Да |

### Переходы состояний

```
                 клик                         клик
  healthy ─────────────► stopped ─────────────► starting ───► healthy
                                                  (таймер)
  overloaded ──────────► stopped
       клик
                                   автоматически
  overloaded ─── перегрузка ──────► stopped
               (util > threshold)
```

- **Клик на зелёном/красном** → серый (мгновенная остановка)
- **Клик на сером** → жёлтый → зелёный/красный (загрузка, таймер 1-3с)
- **Автоматический crash** — при `utilization > crashThreshold` (напр. 0.98) красная реплика с вероятностью переходит в серый

### Визуализация

```
  ┌─────────────────────────────────┐
  │  ⚙️  Order Service              │
  │       1200 rps / 3000 max       │
  │                                 │
  │  🟩 🟩 🟥 ⬜ 🟨                  │  ← реплики по нижней кромке
  └─────────────────────────────────┘
```

- Квадраты ~12x12px с gap 3px, по нижней кромке узла (внутри)
- Tooltip при наведении: `Replica #3: overloaded (util: 94%)`
- Курсор pointer на кликабельных (healthy, overloaded, stopped)
- Анимация пульсации на жёлтом (starting)

### Модель данных

**simulation-engine/models.ts:**
```typescript
export type ReplicaState = 'healthy' | 'overloaded' | 'stopped' | 'starting';

export interface ReplicaInfo {
  index: number;
  state: ReplicaState;
  utilization: number;       // 0..1, текущая загрузка реплики
  startingUntilTick?: number; // тик, когда starting → healthy
}

// В ComponentModel добавить:
export interface ComponentModel {
  // ... существующие поля ...
  replicaStates: ReplicaInfo[];  // вместо скалярного `replicas: number`
}
```

**canvasStore / simulationStore:**
```typescript
// Действие пользователя: переключение реплики
toggleReplica(nodeId: string, replicaIndex: number): void;
```

### Влияние на симуляцию

- `maxRps` ноды = `maxRpsPerInstance * activeReplicas` (не все реплики, а только healthy + overloaded)
- `stopped` реплики не принимают трафик, но учитываются в стоимости
- `starting` реплики не принимают трафик, переходят в `healthy` через N тиков
- При fan-out от load balancer — трафик распределяется только по active репликам
- Crash при перегрузке: на каждом тике, если `util > 0.98`, вероятность `(util - 0.98) / 0.02` что реплика перейдёт в `stopped`

### Задачи

**Модели (simulation-engine):**
- [ ] Добавить `ReplicaState`, `ReplicaInfo` в models.ts
- [ ] Заменить скалярный `replicas` на массив `replicaStates` в ComponentModel
- [ ] В engine.ts: распределять нагрузку только по active репликам
- [ ] В engine.ts: авто-crash при `util > crashThreshold`
- [ ] В engine.ts: обработка starting → healthy по таймеру тиков
- [ ] Передавать per-replica utilization в метрики

**UI (apps/web):**
- [ ] Компонент `ReplicaBar` — ряд цветных квадратов по нижней кромке BaseNode
- [ ] Клик-обработчик: healthy/overloaded → stopped, stopped → starting
- [ ] Tooltip с номером реплики и утилизацией
- [ ] Анимация пульсации для starting (CSS/Framer Motion)
- [ ] Синхронизация toggleReplica → simulation reconfigure (what-if)

**Properties Panel:**
- [ ] Отображение количества реплик по состояниям: `3 healthy, 1 overloaded, 1 stopped`
- [ ] Кнопки «Stop All» / «Start All»
- [ ] Slider для crashThreshold (по умолчанию 0.98)

---

## TD-007: Статический анализ архитектуры (SPOF, anti-patterns, health report)

**Приоритет:** High
**Компоненты:** apps/web
**Фаза спеки:** 1 (Static Constructor) — не реализовано

### Описание

Автоматический анализ архитектуры на канвасе: обнаружение SPOF, bottleneck, anti-patterns, security gaps. Результат — Health Report с оценкой 0-100 и списком проблем. Директория `apps/web/src/analysis/rules/` создана, но правила не реализованы.

### Категории правил (из spec.md §5)

**SPOF (Single Point of Failure):**
- [ ] Единственная БД без реплик
- [ ] Один API Gateway без резервного
- [ ] Сервис с replicas=1
- [ ] Отсутствие failover для stateful-компонентов
- [ ] Всё в одной availability zone

**Bottleneck Detection:**
- [ ] Компонент с fan-in > 10
- [ ] Синхронная цепочка вызовов длиной > 3
- [ ] Компонент с utilization > 80%
- [ ] БД без read replicas при read-heavy нагрузке
- [ ] Отсутствие кэша для hot data

**Anti-Patterns:**
- [ ] Distributed monolith (все сервисы синхронно зависят друг от друга)
- [ ] Shared database (несколько сервисов пишут в одну БД)
- [ ] Chatty services (> 5 вызовов между двумя сервисами на запрос)
- [ ] God service (один сервис делает всё)
- [ ] Circular dependencies

**Security Gaps:**
- [ ] Нет auth между внутренними сервисами
- [ ] Нет rate limiting на публичном API
- [ ] Нет WAF перед API Gateway
- [ ] Нет TLS на внешних endpoint-ах

**Cost Inefficiency:**
- [ ] Over-provisioning (utilization < 20% при пиковой нагрузке)
- [ ] Дорогой storage class для cold data
- [ ] Отсутствие CDN при высоком объёме статического контента

### Health Report UI

Панель `HealthReport` (уже есть stub) отображает:
- Overall Score 0-100 с разбивкой: Reliability / Performance / Security / Cost / Scalability
- Critical issues (красные) → Warnings (жёлтые) → Suggestions (синие)
- Клик по проблеме → подсветка проблемного узла/связи на канвасе

### Задачи

- [ ] Реализовать правила в `analysis/rules/`: spof.ts, bottleneck.ts, antipattern.ts, security.ts, cost.ts
- [ ] Оркестратор `analyzer.ts` — запуск всех правил, агрегация результатов
- [ ] Генерация отчёта `report.ts` — score, категории, список проблем
- [ ] UI: панель HealthReport с визуализацией score и списком проблем
- [ ] Подсветка проблемных узлов на канвасе при клике на проблему
- [ ] Автоматический перезапуск анализа при изменении графа (debounce)

---

## TD-008: Экспорт схемы в PNG

**Приоритет:** Medium
**Компоненты:** apps/web
**Фаза спеки:** 1 (Static Constructor) — не реализовано

### Описание

Экспорт текущего состояния канваса в PNG-изображение для документации, презентаций, шаринга.

### Подход

React Flow предоставляет `toObject()` и viewport utilities. Два варианта:

1. **`@xyflow/react` + `html-to-image`** (рекомендуется) — рендерит DOM-элемент канваса в изображение
2. **`html2canvas`** — альтернатива, хуже работает с SVG

```typescript
import { toPng } from 'html-to-image';

function exportToPng() {
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
  toPng(viewport, {
    backgroundColor: '#0f172a', // dark theme bg
    width: ...,  // fit all nodes
    height: ...,
  }).then((dataUrl) => {
    const link = document.createElement('a');
    link.download = 'architecture.png';
    link.href = dataUrl;
    link.click();
  });
}
```

### Задачи

- [ ] Добавить зависимость `html-to-image`
- [ ] Функция `exportToPng()` — рендер viewport с учётом всех узлов (fitView)
- [ ] Кнопка "Export PNG" в Toolbar
- [ ] Опционально: выбор размера (1x, 2x, 4x) и фона (тёмный/светлый/прозрачный)

---

## TD-009: Sizing Calculator

**Приоритет:** Medium
**Компоненты:** apps/web, packages/simulation-engine
**Фаза спеки:** 2 (Load Simulation) — не реализовано

### Описание

Калькулятор, который по входным параметрам нагрузки (DAU, RPS, объём данных, read/write ratio) рассчитывает необходимые ресурсы: количество серверов, объём хранения, bandwidth, количество реплик БД.

### Входные параметры

| Параметр | Пример |
|----------|--------|
| DAU (Daily Active Users) | 10,000,000 |
| Requests per user per day | 50 |
| Peak multiplier | 3x |
| Avg payload size (KB) | 5 |
| Avg response size (KB) | 10 |
| Read/Write ratio | 80/20 |
| Data retention (days) | 365 |
| Avg record size (KB) | 2 |
| Growth rate (% per month) | 10 |

### Выходные расчёты

| Метрика | Формула |
|---------|---------|
| Avg RPS | `DAU * req_per_user / 86400` |
| Peak RPS | `Avg RPS * peak_multiplier` |
| Bandwidth In | `Peak RPS * payload_kb / 1024` MB/s |
| Bandwidth Out | `Peak RPS * response_kb / 1024` MB/s |
| Write RPS | `Peak RPS * write_ratio` |
| Read RPS | `Peak RPS * read_ratio` |
| Storage/year | `DAU * req_per_user * write_ratio * record_kb * 365 / 1e6` GB |
| Service instances | `Peak RPS / max_rps_per_instance` (ceil) |
| DB read replicas | `Read RPS / max_rps_per_replica` (ceil) |

### UI

Отдельная панель или модальное окно:
- Форма с входными параметрами (слайдеры + инпуты)
- Таблица результатов с автопересчётом
- Кнопка «Apply to Canvas» — автоматически выставить replicas/capacity на узлах схемы

### Задачи

- [ ] Модель расчёта: функция `calculateSizing(inputs) → SizingResult`
- [ ] UI: панель/модалка Sizing Calculator с формой и результатами
- [ ] Автопересчёт при изменении любого входного параметра
- [ ] «Apply to Canvas» — обновить config узлов (replicas, maxRps, storage) по результатам
- [ ] Привязка к курсу: Занятие 22 (Sizing), ДЗ 4

---

## TD-010: Фаза 3 — Chaos Engineering

**Приоритет:** High
**Компоненты:** packages/simulation-engine, apps/web
**Фаза спеки:** 3 (Chaos Mode)

### Текущее состояние

Движок уже умеет:
- `engine.injectFailure(nodeId)` — убивает ноду (`isAlive = false`)
- `propagateFailure()` — каскадный эффект: нагрузка перераспределяется, зависимые могут упасть
- Worker protocol: `INJECT_FAILURE` → `FAILURE_REPORT`
- `WorkerManager.injectFailure()` + `onFailureReport()` callback

Не подключено:
- `failureRate` в ComponentModel — заведён, всегда 0
- `failure_probability` в UI config контейнеров — не передаётся в движок
- ChaosPanel.tsx — пустой stub, не в табах App.tsx
- simulationStore — нет chaos-действий

### Шаг 1. Расширить типы инъекций в движке

Добавить `ChaosEvent` и обработчики в engine.ts:

| Тип инъекции | Эффект на модель | Recover |
|--|--|--|
| `kill_instance` | `isAlive = false` (уже есть) | `isAlive = true` |
| `latency_injection` | `baseLatencyMs += injectedMs` | Вернуть исходное значение |
| `network_partition` | Убрать connection из adjacency | Восстановить connection |
| `packet_loss` | Вероятность `lossRate` на ребре: запрос пропадает | Убрать lossRate |
| `cpu_spike` | `maxRps *= degradeFactor` (снизить capacity) | Вернуть исходное maxRps |

```typescript
export interface ChaosEvent {
  id: string;
  type: 'kill_instance' | 'latency_injection' | 'network_partition' | 'packet_loss' | 'cpu_spike';
  targetNode?: string;       // для node-level инъекций
  targetEdge?: string;       // "from->to" для edge-level инъекций
  params: {
    latencyMs?: number;      // для latency_injection
    lossRate?: number;       // 0..1 для packet_loss
    degradeFactor?: number;  // 0..1 для cpu_spike
  };
  injectedAtTick: number;
}
```

Worker protocol — добавить:
- `INJECT_CHAOS { event: ChaosEvent }` — применить инъекцию
- `RECOVER_CHAOS { eventId: string }` — откатить
- `CHAOS_STATE { active: ChaosEvent[] }` — текущие активные инъекции

**Файлы:** `models.ts`, `engine.ts`, `protocol.ts`, `worker.ts`, `workerManager.ts`

### Задачи

- [ ] Тип `ChaosEvent` в models.ts
- [ ] `injectChaos(event)` и `recoverChaos(eventId)` в engine
- [ ] Хранение оригинальных значений для recover (`Map<eventId, snapshot>`)
- [ ] `packet_loss` — в цикле обработки запросов: `if (Math.random() < lossRate) req.failed = true`
- [ ] `network_partition` — временное удаление ребра из adjacency + connectionMap
- [ ] Protocol messages: `INJECT_CHAOS`, `RECOVER_CHAOS`, `RECOVER_ALL`

### Шаг 2. SimulationStore: chaos state и actions

Добавить в `simulationStore.ts`:

```typescript
// State
chaosEvents: ChaosEvent[];          // активные инъекции
chaosLog: ChaosLogEntry[];          // лог всех событий с timestamp

// Actions
injectChaos(event: Omit<ChaosEvent, 'id' | 'injectedAtTick'>): void;
recoverChaos(eventId: string): void;
recoverAll(): void;
```

### Задачи

- [ ] Расширить `SimulationState` interface
- [ ] `injectChaos()` — генерация id, отправка в worker, добавление в chaosEvents
- [ ] `recoverChaos()` — отправка RECOVER, удаление из chaosEvents
- [ ] `recoverAll()` — откат всех активных инъекций
- [ ] Подписка на `onFailureReport` — запись в chaosLog

### Шаг 3. ChaosPanel UI

Заменить stub на рабочую панель. Добавить в табы App.tsx.

Структура панели:
- **Секция «Inject»** — кнопки инъекций для выделенного узла/ребра:
  - Узел: Kill Instance, +Latency (input ms), CPU Spike (slider 0.1-0.9)
  - Ребро: Network Partition, Packet Loss (slider 0-100%)
  - Без выделения: «Select a node or edge»
- **Секция «Active Faults»** — список активных инъекций с кнопкой Recover на каждой + Recover All
- **Секция «Presets»** — готовые chaos-сценарии (шаг 9)

### Задачи

- [ ] Компонент `ChaosPanel` с секциями Inject / Active / Presets
- [ ] Контекстное меню: кнопки инъекций зависят от типа выделенного элемента
- [ ] Input для latencyMs, slider для lossRate/degradeFactor
- [ ] Список активных инъекций с иконкой типа, целью и кнопкой Recover
- [ ] Добавить «Chaos» в табы нижней зоны App.tsx (рядом с Simulation / Metrics)

### Шаг 4. Визуализация на канвасе

Отображение активных инъекций прямо на графе:

| Инъекция | Визуальный эффект |
|--|--|
| `kill_instance` | Нода серая + перечёркнутая + иконка черепа |
| `latency_injection` | Оранжевый бейдж `+500ms` на ноде |
| `network_partition` | Ребро пунктирное красное + иконка разрыва |
| `packet_loss` | Ребро мерцает, бейдж `30% loss` |
| `cpu_spike` | Красный бейдж `CPU 80%↓` на ноде |

### Задачи

- [ ] Передавать `chaosEvents` в компоненты нод через simulationStore
- [ ] В BaseNode/ServiceNode/DatabaseNode: рендер overlay при активной инъекции
- [ ] В FlowEdge: стиль пунктира/мерцания при partition/packet_loss
- [ ] Бейджи с параметрами инъекции

### Шаг 5. Timeline событий

Компонент `ChaosTimeline` — хронологическая лента:

```
[0.0s]  ▶ Simulation started (constant 1000 rps)
[5.2s]  💀 Kill Instance: Order Service
[5.2s]  ⚡ Cascade: 3 nodes affected (Payment, Notification, Analytics)
[5.3s]  📈 Error rate: 0% → 34%
[12.1s] 🔧 Recover: Order Service
[14.5s] ✅ Error rate back to 0% (RTO: 9.3s, lost: 847 requests)
```

### Задачи

- [ ] Тип `ChaosLogEntry { timestamp, type, message, details }`
- [ ] Компонент `ChaosTimeline` — scroll-лента с цветными иконками
- [ ] Автоматическая запись: инъекция, cascade report, recover, метрики-переходы
- [ ] Фильтр по типу событий

### Шаг 6. Circuit Breaker

Реализовать state machine для компонента `circuit_breaker`:

```
closed ──(error rate > threshold)──► open ──(timeout)──► half_open
  ▲                                                         │
  └──────────(success rate OK)──────────────────────────────┘
              half_open ──(failure)──► open
```

В движке:
- Ребро, проходящее через circuit_breaker ноду, проверяет состояние
- `open`: все запросы мгновенно fail с reason `circuit open`
- `half_open`: пропускать N% запросов, остальные fail
- `closed`: нормальная работа

На канвасе:
- Нода circuit_breaker: зелёная (closed), красная (open), жёлтая (half_open)
- Tooltip: текущее состояние, error count, threshold

### Задачи

- [ ] `CircuitBreakerState` в models.ts: `{ state, errorCount, lastTransition, config }`
- [ ] Логика в engine.ts: трекинг error rate per-downstream, переключение состояний
- [ ] Визуализация состояния в узле circuit_breaker на канвасе
- [ ] Параметры в Properties Panel: threshold, timeout, halfOpenPercent

### Шаг 7. RTO/RPO измерение

Автоматическое измерение при inject → recover:

- **RTO** (Recovery Time Objective): время от инъекции до error rate < 1%
- **RPO** (Recovery Point Objective): количество потерянных/failed запросов за время отказа
- **MTTR** (Mean Time To Recovery): среднее RTO по всем инъекциям сессии

Отображение:
- В ChaosTimeline — при recover показать RTO и RPO
- В Chaos Report — агрегат по всей сессии

### Задачи

- [ ] Трекинг момента инъекции (tick) и момента восстановления (error rate < threshold)
- [ ] Подсчёт failed запросов между inject и recover
- [ ] Отображение RTO/RPO в timeline и active faults

### Шаг 8. Chaos Report

Автоматический отчёт по итогам chaos-сессии:

```
╔═══ CHAOS REPORT ═══════════════════════════╗
║ Experiments: 4       Duration: 120s         ║
║ System survived: 3/4  (75%)                ║
╠═════════════════════════════════════════════╣
║ ✅ Kill Order Service    RTO: 9.3s  RPO: 847║
║ ✅ +500ms on DB          Error rate: 2%     ║
║ ✅ CPU spike on Gateway  Throughput: -15%   ║
║ ❌ Network partition     Cascade failure    ║
╠═════════════════════════════════════════════╣
║ Рекомендации:                               ║
║ • Добавить circuit breaker перед DB         ║
║ • Увеличить реплики Order Service до 3      ║
║ • Добавить retry policy на partition-prone  ║
╚═════════════════════════════════════════════╝
```

### Задачи

- [ ] Агрегация: пережитые/непережитые эксперименты
- [ ] Per-experiment метрики: RTO, RPO, max error rate, throughput drop
- [ ] Генерация рекомендаций на основе результатов
- [ ] UI: модалка или панель Chaos Report
- [ ] Кнопка «Generate Report» в ChaosPanel

### Шаг 9. Предустановленные chaos-сценарии

Готовые последовательности инъекций с автоматическим выполнением:

| Сценарий | Действия |
|--|--|
| Random Kill | Убить случайную ноду, подождать 10s, recover |
| Zone Failure | Убить все ноды в одном контейнере (rack/DC) |
| Network Split | Partition между двумя группами нод |
| Gradual Degradation | +100ms → +200ms → +500ms на случайных нодах |
| Stress Test | CPU spike на всех сервисах одновременно |

```typescript
interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  steps: ChaosScenarioStep[];
}

interface ChaosScenarioStep {
  delayMs: number;             // задержка перед выполнением
  action: 'inject' | 'recover' | 'recover_all';
  event?: Omit<ChaosEvent, 'id' | 'injectedAtTick'>;
  targetSelector?: 'random_node' | 'random_edge' | 'all_in_container';
}
```

### Задачи

- [ ] Тип `ChaosScenario` и `ChaosScenarioStep`
- [ ] 5 предустановленных сценариев
- [ ] Runner: последовательное выполнение шагов с таймерами
- [ ] UI: список сценариев в ChaosPanel / Presets, кнопка Run, прогресс
- [ ] Привязка к курсу: Занятие 28 (Chaos Engineering), ДЗ 5

### Порядок реализации

```
Шаг 1 (движок)  →  Шаг 2 (store)  →  Шаг 3 (ChaosPanel UI)
                                    →  Шаг 4 (визуализация канвас)
                                    →  Шаг 5 (timeline)
                 →  Шаг 6 (circuit breaker) — параллельно с 3-5
                 →  Шаг 7 (RTO/RPO) — после шага 3
                 →  Шаг 8 (chaos report) — после шага 7
                 →  Шаг 9 (сценарии) — после шага 5
```
