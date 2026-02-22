/**
 * Runtime environment configuration loaded from /config.js (prod) or /config.dev.js (dev).
 *
 * The file sets `window.__ENV__` before the app bundle executes.
 * At deploy time, mount an overridden config.js into the nginx html root
 * to configure the app without rebuilding the Docker image.
 *
 * For local development, create `public/config.dev.js` (gitignored).
 * The Vite dev server will prefer it over config.js when it exists.
 *
 * Available keys:
 * ┌─────────────┬──────────────────────────────────────────────────────┬─────────────────────────┐
 * │ Key         │ Description                                          │ Default                 │
 * ├─────────────┼──────────────────────────────────────────────────────┼─────────────────────────┤
 * │ API_URL     │ Base URL for backend API requests                    │ "" (same origin)        │
 * │ WS_URL      │ WebSocket base URL (ws:// or wss://)                 │ derived from API_URL    │
 * │ CDN_URL     │ Base URL for CDN assets                              │ "" (same origin)        │
 * └─────────────┴──────────────────────────────────────────────────────┴─────────────────────────┘
 */

interface RuntimeEnv {
  API_URL?: string;
  WS_URL?: string;
  CDN_URL?: string;
}

declare global {
  interface Window {
    __ENV__?: RuntimeEnv;
  }
}

function getEnv(): RuntimeEnv {
  return window?.__ENV__ ?? {};
}

/** Base URL for API calls. Empty string means same origin (relative paths). */
export function getApiUrl(): string {
  return getEnv().API_URL ?? '';
}

/**
 * WebSocket base URL.
 * If WS_URL is set explicitly, use it.
 * Otherwise derive from API_URL by replacing http(s) with ws(s).
 * If neither is set, returns '' (same origin).
 */
export function getWsUrl(): string {
  const env = getEnv();
  if (env.WS_URL) return env.WS_URL;
  if (env.API_URL) return env.API_URL.replace(/^http/, 'ws');
  return '';
}

/** Base URL for CDN assets. Empty string means same origin. */
export function getCdnUrl(): string {
  return getEnv().CDN_URL ?? '';
}
