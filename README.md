# System Design Sandbox

Интерактивный конструктор для обучения системному дизайну: визуальный редактор архитектур с симуляцией нагрузки в реальном времени.

**Домен:** [sdsandbox.ru](https://sdsandbox.ru)

## Что это

Студенты строят распределённые системы из готовых компонентов, запускают симуляцию нагрузки и наблюдают поведение: латентность, пропускную способность, каскадные отказы, стоимость. Всё работает в браузере — DES-движок крутится в WebWorker.

## Возможности

### Визуальный редактор

- **50+ компонентов** в 11 категориях — клиенты, сеть, compute, БД, кеши, очереди, хранилища, reliability, security, observability, инфраструктура
- **Drag-and-drop** палитра с табами по категориям
- **Контейнерная иерархия** — Datacenter → Rack → VM/K8s Pod → Docker Container, с автоматическим вложением при перетаскивании
- **Протоколы соединений** — REST, gRPC, WebSocket, GraphQL, async, TCP; дисковые: NVMe, SATA, iSCSI, NFS
- **Маршрутизация по тегам** — трафик размечается тегами (read/write/admin), на каждом ребре настраиваются веса и перезапись тегов (outTag)
- **Иерархическая латентность** — задержки автоматически считаются по цепочке контейнеров (Docker +0.1ms, Rack +1ms, DC +5ms, cross-DC +50ms)
- **Auto-save** в localStorage с debounce 500ms

### Симуляция нагрузки (DES)

- **Модель M/M/c** — `latency = base + base * (util / (1 - util))`, при перегрузке → отказ
- **Генерация запросов** — пуассоновский процесс с per-client RPS
- **Профили нагрузки** — constant, ramp-up, spike (3x всплески)
- **Fan-out маршрутизация** — веса > 1 порождают несколько запросов
- **Каскадные отказы** — отказ ноды нагружает зависимых, те могут тоже упасть
- **WebWorker** — тик 100ms, не блокирует UI

### Метрики в реальном времени

- **Латентность** — P50, P95, P99
- **Throughput** — запросов/сек
- **Error Rate** — % отказов
- **Утилизация** — per-node (цветовая индикация: зелёный/жёлтый/красный)
- **Per-edge трафик** — анимированные рёбра, толщина по латентности, скорость по RPS
- **EMA-сглаживание** — 1s / 5s / 30s окна
- **Графики** — Recharts с выбором окна 30s / 60s / 5m

### What-If режим

Меняйте параметры (реплики, bandwidth, маршруты) во время работающей симуляции — метрики обновятся в реальном времени с debounce 300ms.

### Оценка стоимости

Приблизительные модели ценообразования для 15+ типов компонентов (compute, DB, кеш, очереди, storage, CDN, LB, serverless) — разбивка по категориям и суммарная стоимость в месяц.

### Панель трафика

Выбор типа нагрузки по клиентам, отображение per-tag RPS, суммарный RPS системы.

## Компоненты

| Категория | Компоненты |
|-----------|-----------|
| Clients | Web Client, Mobile Client, External API |
| Network | API Gateway, Load Balancer, CDN, DNS, WAF |
| Compute | Service, Serverless Function, Worker, Cron Job |
| Database | PostgreSQL, MongoDB, Cassandra, etcd, Elasticsearch |
| Cache | Redis, Memcached |
| Messaging | Kafka, RabbitMQ, Event Bus |
| Storage | S3, NFS, Local SSD, NVMe, Network Disk |
| Reliability | Circuit Breaker, Rate Limiter, Health Check |
| Security | Auth Service |
| Observability | Logging, Metrics Collector, Tracing |
| Infrastructure | Docker, K8s Pod, VM, Rack, Datacenter |

## Стек

- **Frontend:** React 19, TypeScript (strict), Vite, Tailwind CSS, Framer Motion
- **Canvas:** React Flow (`@xyflow/react`)
- **State:** Zustand
- **Charts:** Recharts
- **Simulation:** собственный DES-движок в WebWorker
- **Backend:** Go (PostgreSQL) — в разработке
- **Monorepo:** pnpm + Turborepo
- **CI/CD:** GitHub Actions → Docker → nginx

## Структура

```
apps/
  web/                  # React SPA
  server/               # Go backend (в разработке)
packages/
  simulation-engine/    # DES-движок: модели, граф, метрики
  component-library/    # Определения 50+ компонентов, ценообразование
  scenario-pack/        # Сценарии уроков (в разработке)
docs/
  spec.md               # Полная спецификация проекта
```

## Разработка

```bash
pnpm install            # Установить зависимости
pnpm dev                # Dev-серверы (Vite HMR)
pnpm build              # Сборка всех пакетов
pnpm lint               # Линтинг
```

## Дорожная карта

| Фаза | Статус | Описание |
|------|--------|----------|
| 1. Статический конструктор | ✅ | Палитра, канвас, свойства, сохранение, стоимость |
| 2. Симуляция нагрузки | ✅ | DES-движок, метрики, графики, what-if, теги |
| 3. Chaos Engineering | ⏳ | Kill instance/zone, network partition, latency injection |
| 4. Сценарии и геймификация | ⏳ | 15+ уроков, шаблоны, health score, leaderboard |
