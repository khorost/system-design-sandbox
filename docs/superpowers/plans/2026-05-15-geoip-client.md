# GeoIP Service Client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить локальную MaxMind БД на клиент к внешнему GeoIP-сервису (gRPC primary + REST fallback), добавить country_code в сессии.

**Architecture:** Пакет `internal/geoip` переписывается: вместо `maxminddb.Reader` — gRPC/REST клиент. Protobuf-код генерируется из `docs/geoip.proto`. При инициализации запрашивается `DBInfo` для логирования. Fallback: gRPC timeout 500ms → REST 1s.

**Tech Stack:** Go 1.25, `google.golang.org/grpc`, `google.golang.org/protobuf`, `protoc-gen-go`, `protoc-gen-go-grpc`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `internal/geoip/proto/geoip.proto` | Create | Копия proto-файла для генерации |
| `internal/geoip/proto/geoip.pb.go` | Generate | Protobuf messages |
| `internal/geoip/proto/geoip_grpc.pb.go` | Generate | gRPC client stub |
| `internal/geoip/geoip.go` | Rewrite | Client: New, Lookup, Close, gRPC+REST transport |
| `internal/config/config.go` | Modify | GeoIPConfig, убрать MaxMindPath |
| `internal/auth/redis.go` | Modify | SessionData + country_code, Redis field `cc` |
| `internal/model/model.go` | Modify | SessionLogEntry + CountryCode |
| `internal/storage/session_log.go` | Modify | INSERT/SELECT с country_code |
| `internal/handler/auth.go` | Modify | Использовать geoip.Client вместо geoip.Lookup |
| `internal/handler/router.go` | Modify | Тип параметра geo |
| `internal/handler/session.go` | Modify | country_code в API-ответе |
| `cmd/server/main.go` | Modify | geoip.New() вместо geoip.Open() |
| `migrations/007_session_log_country_code.sql` | Create | ALTER TABLE |
| `.env.example` | Modify | Новые env-переменные |
| `go.mod` | Modify | Зависимости |

---

### Task 1: Protobuf — генерация Go-кода

**Files:**
- Create: `apps/server/internal/geoip/proto/geoip.proto`
- Generate: `apps/server/internal/geoip/proto/geoip.pb.go`
- Generate: `apps/server/internal/geoip/proto/geoip_grpc.pb.go`

- [ ] **Step 1: Скопировать proto-файл**

Создать `apps/server/internal/geoip/proto/geoip.proto` с корректным `go_package`:

```proto
syntax = "proto3";
package geoip.v1;
option go_package = "github.com/system-design-sandbox/server/internal/geoip/proto";

service GeoIPService {
  rpc Lookup(LookupRequest) returns (LookupResponse);
  rpc BatchLookup(BatchLookupRequest) returns (BatchLookupResponse);
  rpc MyIP(MyIPRequest) returns (LookupResponse);
  rpc GetDBInfo(DBInfoRequest) returns (DBInfoResponse);
}

message LookupRequest {
  string ip = 1;
}

message LookupResponse {
  string ip = 1;
  string city = 2;
  string country = 3;
  string country_code = 4;
  double latitude = 5;
  double longitude = 6;
  string formatted = 7;
  bool found = 8;
}

message BatchLookupRequest {
  repeated string ips = 1;
}

message BatchLookupResponse {
  repeated LookupResponse results = 1;
}

message MyIPRequest {}

message DBInfoRequest {}

message DBInfoResponse {
  string db_type = 1;
  int64  build_epoch = 2;
  string build_date = 3;
  bool   loaded = 4;
}
```

- [ ] **Step 2: Добавить gRPC-зависимости в go.mod**

```bash
cd apps/server
go get google.golang.org/grpc@latest
go get google.golang.org/protobuf@latest
```

- [ ] **Step 3: Сгенерировать Go-код из proto**

```bash
cd apps/server
protoc \
  --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  internal/geoip/proto/geoip.proto
```

Ожидаемые файлы:
- `internal/geoip/proto/geoip.pb.go`
- `internal/geoip/proto/geoip_grpc.pb.go`

