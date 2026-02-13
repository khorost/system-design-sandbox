import { useState, type DragEvent } from 'react';
import { paletteCategories, paletteItems, type PaletteItem } from './paletteData.ts';
import type { ComponentCategory } from '../../../types/index.ts';

export function ComponentPalette() {
  const [expandedCategory, setExpandedCategory] = useState<ComponentCategory | null>('infrastructure');

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
      </div>
      <div className="flex-1 overflow-y-auto">
        {paletteCategories.map((cat) => {
          const items = paletteItems.filter((i) => i.category === cat.key);
          const isExpanded = expandedCategory === cat.key;
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
                  {items.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, item)}
                      className="flex items-center gap-2 px-3 py-2 rounded-md cursor-grab active:cursor-grabbing hover:bg-[var(--color-surface-hover)] transition-colors border border-transparent hover:border-[var(--color-border)]"
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span className="text-sm text-slate-300">{item.label}</span>
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
