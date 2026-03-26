import { type DragEvent,useState } from 'react';

import type { ComponentCategory } from '../../../types/index.ts';
import { paletteCategories, type PaletteItem,paletteItems } from './paletteData.ts';

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
      <div className="px-4 py-4 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(110,220,255,0.07),rgba(0,0,0,0))]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)]">Component Library</div>
        <h2 className="mt-2 text-lg font-semibold text-[var(--color-text)]" style={{ fontFamily: 'var(--font-display)' }}>Build Surface</h2>
        <p className="text-xs text-slate-400 mt-1">Open a category, then drag a component onto the canvas.</p>
        <div className="relative mt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            aria-label="Search components"
            className="w-full h-10 rounded-xl border border-[var(--color-border)] bg-[rgba(6,13,19,0.56)] pl-4 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {paletteCategories.map((cat) => {
          const query = search.toLowerCase();
          const items = paletteItems.filter((i) => i.category === cat.key && (!query || i.label.toLowerCase().includes(query) || i.type.toLowerCase().includes(query)));
          if (query && items.length === 0) return null;
          const isExpanded = query ? true : expandedCategory === cat.key;
          return (
            <div key={cat.key} className="mb-2 rounded-lg border border-[rgba(138,167,198,0.24)] bg-[linear-gradient(180deg,rgba(30,44,60,0.98),rgba(16,26,38,1))]">
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                aria-expanded={isExpanded}
                aria-controls={`palette-cat-${cat.key}`}
                className="w-full px-3 py-3 flex items-center justify-between rounded-lg text-sm font-semibold text-slate-100 transition-colors hover:bg-[rgba(110,220,255,0.08)]"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[1.15rem] leading-none">
                    <span className="text-slate-300">{cat.icon}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate">{cat.label}</span>
                      {cat.hint && (
                        <span className="shrink-0 text-[10px] font-normal text-amber-400/80">({cat.hint})</span>
                      )}
                    </span>
                    <span className="mt-0.5 text-right text-[10px] font-medium uppercase tracking-[0.22em] text-slate-300">{items.length} components</span>
                  </span>
                </span>
                <span className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </button>
              {isExpanded && (
                <div id={`palette-cat-${cat.key}`} role="region" className="relative pl-10 pr-3 pb-3 pt-1 space-y-1.5">
                  <div className="pointer-events-none absolute left-[1.15rem] top-1 bottom-4 w-px bg-[linear-gradient(180deg,rgba(110,220,255,0.18),rgba(110,220,255,0.04))]" />
                  {items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      className="group relative flex items-center gap-3 rounded-md border border-[rgba(110,220,255,0.22)] bg-[linear-gradient(180deg,rgba(28,48,68,0.96),rgba(13,24,36,0.98))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_10px_24px_rgba(3,8,14,0.16)] cursor-grab transition-all hover:border-[rgba(110,220,255,0.36)] hover:bg-[linear-gradient(180deg,rgba(34,58,82,0.98),rgba(15,28,41,1))] active:cursor-grabbing"
                    >
                      <span className="pointer-events-none absolute inset-y-1 left-1 w-px rounded-full bg-[linear-gradient(180deg,rgba(110,220,255,0),rgba(110,220,255,0.48),rgba(110,220,255,0))]" />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[1.15rem] leading-none">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{item.label}</span>
                        <span className="block text-[10px] uppercase tracking-[0.22em] text-slate-400">{formatCapability(item.type)}</span>
                      </span>
                      <span className="shrink-0 text-slate-400 transition-colors group-hover:text-[var(--color-accent)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="9" cy="6" r="1.2" />
                          <circle cx="9" cy="12" r="1.2" />
                          <circle cx="9" cy="18" r="1.2" />
                          <circle cx="15" cy="6" r="1.2" />
                          <circle cx="15" cy="12" r="1.2" />
                          <circle cx="15" cy="18" r="1.2" />
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
