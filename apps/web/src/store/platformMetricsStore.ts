import { create } from 'zustand';

export interface PlatformMetrics {
  usersOnline: number;
  usersOffline: number;
  anonRecent: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface PlatformMetricsState {
  metrics: PlatformMetrics | null;
  status: ConnectionStatus;
  connect: () => void;
  disconnect: () => void;
}

const BACKOFF_BASE = 2000;
const BACKOFF_CAP = 30_000;
const LABEL_KEY = 'sds_visitor_label';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let currentUid = '';
let sentUid: string | null = null; // uid sent in the current WS handshake

function clearReconnect() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function getOrCreateLabel(): string {
  let label = localStorage.getItem(LABEL_KEY);
  if (!label) {
    label = crypto.randomUUID();
    localStorage.setItem(LABEL_KEY, label);
  }
  return label;
}

export function setPlatformMetricsUid(uid: string) {
  currentUid = uid;
}

export function getPlatformMetricsSentUid(): string | null {
  return sentUid;
}

function parseMetrics(raw: Record<string, unknown>): PlatformMetrics {
  // Support both new format {usersOnline,usersOffline,anonRecent}
  // and legacy format {active,frozen,requests} for backward compat.
  return {
    usersOnline: (raw.usersOnline as number) ?? (raw.active as number) ?? 0,
    usersOffline: (raw.usersOffline as number) ?? (raw.frozen as number) ?? 0,
    anonRecent: (raw.anonRecent as number) ?? 0,
  };
}

export const usePlatformMetricsStore = create<PlatformMetricsState>((set, get) => ({
  metrics: null,
  status: 'disconnected',

  connect() {
    if (ws && ws.readyState <= WebSocket.OPEN) return;

    set({ status: 'connecting' });

    const socket = new WebSocket(wsUrl());
    ws = socket;

    socket.addEventListener('open', () => {
      sentUid = currentUid;
      socket.send(JSON.stringify({ label: getOrCreateLabel(), uid: currentUid }));
    });

    socket.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; data: Record<string, unknown> };
        if (msg.type === 'metrics' && msg.data) {
          attempt = 0;
          set({ metrics: parseMetrics(msg.data), status: 'connected' });
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.addEventListener('close', () => {
      // Stale socket — a newer connection has already replaced this one.
      if (ws !== socket) return;

      ws = null;

      // Keep last metrics visible during reconnect.
      set({ status: 'disconnected' });

      const delay = Math.min(BACKOFF_BASE * 2 ** attempt, BACKOFF_CAP);
      attempt++;
      clearReconnect();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (get().status === 'disconnected') {
          get().connect();
        }
      }, delay);
    });
  },

  disconnect() {
    clearReconnect();
    attempt = 0;
    sentUid = null;
    const old = ws;
    ws = null; // clear before close so the close handler sees ws !== socket
    if (old) {
      old.close(1000);
    }
    set({ metrics: null, status: 'disconnected' });
  },
}));
