# JSON Export/Import Format

System Design Sandbox экспортирует архитектурные схемы в формате JSON — полный снимок с позициями, настройками компонентов и параметрами связей. Файл `.json` — это основной формат хранения и обмена схемами.

## Быстрый старт

1. **Экспорт:** File → Export JSON → сохраняется `architecture-2026-02-14.json`
2. **Импорт:** File → Import JSON → выбрать `.json` файл

Экспортированные файлы можно хранить в git, передавать коллегам, импортировать в другом браузере.

## Структура файла

```json
{
  "version": "1.0",
  "metadata": {
    "name": "My Architecture",
    "createdAt": "2026-02-14T10:30:00.000Z",
    "updatedAt": "2026-02-14T10:30:00.000Z",
    "exportedAt": "2026-02-14T10:30:00.000Z"
  },
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `version` | string | да | Версия формата (сейчас `"1.0"`) |
| `metadata` | object | нет | Метаданные схемы |
| `metadata.name` | string | нет | Название архитектуры |
| `metadata.createdAt` | string | нет | ISO-дата создания |
| `metadata.updatedAt` | string | нет | ISO-дата последнего изменения |
| `metadata.exportedAt` | string | нет | ISO-дата экспорта |
| `nodes` | array | да | Массив компонентов |
| `edges` | array | да | Массив связей |

## Nodes (компоненты)

```json
{
  "id": "node-1739520600000",
  "type": "serviceNode",
  "position": { "x": 250, "y": 100 },
  "data": {
    "label": "API Gateway",
    "componentType": "api_gateway",
    "category": "network",
    "icon": "🔌",
    "config": {
      "replicas": 3,
      "cpu": 2000,
      "memory": 2048
    }
  }
}
```

### Обязательные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | Уникальный идентификатор |
| `position` | `{ x, y }` | Позиция на канвасе (пиксели) |
| `data.label` | string | Отображаемое имя компонента |
| `data.componentType` | string | Тип компонента (см. ниже) |

### Опциональные поля

| Поле | Тип | Описание |
|------|-----|----------|
| `type` | string | Тип узла React Flow (`serviceNode`, `databaseNode` и др.) |
| `data.category` | string | Категория (`network`, `compute`, `storage` и др.) |
| `data.icon` | string | Emoji-иконка |
| `data.config` | object | Параметры компонента (replicas, cpu, memory, ttl и др.) |
| `parentId` | string | ID родительского контейнера (для вложенных компонентов) |
| `extent` | string | `"parent"` — ограничить перемещение внутри контейнера |
| `style` | object | CSS-стили (обычно `width`/`height` для контейнеров) |
| `width`, `height` | number | Размеры узла |
| `zIndex` | number | Z-порядок отрисовки |

### Типы компонентов (componentType)

**Clients:** `web_client`, `mobile_client`, `external_api`

**Network:** `external_service`, `api_gateway`, `load_balancer`, `cdn`, `dns`, `waf`

**Compute:** `service`, `serverless_function`, `worker`, `cron_job`

**Database:** `postgresql`, `mysql`, `mongodb`, `cassandra`, `clickhouse`, `s3`, `etcd`, `elasticsearch`

**Cache:** `redis`, `memcached`

**Messaging:** `kafka`, `rabbitmq`, `event_bus`, `nats`

**Storage:** `local_ssd`, `nvme`, `network_disk`, `nfs`

**Reliability:** `circuit_breaker`, `rate_limiter`, `retry_policy`, `health_check`, `failover_controller`

**Security:** `auth_service`, `tls_terminator`, `secret_manager`

**Observability:** `logging`, `metrics_collector`, `tracing`, `alerting`

**Infrastructure:** `datacenter`, `rack`, `docker_container`, `kubernetes_pod`, `vm_instance`, `region`, `availability_zone`, `vpc`

> **Forward compatibility:** Неизвестные `componentType` при импорте вызывают предупреждение в консоли, но **не ошибку**. Такой узел отрисовывается как `serviceNode` (базовый прямоугольник), панель свойств не показывает настраиваемых параметров. При этом `componentType` сохраняется в данных узла — при повторном экспорте он будет записан как есть. Это позволяет обмениваться схемами между версиями приложения с разным набором компонентов без потери данных.

## Edges (связи)

```json
{
  "id": "e-node-1-node-2-1739520600000",
  "source": "node-1",
  "target": "node-2",
  "type": "flow",
  "data": {
    "protocol": "REST",
    "latencyMs": 50,
    "bandwidthMbps": 1000,
    "timeoutMs": 5000,
    "routingRules": [
      { "tag": "primary", "weight": 0.8, "outTag": "secondary" },
      { "tag": "fallback", "weight": 0.2 }
    ]
  }
}
```

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `id` | string | да | Уникальный идентификатор |
| `source` | string | да | ID узла-источника |
| `target` | string | да | ID узла-получателя |
| `type` | string | нет | Тип связи (`"flow"`) |
| `data.protocol` | string | нет | Протокол: `REST`, `gRPC`, `WebSocket`, `GraphQL`, `async`, `TCP`, `NVMe`, `SATA`, `iSCSI`, `NFS` |
| `data.latencyMs` | number | нет | Задержка в миллисекундах |
| `data.bandwidthMbps` | number | нет | Пропускная способность в Мбит/с |
| `data.timeoutMs` | number | нет | Таймаут в миллисекундах |
| `data.routingRules` | array | нет | Правила маршрутизации (tag-based routing) |
| `style` | object | нет | CSS-стили линии |

### Значения по умолчанию

Если `data` не указан или поля отсутствуют:

```json
{
  "protocol": "REST",
  "latencyMs": 1,
  "bandwidthMbps": 1000,
  "timeoutMs": 5000
}
```

## Полный пример

```json
{
  "version": "1.0",
  "metadata": {
    "name": "My Architecture",
    "createdAt": "2026-02-14T10:30:00.000Z",
    "updatedAt": "2026-02-14T10:30:00.000Z",
    "exportedAt": "2026-02-14T10:30:00.000Z"
  },
  "nodes": [
    {
      "id": "node-1",
      "type": "gatewayNode",
      "position": { "x": 300, "y": 50 },
      "data": {
        "label": "API Gateway",
        "componentType": "api_gateway",
        "category": "network",
        "icon": "🔌",
        "config": { "replicas": 2, "cpu": 1000, "memory": 1024 }
      }
    },
    {
      "id": "node-2",
      "type": "serviceNode",
      "position": { "x": 100, "y": 250 },
      "data": {
        "label": "User Service",
        "componentType": "service",
        "category": "compute",
        "icon": "⚙️",
        "config": { "replicas": 3, "cpu": 2000, "memory": 2048 }
      }
    },
    {
      "id": "node-3",
      "type": "databaseNode",
      "position": { "x": 100, "y": 450 },
      "data": {
        "label": "Users DB",
        "componentType": "postgresql",
        "category": "database",
        "icon": "🐘",
        "config": { "replicas": 2, "storage": 100, "maxConnections": 200 }
      }
    },
    {
      "id": "node-4",
      "type": "cacheNode",
      "position": { "x": 500, "y": 250 },
      "data": {
        "label": "Session Cache",
        "componentType": "redis",
        "category": "cache",
        "icon": "🔴",
        "config": { "memory": 512, "ttl": 3600 }
      }
    }
  ],
  "edges": [
    {
      "id": "e-1-2",
      "source": "node-1",
      "target": "node-2",
      "data": {
        "protocol": "gRPC",
        "latencyMs": 5,
        "bandwidthMbps": 1000,
        "timeoutMs": 3000
      }
    },
    {
      "id": "e-2-3",
      "source": "node-2",
      "target": "node-3",
      "data": {
        "protocol": "TCP",
        "latencyMs": 2,
        "bandwidthMbps": 5000,
        "timeoutMs": 5000
      }
    },
    {
      "id": "e-1-4",
      "source": "node-1",
      "target": "node-4",
      "data": {
        "protocol": "REST",
        "latencyMs": 1,
        "bandwidthMbps": 1000,
        "timeoutMs": 1000
      }
    }
  ]
}
```

## Правила импорта

- Файл должен быть валидным JSON с полями `version`, `nodes[]`, `edges[]`.
- Каждый узел обязан содержать `id`, `position`, `data.componentType`, `data.label`.
- Отсутствующие опциональные поля заполняются значениями по умолчанию.
- Связи со ссылками на несуществующие узлы отбрасываются с предупреждением.
- Неизвестные `componentType` — предупреждение, не ошибка.
- Импорт **заменяет** текущую схему целиком (а не объединяет).

## Обратная совместимость

Формат `version: "1.0"` — публичный контракт. Любой ранее экспортированный файл будет импортироваться в новых версиях приложения. Новые поля добавляются только как опциональные.
