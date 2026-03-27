import { getDefinition } from '@system-design-sandbox/component-library';

import type { ComponentNode } from '../types/index.ts';

interface TagEntry { tag: string }

/**
 * Returns explicit tags for a node, or null if wildcard (accepts any tag).
 * - Nodes with tagDistribution (clients) → their tags
 * - Nodes with cacheRules (CDN) → their tags
 * - All other nodes (Service, DB, Cache, etc.) → null (wildcard)
 */
export function getNodeTags(node: ComponentNode): string[] | null {
  const config = node.data.config;
  const def = getDefinition(node.data.componentType as Parameters<typeof getDefinition>[0]);

  // CDN — tags from cacheRules
  const cacheRules = (config.cacheRules ?? def?.defaultConfig?.cacheRules) as TagEntry[] | undefined;
  if (cacheRules && cacheRules.length > 0) return cacheRules.map(r => r.tag);

  // Storage/origin — tags from responseRules
  const responseRules = (config.responseRules ?? def?.defaultConfig?.responseRules) as TagEntry[] | undefined;
  if (responseRules && responseRules.length > 0) return responseRules.map(r => r.tag);

  // Clients — tags from tagDistribution
  const tagDist = (config.tagDistribution ?? def?.defaultConfig?.tagDistribution) as TagEntry[] | undefined;
  if (tagDist && tagDist.length > 0) return tagDist.map(t => t.tag);

  return null; // wildcard — accepts any tag
}

/**
 * Tags that can flow through a connection from source to target.
 * Returns null if both sides are wildcard (any tag passes through).
 * Returns [] if no matching tags (misconfigured connection).
 */
export function getConnectionTags(source: ComponentNode, target: ComponentNode): string[] | null {
  const srcTags = getNodeTags(source);
  const tgtTags = getNodeTags(target);

  if (srcTags === null && tgtTags === null) return null; // both wildcard
  if (srcTags === null) return tgtTags; // source wildcard, use target's tags
  if (tgtTags === null) return srcTags; // target wildcard, use source's tags

  // Intersection of both tag sets
  const tgtSet = new Set(tgtTags);
  return srcTags.filter(t => tgtSet.has(t));
}
