// Runtime configuration for System Design Sandbox.
// This file is loaded before the app bundle and sets window.__ENV__.
//
// In production, replace this file via Docker volume mount or ConfigMap:
//   docker run -v ./my-config.js:/usr/share/nginx/html/config.js ...
//
// For local development, create config.dev.js (gitignored) with your overrides.
// The dev server will prefer config.dev.js over config.js when both exist.
//
// ┌─────────────┬──────────────────────────────────────────────────────┬─────────────────────────┐
// │ Key         │ Description                                          │ Default                 │
// ├─────────────┼──────────────────────────────────────────────────────┼─────────────────────────┤
// │ API_URL     │ Base URL for backend API requests.                   │ "" (same origin)        │
// │             │ Examples: "https://api.sdsandbox.ru", ""             │                         │
// │             │ Empty string = relative paths (/api/v1/...).         │                         │
// ├─────────────┼──────────────────────────────────────────────────────┼─────────────────────────┤
// │ WS_URL      │ WebSocket base URL (ws:// or wss://).                │ derived from API_URL    │
// │             │ Set only if WS host differs from API_URL.            │ (http→ws, https→wss)    │
// │             │ Example: "wss://ws.sdsandbox.ru"                     │                         │
// ├─────────────┼──────────────────────────────────────────────────────┼─────────────────────────┤
// │ CDN_URL     │ Base URL for static assets served from CDN.          │ "" (same origin)        │
// │             │ Example: "https://cdn.sdsandbox.ru"                  │                         │
// └─────────────┴──────────────────────────────────────────────────────┴─────────────────────────┘
//
window.__ENV__ = {};
