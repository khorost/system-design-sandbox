# GeoIP Service — спецификация для реализации

## Назначение

Микросервис для централизованного GeoIP-lookup по IP-адресу. Заменяет встроенные MaxMind-lookup'ы в 5-7 сервисах платформы. Единственный сервис, который загружает и хранит в памяти базу MaxMind GeoLite2-City.mmdb (~70MB).

## Технологический стек

- **Go** (1.22+)
- **gRPC** — основной транспорт (порт 50051)
- **HTTP** — health/ready/reload эндпоинты (порт 8080)
- **MaxMind** — `github.com/oschwald/maxminddb-golang` для чтения mmdb
- **In-memory LRU cache** с TTL

## API

### gRPC (proto3)

```protobuf
syntax = "proto3";
package geoip.v1;
option go_package = "geoip/api/v1;geoipv1";

service GeoIPService {
  // Lookup по одному IP
  rpc Lookup(LookupRequest) returns (LookupResponse);
  // Batch lookup (до 100 IP за запрос)
  rpc BatchLookup(BatchLookupRequest) returns (BatchLookupResponse);
}

message LookupRequest {
  string ip = 1;
}

message LookupResponse {
  string ip = 1;
  string city = 2;
  string country = 3;
  string country_code = 4; // ISO 3166-1 alpha-2
  double latitude = 5;
  double longitude = 6;
  string formatted = 7;    // "City, Country" — готовая строка для хранения
  bool found = 8;
}

message BatchLookupRequest {
  repeated string ips = 1; // max 100
}

message BatchLookupResponse {
  repeated LookupResponse results = 1;
}
```

### HTTP

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | Liveness probe. 200 OK всегда |
| GET | `/ready` | Readiness probe. 200 если база загружена, 503 если нет |
| POST | `/reload` | Hot-reload базы из файла без рестарта. 200 OK / 500 при ошибке |
| GET | `/metrics` | Prometheus-метрики |
| GET | `/stats` | JSON: cache size, hit rate, db build date, uptime |

## Кеширование

- **LRU-кеш** в оперативной памяти, ключ — IP-адрес (string), значение — результат lookup.
- **TTL** — настраивается через env (по умолчанию 5 минут). По истечении TTL запись вытесняется.
- **Max size** — настраивается (по умолчанию 50 000 записей, ~10MB RAM).
- При вызове `/reload` кеш полностью сбрасывается.
- Private/reserved IP (10.x, 172.16-31.x, 192.168.x, 127.x, ::1) — возвращать пустой ответ (`found=false`), не класть в кеш.

## Загрузка базы

- При старте читает файл по пути из `GEOIP_DB_PATH`.
- Если файл отсутствует — сервис стартует, но `/ready` возвращает 503. Lookup возвращает `found=false`.
- `/reload` — перечитывает файл с диска. Позволяет обновлять базу без рестарта (например, CronJob скачивает новый файл и вызывает reload).

## Переменные окружения

| Переменная | Default | Описание |
|---|---|---|
| `GRPC_PORT` | `50051` | Порт gRPC-сервера |
| `HTTP_PORT` | `8080` | Порт HTTP (health, metrics, reload) |
| `GEOIP_DB_PATH` | `/data/GeoLite2-City.mmdb` | Путь к файлу базы |
| `CACHE_MAX_SIZE` | `50000` | Макс. записей в LRU-кеше |
| `CACHE_TTL` | `5m` | TTL записей в кеше |
| `LOG_LEVEL` | `info` | Уровень логирования (debug/info/warn/error) |
| `LOG_STRUCT` | `true` | Структурированный JSON-лог |

## Prometheus-метрики

| Метрика | Тип | Описание |
|---|---|---|
| `geoip_lookups_total` | counter | Общее количество lookup-запросов |
| `geoip_cache_hits_total` | counter | Cache hits |
| `geoip_cache_misses_total` | counter | Cache misses |
| `geoip_cache_size` | gauge | Текущий размер кеша |
| `geoip_lookup_duration_seconds` | histogram | Латентность lookup (без учёта gRPC overhead) |
| `geoip_db_loaded` | gauge | 1 если база загружена, 0 если нет |
| `geoip_db_build_epoch` | gauge | Timestamp сборки загруженной базы |

## Dockerfile

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /geoip-service ./cmd/server

