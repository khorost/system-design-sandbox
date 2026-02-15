import { type DragEvent,useState } from 'react';

import { CONTAINER_COLORS,NODE_TYPE_COLORS } from '../../../constants/colors.ts';
import type { ComponentCategory } from '../../../types/index.ts';
import { NODE_TYPE_MAP } from '../../../types/index.ts';
import { paletteCategories, type PaletteItem,paletteItems } from './paletteData.ts';

function getItemColor(type: string): string {
  return CONTAINER_COLORS[type] ?? NODE_TYPE_COLORS[NODE_TYPE_MAP[type] ?? ''] ?? '#475569';
}

export function ComponentPalette() {
  const [expandedCategory, setExpandedCategory] = useState<ComponentCategory | null>('infrastructure');
  const [search, setSearch] = useState('');

  const onDragStart = (event: DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData('application/reactflow-type', item.type);
    event.dataTransfer.setData('application/reactflow-label', item.label);
    event.dataTransfer.setData('application/reactflow-icon', item.icon);
    event.dataTransfer.setData('application/reactflow-category', item.category);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-[var(--color-border)]">
        <h2 className="text-base font-bold text-slate-200">Components</h2>
        <p className="text-xs text-slate-400 mt-0.5">Drag to canvas</p>
        <div className="relative mt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full px-3 py-1.5 pl-8 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {paletteCategories.map((cat) => {
          const query = search.toLowerCase();
          const items = paletteItems.filter((i) => i.category === cat.key && (!query || i.label.toLowerCase().includes(query) || i.type.toLowerCase().includes(query)));
          if (query && items.length === 0) return null;
          const isExpanded = query ? true : expandedCategory === cat.key;
          const isClients = cat.key === 'clients';
          return (
            <div key={cat.key} className={isClients ? 'border-b border-amber-500/20' : ''}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                className={`w-full px-3 py-2.5 flex items-center justify-between text-sm font-semibold transition-colors ${
                  isClients
                    ? 'text-amber-300 hover:bg-amber-500/10'
                    : 'text-slate-300 hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm">{cat.icon}</span>
                  <span>{cat.label}</span>
                  {cat.hint && (
                    <span className="text-[10px] font-normal text-amber-400/70 ml-0.5">({cat.hint})</span>
                  )}
                </span>
                <span className="text-slate-500 text-xs">
                  {items.length} {isExpanded ? '▼' : '▶'}
                </span>
              </button>
              {isExpanded && (
                <div className="px-2 pb-2 space-y-1">
                  {items.map((item) => {
                    const color = getItemColor(item.type);
                    return (
                      <div
                        key={item.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, item)}
                        className="flex items-center gap-2 px-3 py-2 rounded-md cursor-grab active:cursor-grabbing hover:bg-[var(--color-surface-hover)] transition-colors border border-transparent hover:border-[var(--color-border)]"
                        style={{ borderLeftColor: color, borderLeftWidth: 2, borderLeftStyle: 'solid' }}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-sm text-slate-300">{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
