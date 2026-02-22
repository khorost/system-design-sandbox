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
- `packages/component-library` — 36+ определений системных компонентов в 10 категориях с моделями ценообразования
- `packages/scenario-pack` — сценарии уроков курса OTUS с критериями успеха

**Ключевые технологии:** React Flow (`@xyflow/react`) — визуальный редактор графов, Zustand — управление состоянием, Tailwind CSS — стили, Framer Motion — анимации, Recharts — графики метрик.

**Стейт-сторы** (Zustand, в `apps/web/src/store/`):
- `canvasStore` — состояние графа (узлы, связи, выделение), сохранение/загрузка через localStorage
- `simulationStore` — состояние симуляции и метрики

**Компоненты канваса** (`apps/web/src/components/canvas/`):
- `Canvas.tsx` — обёртка над React Flow
- `nodes/` — 7 типов кастомных узлов (Service, Database, Cache, Queue, Gateway, LoadBalancer, Generic), все наследуют `BaseNode`
- `edges/` — рендереры связей
- `controls/` — тулбар и палитра компонентов

**Боковые панели** (`apps/web/src/components/panels/`) — 6 панелей: Properties, Simulation, Metrics, Chaos, Cost, HealthReport

**Анализатор архитектуры** (`apps/web/src/analysis/`) — проверки на основе правил (обнаружение SPOF, архитектурные антипаттерны, скоринг здоровья). Правила в `analysis/rules/`.

**Симуляция** — клиентский DES-движок. Модель латентности: `base + queue_delay`, где `queue_delay = base * (util / (1 - util))` (модель очереди M/M/c). Каскадное распространение отказов. Сейчас stub-реализация (Фаза 2).

**Сценарии** (`apps/web/src/scenarios/`, `packages/scenario-pack/`) — сценарии уроков, организованные по модулям курса с уровнями сложности и валидацией критериев успеха.

## Спецификация проекта

`docs/spec.md` — подробная спецификация (на русском): палитра компонентов, режимы симуляции, определения сценариев, правила анализатора и 4-фазный роадмап MVP. Текущий статус: Фаза 1 (Статический конструктор).

## Git-flow

- **`develop`** — основная ветка разработки. PR мержатся сюда. Push триггерит beta-деплой (`:latest` → `beta.sdsandbox.ru`).
- **`main`** — protected branch (запрещён force-push и удаление). Push триггерит prod-деплой (`:stable` → `sdsandbox.ru`).
- **Теги `v*`** — создаются на `main` для фиксации версий. Собирают образ с тегом `:version`, но деплой не запускают.
- **Feature-ветки** — создаются от `develop`, мержатся обратно в `develop` через PR.

## Домен

- Продакшн: `sdsandbox.ru` (push в `main`, образ `:stable`)
- Beta: `beta.sdsandbox.ru` (push в `develop`, образ `:latest`)

## Серверная часть (Go)

Бэкенд на Go в `apps/server`. БД — PostgreSQL, схемы применяются через миграции.

### Аутентификация

Сессионная cookie (`session_id`, HttpOnly, Secure, SameSite=Strict, Path=/). JWT не используется — удалён полностью.

- **Middleware** `RequireAuth(redisAuth)` — читает cookie `session_id`, валидирует через `RedisAuth.ValidateAndTouchSession()`.
- **Сессии** хранятся в Redis как хеши (`s:{sessionID}`) с полями `uid`, `ip`, `geo`, `cat`, `lat`. TTL = sliding window (`SESSION_EXPIRY`, default 7d).
- **Touch throttling** — `lat` и TTL обновляются не чаще чем раз в `SESSION_TOUCH_INTERVAL` (default 20s), чтобы снизить нагрузку на Redis при частых API-запросах.
- **Логин** — magic link или код (`POST /auth/send-code` → `POST /auth/verify-code`). Ответ: `{ user }` + cookie `session_id`.
- **Logout** — `POST /auth/logout` (за auth middleware), удаляет сессию из Redis, очищает cookie.
- **Фронтенд** — `apiFetch()` с `credentials: 'include'`, без управления токенами. Инициализация через `GET /api/v1/users/me`.

### Метрики и подсчёт пользователей

Collector (`internal/metrics/collector.go`) периодически сканирует Redis-сессии и WebSocket Hub:

- `METRICS_TICK` (default 40s) — интервал сканирования Redis (SCAN `s:*`).
- `activeWindow` (5 мин) — порог для классификации сессий: active (lat < 5 мин) vs frozen.
- **UsersOnline** — уникальные authenticated uid, подключённые по WebSocket.
- **UsersOffline** — uid из Redis-сессий, не подключённые по WebSocket.
- **AnonRecent** — уникальные анонимные visitor label, подключённые по WebSocket.

Prometheus-метрики: `sds_platform_sessions_active`, `sds_platform_sessions_frozen`, `sds_platform_users_online`, `sds_platform_users_offline`, `sds_platform_anon_recent`, `sds_platform_http_requests_total`.

### Переменные окружения (сессии и метрики)

| Переменная | Default | Описание |
|---|---|---|
| `SESSION_EXPIRY` | `168h` (7d) | TTL сессии (sliding window). Fallback: `JWT_REFRESH_EXPIRY` |
| `SESSION_TOUCH_INTERVAL` | `20s` | Минимальный интервал между обновлениями `lat` в Redis |
| `METRICS_TICK` | `40s` | Интервал сканирования Redis коллектором метрик |

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
