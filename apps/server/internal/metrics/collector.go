package metrics

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/redis/go-redis/v9"
)

// Collector periodically scans Redis sessions and maintains Prometheus gauges.
type Collector struct {
	rdb          redis.UniversalClient
	hub          *Hub
	activeWindow time.Duration
	requestCount atomic.Int64

	mu            sync.RWMutex
	latest        WSPayload
	lastRedisUIDs map[string]struct{}
	onSnapshot    func(WSPayload)

	sessionsActive prometheus.Gauge
	sessionsFrozen prometheus.Gauge
	requestsTotal  prometheus.Counter
	usersOnline    prometheus.Gauge
	usersOffline   prometheus.Gauge
	anonRecent     prometheus.Gauge
}

// NewCollector creates a Collector. activeWindow is the duration within which
// a session is considered active (typically AccessExpiry = 5 min).
func NewCollector(rdb redis.UniversalClient, hub *Hub, activeWindow time.Duration) *Collector {
	c := &Collector{
		rdb:          rdb,
		hub:          hub,
		activeWindow: activeWindow,
	}

	c.sessionsActive = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "sds_platform_sessions_active",
		Help: "Number of sessions with recent activity",
	})
	c.sessionsFrozen = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "sds_platform_sessions_frozen",
		Help: "Number of sessions alive in Redis but idle",
	})
	c.requestsTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "sds_platform_http_requests_total",
		Help: "Total HTTP requests processed",
	})
	c.usersOnline = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "sds_platform_users_online",
		Help: "Unique authenticated users connected via WebSocket",
	})
	c.usersOffline = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "sds_platform_users_offline",
		Help: "Unique authenticated users with Redis sessions but not connected via WebSocket",
	})
	c.anonRecent = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "sds_platform_anon_recent",
		Help: "Unique anonymous visitors connected within activeWindow",
	})

	prometheus.MustRegister(
		c.sessionsActive, c.sessionsFrozen, c.requestsTotal,
		c.usersOnline, c.usersOffline, c.anonRecent,
	)
	return c
}

// SetOnSnapshot registers a callback invoked after each tick with the new payload.
func (c *Collector) SetOnSnapshot(fn func(WSPayload)) {
	c.mu.Lock()
	c.onSnapshot = fn
	c.mu.Unlock()
}

// IncrRequests atomically increments the per-tick request counter.
func (c *Collector) IncrRequests() {
	c.requestCount.Add(1)
}

// Snapshot computes a fresh WSPayload from live hub state and cached Redis UIDs.
// Use this for the initial send on connect so the client sees up-to-date numbers
// without waiting for the next collector tick.
func (c *Collector) Snapshot() WSPayload {
	c.mu.RLock()
	redisUIDs := c.lastRedisUIDs
	c.mu.RUnlock()

	if redisUIDs == nil {
		redisUIDs = make(map[string]struct{})
	}
	return c.computeWSPayload(redisUIDs)
}

// computeWSPayload derives user-centric metrics from the current hub connections
// and the provided set of Redis session UIDs.
func (c *Collector) computeWSPayload(redisUIDs map[string]struct{}) WSPayload {
	clients := c.hub.ConnectedClients()

	connectedUIDs := make(map[string]struct{})
	anonLabels := make(map[string]struct{})

	for _, ci := range clients {
		if ci.UID != "" {
			connectedUIDs[ci.UID] = struct{}{}
		} else {
			// Connected via WS right now → active by definition,
			// no need for a time-window check.
			anonLabels[ci.Label] = struct{}{}
		}
	}

	usersOfflineCount := 0
	for uid := range redisUIDs {
		if _, connected := connectedUIDs[uid]; !connected {
			usersOfflineCount++
		}
	}

	p := WSPayload{
		UsersOnline:  len(connectedUIDs),
		UsersOffline: usersOfflineCount,
		AnonRecent:   len(anonLabels),
	}

	slog.Debug("metrics: computeWSPayload",
		"wsClients", len(clients),
		"redisUIDs", len(redisUIDs),
		"usersOnline", p.UsersOnline,
		"usersOffline", p.UsersOffline,
		"anonRecent", p.AnonRecent,
	)

	return p
}

// Run starts the collection loop. It blocks until ctx is cancelled.
func (c *Collector) Run(ctx context.Context, tick time.Duration) {
	t := time.NewTicker(tick)
	defer t.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c.collect(ctx)
		}
	}
}

func (c *Collector) collect(ctx context.Context) {
	// Swap request counter → Prometheus counter
	reqs := c.requestCount.Swap(0)
	c.requestsTotal.Add(float64(reqs))

	// Scan Redis sessions → active/frozen counts + set of unique uids
	active, frozen, redisUIDs := c.countSessions(ctx)
	c.sessionsActive.Set(float64(active))
	c.sessionsFrozen.Set(float64(frozen))

	// Cache Redis UIDs for Snapshot()
	c.mu.Lock()
	c.lastRedisUIDs = redisUIDs
	c.mu.Unlock()

	// Compute user-centric metrics from live hub state + Redis UIDs
	payload := c.computeWSPayload(redisUIDs)

	// Update Prometheus gauges
	c.usersOnline.Set(float64(payload.UsersOnline))
	c.usersOffline.Set(float64(payload.UsersOffline))
	c.anonRecent.Set(float64(payload.AnonRecent))

	c.mu.Lock()
	c.latest = payload
	fn := c.onSnapshot
	c.mu.Unlock()

	if fn != nil {
		fn(payload)
	}
}

// countSessions scans Redis session keys, returns active/frozen counts
// and a set of unique user IDs found in sessions.
func (c *Collector) countSessions(ctx context.Context) (active, frozen int, userIDs map[string]struct{}) {
	userIDs = make(map[string]struct{})

	if c.rdb == nil {
		return 0, 0, userIDs
	}

	cutoff := time.Now().Add(-c.activeWindow)

	var cursor uint64
	for {
		keys, next, err := c.rdb.Scan(ctx, cursor, "s:*", 100).Result()
		if err != nil {
			slog.Error("metrics: scan sessions", "error", err)
			return active, frozen, userIDs
		}

		if len(keys) > 0 {
			pipe := c.rdb.Pipeline()
			cmds := make([]*redis.SliceCmd, len(keys))
			for i, k := range keys {
				cmds[i] = pipe.HMGet(ctx, k, "lat", "uid")
			}
			_, _ = pipe.Exec(ctx)

			for _, cmd := range cmds {
				vals, err := cmd.Result()
				if err != nil || len(vals) < 2 {
					frozen++
					continue
				}

				// Parse lat
				latStr, _ := vals[0].(string)
				if latStr == "" {
					frozen++
				} else {
					t, err := time.Parse(time.RFC3339, latStr)
					if err != nil {
						frozen++
					} else if t.After(cutoff) {
						active++
					} else {
						frozen++
					}
				}

				// Collect uid
				if uidStr, _ := vals[1].(string); uidStr != "" {
					userIDs[uidStr] = struct{}{}
				}
			}
		}

		cursor = next
		if cursor == 0 {
			break
		}
	}

	return active, frozen, userIDs
}
