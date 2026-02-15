import { getDefinition } from '@system-design-sandbox/component-library';

import type { ComponentEdge, ComponentNode, ComponentType, EdgeData, EdgeRoutingRule, ProtocolType } from '../types/index.ts';
import { DEFAULT_EDGE_DATA, NODE_TYPE_MAP } from '../types/index.ts';
import { CONTAINER_TYPES, CONTAINER_Z_INDEX } from '../utils/networkLatency.ts';
import { sanitizeLabel, sanitizeString } from '../utils/sanitize.ts';

interface ParseResult {
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  warnings: string[];
}

interface ParseError {
  error: string;
}

interface EdgeDefaults {
  protocol: ProtocolType;
  timeoutMs: number;
  bandwidthMbps: number;
}

interface TokenLine {
  raw: string;
  trimmed: string;
  lineNum: number;
}

/** Strip comments and blank lines, track line numbers */
function tokenize(text: string): TokenLine[] {
  const lines = text.split('\n');
  const result: TokenLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Strip inline comments (but not inside quoted strings — simplified: strip from first # not inside quotes)
    let trimmed = raw;
    let inQuote = false;
    for (let j = 0; j < trimmed.length; j++) {
      if (trimmed[j] === '"') inQuote = !inQuote;
      if (trimmed[j] === '#' && !inQuote) {
        trimmed = trimmed.slice(0, j);
        break;
      }
    }
    trimmed = trimmed.trimEnd();
    if (trimmed.trim() === '') continue;
    result.push({ raw: trimmed, trimmed: trimmed.trim(), lineNum: i + 1 });
  }
  return result;
}

/** Parse a value: number, boolean, quoted/unquoted string */
function parseValue(s: string): unknown {
  if (s === 'true') return true;
  if (s === 'false') return false;
  // Strip ms/mbps suffixes for numeric values
  const stripped = s.replace(/ms$/, '').replace(/mbps$/, '');
  const num = Number(stripped);
  if (!isNaN(num) && stripped !== '') return num;
  // Unquote if quoted
  if (s.startsWith('"') && s.endsWith('"')) {
    return sanitizeString(s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return sanitizeString(s);
}

/** Match node declaration: componentType "Label" as alias { */
const NODE_DECL_RE = /^(\w+)\s+"([^"]+)"\s+as\s+(\w+)\s*\{$/;

/** Match edge line: alias -> alias latency protocol? [routing]? extras? */
const EDGE_RE = /^(\w+)\s*->\s*(\w+)\s+(.+)$/;

/** Match defaults block start */
const DEFAULTS_RE = /^defaults\s*\{$/;

/** Parse config key=value pairs for tags */
function parseTagsValue(rest: string): Array<{ tag: string; weight: number }> {
  const tags: Array<{ tag: string; weight: number }> = [];
  const parts = rest.trim().split(/\s+/);
  for (const part of parts) {
    const [tag, wStr] = part.split('=');
    if (tag && wStr) {
      const weight = Number(wStr);
      if (!isNaN(weight)) tags.push({ tag, weight });
    }
  }
  return tags;
}

/** Parse routing clause: [tag *weight -> outTag, ...] */
function parseRoutingClause(s: string): { rules: EdgeRoutingRule[]; rest: string } {
  const bracketStart = s.indexOf('[');
  if (bracketStart === -1) return { rules: [], rest: s };

  const bracketEnd = s.indexOf(']', bracketStart);
  if (bracketEnd === -1) return { rules: [], rest: s };

  const inside = s.slice(bracketStart + 1, bracketEnd).trim();
  const rest = (s.slice(0, bracketStart) + s.slice(bracketEnd + 1)).trim();

  const rules: EdgeRoutingRule[] = [];
  const ruleStrs = inside.split(',').map(r => r.trim()).filter(Boolean);

  for (const rs of ruleStrs) {
    // tag *weight -> outTag
    const m = rs.match(/^(\w+)\s+\*([0-9.]+)(?:\s*->\s*(\w+))?$/);
    if (m) {
      const rule: EdgeRoutingRule = { tag: m[1], weight: Number(m[2]) };
      if (m[3]) rule.outTag = m[3];
      rules.push(rule);
    }
  }

  return { rules, rest };
}

/** Build full ComponentNodeData from parsed info */
function buildNodeData(
  componentType: string,
  label: string,
  config: Record<string, unknown>,
  warnings: string[],
  lineNum: number,
): ComponentNode['data'] {
  const def = getDefinition(componentType as ComponentType);

  const cleanLabel = sanitizeLabel(label);

  if (!def) {
    warnings.push(`Line ${lineNum}: Unknown componentType "${componentType}".`);
    return {
      label: cleanLabel,
      componentType: componentType as ComponentType,
      category: 'compute',
      icon: '❓',
      config,
    };
  }

  // Merge with defaults from definition
  const mergedConfig: Record<string, unknown> = {};
  for (const p of def.params) {
    mergedConfig[p.key] = p.default;
  }
  for (const [k, v] of Object.entries(config)) {
    mergedConfig[k] = v;
  }

  return {
    label: cleanLabel,
    componentType: componentType as ComponentType,
    category: def.category,
    icon: def.icon,
    config: mergedConfig,
  };
}

/** Collect lines inside a brace block. Returns lines between { and matching } */
function collectBlock(
  lines: TokenLine[],
  startIdx: number,
): { bodyLines: TokenLine[]; endIdx: number } | null {
  // The startIdx line should end with {
  // Find matching closing }
  let depth = 1;
  let i = startIdx + 1;
  const body: TokenLine[] = [];

  while (i < lines.length && depth > 0) {
    const t = lines[i].trimmed;
    // Count braces (simplified — don't count inside quoted strings)
    for (const ch of t) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      if (depth === 0) break;
    }
    if (depth > 0) {
      body.push(lines[i]);
    } else {
      // If there's content before the closing brace on this line, add it
      const beforeBrace = t.replace(/\}$/, '').trim();
      if (beforeBrace) {
        body.push({ ...lines[i], trimmed: beforeBrace });
      }
    }
    i++;
  }

  if (depth !== 0) return null;
  return { bodyLines: body, endIdx: i };
}

