# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Команды сборки и разработки

Монорепозиторий на pnpm, оркестрация через Turbo.

```bash
pnpm dev        # Запуск всех dev-серверов (Vite HMR для веб-приложения)
pnpm build      # Сборка всех пакетов (сначала packages, потом apps)
pnpm lint       # Линтинг всех пакетов (ESLint)
pnpm clean      # Очистка артефактов сборки

# Только веб-приложение
cd apps/web
pnpm dev        # Vite dev server
pnpm build      # tsc -b && vite build
pnpm lint       # eslint .
pnpm preview    # Превью продакшн-сборки
```

Тесты: Go — `go test ./...` в `apps/server`, фронтенд — Vitest (`npx vitest run` в `apps/web`).

## Архитектура

**Структура монорепо:**
- `apps/web` — React 19 + Vite SPA, основное фронтенд-приложение
- `apps/server` — серверная часть на Go
- `packages/simulation-engine` — ядро DES (Discrete Event Simulation), модели латентности и отказов
- `packages/component-library` — 36+ определений системных компонентов в 11 категориях. Messaging: Kafka (brokers), RabbitMQ (nodes), NATS (nodes). Каждый компонент может определять `defaultConfig` с `tagDistribution`, `cacheRules` или `responseRules`.
- `packages/scenario-pack` — сценарии уроков курса OTUS с критериями успеха

**Ключевые технологии:** React Flow (`@xyflow/react`) — визуальный редактор графов, Zustand — управление состоянием, Tailwind CSS — стили, Framer Motion — анимации, Recharts — графики метрик.

**Стейт-сторы** (Zustand, в `apps/web/src/store/`):
- `canvasStore` — состояние графа (узлы, связи, выделение), сохранение/загрузка через localStorage
- `simulationStore` — состояние симуляции и метрики

**Компоненты канваса** (`apps/web/src/components/canvas/`):
- `Canvas.tsx` — обёртка над React Flow
- `nodes/` — 7 типов кастомных узлов (Service, Database, Cache, Queue, Gateway, LoadBalancer, Generic) наследуют `BaseNode`; `ContainerNode` (Datacenter, Rack, Docker, K8s, VM) — перемещение за заголовок, тело пропускает canvas pan (`pointer-events: none` на wrapper)
- `edges/` — рендереры связей
- `controls/` — тулбар и палитра компонентов

**Боковые панели** (`apps/web/src/components/panels/`) — Properties (компонент/соединение), Traffic (per-tag трафик + cache stats для CDN), Simulation, Metrics, Cost. Правая панель скроллится при нехватке места.

**Анализатор архитектуры** (`apps/web/src/analysis/`) — проверки на основе правил (обнаружение SPOF, архитектурные антипаттерны, скоринг здоровья). Правила в `analysis/rules/`.

**Утилиты** (`apps/web/src/utils/`):
- `nodeTags.ts` — `getNodeTags(node)` (извлечение явных тегов узла), `getConnectionTags(source, target)` (пересечение тегов для соединения). Wildcard-узлы (без явных тегов) принимают любой трафик.

**Симуляция** — клиентский DES-движок (`packages/simulation-engine/`). Модель латентности: `base + queue_delay`, где `queue_delay = base * (util / (1 - util))` (модель очереди M/M/c). Каскадное распространение отказов.

Тег-ориентированная маршрутизация:
- **Клиенты** (`tagDistribution`) — описывают генерируемый трафик (теги + вес + размер запроса).
- **CDN** (`cacheRules`) — per-tag cache hit ratio и ёмкость. При cache hit запрос не идёт к origin.
- **Storage/S3** (`responseRules`) — per-tag размер ответа (web=2KB, content=400KB).
- **Все остальные узлы** — wildcard, принимают любой тег.
- **Соединения** — показывают только пересечение тегов source/target, балансируют весами (weight=0 блокирует тег).
- `supportedTags` на `ComponentModel` фильтрует трафик в `resolveNextHops`.

Метрики симуляции: `NodeTagTraffic` (per-tag RPS/bandwidth), `CacheTagStats` (hits/misses/hitRate per CDN per tag), `EdgeTagTraffic`.

**Сценарии** (`apps/web/src/scenarios/`, `packages/scenario-pack/`) — сценарии уроков, организованные по модулям курса с уровнями сложности и валидацией критериев успеха.

## Спецификация проекта

`docs/spec.md` — подробная спецификация (на русском): палитра компонентов, режимы симуляции, определения сценариев, правила анализатора и 4-фазный роадмап MVP. Текущий статус: Фаза 1 (Статический конструктор).

## Git-flow

- **`develop`** — основная ветка разработки. PR мержатся сюда. Push триггерит сборку образа `:latest`.
- **`main`** — protected branch (запрещён force-push и удаление). Push триггерит сборку образа `:stable`.
- **Теги `v*`** — создаются на `main` для фиксации версий. Собирают образ с тегом `:version`.
- **Feature-ветки** — создаются от `develop`, мержатся обратно в `develop` через PR.
- **Деплой** — через ArgoCD Image Updater (отслеживает digest в registry). CI только собирает и пушит образы.

## Домен

- Продакшн: `sdsandbox.ru` (push в `main`, образ `:stable`)
- Beta: `beta.sdsandbox.ru` (push в `develop`, образ `:latest`)

## Деплой и инфраструктура

### ArgoCD

Конфигурация в отдельном репозитории: `github.com/khorost/sdsb-argocd`.