FROM alpine:3.21
RUN apk add --no-cache ca-certificates
COPY --from=builder /geoip-service /geoip-service
EXPOSE 50051 8080
CMD ["/geoip-service"]
```

## Kubernetes-манифест (пример)

Сервис деплоится в shared-namespace `sds-shared`, доступен для обоих окружений (prod/beta).

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: geoip-service
  namespace: sds-shared
spec:
  replicas: 2
  selector:
    matchLabels:
      app: geoip-service
  template:
    spec:
      initContainers:
        - name: fetch-geoip
          image: minio/mc:latest
          command: ["sh", "-c"]
          args:
            - |
              mc alias set store "$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" --api S3v4 &&
              mc cp store/geoip/GeoLite2-City.mmdb /data/GeoLite2-City.mmdb
          envFrom:
            - secretRef:
                name: minio-credentials
          volumeMounts:
            - name: geoip-data
              mountPath: /data
      containers:
        - name: geoip-service
          image: khorost/geoip-service:latest
          ports:
            - containerPort: 50051
              name: grpc
            - containerPort: 8080
              name: http
          env:
            - name: GEOIP_DB_PATH
              value: /data/GeoLite2-City.mmdb
          volumeMounts:
            - name: geoip-data
              mountPath: /data
              readOnly: true
          resources:
            requests:
              cpu: 50m
              memory: 128Mi
            limits:
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 3
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            periodSeconds: 30
      volumes:
        - name: geoip-data
          emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: geoip-service
  namespace: sds-shared
spec:
  selector:
    app: geoip-service
  ports:
    - name: grpc
      port: 50051
      targetPort: 50051
    - name: http
      port: 8080
      targetPort: 8080
```

Клиенты подключаются: `geoip-service.sds-shared.svc.cluster.local:50051`

## CronJob для обновления базы

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: geoip-db-updater
  namespace: sds-shared
spec:
  schedule: "0 4 * * 3"  # среда, 04:00
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: updater
              image: curlimages/curl:latest
              command: ["sh", "-c"]
              args:
                - |
                  # Скачать свежую базу в MinIO (предполагается, что MaxMind license key в секрете)
                  # Затем вызвать hot-reload на всех репликах
                  curl -sf -X POST http://geoip-service.sds-shared.svc.cluster.local:8080/reload
          restartPolicy: OnFailure
```

## Структура проекта

```
geoip-service/
├── cmd/server/
│   └── main.go              # Точка входа: загрузка конфига, старт gRPC + HTTP
├── internal/
│   ├── config/config.go     # Чтение env-переменных
│   ├── geoip/
│   │   ├── lookup.go        # Обёртка над maxminddb, Open/Close/City/Reload
│   │   └── lookup_test.go
│   ├── cache/
│   │   ├── lru.go           # LRU с TTL, потокобезопасный
│   │   └── lru_test.go
│   ├── server/
│   │   ├── grpc.go          # gRPC-хендлеры (Lookup, BatchLookup)
│   │   └── http.go          # HTTP-хендлеры (health, ready, reload, stats, metrics)
│   └── metrics/metrics.go   # Prometheus-метрики
├── api/v1/
│   ├── geoip.proto
│   └── geoip.pb.go          # сгенерированный код
├── Dockerfile
├── go.mod
├── go.sum
├── Makefile                  # proto-gen, build, test, lint
└── .golangci.yml
```

## Поведение и граничные случаи

- **Невалидный IP** → `found=false`, без ошибки gRPC (не `InvalidArgument`), чтобы не ломать batch.
- **База не загружена** → все lookup возвращают `found=false`. Логировать warning при первом запросе.
- **BatchLookup > 100 IP** → `InvalidArgument`.
- **Concurrent reload** — `sync.RWMutex`: lookup берёт RLock, reload берёт Lock. Lookup не блокируется между собой.
- **Graceful shutdown** — drain gRPC connections, завершить in-flight запросы (deadline 5s).

## Интеграция с sds-server

В `apps/server` (system-design-sandbox) заменить прямой вызов `geoip.Lookup.City(ip)` на gRPC-клиент:

```go
// internal/geoip/client.go
type Client struct {
    conn   *grpc.ClientConn
    client geoipv1.GeoIPServiceClient
}

func NewClient(addr string) (*Client, error) {
    conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil { return nil, err }
    return &Client{conn: conn, client: geoipv1.NewGeoIPServiceClient(conn)}, nil
}

func (c *Client) City(ctx context.Context, ip string) string {
    resp, err := c.client.Lookup(ctx, &geoipv1.LookupRequest{Ip: ip})
    if err != nil || !resp.Found { return "" }
    return resp.Formatted
}
```

Env-переменная: `GEOIP_SERVICE_ADDR=geoip-service.sds-shared.svc.cluster.local:50051`

Если переменная пуста — fallback на локальный mmdb (обратная совместимость с docker-compose).
