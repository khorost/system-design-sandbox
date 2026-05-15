/**
 * Telemetry for orthogonal edge routing debugging.
 * Stores events in a circular buffer, auto-expires after 10 minutes.
 * Access via window.__orthoTelemetry in browser console.
 */

interface TelemetryEntry {
  ts: number;
  type: 'seg-drag-start' | 'seg-drag-move' | 'seg-drag-end' | 'seg-dblclick'
      | 'bake' | 'render' | 'node-move' | 'edge-update';
  edgeId?: string;
  data: Record<string, unknown>;
}

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 2000;
const buffer: TelemetryEntry[] = [];

function prune(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  while (buffer.length > 0 && buffer[0].ts < cutoff) buffer.shift();
  while (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function orthoLog(
  type: TelemetryEntry['type'],
  edgeId: string | undefined,
  data: Record<string, unknown>,
): void {
  prune();
  buffer.push({ ts: Date.now(), type, edgeId, data });
}

export function orthoGetLog(): TelemetryEntry[] {
  prune();
  return [...buffer];
}

export function orthoClearLog(): void {
  buffer.length = 0;
}

// Expose to browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__orthoTelemetry = {
    get log() { return orthoGetLog(); },
    get last() { const l = orthoGetLog(); return l[l.length - 1]; },
    last10() { return orthoGetLog().slice(-10); },
    clear() { orthoClearLog(); },
    filter(type: string) { return orthoGetLog().filter(e => e.type === type); },
    dump() {
      const entries = orthoGetLog();
      // eslint-disable-next-line no-console
      console.table(entries.map(e => ({
        time: new Date(e.ts).toLocaleTimeString(),
        type: e.type,
        edge: e.edgeId?.slice(-8),
        ...e.data,
      })));
    },
  };
}
