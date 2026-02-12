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

Тестовый фреймворк пока не настроен.

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

## Серверная часть (Go)

Бэкенд на Go в `apps/server`. БД — PostgreSQL, схемы применяются через миграции.

## TypeScript

Strict mode включён во всех пакетах. Module resolution: `bundler`. Target: ES2022. Пакеты генерируют декларации (`.d.ts`) в `dist/`.
