# GeoIP Service — Integration Guide

## Overview

GeoIP Service определяет геолокацию по IP-адресу (город, страна, координаты) на базе MaxMind GeoLite2-City. Доступен по gRPC и REST.

## Endpoints

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/lookup?ip=<IP>` | Геолокация по указанному IP |
| `GET` | `/api/v1/myip` | Геолокация вызывающего (по X-Forwarded-For / RemoteAddr) |
| `POST` | `/api/v1/batch-lookup` | Пакетный запрос (до 100 IP) |
| `GET` | `/api/v1/db-info` | Информация о загруженной базе |
| `GET` | `/ready` | Readiness probe (200 если БД загружена) |
| `GET` | `/health` | Liveness probe |

### gRPC API

Сервис: `geoip.v1.GeoIPService`

| Method | Request | Response | Description |
|--------|---------|----------|-------------|
| `Lookup` | `LookupRequest{ip}` | `LookupResponse` | Геолокация по указанному IP |
| `MyIP` | `MyIPRequest{}` | `LookupResponse` | Геолокация вызывающего (по peer IP) |
| `BatchLookup` | `BatchLookupRequest{ips}` | `BatchLookupResponse` | Пакетный запрос (до 100 IP) |
| `GetDBInfo` | `DBInfoRequest{}` | `DBInfoResponse` | Информация о базе |

Proto-файл: `app/api/v1/geoip.proto`

## Адреса подключения

### Из Kubernetes (внутри кластера)

| Протокол | Адрес | Порт |
|----------|-------|------|
| REST | `http://geoip-prod-geoip-service.khorost:8080` | 8080 |
| gRPC | `geoip-prod-geoip-service-grpc.khorost:50051` | 50051 |

Beta-окружение:

| Протокол | Адрес | Порт |
|----------|-------|------|
| REST | `http://geoip-beta-geoip-service.khorost-beta:8080` | 8080 |
| gRPC | `geoip-beta-geoip-service.khorost-beta:50051` | 50051 (ClusterIP, expose не включён) |

### Из внешней сети

| Протокол | Адрес | Порт | TLS |
|----------|-------|------|-----|
| REST | `https://geoip.khorost.tech` | 443 | Yes (через Ingress) |
| gRPC | `192.168.71.143` | 50051 | No (plaintext, LoadBalancer) |

REST через Ingress корректно пробрасывает реальный IP клиента (X-Forwarded-For). gRPC через LoadBalancer видит IP пира (pod network), поэтому `MyIP` для gRPC полезен только внутри кластера.

## Форматы данных

### LookupResponse (REST JSON)

```json
{
  "ip": "193.42.125.233",
  "city": "Moscow",
  "country": "Russia",
  "country_code": "RU",
  "latitude": 55.7484,
  "longitude": 37.6175,
  "formatted": "Moscow, Russia",
  "found": true
}
```

Если IP не найден или приватный — `found: false`, остальные поля пусты.

### BatchLookup (REST)

Request:
```json
POST /api/v1/batch-lookup
Content-Type: application/json

{"ips": ["8.8.8.8", "1.1.1.1", "192.168.1.1"]}
```

Response:
```json
{
  "results": [
    {"ip": "8.8.8.8", "city": "...", "country": "...", "found": true},
    {"ip": "1.1.1.1", "city": "...", "country": "...", "found": true},
    {"ip": "192.168.1.1", "found": false}
  ]
}
```

### DBInfoResponse

```json
{
  "db_type": "GeoLite2-City",
  "build_epoch": 1747612800,
  "build_date": "2026-05-19",
  "loaded": true
}
```

## Примеры подключения

### Go — gRPC (внутри кластера)

```go
import (
    "context"
    "log"

    pb "github.com/khorost/geoip/api/v1"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"
)

func main() {
    conn, err := grpc.NewClient(
        "geoip-prod-geoip-service-grpc.khorost:50051",
        grpc.WithTransportCredentials(insecure.NewCredentials()),
    )
    if err != nil {
        log.Fatal(err)
    }
    defer conn.Close()

    client := pb.NewGeoIPServiceClient(conn)

    // Lookup по IP
    resp, err := client.Lookup(context.Background(), &pb.LookupRequest{Ip: "8.8.8.8"})
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("%s -> %s (%s)", resp.Ip, resp.Formatted, resp.CountryCode)

    // Batch
    batch, err := client.BatchLookup(context.Background(), &pb.BatchLookupRequest{
        Ips: []string{"8.8.8.8", "1.1.1.1"},
    })
    if err != nil {
        log.Fatal(err)
    }
    for _, r := range batch.Results {
        log.Printf("%s -> %s", r.Ip, r.Formatted)
    }
}
```

### Go — REST (внутри кластера)

```go
import (
    "encoding/json"
    "fmt"
    "net/http"
    "net/url"
)

type GeoIPResult struct {
    IP          string  `json:"ip"`
    City        string  `json:"city"`
    Country     string  `json:"country"`
    CountryCode string  `json:"country_code"`
    Latitude    float64 `json:"latitude"`
    Longitude   float64 `json:"longitude"`
    Formatted   string  `json:"formatted"`
    Found       bool    `json:"found"`
}

func LookupIP(ip string) (*GeoIPResult, error) {
    u := fmt.Sprintf("http://geoip-prod-geoip-service.khorost:8080/api/v1/lookup?ip=%s",
        url.QueryEscape(ip))
    resp, err := http.Get(u)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()

    var result GeoIPResult
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }
    return &result, nil
}
```

### curl — из внешней сети

```bash
# Lookup по IP
curl "https://geoip.khorost.tech/api/v1/lookup?ip=8.8.8.8"

# Мой IP
curl "https://geoip.khorost.tech/api/v1/myip"

# Batch
curl -X POST "https://geoip.khorost.tech/api/v1/batch-lookup" \
  -H "Content-Type: application/json" \
  -d '{"ips": ["8.8.8.8", "1.1.1.1"]}'

# Статус базы
curl "https://geoip.khorost.tech/api/v1/db-info"
```

### grpcurl — из внешней сети

```bash
# Lookup по IP
grpcurl -plaintext -proto geoip.proto \
  -d '{"ip": "8.8.8.8"}' \
  192.168.71.143:50051 geoip.v1.GeoIPService/Lookup

# Batch
grpcurl -plaintext -proto geoip.proto \
  -d '{"ips": ["8.8.8.8", "1.1.1.1"]}' \
  192.168.71.143:50051 geoip.v1.GeoIPService/BatchLookup
```

## Рекомендации

- **gRPC** — для сервис-к-сервису внутри кластера (низкая latency, типизация, batch)
- **REST** — для фронтенда, внешних интеграций, отладки
- **MyIP** — REST-версия для определения геолокации посетителя сайта (через Ingress с X-Forwarded-For)
- **Приватные IP** (10.x, 172.16-31.x, 192.168.x, loopback) возвращают `found: false` без обращения к базе
- **Кеширование** — сервис кеширует результаты (LRU, 50k записей, TTL 5 мин). Клиентский кеш не обязателен
- **Лимит batch** — максимум 100 IP за запрос
