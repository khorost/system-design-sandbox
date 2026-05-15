import { estimateMonthlyCost } from '@system-design-sandbox/component-library';
import { useCallback, useMemo, useState } from 'react';

import { useCanvasStore } from '../../store/canvasStore.ts';
import type { ComponentNode } from '../../types/index.ts';
import { CONTAINER_TYPES } from '../../utils/networkLatency.ts';
import { paletteCategories, paletteItems } from '../canvas/controls/paletteData.ts';
import { ComponentIcon } from '../ui/ComponentIcon.tsx';

type SortKey = 'name' | 'type' | 'category' | 'cost';
type SortDir = 'asc' | 'desc';
type FilterMode = 'all' | 'containers' | 'top-level' | 'costly';

interface InventoryTableProps {
  onNavigateToNode: (nodeId: string) => void;
}

interface EditingCell {
  nodeId: string;
  field: string;
}

function getPaletteInfo(componentType: string) {
  return paletteItems.find((i) => i.type === componentType);
}

function getCategoryLabel(categoryKey: string) {
  return paletteCategories.find((c) => c.key === categoryKey)?.label ?? categoryKey;
}

function getNodeName(node: ComponentNode): string {
  return (node.data.config.name as string) || node.data.label;
}

function formatComponentType(componentType: string): string {
  return componentType
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getConfigNum(node: ComponentNode, key: string): number | undefined {
  const val = node.data.config[key];
  return typeof val === 'number' ? val : undefined;
}

function formatAggregate(value: number): string {
  if (value === 0) return '—';
  if (Number.isInteger(value)) return value.toLocaleString('en-US');
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const cellBase = 'px-2.5 py-2 text-sm text-slate-300 border-b border-[var(--color-border)] whitespace-nowrap';
const editableCell = `${cellBase} bg-[rgba(255,255,255,0.01)]`;
const numericCell = `${cellBase} text-right`;
const editableNumericCell = `${editableCell} text-right`;
const headerBase = 'px-2.5 py-2 text-[9px] font-semibold text-slate-400 uppercase tracking-[0.16em] border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10 select-none';
const COSTLY_THRESHOLD_USD = 100;

export function InventoryTable({ onNavigateToNode }: InventoryTableProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditingCell | null>(null);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const connectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of edges) {
      counts[e.source] = (counts[e.source] ?? 0) + 1;
      counts[e.target] = (counts[e.target] ?? 0) + 1;
    }
    return counts;
  }, [edges]);

  const costMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of nodes) {
      map[n.id] = estimateMonthlyCost(n.data.componentType, n.data.config);
    }
    return map;
  }, [nodes]);

  // Recursive subtotal: container's own cost + all descendants
  const subtotalMap = useMemo(() => {
    const map: Record<string, number> = {};
    const calcSubtotal = (nodeId: string): number => {
      if (map[nodeId] != null) return map[nodeId];
      const own = costMap[nodeId] ?? 0;
      const children = nodes.filter((n) => n.parentId === nodeId);
      const childrenTotal = children.reduce((s, c) => s + calcSubtotal(c.id), 0);
      map[nodeId] = own + childrenTotal;
      return map[nodeId];
    };
    for (const n of nodes) {
      calcSubtotal(n.id);
    }
    return map;
  }, [nodes, costMap]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return key;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const toggleCollapse = useCallback((nodeId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  // Group nodes: containers as group headers, children underneath
  const groupedRows = useMemo(() => {
    const cmp = (a: ComponentNode, b: ComponentNode): number => {
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case 'name':
          va = getNodeName(a).toLowerCase();
          vb = getNodeName(b).toLowerCase();
          break;
        case 'type':
          va = a.data.componentType;
          vb = b.data.componentType;
          break;
        case 'category':
          va = a.data.category;
          vb = b.data.category;
          break;
        case 'cost':
          va = costMap[a.id] ?? 0;
          vb = costMap[b.id] ?? 0;
          break;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };

    const query = search.trim().toLowerCase();
    const matchesFilter = (node: ComponentNode): boolean => {
      if (filterMode === 'containers' && !CONTAINER_TYPES.has(node.data.componentType)) return false;
      if (filterMode === 'top-level' && !!node.parentId) return false;
      if (filterMode === 'costly' && (costMap[node.id] ?? 0) < COSTLY_THRESHOLD_USD) return false;
      if (!query) return true;
      const parentName = node.parentId ? getNodeName(nodeMap.get(node.parentId) ?? node).toLowerCase() : '';
      const haystack = [
        getNodeName(node).toLowerCase(),
        node.data.componentType.toLowerCase(),
        formatComponentType(node.data.componentType).toLowerCase(),
        getCategoryLabel(node.data.category).toLowerCase(),
        parentName,
      ];
      return haystack.some((v) => v.includes(query));
    };

    const baseMatchedIds = new Set(nodes.filter(matchesFilter).map((n) => n.id));
    const visibleIds = new Set<string>();

    if (filterMode === 'all' || filterMode === 'costly') {
      for (const node of nodes) {
        if (!baseMatchedIds.has(node.id)) continue;
        let current: ComponentNode | undefined = node;
        while (current) {
          visibleIds.add(current.id);
          current = current.parentId ? nodeMap.get(current.parentId) : undefined;
        }
      }
    } else {
      for (const id of baseMatchedIds) visibleIds.add(id);
    }

    const visibleNodes = nodes.filter((n) => visibleIds.has(n.id));
    const topLevel = visibleNodes.filter((n) => !n.parentId || !visibleIds.has(n.parentId));
    const childrenOf = (parentId: string) =>
      visibleNodes.filter((n) => n.parentId === parentId);

    const visibleSubtotalCostMap: Record<string, number> = {};
    const visibleSubtotalCpuMap: Record<string, number> = {};
    const visibleSubtotalMemoryMap: Record<string, number> = {};
    const calcVisibleSubtotal = (nodeId: string) => {
      if (visibleSubtotalCostMap[nodeId] != null) {
        return {
          cost: visibleSubtotalCostMap[nodeId],
          cpu: visibleSubtotalCpuMap[nodeId],
          memory: visibleSubtotalMemoryMap[nodeId],
        };
      }
      const node = nodeMap.get(nodeId);
      const ownCost = costMap[nodeId] ?? 0;
      const ownCpu = node ? (getConfigNum(node, 'cpu_cores') ?? 0) : 0;
      const ownMemory = node ? (getConfigNum(node, 'memory_gb') ?? 0) : 0;
      const childTotals = childrenOf(nodeId).reduce(
        (acc, child) => {
          const childTotal = calcVisibleSubtotal(child.id);
          acc.cost += childTotal.cost;
          acc.cpu += childTotal.cpu;
          acc.memory += childTotal.memory;
          return acc;
        },
        { cost: ownCost, cpu: ownCpu, memory: ownMemory },
      );
      visibleSubtotalCostMap[nodeId] = childTotals.cost;
      visibleSubtotalCpuMap[nodeId] = childTotals.cpu;
      visibleSubtotalMemoryMap[nodeId] = childTotals.memory;
      return childTotals;
    };

    type Row =
      | { kind: 'node'; node: ComponentNode; depth: number; isContainer: boolean }
      | { kind: 'subtotal'; containerId: string; containerName: string; depth: number; subtotal: number; cpu: number; memory: number; childCount: number };
    const rows: Row[] = [];

    // Recursive builder
    const addNode = (node: ComponentNode, depth: number) => {
      const isCont = CONTAINER_TYPES.has(node.data.componentType);
      rows.push({ kind: 'node', node, depth, isContainer: isCont });
      if (isCont) {
        const children = childrenOf(node.id);
        if (children.length > 0 && !collapsed.has(node.id)) {
          const sorted = children.sort(cmp);
          for (const child of sorted) {
            addNode(child, depth + 1);
          }
          const totals = calcVisibleSubtotal(node.id);
          rows.push({
            kind: 'subtotal',
            containerId: node.id,
            containerName: getNodeName(node),
            depth,
            subtotal: totals.cost,
            cpu: totals.cpu,
            memory: totals.memory,
            childCount: children.length,
          });
        }
      }
    };

    const sortedTop = topLevel.sort(cmp);
    for (const node of sortedTop) {
      addNode(node, 0);
    }

    // Add truly orphaned nodes (parentId points to a non-existent node)
    const allNodeIds = new Set(nodes.map((n) => n.id));
    const includedIds = new Set(
      rows.filter((r): r is Extract<Row, { kind: 'node' }> => r.kind === 'node').map((r) => r.node.id),
    );
    const orphans = visibleNodes.filter((n) => !includedIds.has(n.id) && n.parentId && !allNodeIds.has(n.parentId));
    for (const o of orphans) {
      rows.push({ kind: 'node', node: o, depth: 0, isContainer: false });
    }

    return rows;
  }, [nodes, sortKey, sortDir, collapsed, costMap, filterMode, search, nodeMap]);

  const totalCost = useMemo(
    () => groupedRows.reduce((sum, row) => row.kind === 'node' ? sum + (costMap[row.node.id] ?? 0) : sum, 0),
    [groupedRows, costMap],
  );
  const totalCpu = useMemo(
    () => groupedRows.reduce((sum, row) => row.kind === 'node' ? sum + (getConfigNum(row.node, 'cpu_cores') ?? 0) : sum, 0),
    [groupedRows],
  );
  const totalMemory = useMemo(
    () => groupedRows.reduce((sum, row) => row.kind === 'node' ? sum + (getConfigNum(row.node, 'memory_gb') ?? 0) : sum, 0),
    [groupedRows],
  );

  const handleEdit = useCallback(
    (nodeId: string, field: string, value: string | number) => {
      if (field === 'name') {
        updateNodeConfig(nodeId, { name: value });
      } else {
        updateNodeConfig(nodeId, { [field]: Number(value) });
      }
      setEditing(null);
    },
    [updateNodeConfig],
  );

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      <div className="border-b border-[var(--color-border)] bg-[rgba(19,32,44,0.72)] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, type, category..."
            className="h-9 flex-1 rounded-lg border border-[var(--color-border)] bg-[rgba(7,12,19,0.52)] px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[rgba(6,13,19,0.52)] p-1">
            {([
              ['all', 'All'],
              ['containers', 'Containers'],
              ['top-level', 'Top'],
              ['costly', 'Costly'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.10em] transition-colors ${
                  filterMode === mode
                    ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 66 }} />
            <col style={{ width: 56 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 76 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr>
              <th className={`${headerBase} sticky left-0 z-20 cursor-pointer bg-[var(--color-surface)] hover:text-slate-200`} onClick={() => toggleSort('name')}>
                Name{sortArrow('name')}
              </th>
              <th className={`${headerBase} cursor-pointer hover:text-slate-200`} onClick={() => toggleSort('type')}>
                Type{sortArrow('type')}
              </th>
              <th className={`${headerBase} cursor-pointer hover:text-slate-200`} onClick={() => toggleSort('category')}>
                Category{sortArrow('category')}
              </th>
              <th className={headerBase}>Parent</th>
              <th className={`${headerBase} text-right`}>Replicas</th>
              <th className={`${headerBase} text-right`}>CPU</th>
              <th className={`${headerBase} text-right`}>Memory</th>
              <th className={`${headerBase} text-right`}>Max RPS</th>
              <th className={`${headerBase} text-right`}>Conn.</th>
              <th className={`${headerBase} text-right cursor-pointer hover:text-slate-200`} onClick={() => toggleSort('cost')}>
                $/mo{sortArrow('cost')}
              </th>
              <th className={`${headerBase} text-center`}></th>
            </tr>
          </thead>
          <tbody>
            {groupedRows.map((row, _idx) => {
              if (row.kind === 'subtotal') {
                return (
                  <tr key={`sub-${row.containerId}`} className="bg-[rgba(110,220,255,0.04)]">
                    <td className={`${cellBase} text-xs text-slate-300`} colSpan={5} style={{ paddingLeft: 20 + row.depth * 20 }}>
                      <span className="font-semibold text-slate-200">Subtotal</span>
                      <span className="mx-2 text-slate-500">·</span>
                      <span className="italic">{row.containerName}</span>
                      <span className="ml-2 text-slate-500">({row.childCount} item{row.childCount !== 1 ? 's' : ''})</span>
                    </td>
                    <td className={`${numericCell} font-mono text-xs font-semibold text-slate-300`}>
                      {formatAggregate(row.cpu)}
                    </td>
                    <td className={`${numericCell} font-mono text-xs font-semibold text-slate-300`}>
                      {formatAggregate(row.memory)}
                    </td>
                    <td className={`${numericCell} text-slate-600`}>—</td>
                    <td className={`${numericCell} text-slate-600`}>—</td>
                    <td className={`${numericCell} font-mono text-xs font-semibold text-blue-300`}>
                      {row.subtotal > 0 ? `$${row.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className={cellBase}></td>
                  </tr>
                );
              }

              const { node, depth, isContainer } = row;
              const pi = getPaletteInfo(node.data.componentType);
              const icon = pi?.icon ?? node.data.icon;
              const parentNode = node.parentId ? nodeMap.get(node.parentId) : null;
              const conns = connectionCounts[node.id] ?? 0;
              const cost = costMap[node.id] ?? 0;
              const hasChildren = isContainer && nodes.some((n) => n.parentId === node.id);
              const isCollapsed = collapsed.has(node.id);

              return (
                <tr
                  key={node.id}
                  className={`group transition-colors hover:bg-white/[0.03] ${isContainer ? 'bg-[rgba(255,255,255,0.015)]' : ''}`}
                >
                  {/* Name with icon */}
                  <td className={`${editableCell} sticky left-0 z-[1] ${isContainer ? 'bg-[rgba(17,26,37,0.98)] group-hover:bg-[rgba(24,36,50,0.98)]' : 'bg-[rgba(11,18,28,0.98)] group-hover:bg-[rgba(20,30,42,0.98)]'}`}>
                    <div className="flex items-start gap-1.5" style={{ paddingLeft: depth * 18 }}>
                      {isContainer && hasChildren && (
                        <button
                          onClick={() => toggleCollapse(node.id)}
                          className="mt-0.5 w-4 flex-shrink-0 text-xs text-slate-400 hover:text-slate-300"
                        >
                          {isCollapsed ? '\u25B6' : '\u25BC'}
                        </button>
                      )}
                      {isContainer && !hasChildren && <span className="mt-0.5 w-4 flex-shrink-0" />}
                      {!isContainer && depth > 0 && <span className="mt-0.5 w-4 flex-shrink-0" />}
                      <ComponentIcon icon={icon} alt={getNodeName(node)} className="mt-0.5 flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center text-[15px] leading-none" imgClassName="h-[15px] w-[15px] object-contain" />
                      <div className="min-w-0 flex-1">
                        <EditableCell
                          value={getNodeName(node)}
                          isEditing={editing?.nodeId === node.id && editing?.field === 'name'}
                          onStartEdit={() => setEditing({ nodeId: node.id, field: 'name' })}
                          onCommit={(v) => handleEdit(node.id, 'name', v)}
                          onCancel={() => setEditing(null)}
                          type="text"
                          strong={isContainer}
                        />
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                          <span className="truncate">{formatComponentType(node.data.componentType)}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td className={`${cellBase} text-[10px] text-slate-400 font-mono`}>{node.data.componentType}</td>

                  {/* Category */}
                  <td className={cellBase}>
                    <span className="inline-block rounded-full border border-[rgba(138,167,198,0.10)] px-2 py-0.5 text-[9px] uppercase tracking-[0.10em] text-slate-500">
                      {getCategoryLabel(node.data.category)}
                    </span>
                  </td>

                  {/* Parent */}
                  <td className={`${cellBase} text-[10px] text-slate-500`}>
                    {parentNode ? getNodeName(parentNode) : '—'}
                  </td>

                  {/* Replicas — editable */}
                  <td className={editableNumericCell}>
                    <NumericEditableCell
                      value={getConfigNum(node, 'replicas')}
                      isEditing={editing?.nodeId === node.id && editing?.field === 'replicas'}
                      onStartEdit={() => setEditing({ nodeId: node.id, field: 'replicas' })}
                      onCommit={(v) => handleEdit(node.id, 'replicas', v)}
                      onCancel={() => setEditing(null)}
                    />
                  </td>

                  {/* CPU — editable */}
                  <td className={editableNumericCell}>
                    <NumericEditableCell
                      value={getConfigNum(node, 'cpu_cores')}
                      isEditing={editing?.nodeId === node.id && editing?.field === 'cpu_cores'}
                      onStartEdit={() => setEditing({ nodeId: node.id, field: 'cpu_cores' })}
                      onCommit={(v) => handleEdit(node.id, 'cpu_cores', v)}
                      onCancel={() => setEditing(null)}
                    />
                  </td>

                  {/* Memory — editable */}
                  <td className={editableNumericCell}>
                    <NumericEditableCell
                      value={getConfigNum(node, 'memory_gb')}
                      isEditing={editing?.nodeId === node.id && editing?.field === 'memory_gb'}
                      onStartEdit={() => setEditing({ nodeId: node.id, field: 'memory_gb' })}
                      onCommit={(v) => handleEdit(node.id, 'memory_gb', v)}
                      onCancel={() => setEditing(null)}
                    />
                  </td>

                  {/* Max RPS — editable */}
                  <td className={editableNumericCell}>
                    <NumericEditableCell
                      value={getConfigNum(node, 'max_rps_per_broker') ?? getConfigNum(node, 'max_rps_per_node') ?? getConfigNum(node, 'max_rps_per_instance') ?? getConfigNum(node, 'max_rps')}
                      isEditing={editing?.nodeId === node.id && editing?.field === 'max_rps'}
                      onStartEdit={() => setEditing({ nodeId: node.id, field: 'max_rps' })}
                      onCommit={(v) => {
                        const field = node.data.config.max_rps_per_broker != null ? 'max_rps_per_broker' : node.data.config.max_rps_per_node != null ? 'max_rps_per_node' : node.data.config.max_rps_per_instance != null ? 'max_rps_per_instance' : 'max_rps';
                        handleEdit(node.id, field, v);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </td>

                  {/* Connections count */}
                  <td className={`${numericCell} text-slate-500`}>{conns || '—'}</td>

                  {/* Cost — show subtotal when container is collapsed */}
                  {isContainer && hasChildren && isCollapsed ? (
                    <td className={`${numericCell} font-mono text-xs font-semibold text-blue-300`}>
                      {(subtotalMap[node.id] ?? 0) > 0
                        ? `$${(subtotalMap[node.id] ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                  ) : (
                    <td className={`${numericCell} font-mono text-xs ${cost > 0 ? 'text-green-400' : 'text-slate-600'}`}>
                      {cost > 0 ? `$${cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                  )}

                  {/* Actions */}
                  <td className={`${cellBase} text-center`}>
                    <button
                      onClick={() => onNavigateToNode(node.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-md border border-[rgba(110,220,255,0.24)] px-1.5 py-1 text-[10px] font-medium text-[var(--color-accent)] opacity-60 transition-all hover:bg-[rgba(110,220,255,0.10)] group-hover:opacity-100 focus-visible:opacity-100"
                      title="Locate node on canvas"
                      aria-label="Locate node on canvas"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M15 3h6v6" />
                        <path d="M10 14 21 3" />
                        <path d="M21 14v7H3V3h7" />
                      </svg>
                      <span className="hidden group-hover:inline">Locate</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)] bg-[rgba(110,220,255,0.06)]">
              <td className={`${cellBase} font-semibold text-slate-100`} colSpan={5}>
                Total
                <span className="mx-2 text-slate-500">·</span>
                <span className="text-slate-300">{nodes.length} component{nodes.length !== 1 ? 's' : ''}</span>
              </td>
              <td className={`${numericCell} font-mono font-semibold text-slate-200`}>
                {formatAggregate(totalCpu)}
              </td>
              <td className={`${numericCell} font-mono font-semibold text-slate-200`}>
                {formatAggregate(totalMemory)}
              </td>
              <td className={`${numericCell} text-slate-600`}>—</td>
              <td className={`${numericCell} text-slate-600`}>—</td>
              <td className={`${numericCell} font-mono font-semibold text-green-300`}>
                ${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
              <td className={cellBase}></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {nodes.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-400">No components on canvas. Add components from the palette first.</p>
        </div>
      )}
      {nodes.length > 0 && groupedRows.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-slate-400">No components match the current search or filter.</p>
        </div>
      )}
    </div>
  );
}

function EditableCell({
  value,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
  type,
  strong = false,
}: {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  type: 'text';
  strong?: boolean;
}) {
  if (isEditing) {
    return (
      <input
        autoFocus
        type={type}
        defaultValue={value}
        className="w-full px-1 py-0.5 text-sm bg-[var(--color-bg)] border border-blue-500 rounded text-slate-200 focus:outline-none"
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(e.currentTarget.value);
          if (e.key === 'Escape') onCancel();
        }}
      />
    );
  }
  return (
    <span
      className={`block max-w-[240px] truncate cursor-pointer transition-colors hover:text-blue-400 ${strong ? 'font-semibold text-slate-100' : 'text-slate-200'}`}
      onDoubleClick={onStartEdit}
      title="Double-click to edit"
    >
      {value}
    </span>
  );
}

function NumericEditableCell({
  value,
  isEditing,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  value: number | undefined;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: number) => void;
  onCancel: () => void;
}) {
  if (value == null) return <span className="text-slate-600 block text-right">—</span>;

  if (isEditing) {
    return (
      <input
        autoFocus
        type="number"
        defaultValue={value}
        min={0}
        className="w-full px-1 py-0.5 text-sm text-right bg-[var(--color-bg)] border border-blue-500 rounded text-slate-200 focus:outline-none"
        onBlur={(e) => onCommit(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(Number(e.currentTarget.value));
          if (e.key === 'Escape') onCancel();
        }}
      />
    );
  }
  return (
    <span
      className="cursor-pointer hover:text-blue-400 transition-colors font-mono text-xs block text-right"
      onDoubleClick={onStartEdit}
      title="Double-click to edit"
    >
      {value}
    </span>
  );
}
