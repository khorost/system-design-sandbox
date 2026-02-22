import type { User } from '../store/authStore.ts';
import type { ComponentEdge, ComponentNode } from '../types/index.ts';

export type TabMessage =
  | { type: 'auth:logout' }
  | { type: 'auth:login'; user: User }
  | { type: 'canvas:nodes-upserted'; nodes: ComponentNode[] }
  | { type: 'canvas:nodes-removed'; ids: string[] }
  | { type: 'canvas:nodes-moved'; positions: Record<string, { x: number; y: number }> }
  | { type: 'canvas:edges-upserted'; edges: ComponentEdge[] }
  | { type: 'canvas:edges-removed'; ids: string[] }
  | { type: 'canvas:meta'; name: string; description: string; tags: string[] };

const channel = new BroadcastChannel('sds_sync');

export function postTabMessage(msg: TabMessage): void {
  channel.postMessage(msg);
}

export function onTabMessage(handler: (msg: TabMessage) => void): () => void {
  const listener = (e: MessageEvent<TabMessage>) => handler(e.data);
  channel.addEventListener('message', listener);
  return () => channel.removeEventListener('message', listener);
}
