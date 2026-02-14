import type { ComponentNode, ComponentEdge, EdgeRoutingRule, ProtocolType } from '../types/index.ts';
import { DEFAULT_EDGE_DATA } from '../types/index.ts';
import { getDefinition } from '@system-design-sandbox/component-library';

interface TagWeightEntry {
  tag: string;
  weight: number;
}

/** Build alias from label: lowercase, spaces→underscores, dedup with suffix */
function buildAliasMap(nodes: ComponentNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Map<string, number>();

  for (const node of nodes) {
    let base = node.data.label
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    if (!base) base = node.data.componentType;

    const count = used.get(base) ?? 0;
    const alias = count === 0 ? base : `${base}_${count}`;
    used.set(base, count + 1);
    map.set(node.id, alias);
  }

  return map;
}

/** Get non-default config keys for a node */
function getNonDefaultConfig(node: ComponentNode): Record<string, unknown> {
  const def = getDefinition(node.data.componentType);
  const config = node.data.config;
  const result: Record<string, unknown> = {};

  if (!def) {
    // Unknown type — emit all config
    for (const [k, v] of Object.entries(config)) {
      if (k === 'tagDistribution') continue;
      if (v !== undefined && v !== null) result[k] = v;
    }
    return result;
  }

  const paramDefaults = new Map<string, unknown>();
  for (const p of def.params) {
    paramDefaults.set(p.key, p.default);
  }

  for (const [k, v] of Object.entries(config)) {
    if (k === 'tagDistribution') continue;
    if (v === undefined || v === null) continue;
    const defVal = paramDefaults.get(k);
    if (defVal !== undefined && defVal === v) continue;
    result[k] = v;
  }

  return result;
}

