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
        <p className="text-xs text-slate-400 mt-1">Drag components onto the canvas to assemble the system.</p>
        <div className="relative mt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            aria-label="Search components"
            className="w-full px-3 py-2 pl-8 text-sm bg-[rgba(6,13,19,0.56)] border border-[var(--color-border)] rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[var(--color-accent)] transition-colors"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
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
          const isClients = cat.key === 'clients';
          return (
            <div key={cat.key} className={`mb-2 rounded-xl border ${isClients ? 'border-[rgba(255,180,84,0.22)] bg-[rgba(255,180,84,0.05)]' : 'border-[var(--color-border)] bg-[rgba(255,255,255,0.02)]'}`}>
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                aria-expanded={isExpanded}
                aria-controls={`palette-cat-${cat.key}`}
                className={`w-full px-3 py-3 flex items-center justify-between text-sm font-semibold transition-colors ${
                  isClients
                    ? 'text-amber-200 hover:bg-[rgba(255,180,84,0.08)]'
                    : 'text-slate-200 hover:bg-[rgba(110,220,255,0.05)]'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl border ${isClients ? 'border-[rgba(255,180,84,0.22)] bg-[rgba(255,180,84,0.10)]' : 'border-[var(--color-border)] bg-[rgba(255,255,255,0.03)]'}`}>
                    <span className="text-base">{cat.icon}</span>
                  </span>
                  <span className="flex flex-col items-start text-left">
                    <span>{cat.label}</span>
                    <span className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-500">{items.length} components</span>
                  </span>
                  {cat.hint && (
                    <span className="text-[10px] font-normal text-amber-400/70 ml-1">({cat.hint})</span>
                  )}
                </span>
                <span className="text-slate-500 text-xs">
                  {isExpanded ? '−' : '+'}
                </span>
              </button>
              {isExpanded && (
                <div id={`palette-cat-${cat.key}`} role="region" className="px-3 pb-3 space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      className="group flex items-center gap-3 px-3 py-3 rounded-xl cursor-grab active:cursor-grabbing border border-[var(--color-border)] bg-[rgba(6,13,19,0.36)] hover:bg-[rgba(110,220,255,0.06)] hover:border-[rgba(110,220,255,0.25)] transition-all"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(110,220,255,0.14)] bg-[rgba(110,220,255,0.08)] text-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-100">{item.label}</span>
                        <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">{formatCapability(item.type)}</span>
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 transition-colors group-hover:text-[var(--color-accent)]">
                        Drag
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