function parseDefaults(lines: TokenLine[]): EdgeDefaults {
  const defaults: EdgeDefaults = {
    protocol: DEFAULT_EDGE_DATA.protocol,
    timeoutMs: DEFAULT_EDGE_DATA.timeoutMs,
    bandwidthMbps: DEFAULT_EDGE_DATA.bandwidthMbps,
  };

  for (const line of lines) {
    const parts = line.trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const key = parts[0];
    const val = parts.slice(1).join(' ');

    if (key === 'protocol') defaults.protocol = val as ProtocolType;
    else if (key === 'timeout') defaults.timeoutMs = Number(val.replace(/ms$/, ''));
    else if (key === 'bandwidth') defaults.bandwidthMbps = Number(val.replace(/mbps$/, ''));
  }

  return defaults;
}

let nodeCounter = 0;

function parseNodeBlock(
  lines: TokenLine[],
  parentId: string | null,
  aliasToId: Map<string, string>,
  warnings: string[],
): { nodes: ComponentNode[]; idx: number } | { error: string } {
  const nodes: ComponentNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trimmed;

    // Try node declaration
    const nodeMatch = t.match(NODE_DECL_RE);
    if (nodeMatch) {
      const [, componentType, label, alias] = nodeMatch;

      // Collect block body
      const block = collectBlock(lines, i);
      if (!block) {
        return { error: `Line ${line.lineNum}: Unclosed brace for "${alias}".` };
      }

      const nodeId = `dsl-${alias}-${nodeCounter++}`;
      aliasToId.set(alias, nodeId);

      // Parse body: config lines and nested node blocks
      const config: Record<string, unknown> = {};
      const bodyLines = block.bodyLines;
      let j = 0;

      while (j < bodyLines.length) {
        const bl = bodyLines[j];
        const bt = bl.trimmed;

        // Nested node?
        const nestedMatch = bt.match(NODE_DECL_RE);
        if (nestedMatch) {
          // Re-parse from this position
          const sub = parseNodeBlock(bodyLines.slice(j), nodeId, aliasToId, warnings);
          if ('error' in sub) return sub;
          nodes.push(...sub.nodes);
          j += sub.idx;
          continue;
        }

        // Config line: key value
        const spaceIdx = bt.indexOf(' ');
        if (spaceIdx > 0) {
          const key = bt.slice(0, spaceIdx);
          const rest = bt.slice(spaceIdx + 1);

          if (key === 'tags') {
            config.tagDistribution = parseTagsValue(rest);
          } else {
            config[key] = parseValue(rest);
          }
        }
        j++;
      }

      const data = buildNodeData(componentType, label, config, warnings, line.lineNum);
      const isContainer = CONTAINER_TYPES.has(componentType as ComponentType);

      const node: ComponentNode = {
        id: nodeId,
        type: NODE_TYPE_MAP[componentType] ?? 'serviceNode',
        position: { x: 0, y: 0 },
        data,
        ...(parentId ? { parentId, extent: 'parent' as const } : {}),
        ...(isContainer ? {
          style: { width: 400, height: 300 },
          dragHandle: '.container-drag-handle',
          zIndex: CONTAINER_Z_INDEX[componentType] ?? -1,
        } : {}),
      };

      nodes.unshift(node); // Parent before children
      i = block.endIdx; // endIdx is absolute index into `lines`
      continue;
    }

    // Not a node — skip (config line at wrong level or edge)
    i++;
  }

  return { nodes, idx: i };
}