/** Format a config value for DSL output */
function formatValue(v: unknown): string {
  if (typeof v === 'string') {
    // Quote if contains spaces or special chars
    if (/^[a-zA-Z0-9_.\-/]+$/.test(v)) return v;
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

/** Build node tree from flat list */
function buildTree(nodes: ComponentNode[]): Map<string | undefined, ComponentNode[]> {
  const children = new Map<string | undefined, ComponentNode[]>();
  for (const node of nodes) {
    const key = node.parentId ?? undefined;
    const list = children.get(key) ?? [];
    list.push(node);
    children.set(key, list);
  }
  return children;
}

/** Find the most common edge default values */
function computeEdgeDefaults(edges: ComponentEdge[]): { protocol: ProtocolType; timeoutMs: number; bandwidthMbps: number } {
  if (edges.length === 0) return { protocol: DEFAULT_EDGE_DATA.protocol, timeoutMs: DEFAULT_EDGE_DATA.timeoutMs, bandwidthMbps: DEFAULT_EDGE_DATA.bandwidthMbps };

  // Count protocol frequency
  const protocolCounts = new Map<string, number>();
  const timeoutCounts = new Map<number, number>();
  const bandwidthCounts = new Map<number, number>();

  for (const e of edges) {
    const p = e.data?.protocol ?? DEFAULT_EDGE_DATA.protocol;
    protocolCounts.set(p, (protocolCounts.get(p) ?? 0) + 1);

    const t = e.data?.timeoutMs ?? DEFAULT_EDGE_DATA.timeoutMs;
    timeoutCounts.set(t, (timeoutCounts.get(t) ?? 0) + 1);

    const b = e.data?.bandwidthMbps ?? DEFAULT_EDGE_DATA.bandwidthMbps;
    bandwidthCounts.set(b, (bandwidthCounts.get(b) ?? 0) + 1);
  }

  const mostCommon = <T>(counts: Map<T, number>, fallback: T): T => {
    let best = fallback;
    let bestCount = 0;
    for (const [val, count] of counts) {
      if (count > bestCount) { best = val; bestCount = count; }
    }
    return best;
  };

  return {
    protocol: mostCommon(protocolCounts, DEFAULT_EDGE_DATA.protocol) as ProtocolType,
    timeoutMs: mostCommon(timeoutCounts, DEFAULT_EDGE_DATA.timeoutMs),
    bandwidthMbps: mostCommon(bandwidthCounts, DEFAULT_EDGE_DATA.bandwidthMbps),
  };
}

/** Render a node block with indentation */
function renderNode(
  node: ComponentNode,
  aliasMap: Map<string, string>,
  tree: Map<string | undefined, ComponentNode[]>,
  indent: string,
): string {
  const alias = aliasMap.get(node.id) ?? node.id;
  const label = node.data.label;
  const type = node.data.componentType;

  const lines: string[] = [];
  lines.push(`${indent}${type} "${label}" as ${alias} {`);

  const inner = indent + '  ';

  // Emit non-default config
  const config = getNonDefaultConfig(node);
  for (const [k, v] of Object.entries(config)) {
    lines.push(`${inner}${k} ${formatValue(v)}`);
  }

  // Emit tagDistribution as `tags`
  const tags = node.data.config.tagDistribution as TagWeightEntry[] | undefined;
  if (tags && tags.length > 0) {
    const tagStr = tags.map(t => `${t.tag}=${t.weight}`).join(' ');
    lines.push(`${inner}tags ${tagStr}`);
  }

  // Emit children
  const children = tree.get(node.id) ?? [];
  if (children.length > 0) {
    lines.push('');
    for (const child of children) {
      lines.push(renderNode(child, aliasMap, tree, inner));
    }
  }

  lines.push(`${indent}}`);
  return lines.join('\n');
}

/** Render an edge line */
function renderEdge(
  edge: ComponentEdge,
  aliasMap: Map<string, string>,
  defaults: { protocol: ProtocolType; timeoutMs: number; bandwidthMbps: number },
): string {
  const src = aliasMap.get(edge.source) ?? edge.source;
  const tgt = aliasMap.get(edge.target) ?? edge.target;
  const data = edge.data ?? DEFAULT_EDGE_DATA;
  const latency = `${data.latencyMs}ms`;

  const parts = [`${src} -> ${tgt}`, latency];

  // Protocol: omit if same as defaults
  if (data.protocol !== defaults.protocol) {
    parts.push(data.protocol);
  }

  // Routing rules
  const rules = data.routingRules as EdgeRoutingRule[] | undefined;
  if (rules && rules.length > 0) {
    const ruleStrs = rules.map(r => {
      let s = `${r.tag} *${r.weight}`;
      if (r.outTag) s += ` -> ${r.outTag}`;
      return s;
    });
    parts.push(`[${ruleStrs.join(', ')}]`);
  }

  // Non-default timeout/bandwidth
  const extras: string[] = [];
  if (data.timeoutMs !== defaults.timeoutMs) {
    extras.push(`timeout=${data.timeoutMs}ms`);
  }
  if (data.bandwidthMbps !== defaults.bandwidthMbps) {
    extras.push(`bandwidth=${data.bandwidthMbps}mbps`);
  }
  parts.push(...extras);

  return parts.join('  ');
}

export function exportDsl(nodes: ComponentNode[], edges: ComponentEdge[]): string {
  const aliasMap = buildAliasMap(nodes);
  const tree = buildTree(nodes);
  const edgeDefaults = computeEdgeDefaults(edges);

  const sections: string[] = [];

  // Header comment
  sections.push('# Architecture Schema (DSL)');

  // Defaults block — only emit if different from DEFAULT_EDGE_DATA
  const needsDefaults =
    edgeDefaults.protocol !== DEFAULT_EDGE_DATA.protocol ||
    edgeDefaults.timeoutMs !== DEFAULT_EDGE_DATA.timeoutMs ||
    edgeDefaults.bandwidthMbps !== DEFAULT_EDGE_DATA.bandwidthMbps;

  if (needsDefaults) {
    const dLines: string[] = ['defaults {'];
    if (edgeDefaults.protocol !== DEFAULT_EDGE_DATA.protocol) {
      dLines.push(`  protocol ${edgeDefaults.protocol}`);
    }
    if (edgeDefaults.timeoutMs !== DEFAULT_EDGE_DATA.timeoutMs) {
      dLines.push(`  timeout ${edgeDefaults.timeoutMs}ms`);
    }
    if (edgeDefaults.bandwidthMbps !== DEFAULT_EDGE_DATA.bandwidthMbps) {
      dLines.push(`  bandwidth ${edgeDefaults.bandwidthMbps}mbps`);
    }
    dLines.push('}');
    sections.push(dLines.join('\n'));
  }

  // Top-level nodes
  const topLevel = tree.get(undefined) ?? [];
  for (const node of topLevel) {
    sections.push(renderNode(node, aliasMap, tree, ''));
  }

  // Edges
  if (edges.length > 0) {
    const edgeLines: string[] = ['# --- connections ---'];
    for (const edge of edges) {
      edgeLines.push(renderEdge(edge, aliasMap, edgeDefaults));
    }
    sections.push(edgeLines.join('\n'));
  }

  return sections.join('\n\n') + '\n';
}