- [ ] **Step 4: Проверить компиляцию**

```bash
cd apps/server && go build ./internal/geoip/proto/
```

Expected: BUILD OK

- [ ] **Step 5: Удалить maxminddb-golang из go.mod**

```bash
cd apps/server
go mod edit -droprequire github.com/oschwald/maxminddb-golang
go mod tidy
```

- [ ] **Step 6: Commit**

```bash
cd apps/server
git add internal/geoip/proto/ go.mod go.sum
git commit -m "feat(geoip): protobuf и gRPC зависимости для GeoIP сервиса"
```

---

### Task 2: GeoIP Client — gRPC + REST с fallback

**Files:**
- Rewrite: `apps/server/internal/geoip/geoip.go`

- [ ] **Step 1: Написать новый geoip.go**

```go
package geoip

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	pb "github.com/system-design-sandbox/server/internal/geoip/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

type Result struct {
	Formatted   string
	CountryCode string
}

type Client struct {
	grpcConn   *grpc.ClientConn
	grpcClient pb.GeoIPServiceClient
	restURL    string
	httpClient *http.Client
}

func New(grpcAddr, restURL string) (*Client, error) {
	if grpcAddr == "" && restURL == "" {
		slog.Warn("geoip: no GEOIP_GRPC_ADDR or GEOIP_REST_URL set, geo lookups disabled")
		return nil, nil
	}

	c := &Client{
		restURL: restURL,
		httpClient: &http.Client{
			Timeout: 1 * time.Second,
		},
	}

	if grpcAddr != "" {
		conn, err := grpc.NewClient(grpcAddr,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err != nil {
			slog.Warn("geoip: failed to create gRPC client, will use REST only", "addr", grpcAddr, "error", err)
		} else {
			c.grpcConn = conn
			c.grpcClient = pb.NewGeoIPServiceClient(conn)
		}
	}

	c.logDBInfo()
	return c, nil
}

func (c *Client) Close() {
	if c == nil {
		return
	}
	if c.grpcConn != nil {
		_ = c.grpcConn.Close()
	}
}

func (c *Client) Lookup(ctx context.Context, ip string) Result {
	if c == nil {
		return Result{}
	}

	if c.grpcClient != nil {
		r, err := c.lookupGRPC(ctx, ip)
		if err == nil {
			return r
		}
		slog.Debug("geoip: gRPC lookup failed, trying REST", "ip", ip, "error", err)
	}

	if c.restURL != "" {
		r, err := c.lookupREST(ctx, ip)
		if err == nil {
			return r
		}
		slog.Warn("geoip: REST lookup failed", "ip", ip, "error", err)
	}

	return Result{}
}

func (c *Client) lookupGRPC(ctx context.Context, ip string) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()

	resp, err := c.grpcClient.Lookup(ctx, &pb.LookupRequest{Ip: ip})
	if err != nil {
		return Result{}, err
	}
	if !resp.Found {
		return Result{}, nil
	}
	return Result{
		Formatted:   resp.Formatted,
		CountryCode: resp.CountryCode,
	}, nil
}

func (c *Client) lookupREST(ctx context.Context, ip string) (Result, error) {
	u := fmt.Sprintf("%s/api/v1/lookup?ip=%s", c.restURL, url.QueryEscape(ip))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return Result{}, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("geoip REST: status %d", resp.StatusCode)
	}

	var body struct {
		Formatted   string `json:"formatted"`
		CountryCode string `json:"country_code"`
		Found       bool   `json:"found"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return Result{}, err
	}
	if !body.Found {
		return Result{}, nil
	}
	return Result{
		Formatted:   body.Formatted,
		CountryCode: body.CountryCode,
	}, nil
}

