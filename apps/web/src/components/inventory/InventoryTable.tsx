import { estimateMonthlyCost } from '@system-design-sandbox/component-library';
import { useCallback,useMemo, useState } from 'react';

import { useCanvasStore } from '../../store/canvasStore.ts';
import type { ComponentNode } from '../../types/index.ts';
import { CONTAINER_TYPES } from '../../utils/networkLatency.ts';
import { paletteCategories,paletteItems } from '../canvas/controls/paletteData.ts';

type SortKey = 'name' | 'type' | 'category' | 'cost';
type SortDir = 'asc' | 'desc';

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

function getConfigNum(node: ComponentNode, key: string): number | undefined {
  const val = node.data.config[key];
  return typeof val === 'number' ? val : undefined;
}

const cellBase = 'px-3 py-2 text-sm text-slate-300 border-b border-[var(--color-border)] whitespace-nowrap';
const editableCell = `${cellBase} bg-blue-500/[0.10]`;
const numericCell = `${cellBase} text-right`;
const editableNumericCell = `${editableCell} text-right`;
const headerBase = 'px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-[var(--color-border)] bg-[var(--color-surface)] sticky top-0 z-10 select-none';

export function InventoryTable({ onNavigateToNode }: InventoryTableProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const updateNodeConfig = useCanvasStore((s) => s.updateNodeConfig);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
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
    const topLevel = nodes.filter((n) => !n.parentId);
    const childrenOf = (parentId: string) =>
      nodes.filter((n) => n.parentId === parentId);

    // Sort comparator
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

    type Row =
      | { kind: 'node'; node: ComponentNode; depth: number; isContainer: boolean }
      | { kind: 'subtotal'; containerId: string; containerName: string; depth: number; subtotal: number; childCount: number };
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
          rows.push({
            kind: 'subtotal',
            containerId: node.id,
            containerName: getNodeName(node),
            depth,
            subtotal: subtotalMap[node.id] ?? 0,
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
    const orphans = nodes.filter((n) => !includedIds.has(n.id) && n.parentId && !allNodeIds.has(n.parentId));
    for (const o of orphans) {
      rows.push({ kind: 'node', node: o, depth: 0, isContainer: false });
    }

    return rows;
  }, [nodes, sortKey, sortDir, collapsed, costMap, subtotalMap]);

  const totalCost = useMemo(
    () => Object.values(costMap).reduce((s, v) => s + v, 0),
    [costMap],
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
              <th className={`${headerBase} cursor-pointer hover:text-slate-200`} onClick={() => toggleSort('name')}>
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
                  <tr key={`sub-${row.containerId}`} className="bg-white/[0.02]">
                    <td className={`${cellBase} text-xs text-slate-400 italic`} colSpan={9} style={{ paddingLeft: 20 + row.depth * 20 }}>
                      Subtotal: {row.containerName} ({row.childCount} item{row.childCount !== 1 ? 's' : ''})
                    </td>
                    <td className={`${numericCell} font-mono text-xs font-semibold text-slate-400`}>
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
                <tr key={node.id} className="hover:bg-white/[0.03] transition-colors">
                  {/* Name with icon */}
                  <td className={editableCell}>
                    <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
                      {isContainer && hasChildren && (
                        <button
                          onClick={() => toggleCollapse(node.id)}
                          className="text-xs text-slate-400 hover:text-slate-300 w-4 flex-shrink-0"
                        >
                          {isCollapsed ? '\u25B6' : '\u25BC'}
                        </button>
                      )}
                      {isContainer && !hasChildren && <span className="w-4 flex-shrink-0" />}
                      {!isContainer && depth > 0 && <span className="w-4 flex-shrink-0" />}
                      <span className="text-base flex-shrink-0">{icon}</span>
                      <EditableCell
                        value={getNodeName(node)}
                        isEditing={editing?.nodeId === node.id && editing?.field === 'name'}
                        onStartEdit={() => setEditing({ nodeId: node.id, field: 'name' })}
                        onCommit={(v) => handleEdit(node.id, 'name', v)}
                        onCancel={() => setEditing(null)}
                        type="text"
                      />
                    </div>
                  </td>

                  {/* Type */}
                  <td className={`${cellBase} text-slate-400 text-xs font-mono`}>{node.data.componentType}</td>

                  {/* Category */}
                  <td className={cellBase}>
                    <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-white/[0.06] text-slate-400">
                      {getCategoryLabel(node.data.category)}
                    </span>
                  </td>

                  {/* Parent */}
                  <td className={`${cellBase} text-slate-400 text-xs`}>
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
                      value={getConfigNum(node, 'max_rps_per_instance') ?? getConfigNum(node, 'max_rps')}
                      isEditing={editing?.nodeId === node.id && editing?.field === 'max_rps'}
                      onStartEdit={() => setEditing({ nodeId: node.id, field: 'max_rps' })}
                      onCommit={(v) => {
                        const field = node.data.config.max_rps_per_instance != null ? 'max_rps_per_instance' : 'max_rps';
                        handleEdit(node.id, field, v);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  </td>

                  {/* Connections count */}
                  <td className={`${numericCell} text-slate-400`}>{conns || '—'}</td>

                  {/* Cost — show subtotal when container is collapsed */}
                  {isContainer && hasChildren && isCollapsed ? (
                    <td className={`${numericCell} font-mono text-xs font-semibold text-slate-400`}>
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
                      className="px-2 py-1 text-xs text-blue-400 border border-blue-400/30 rounded hover:bg-blue-400/10 transition-colors"
                      title="Go to node on canvas"
                    >
                      Go to
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--color-border)]">
              <td className={`${cellBase} font-semibold text-slate-200`} colSpan={9}>
                Total: {nodes.length} component{nodes.length !== 1 ? 's' : ''}
              </td>
              <td className={`${numericCell} font-mono font-semibold text-green-400`}>
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
}: {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  type: 'text';
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
      className="cursor-pointer hover:text-blue-400 transition-colors truncate block max-w-[160px]"
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
