package metrics

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type client struct {
	conn        *websocket.Conn
	cancel      context.CancelFunc
	label       string
	uid         string
	connectedAt time.Time
}

// ClientInfo is a read-only snapshot of a connected client's identity.
type ClientInfo struct {
	Label       string
	UID         string
	ConnectedAt time.Time
}

// WSPayload is the user-centric metrics payload sent to WebSocket clients.
type WSPayload struct {
	UsersOnline int `json:"usersOnline"`
	UsersOffline int `json:"usersOffline"`
	AnonRecent  int `json:"anonRecent"`
}

// Hub manages WebSocket connections and broadcasts snapshots to all clients.
// Sends are staggered over the spread duration so not all clients are hit at once.
type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
	spread  time.Duration
}

// NewHub creates a new Hub. spread is the duration over which to distribute
// sends within a single tick (e.g. 15s for a 20s tick).
func NewHub(spread time.Duration) *Hub {
	return &Hub{
		clients: make(map[*client]struct{}),
		spread:  spread,
	}
}

// HandleConn registers a new WebSocket connection with identity info.
func (h *Hub) HandleConn(conn *websocket.Conn, cancel context.CancelFunc, label, uid string) *client {
	c := &client{
		conn:        conn,
		cancel:      cancel,
		label:       label,
		uid:         uid,
		connectedAt: time.Now(),
	}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	return c
}

// Remove unregisters a client and cancels its context.
func (h *Hub) Remove(c *client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		c.cancel()
	}
	h.mu.Unlock()
}

// ConnectedClients returns a snapshot of all connected clients' identity info.
func (h *Hub) ConnectedClients() []ClientInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]ClientInfo, 0, len(h.clients))
	for c := range h.clients {
		out = append(out, ClientInfo{
			Label:       c.label,
			UID:         c.uid,
			ConnectedAt: c.connectedAt,
		})
	}
	return out
}

// Broadcast sends a WSPayload to all connected clients as JSON,
// spreading the writes evenly over h.spread duration.
func (h *Hub) Broadcast(payload WSPayload) {
	msg, err := json.Marshal(struct {
		Type string    `json:"type"`
		Data WSPayload `json:"data"`
	}{Type: "metrics", Data: payload})
	if err != nil {
		slog.Error("metrics hub: marshal payload", "error", err)
		return
	}

	h.mu.RLock()
	targets := make([]*client, 0, len(h.clients))
	for c := range h.clients {
		targets = append(targets, c)
	}
	h.mu.RUnlock()

	n := len(targets)
	if n == 0 {
		return
	}

	// Single client — send immediately, no goroutine.
	if n == 1 {
		h.sendRaw(targets[0], msg)
		return
	}

	// Multiple clients — stagger in a background goroutine.
	gap := h.spread / time.Duration(n)
	go func() {
		for i, c := range targets {
			if i > 0 {
				time.Sleep(gap)
			}
			h.sendRaw(c, msg)
		}
	}()
}

// Send writes a single WSPayload to one client (used for initial send on connect).
func (h *Hub) Send(c *client, payload WSPayload) {
	msg, err := json.Marshal(struct {
		Type string    `json:"type"`
		Data WSPayload `json:"data"`
	}{Type: "metrics", Data: payload})
	if err != nil {
		return
	}
	h.sendRaw(c, msg)
}

func (h *Hub) sendRaw(c *client, msg []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := c.conn.Write(ctx, websocket.MessageText, msg); err != nil {
		slog.Debug("metrics hub: write failed, removing client", "error", err)
		h.Remove(c)
		_ = c.conn.Close(websocket.StatusGoingAway, "write timeout")
	}
}