func (c *Client) logDBInfo() {
	if c == nil {
		return
	}

	transport := "rest"
	if c.grpcClient != nil && c.restURL != "" {
		transport = "grpc+rest"
	} else if c.grpcClient != nil {
		transport = "grpc"
	}

	if c.grpcClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		info, err := c.grpcClient.GetDBInfo(ctx, &pb.DBInfoRequest{})
		if err == nil {
			slog.Info("geoip: connected",
				"transport", transport,
				"db_type", info.DbType,
				"build_date", info.BuildDate,
				"loaded", info.Loaded,
			)
			return
		}
		slog.Debug("geoip: gRPC GetDBInfo failed, trying REST", "error", err)
	}

	if c.restURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.restURL+"/api/v1/db-info", nil)
		if err == nil {
			resp, err := c.httpClient.Do(req)
			if err == nil {
				defer resp.Body.Close()
				var info struct {
					DBType    string `json:"db_type"`
					BuildDate string `json:"build_date"`
					Loaded    bool   `json:"loaded"`
				}
				if json.NewDecoder(resp.Body).Decode(&info) == nil {
					slog.Info("geoip: connected",
						"transport", transport,
						"db_type", info.DBType,
						"build_date", info.BuildDate,
						"loaded", info.Loaded,
					)
					return
				}
			}
		}
	}

	slog.Warn("geoip: configured but could not fetch DB info", "transport", transport)
}
```

- [ ] **Step 2: Проверить компиляцию пакета**

```bash
cd apps/server && go build ./internal/geoip/
```

Expected: BUILD OK

- [ ] **Step 3: Commit**

```bash
git add apps/server/internal/geoip/geoip.go
git commit -m "feat(geoip): клиент gRPC+REST с fallback для GeoIP сервиса"
```

---

### Task 3: Config — новые переменные, убрать MaxMindPath

**Files:**
- Modify: `apps/server/internal/config/config.go` (lines 11-22, 178-184)
- Modify: `apps/server/.env.example` (lines 54-57)

- [ ] **Step 1: Обновить config.go — структура**

В `config.go` заменить поле `MaxMindPath` на `GeoIP`:

```go
// В struct Config заменить:
//   MaxMindPath          string
// на:
type GeoIPConfig struct {
	GRPCAddr string
	RESTURL  string
}

