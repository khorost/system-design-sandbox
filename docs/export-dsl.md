# DSL Export/Import Format

System Design Sandbox поддерживает компактный текстовый формат `.sds` (System Design Schema) — удобный для чтения, редактирования в текстовом редакторе и хранения в git-диффах. В отличие от JSON, DSL не сохраняет позиции — при импорте компоненты автоматически раскладываются по канвасу.

## Быстрый старт

1. **Экспорт:** File → Export DSL → сохраняется `architecture-2026-02-14.sds`
2. **Импорт:** File → Import DSL → выбрать `.sds` или `.txt` файл

## Когда что использовать

| | JSON | DSL |
|---|---|---|
| Позиции компонентов | сохраняются | авто-layout при импорте |
| Человекочитаемость | средняя | высокая |
| Редактирование вручную | неудобно | удобно |
| Git-диффы | шумные | чистые |
| Полнота данных | полная | полная (кроме позиций) |
| Расширение файла | `.json` | `.sds` |

## Синтаксис

### Комментарии

```
# Это комментарий
service "My App" as my_app {  # Инлайн-комментарий тоже работает
}
```

### Блок defaults (опциональный)

Задаёт значения по умолчанию для всех связей. Если не указан, используются:
- protocol: `REST`
- timeout: `5000ms`
- bandwidth: `1000mbps`

```
defaults {
  protocol gRPC
  timeout 3000ms
  bandwidth 500mbps
}
```

### Объявление компонентов

```
<componentType> "<Label>" as <alias> {
  <key> <value>
  <key> <value>
  tags <tag>=<weight> <tag>=<weight>
}
```

- **componentType** — тип компонента (`service`, `postgresql`, `redis_cache`, `kafka` и др.)
- **Label** — отображаемое имя (в кавычках)
- **alias** — короткое имя для ссылок в связях (латиница, цифры, `_`)
- Внутри блока — пары `ключ значение` для настроек компонента
- Строковые значения с пробелами нужно оборачивать в кавычки: `region "us-east-1"`

```
service "User Service" as user_service {
  replicas 3
  cpu 2000
  memory 2048
}

postgresql "Users DB" as users_db {
  replicas 2
  storage 100
  maxConnections 200
}

redis_cache "Session Cache" as session_cache {
  memory 512
  ttl 3600
}
```

### Вложенные компоненты (контейнеры)

Контейнеры содержат другие компоненты внутри фигурных скобок:

```
kubernetes_pod "Backend Pod" as backend_pod {

  service "App" as app {
    replicas 2
    cpu 1000
  }

  redis_cache "Local Cache" as local_cache {
    memory 256
  }
}
```

### Связи (connections)

```
<source_alias> -> <target_alias> <latency>ms [protocol] [routing] [extras]
```

Связи перечисляются после блока `# --- connections ---`:

```
# --- connections ---
gateway -> user_service  5ms
user_service -> users_db  2ms  TCP
gateway -> session_cache  1ms
```

#### Протокол

Указывается после задержки. Допустимые значения: `REST`, `gRPC`, `WebSocket`, `GraphQL`, `async`, `TCP`, `NVMe`, `SATA`, `iSCSI`, `NFS`.

Если протокол совпадает со значением из `defaults` — он опускается.

```
gateway -> service_a  10ms  gRPC
gateway -> service_b  15ms          # REST по умолчанию, можно не писать
```

#### Правила маршрутизации

Описывают распределение трафика по тегам:

```
lb -> backend  5ms  [primary *0.8 -> secondary, fallback *0.2]
```

Формат: `[<tag> *<weight> -> <outTag>, ...]`
- `tag` — метка правила
- `weight` — доля трафика (0.0–1.0)
- `outTag` — целевой тег (опционально)

#### Timeout и bandwidth

Если отличаются от defaults:

```
gateway -> slow_service  200ms  timeout=30000ms  bandwidth=100mbps
```

## Полный пример

```
# Architecture Schema (DSL)

defaults {
  protocol gRPC
  timeout 3000ms
}

api_gateway "API Gateway" as gateway {
  replicas 2
  cpu 1000
  memory 1024
}

service "User Service" as user_service {
  replicas 3
  cpu 2000
  memory 2048
}

service "Order Service" as order_service {
  replicas 2
  cpu 1000
  memory 1024
}

postgresql "Users DB" as users_db {
  replicas 2
  storage 100
  maxConnections 200
}

postgresql "Orders DB" as orders_db {
  storage 500
}

redis_cache "Session Cache" as session_cache {
  memory 512
  ttl 3600
}

kafka "Events" as events {
  partitions 12
  replicas 3
}

kubernetes_pod "Worker Pod" as worker_pod {

  worker "Order Processor" as order_processor {
    replicas 4
    cpu 500
  }
}

# --- connections ---
gateway -> user_service  5ms
gateway -> order_service  8ms
gateway -> session_cache  1ms  REST  timeout=1000ms
user_service -> users_db  2ms  TCP
order_service -> orders_db  3ms  TCP
order_service -> events  1ms  async
events -> order_processor  2ms  async
gateway -> order_service  8ms  [primary *0.7 -> secondary, canary *0.3]
```

## Правила импорта

- Файл парсится построчно, пустые строки и комментарии игнорируются.
- Компоненты автоматически раскладываются на канвасе (auto-layout по топологии связей).
- Неизвестные `componentType` — предупреждение, не ошибка.
- Импорт **заменяет** текущую схему целиком.
- Значения конфигурации — числа, строки, булевы (`true`/`false`).
- Суффиксы `ms` и `mbps` в значениях задержки/bandwidth автоматически убираются при парсинге.

## Правила генерации alias

При экспорте alias генерируется автоматически из label:
- Приводится к нижнему регистру
- Пробелы и спецсимволы заменяются на `_`
- При совпадении добавляется суффикс `_1`, `_2` и т.д.

Примеры:
- `"API Gateway"` → `api_gateway`
- `"Users DB"` → `users_db`
- `"Redis (primary)"` → `redis_primary_`
- Два компонента `"Cache"` → `cache`, `cache_1`
