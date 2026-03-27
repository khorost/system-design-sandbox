import { type DragEvent, useState } from 'react';

import type { ComponentCategory } from '../../../types/index.ts';
import { ComponentIcon } from '../../ui/ComponentIcon.tsx';
import { paletteCategories, type PaletteItem, paletteItems } from './paletteData.ts';

function formatCapability(type: string) {
  return type.replaceAll('_', ' ');
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
    <div className="border-r border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(19,32,44,0.95),rgba(13,23,34,0.96))] flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(110,220,255,0.07),rgba(0,0,0,0))]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)]">Component Library</div>
        <h2 className="mt-1 text-base font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Add Components</h2>
        <p className="mt-0.5 text-[11px] leading-tight text-slate-400">Open a category, then drag a component onto the canvas.</p>
        <div className="relative mt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components"
            aria-label="Search components"
            className="w-full h-8 rounded-lg border border-[var(--color-border)] bg-[rgba(6,13,19,0.56)] px-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-1">
        {paletteCategories.map((cat) => {
          const query = search.toLowerCase();
          const items = paletteItems.filter((i) => i.category === cat.key && (!query || i.label.toLowerCase().includes(query) || i.type.toLowerCase().includes(query)));
          if (query && items.length === 0) return null;
          const isExpanded = query ? true : expandedCategory === cat.key;
          return (
            <div key={cat.key} className={`rounded-lg border ${isExpanded ? 'border-[rgba(110,220,255,0.22)] bg-[rgba(24,36,50,0.72)]' : 'border-[rgba(138,167,198,0.16)] bg-[rgba(24,36,50,0.6)]'}`}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                aria-expanded={isExpanded}
                aria-controls={`palette-cat-${cat.key}`}
                className="w-full px-2.5 py-2 flex items-center justify-between rounded-lg text-xs font-semibold text-slate-100 transition-colors hover:bg-[rgba(110,220,255,0.08)]"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none">
                    <span className="text-slate-300">{cat.icon}</span>
                  </span>
                  <span className="min-w-0 truncate">{cat.label}</span>
                  {cat.hint && (
                    <span className="shrink-0 rounded-full border border-[rgba(255,180,84,0.18)] bg-[rgba(255,180,84,0.10)] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.08em] text-amber-300">
                      {cat.hint}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-[rgba(138,167,198,0.14)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    {items.length}
                  </span>
                  <span className={`shrink-0 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </span>
              </button>
              {isExpanded && (
                <div id={`palette-cat-${cat.key}`} role="region" className="relative pl-8 pr-2 pb-2 pt-0.5 space-y-0.5">
                  <div className="pointer-events-none absolute left-[0.9rem] top-0.5 bottom-3 w-px bg-[linear-gradient(180deg,rgba(110,220,255,0.18),rgba(110,220,255,0.04))]" />
                  {items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      role="menuitem"
                      className="group relative flex items-center gap-2 rounded-md border border-[rgba(110,220,255,0.14)] bg-[rgba(20,34,50,0.76)] px-2 py-1.25 cursor-grab transition-all hover:border-[rgba(110,220,255,0.32)] hover:bg-[rgba(28,48,68,0.84)] active:cursor-grabbing"
                    >
                      <span className="pointer-events-none absolute inset-y-0.5 left-0.5 w-px rounded-full bg-[linear-gradient(180deg,rgba(110,220,255,0),rgba(110,220,255,0.38),rgba(110,220,255,0))]" />
                      <ComponentIcon icon={item.icon} alt={item.label} className="flex h-5 w-5 shrink-0 items-center justify-center text-sm leading-none" imgClassName="h-5 w-5 object-contain" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-slate-100 truncate">{item.label}</span>
                        <span className="block text-[9px] uppercase tracking-[0.18em] text-slate-500 truncate">{formatCapability(item.type)}</span>
                      </span>
                      <span className="shrink-0 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="9" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" />
                          <circle cx="15" cy="6" r="1.5" />
                          <circle cx="15" cy="12" r="1.5" />
                          <circle cx="15" cy="18" r="1.5" />
                        </svg>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