type Config struct {
	DatabaseURL          string
	ServerPort           string
	Redis                RedisConfig
	Session              SessionConfig
	SMTP                 SMTPConfig
	RateLimit            RateLimitConfig
	PublicURL            string
	ReferralFieldEnabled bool
	GeoIP                GeoIPConfig
	SessionLogEnabled    bool
}
```

- [ ] **Step 2: Обновить config.go — загрузка**

В функции `Load()` заменить строку:

```go
MaxMindPath:          os.Getenv("MAXMIND_GEOLITE2"),
```

на:

```go
GeoIP: GeoIPConfig{
    GRPCAddr: os.Getenv("GEOIP_GRPC_ADDR"),
    RESTURL:  os.Getenv("GEOIP_REST_URL"),
},
```

- [ ] **Step 3: Обновить .env.example**

Заменить секцию GeoIP:

```
# --- GeoIP --------------------------------------------------------------------
# Адреса GeoIP-сервиса. gRPC — приоритетный, REST — fallback.
# Если оба пусты — geo-lookups отключены.
GEOIP_GRPC_ADDR=geoip-prod-geoip-service-grpc.khorost:50051
GEOIP_REST_URL=http://geoip-prod-geoip-service.khorost:8080
```

- [ ] **Step 4: Проверить компиляцию**

```bash
cd apps/server && go build ./internal/config/
```

Expected: BUILD OK

- [ ] **Step 5: Commit**

```bash
git add apps/server/internal/config/config.go apps/server/.env.example
git commit -m "feat(config): GEOIP_GRPC_ADDR + GEOIP_REST_URL вместо MAXMIND_GEOLITE2"
```

---

### Task 4: SessionData + Redis — поле country_code

**Files:**
- Modify: `apps/server/internal/auth/redis.go` (lines 26-35, 222-227, 234-248, 260-266, 275-282, 311-318, 396-401)

- [ ] **Step 1: Добавить CountryCode в SessionData**

В `redis.go` строка 30, после `Geo string`:

```go
type SessionData struct {
	UserID       string
	IP           string
	Geo          string
	CountryCode  string
	CreatedAt    string
	LastActiveAt string
}
```

- [ ] **Step 2: Добавить константу поля Redis**

После `fGeo = "geo"` (строка 225):

```go
const (
	fUserID       = "uid"
	fIP           = "ip"
	fGeo          = "geo"
	fCountryCode  = "cc"
	fCreatedAt    = "cat"
	fLastActiveAt = "lat"
)
```

- [ ] **Step 3: Обновить CreateSession — записывать cc**

В `CreateSession` (строка 237), добавить поле в HSet map:

```go
pipe.HSet(ctx, key, map[string]interface{}{
    fUserID:       data.UserID,
    fIP:           data.IP,
    fGeo:          data.Geo,
    fCountryCode:  data.CountryCode,
    fCreatedAt:    data.CreatedAt,
    fLastActiveAt: data.LastActiveAt,
})
```

- [ ] **Step 4: Обновить GetSession — читать cc**

В `GetSession` (строка 260):

```go
return &SessionData{
    UserID:       m[fUserID],
    IP:           m[fIP],
    Geo:          m[fGeo],
    CountryCode:  m[fCountryCode],
    CreatedAt:    m[fCreatedAt],
    LastActiveAt: m[fLastActiveAt],
}, nil
```

- [ ] **Step 5: Обновить SessionInfoItem + ListUserSessionsFull**

Добавить `CountryCode` в `SessionInfoItem` (строка 275):

```go
type SessionInfoItem struct {
	SessionID    string
	IP           string
	Geo          string
	CountryCode  string
	CreatedAt    string
	LastActiveAt string
	Current      bool
}
```

И в `ListUserSessionsFull` (строка 311):

```go
sessions = append(sessions, SessionInfoItem{
    SessionID:    ids[i],
    IP:           m[fIP],
    Geo:          m[fGeo],
    CountryCode:  m[fCountryCode],
    CreatedAt:    m[fCreatedAt],
    LastActiveAt: m[fLastActiveAt],
    Current:      ids[i] == currentSessionID,
})
```

- [ ] **Step 6: Обновить ValidateAndTouchSession — читать cc**

Найти второе место, где собирается `SessionData` (около строки 396):

```go
return &SessionData{
    UserID:       m[fUserID],
    IP:           m[fIP],
    Geo:          m[fGeo],
    CountryCode:  m[fCountryCode],
    CreatedAt:    m[fCreatedAt],
    LastActiveAt: latStr,
}, nil
```

- [ ] **Step 7: Проверить компиляцию**

```bash
cd apps/server && go build ./internal/auth/
```

Expected: BUILD OK

- [ ] **Step 8: Commit**

```bash
git add apps/server/internal/auth/redis.go
git commit -m "feat(auth): country_code (cc) в Redis-сессиях"
```

---

### Task 5: SessionLogEntry + миграция — country_code в PostgreSQL

**Files:**
- Modify: `apps/server/internal/model/model.go` (line 40-49)
- Create: `apps/server/migrations/007_session_log_country_code.sql`
- Modify: `apps/server/internal/storage/session_log.go`

- [ ] **Step 1: Добавить CountryCode в SessionLogEntry**

В `model.go`, после `Geo` (строка 47):

```go
type SessionLogEntry struct {
	ID          pgtype.UUID        `json:"id"`
	UserID      pgtype.UUID        `json:"user_id"`
	SessionID   string             `json:"session_id"`
	Action      string             `json:"action"`
	IP          string             `json:"ip,omitempty"`
	UserAgent   string             `json:"user_agent,omitempty"`
	Geo         string             `json:"geo,omitempty"`
	CountryCode string             `json:"country_code,omitempty"`
	CreatedAt   pgtype.Timestamptz `json:"created_at"`
}
```

- [ ] **Step 2: Создать миграцию**

Создать `apps/server/migrations/007_session_log_country_code.sql`:

```sql
-- +goose Up
ALTER TABLE session_log ADD COLUMN country_code VARCHAR(2) DEFAULT '' NOT NULL;

