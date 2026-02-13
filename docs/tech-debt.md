# Tech Debt / Backlog

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
