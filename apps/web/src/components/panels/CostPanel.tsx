import { useEffect } from 'react';
import { useCostStore } from '../../store/costStore.ts';
import { useCanvasStore } from '../../store/canvasStore.ts';

const CATEGORY_LABELS: Record<string, string> = {
  compute: 'Compute',
  storage: 'Storage',
  network: 'Network',
  messaging: 'Messaging',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  compute: 'text-blue-400',
  storage: 'text-purple-400',
  network: 'text-green-400',
  messaging: 'text-yellow-400',
  other: 'text-slate-400',
};

export function CostPanel() {
  const nodes = useCanvasStore((s) => s.nodes);
  const { items, totalMonthlyCost, byCategory, recalculate } = useCostStore();

  useEffect(() => {
    recalculate();
  }, [nodes, recalculate]);

  if (items.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Cost Estimation</h3>
        <p className="text-sm text-slate-500">Add components to see cost estimates.</p>
      </div>
    );
  }

  const categories = Object.keys(byCategory).sort();

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Cost Estimation</h3>

      <div className="bg-[var(--color-bg)] rounded-lg p-4 text-center">
        <div className="text-xs text-slate-500 uppercase">Monthly Total</div>
        <div className="text-2xl font-bold text-slate-100 font-mono">
          ${totalMonthlyCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="space-y-3">
        {categories.map((cat) => (
          <div key={cat}>
            <div className="flex justify-between items-center mb-1">
              <span className={`text-xs font-semibold uppercase tracking-wider ${CATEGORY_COLORS[cat] || 'text-slate-400'}`}>
                {CATEGORY_LABELS[cat] || cat}
              </span>
              <span className="text-xs font-mono text-slate-300">
                ${byCategory[cat].toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="space-y-1">
              {items
                .filter((item) => item.category === cat)
                .map((item) => (
                  <div key={item.nodeId} className="flex justify-between items-center px-3 py-2 bg-[var(--color-bg)] rounded text-xs">
                    <span className="text-slate-300 truncate mr-2">{item.label}</span>
                    <span className="text-slate-400 font-mono shrink-0">
                      ${item.monthlyCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