- **Helm chart** `charts/sdsandbox` — два компонента: web (nginx + SPA) + server (Go API)
- **Environments**: `envs/prod/values.yaml`, `envs/beta/values.yaml`
- **Namespaces**: `sds-prod`, `sds-beta`
- **Image Updater**: digest strategy, git write-back (автоматический деплой при новом образе)
- **Sealed Secrets** (Bitnami, namespace-wide scope): `nexus-registry` (pull secret), `sealed-sdsb-server-secrets`

### Docker-образы

- Registry: `images.khorost.tech/sdsandbox/sdsandbox-web`, `images.khorost.tech/sdsandbox/sdsandbox-server`
- Docker Hub (только на тегах): `khorost/sdsandbox-web`, `khorost/sdsandbox-server`

### K8s маршрутизация (Ingress cilium)

| Path | Backend |
|---|---|
| `/api/` | server |
| `/auth/` | server |
| `/metrics` | server |
| `/ws` | server |
| `/` | web |

### Health probes

- **Server**: `GET /healthz` — зарегистрирован вне `slogRequestLogger`, не попадает в логи
- **Web**: `GET /healthz` — nginx `return 200`, `access_log off`

## Серверная часть (Go)

Бэкенд на Go в `apps/server`. БД — PostgreSQL, схемы применяются через миграции.

### Аутентификация

Сессионная cookie (`session_id`, HttpOnly, Secure, SameSite=Strict, Path=/). JWT не используется — удалён полностью.

- **Middleware** `RequireAuth(redisAuth)` — читает cookie `session_id`, валидирует через `RedisAuth.ValidateAndTouchSession()`.
- **Сессии** хранятся в Redis как хеши (`s:{sessionID}`) с полями `uid`, `ip`, `geo`, `cc`, `cat`, `lat`. TTL = sliding window (`SESSION_EXPIRY`, default 7d).
- **Touch throttling** — `lat` и TTL обновляются не чаще чем раз в `SESSION_TOUCH_INTERVAL` (default 20s), чтобы снизить нагрузку на Redis при частых API-запросах.
- **Логин** — magic link или код (`POST /auth/send-code` → `POST /auth/verify-code`). Ответ: `{ user }` + cookie `session_id`.
- **Logout** — `POST /auth/logout` (за auth middleware), удаляет сессию из Redis, очищает cookie.
- **Фронтенд** — `apiFetch()` с `credentials: 'include'`, без управления токенами. Инициализация через `GET /api/v1/users/me`.

### GeoIP

Геолокация по IP через внешний GeoIP-сервис (gRPC primary + REST fallback). Клиент: `internal/geoip/geoip.go`.

- **gRPC**: timeout 500ms, proto в `internal/geoip/proto/`
- **REST**: timeout 1s, fallback при ошибке gRPC
- **При старте** логирует тип подключения и версию БД (`logDBInfo`)
- **Результат**: `Result{Formatted, CountryCode}` — хранится в Redis (`geo`, `cc`) и `session_log`
- **Конфиг**: `GEOIP_GRPC_ADDR`, `GEOIP_REST_URL` (оба пустые = geo отключён)

### Метрики и подсчёт пользователей

Collector (`internal/metrics/collector.go`) периодически сканирует Redis-сессии и WebSocket Hub:

- `METRICS_TICK` (default 40s) — интервал сканирования Redis (SCAN `s:*`).
- `activeWindow` (5 мин) — порог для классификации сессий: active (lat < 5 мин) vs frozen.
- **UsersOnline** — уникальные authenticated uid, подключённые по WebSocket.
- **UsersOffline** — uid из Redis-сессий, не подключённые по WebSocket.
- **AnonRecent** — уникальные анонимные visitor label, подключённые по WebSocket.

Prometheus-метрики: `sds_platform_sessions_active`, `sds_platform_sessions_frozen`, `sds_platform_users_online`, `sds_platform_users_offline`, `sds_platform_anon_recent`, `sds_platform_http_requests_total`.

### Переменные окружения

| Переменная | Default | Описание |
|---|---|---|
| `SESSION_EXPIRY` | `168h` (7d) | TTL сессии (sliding window). Fallback: `JWT_REFRESH_EXPIRY` |
| `SESSION_TOUCH_INTERVAL` | `20s` | Минимальный интервал между обновлениями `lat` в Redis |
| `METRICS_TICK` | `40s` | Интервал сканирования Redis коллектором метрик |
| `GEOIP_GRPC_ADDR` | — | gRPC endpoint GeoIP-сервиса (приоритетный) |
| `GEOIP_REST_URL` | — | REST endpoint GeoIP-сервиса (fallback) |

## Обратная совместимость экспорта/импорта схем

Формат JSON-файлов архитектурных схем (`ArchitectureSchema`, version `1.0`) — публичный контракт. Пользователи хранят экспортированные файлы в git, обмениваются ими между браузерами и окружениями.

**Строгие правила:**
- Любой ранее экспортированный `.json`-файл ДОЛЖЕН успешно импортироваться в новой версии приложения.
- Нельзя удалять или переименовывать существующие поля схемы. Новые поля — только как опциональные.
- При изменении формата — bumping `version` и поддержка миграции со всех предыдущих версий.
- `importSchema()` должен толерантно обрабатывать отсутствующие опциональные поля (подставлять дефолты).
- Неизвестные `componentType` — предупреждение, не ошибка (forward compatibility).
- Экспорт не должен включать рантайм-состояние React Flow (`selected`, `dragging`, `measured` и т.д.) — только данные, влияющие на восстановление схемы.

## TypeScript

Strict mode включён во всех пакетах. Module resolution: `bundler`. Target: ES2022. Пакеты генерируют декларации (`.d.ts`) в `dist/`.
