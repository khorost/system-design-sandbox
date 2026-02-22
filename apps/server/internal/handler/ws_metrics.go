package handler

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/system-design-sandbox/server/internal/metrics"
	"github.com/coder/websocket"
)

type wsHandshake struct {
	Label string `json:"label"`
	UID   string `json:"uid"`
}

// WSMetricsHandler upgrades HTTP to WebSocket and streams platform metrics.
type WSMetricsHandler struct {
	Collector *metrics.Collector
	Hub       *metrics.Hub
	Origins   []string
}

func (h *WSMetricsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: h.Origins,
	})
	if err != nil {
		slog.Debug("ws: accept failed", "error", err)
		return
	}

	ctx, cancel := context.WithCancel(r.Context())

	// Read handshake: first message with label and uid (5s timeout).
	label, uid := h.readHandshake(ctx, conn)

	slog.Debug("ws: client connected", "label", label, "uid", uid)

	c := h.Hub.HandleConn(conn, cancel, label, uid)

	// Compute fresh payload from live hub state (includes this client).
	h.Hub.Send(c, h.Collector.Snapshot())

	// Read loop: drain incoming messages to detect disconnect.
	for {
		if _, _, err := conn.Read(ctx); err != nil {
			break
		}
	}

	h.Hub.Remove(c)
	_ = conn.Close(websocket.StatusNormalClosure, "")
}

func (h *WSMetricsHandler) readHandshake(ctx context.Context, conn *websocket.Conn) (label, uid string) {
	hsCtx, hsCancel := context.WithTimeout(ctx, 5*time.Second)
	defer hsCancel()

	_, msg, err := conn.Read(hsCtx)
	if err != nil {
		slog.Debug("ws: handshake read failed, generating server label", "error", err)
		return randomLabel(), ""
	}

	var hs wsHandshake
	if err := json.Unmarshal(msg, &hs); err != nil {
		slog.Debug("ws: handshake parse failed, generating server label", "error", err)
		return randomLabel(), ""
	}

	if hs.Label == "" {
		hs.Label = randomLabel()
	}

	return hs.Label, hs.UID
}

func randomLabel() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%x", b)
}
