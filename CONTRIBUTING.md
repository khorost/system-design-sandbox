# Contributing

Спасибо за интерес к проекту! Ниже — правила и рекомендации для контрибьюторов.

## Требования

- **Node.js** >= 22
- **pnpm** >= 9
- **Git**

## Быстрый старт

```bash
git clone https://github.com/khorost/system-design-sandbox.git
cd system-design-sandbox
pnpm install
pnpm dev
```

Dev-сервер запустится на [http://localhost:5173](http://localhost:5173).

## Структура проекта

| Директория | Описание |
|---|---|
| `apps/web` | React 19 SPA — фронтенд-приложение |
| `apps/server` | Go-бэкенд (PostgreSQL) |
| `packages/simulation-engine` | DES-движок: модели, граф, метрики |
| `packages/component-library` | Определения 50+ компонентов, ценообразование |
| `packages/scenario-pack` | Сценарии уроков |
| `docs/` | Спецификация, tech debt |

## Команды

```bash
pnpm dev          # Запуск dev-серверов (Vite HMR)
pnpm build        # Сборка всех пакетов (packages -> apps)
pnpm lint         # ESLint по всем пакетам
pnpm test         # Запуск тестов (Vitest)
pnpm clean        # Очистка артефактов сборки
```

## Процесс работы

1. Создайте ветку от `main`:
   ```bash
   git checkout -b feature/my-feature
   ```
2. Внесите изменения, убедитесь что проходят проверки:
   ```bash
   pnpm lint && pnpm build
   ```
3. Создайте коммит с понятным сообщением (см. [Формат коммитов](#формат-коммитов))
4. Откройте Pull Request в `main`

## Формат коммитов

Используем краткие сообщения на английском языке, описывающие суть изменений:

```
Add user authentication to API gateway
Fix cascading failure detection in simulation engine
Update component library with new storage types
```

Для tech debt задач добавляйте тег:
```
Add input validation with NumberInput component (TD-017)
```

## Код-стайл

- **TypeScript strict mode** включён во всех пакетах
- **ESLint** — запускайте `pnpm lint` перед коммитом
- **Импорты** — отсортированы автоматически (eslint-plugin-simple-import-sort)
- **Tailwind CSS** — для стилей, никакого CSS-in-JS
- **Zustand** — для управления состоянием, сторы в `apps/web/src/store/`

## Архитектурные правила

### Обратная совместимость схем

Формат JSON-файлов архитектурных схем (`ArchitectureSchema`, version `1.0`) — публичный контракт:

- Ранее экспортированные `.json`-файлы **должны** успешно импортироваться в новой версии
- Нельзя удалять или переименовывать существующие поля
- Новые поля — **только опциональные** с дефолтами
- Неизвестные `componentType` — предупреждение, не ошибка

### Компоненты

- Новые типы компонентов добавляются в `packages/component-library`
- UI-представление узлов — в `apps/web/src/components/canvas/nodes/`
- Все узлы наследуют `BaseNode`

### Состояние

- Канвас (узлы, связи, выделение) — `canvasStore`
- Симуляция и метрики — `simulationStore`
- Не смешивайте сторы между собой

## CI/CD

При пуше в `main` автоматически запускается:

1. **Lint** — ESLint проверка
2. **Build & Deploy Web** — Docker-образ, деплой на sdsandbox.ru
3. **Build & Deploy Server** — Docker-образ Go-бэкенда

CI запускает только затронутые пайплайны (web или server) на основе изменённых файлов.

## Tech Debt

Список технического долга и задач ведётся в [docs/tech-debt.md](docs/tech-debt.md). При обнаружении нового долга — добавляйте запись с номером TD-NNN.

## Вопросы

Если что-то непонятно — создайте [Issue](https://github.com/khorost/system-design-sandbox/issues) на GitHub.