-- +goose Down
ALTER TABLE session_log DROP COLUMN country_code;
```

- [ ] **Step 3: Обновить CreateSessionLog**

В `session_log.go` строка 10-17:

```go
func (s *Storage) CreateSessionLog(ctx context.Context, entry model.SessionLogEntry) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO session_log (user_id, session_id, action, ip, user_agent, geo, country_code)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		entry.UserID, entry.SessionID, entry.Action, entry.IP, entry.UserAgent, entry.Geo, entry.CountryCode,
	)
	return err
}
```

- [ ] **Step 4: Обновить GetLoginInfoBySessionIDs**

В `session_log.go` строка 25-44, добавить `country_code` в SELECT и Scan:

```go
func (s *Storage) GetLoginInfoBySessionIDs(ctx context.Context, sessionIDs []string) (map[string]model.SessionLogEntry, error) {
	if len(sessionIDs) == 0 {
		return map[string]model.SessionLogEntry{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT DISTINCT ON (session_id) session_id, ip, user_agent, geo, country_code, created_at
		 FROM session_log
		 WHERE session_id = ANY($1) AND action = 'login'
		 ORDER BY session_id, created_at DESC`,
		sessionIDs,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]model.SessionLogEntry, len(sessionIDs))
	for rows.Next() {
		var e model.SessionLogEntry
		if err := rows.Scan(&e.SessionID, &e.IP, &e.UserAgent, &e.Geo, &e.CountryCode, &e.CreatedAt); err != nil {
			return nil, err
		}
		result[e.SessionID] = e
	}
	return result, rows.Err()
}
```

- [ ] **Step 5: Обновить ListSessionLogs**

В `session_log.go` строка 48-72:

```go
func (s *Storage) ListSessionLogs(ctx context.Context, userID pgtype.UUID, limit int) ([]model.SessionLogEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT id, user_id, session_id, action, ip, user_agent, geo, country_code, created_at
		 FROM session_log WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []model.SessionLogEntry
	for rows.Next() {
		var e model.SessionLogEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.SessionID, &e.Action, &e.IP, &e.UserAgent, &e.Geo, &e.CountryCode, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
```

- [ ] **Step 6: Проверить компиляцию**

```bash
cd apps/server && go build ./internal/model/ ./internal/storage/
```

Expected: BUILD OK

- [ ] **Step 7: Commit**

```bash
git add apps/server/internal/model/model.go apps/server/internal/storage/session_log.go apps/server/migrations/007_session_log_country_code.sql
git commit -m "feat(storage): country_code в session_log + миграция"
```

---

### Task 6: Handlers — интеграция нового GeoIP Client

**Files:**
- Modify: `apps/server/internal/handler/auth.go` (lines 15-25, 292-298, 310-314)
- Modify: `apps/server/internal/handler/router.go` (lines 14, 19, 55)
- Modify: `apps/server/internal/handler/session.go` (lines 22-29, 80-87)

- [ ] **Step 1: Обновить auth.go — import и тип поля**

Заменить import `geoip` и тип поля:

```go
// import: оставить "github.com/system-design-sandbox/server/internal/geoip" (пакет тот же)

type AuthHandler struct {
	Store     *storage.Storage
	RedisAuth *auth.RedisAuth
	Email     auth.EmailSender
	Config    *config.Config
	GeoIP     *geoip.Client
}
```

- [ ] **Step 2: Обновить completeVerification — Lookup вместо City**

В `auth.go` строка 290-298, заменить создание sessData:

```go
ip := clientIP(r)
now := time.Now().UTC().Format(time.RFC3339)
geo := h.GeoIP.Lookup(r.Context(), ip)
sessData := auth.SessionData{
    UserID:       userIDStr,
    IP:           ip,
    Geo:          geo.Formatted,
    CountryCode:  geo.CountryCode,
    CreatedAt:    now,
    LastActiveAt: now,
}
```

Метод `Lookup` на nil-receiver `*Client` безопасно возвращает zero `Result`, поэтому проверка `h.GeoIP != nil` не нужна — она внутри метода.

- [ ] **Step 3: Обновить session_log в completeVerification**

В `auth.go` строка 307-314, обновить запись в лог:

```go
if h.Config.SessionLogEnabled {
    _ = h.Store.CreateSessionLog(r.Context(), model.SessionLogEntry{
        UserID:      user.ID,
        SessionID:   sessionID,
        Action:      "login",
        IP:          ip,
        UserAgent:   r.UserAgent(),
        Geo:         geo.Formatted,
        CountryCode: geo.CountryCode,
    })
}
```

- [ ] **Step 4: Обновить router.go**

В `router.go` строка 19, изменить сигнатуру:

```go
func NewRouter(cfg *config.Config, store *storage.Storage, redisAuth *auth.RedisAuth, emailSender auth.EmailSender, geo *geoip.Client, collector *metrics.Collector, hub *metrics.Hub) *chi.Mux {
```

Строка 55 — тип уже совместим (поле `GeoIP` стало `*geoip.Client`):

```go
authH := &AuthHandler{Store: store, RedisAuth: redisAuth, Email: emailSender, Config: cfg, GeoIP: geo}
```

- [ ] **Step 5: Обновить session.go — country_code в API**

В `session.go`, добавить `CountryCode` в `sessionInfo` (строка 22-29):

```go
type sessionInfo struct {
	SessionID    string `json:"session_id"`
	IP           string `json:"ip"`
	Geo          string `json:"geo"`
	CountryCode  string `json:"country_code,omitempty"`
	CreatedAt    string `json:"created_at"`
	LastActiveAt string `json:"last_active_at"`
	Current      bool   `json:"current"`
}
```

И в маппинг (строка 80-87):

```go
out = append(out, sessionInfo{
    SessionID:    s.SessionID,
    IP:           s.IP,
    Geo:          s.Geo,
    CountryCode:  s.CountryCode,
    CreatedAt:    s.CreatedAt,
    LastActiveAt: s.LastActiveAt,
    Current:      s.Current,
})
```

- [ ] **Step 6: Проверить компиляцию**

```bash
cd apps/server && go build ./internal/handler/
```

Expected: BUILD OK

- [ ] **Step 7: Commit**

```bash
git add apps/server/internal/handler/auth.go apps/server/internal/handler/router.go apps/server/internal/handler/session.go
git commit -m "feat(handler): интеграция GeoIP Client + country_code в API сессий"
```

---

### Task 7: main.go — инициализация нового клиента

**Files:**
- Modify: `apps/server/cmd/server/main.go` (lines 18, 118-124)

- [ ] **Step 1: Обновить main.go**

Заменить блок инициализации geoip (строки 118-124):

```go
// Было:
// geo, err := geoip.Open(cfg.MaxMindPath)
// if err != nil {
// 	slog.Warn("geoip disabled: failed to open database", "error", err)
// }
// if geo != nil {
// 	defer func() { _ = geo.Close() }()
// }

// Стало:
geo, err := geoip.New(cfg.GeoIP.GRPCAddr, cfg.GeoIP.RESTURL)
if err != nil {
    slog.Warn("geoip: initialization failed", "error", err)
}
if geo != nil {
    defer geo.Close()
}
```

- [ ] **Step 2: Полная сборка проекта**

```bash
cd apps/server && go build ./...
```

Expected: BUILD OK

- [ ] **Step 3: Запуск тестов**

```bash
cd apps/server && go test ./...
```

Expected: все тесты проходят.

- [ ] **Step 4: Commit**

```bash
git add apps/server/cmd/server/main.go
git commit -m "feat(main): инициализация GeoIP service client"
```

---

### Task 8: Финализация — go mod tidy + обновление .env

**Files:**
- Modify: `apps/server/go.mod`
- Modify: `apps/server/go.sum`
- Modify: `apps/server/.env` (если существует)

- [ ] **Step 1: go mod tidy**

```bash
cd apps/server && go mod tidy
```

Убедиться, что `maxminddb-golang` исчезла из `go.mod`, а `google.golang.org/grpc` присутствует.

- [ ] **Step 2: Финальная сборка и тесты**

```bash
cd apps/server && go build ./... && go test ./...
```

Expected: BUILD OK, все тесты проходят.

- [ ] **Step 3: Commit**

```bash
git add apps/server/go.mod apps/server/go.sum
git commit -m "chore: go mod tidy — убрана maxminddb, добавлен grpc"
```