function parseEdges(
  lines: TokenLine[],
  aliasToId: Map<string, string>,
  defaults: EdgeDefaults,
): { edges: ComponentEdge[]; errors: string[] } {
  const edges: ComponentEdge[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    const t = line.trimmed;
    const m = t.match(EDGE_RE);
    if (!m) continue;

    const [, srcAlias, tgtAlias, rest] = m;
    const srcId = aliasToId.get(srcAlias);
    const tgtId = aliasToId.get(tgtAlias);

    if (!srcId) { errors.push(`Line ${line.lineNum}: Unknown alias "${srcAlias}".`); continue; }
    if (!tgtId) { errors.push(`Line ${line.lineNum}: Unknown alias "${tgtAlias}".`); continue; }

    // Parse rest: latency protocol? [routing]? key=value*
    const { rules, rest: afterRouting } = parseRoutingClause(rest);

    const tokens = afterRouting.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) { errors.push(`Line ${line.lineNum}: Missing latency value.`); continue; }

    const latencyMs = Number(tokens[0].replace(/ms$/, ''));
    if (isNaN(latencyMs)) { errors.push(`Line ${line.lineNum}: Invalid latency "${tokens[0]}".`); continue; }

    let protocol = defaults.protocol;
    let timeoutMs = defaults.timeoutMs;
    let bandwidthMbps = defaults.bandwidthMbps;

    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.startsWith('timeout=')) {
        timeoutMs = Number(tok.slice(8).replace(/ms$/, ''));
      } else if (tok.startsWith('bandwidth=')) {
        bandwidthMbps = Number(tok.slice(10).replace(/mbps$/, ''));
      } else {
        // Assume protocol
        protocol = tok as ProtocolType;
      }
    }

    const edgeData: EdgeData = {
      protocol,
      latencyMs,
      bandwidthMbps,
      timeoutMs,
      ...(rules.length > 0 ? { routingRules: rules } : {}),
    };

    const edgeId = `e-${srcId}-${tgtId}-${Date.now()}-${edges.length}`;
    edges.push({
      id: edgeId,
      source: srcId,
      target: tgtId,
      type: 'flow',
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      data: edgeData,
    });
  }

  return { edges, errors };
}

export function parseDsl(text: string): ParseResult | ParseError {
  nodeCounter = 0;
  const lines = tokenize(text);
  if (lines.length === 0) return { error: 'Empty DSL input.' };

  const warnings: string[] = [];
  const aliasToId = new Map<string, string>();
  let edgeDefaults: EdgeDefaults = {
    protocol: DEFAULT_EDGE_DATA.protocol,
    timeoutMs: DEFAULT_EDGE_DATA.timeoutMs,
    bandwidthMbps: DEFAULT_EDGE_DATA.bandwidthMbps,
  };

  // Separate sections: defaults, nodes, edges
  // First pass: find defaults block and edge lines (lines with ->)
  const nodeLines: TokenLine[] = [];
  const edgeLines: TokenLine[] = [];

  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trimmed;

    // Defaults block
    if (DEFAULTS_RE.test(t)) {
      const block = collectBlock(lines, i);
      if (!block) return { error: `Line ${lines[i].lineNum}: Unclosed defaults block.` };
      edgeDefaults = parseDefaults(block.bodyLines);
      i = block.endIdx;
      continue;
    }

    // Edge line (contains ->)
    if (EDGE_RE.test(t)) {
      edgeLines.push(lines[i]);
      i++;
      continue;
    }

    // Node line
    nodeLines.push(lines[i]);
    i++;
  }

  // Parse nodes
  const nodeResult = parseNodeBlock(nodeLines, null, aliasToId, warnings);
  if ('error' in nodeResult) return { error: nodeResult.error };

  // Parse edges
  const { edges, errors } = parseEdges(edgeLines, aliasToId, edgeDefaults);
  if (errors.length > 0) return { error: errors[0] };

  // Sort: parents before children
  const nodes = sortParsedNodes(nodeResult.nodes);

  return { nodes, edges, warnings };
}

/** Sort nodes so parents come before children */
function sortParsedNodes(nodes: ComponentNode[]): ComponentNode[] {
  const ids = new Set(nodes.map(n => n.id));
  const depthOf = (node: ComponentNode, visited = new Set<string>()): number => {
    if (!node.parentId || !ids.has(node.parentId)) return 0;
    if (visited.has(node.id)) return 0;
    visited.add(node.id);
    const parent = nodes.find(n => n.id === node.parentId);
    return parent ? depthOf(parent, visited) + 1 : 0;
  };
  return [...nodes].sort((a, b) => depthOf(a) - depthOf(b));
}
