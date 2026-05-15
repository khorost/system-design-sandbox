# GeoIP Service Client — Design Spec

## Контекст

Переход с локальной MaxMind `.mmdb` базы на внешний GeoIP-сервис (gRPC + REST).
Подготовка к ArgoCD: сервис уже задеплоен в Kubernetes, нужно переключить Go-бэкенд на него.

## Конфигурация

Новые env-переменные:

| Переменная | Пример | Описание |
|---|---|---|
| `GEOIP_GRPC_ADDR` | `geoip-prod-geoip-service-grpc.khorost:50051` | gRPC endpoint (приоритетный) |
| `GEOIP_REST_URL` | `http://geoip-prod-geoip-service.khorost:8080` | REST endpoint (fallback) |

Логика:
- Оба заданы → gRPC primary, REST fallback
- Только REST → работает через REST
- Только gRPC → работает через gRPC, без fallback
- Ничего не задано → geo disabled (как сейчас при отсутствии `MAXMIND_GEOLITE2`)

Удаляется: `MAXMIND_GEOLITE2`, зависимость `github.com/oschwald/maxminddb-golang`.

## Интерфейс пакета `internal/geoip`

```go
type Result struct {
    Formatted   string // "Moscow, Russia"
    CountryCode string // "RU"
}

type Client struct { ... }

func New(grpcAddr, restURL string) (*Client, error)
func (c *Client) Lookup(ctx context.Context, ip string) Result
func (c *Client) Close()
```

- `New` подключается к gRPC (если задан), проверяет REST (если задан).
- При инициализации вызывает `GetDBInfo` (gRPC) или `GET /api/v1/db-info` (REST) и логирует:
  - Тип подключения (`grpc`, `rest`, `grpc+rest`)
  - Версию БД (`db_type`, `build_date`)
- `Lookup` возвращает zero `Result` при любой ошибке. Ошибки логируются внутри.
- `Close` закрывает gRPC-соединение.

## Транспорт и fallback

- gRPC timeout: **500ms** per request
- REST timeout: **1s** per request
- Стратегия: простой timeout + fallback (per-request)
  - Если gRPC задан — пробуем gRPC с timeout 500ms
  - При ошибке/timeout и если REST задан — пробуем REST
  - Если только один транспорт — используем его без fallback

## Protobuf

Генерация Go-кода из `docs/geoip.proto` в `internal/geoip/proto/`.
Используем `protoc-gen-go` + `protoc-gen-go-grpc`.

Proto-пакет: `geoip.v1`, Go-пакет: `geoipv1`.

## Хранение данных сессии

### Redis-хеш `s:{sessionID}`

Добавляется поле `cc` (country code, ISO 3166-1 alpha-2).
Поле `geo` остаётся — хранит `formatted` строку.

### Структура `SessionData` (auth)

```go
type SessionData struct {
    UserID       string
    IP           string
    Geo          string // "Moscow, Russia"
    CountryCode  string // "RU"
    CreatedAt    time.Time
    LastActiveAt time.Time
}
```

### `session_log`

Если `SESSION_LOG_ENABLED` — поле `geo` остаётся как есть (строка `formatted`).
`country_code` добавляется отдельным полем в `SessionLogEntry` и в таблицу (миграция).

## Затрагиваемые файлы

| Файл | Изменение |
|---|---|
| `internal/geoip/geoip.go` | Полная перезапись: Client с gRPC/REST |
| `internal/geoip/proto/` | Новая директория: сгенерированный Go-код из geoip.proto |
| `internal/config/config.go` | `MaxMindPath` → `GeoIP GeoIPConfig{GRPCAddr, RESTURL}` |
| `internal/handler/auth.go` | `*geoip.Lookup` → `*geoip.Client`, `.City(ip)` → `.Lookup(ctx, ip)` |
| `internal/handler/router.go` | Обновить тип параметра и конструктор |
| `internal/auth/redis_auth.go` | Поле `cc` в Redis-хеше при создании/чтении сессии |
| `cmd/server/main.go` | `geoip.Open()` → `geoip.New()`, `defer .Close()` |
| `go.mod` | `-maxminddb-golang`, `+google.golang.org/grpc`, `+google.golang.org/protobuf` |
| `.env.example` | `GEOIP_GRPC_ADDR`, `GEOIP_REST_URL` вместо `MAXMIND_GEOLITE2` |
| `migrations/007_session_log_country_code.sql` | `ALTER TABLE session_log ADD COLUMN country_code VARCHAR(2)` |

## Что НЕ делаем

- Кеширование на стороне клиента (сервис уже кеширует, LRU 50k, TTL 5 мин)
- Circuit breaker (overkill для текущего use case — lookup при логине)
- Retry logic (timeout + fallback достаточно)
- Расширение API сессий (возвращаем `country_code` в существующих ответах, новых endpoint'ов нет)