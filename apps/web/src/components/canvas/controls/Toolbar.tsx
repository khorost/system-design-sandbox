import { useCanvasStore } from '../../../store/canvasStore.ts';

export function Toolbar() {
  const save = useCanvasStore((s) => s.save);
  const load = useCanvasStore((s) => s.load);
  const clear = useCanvasStore((s) => s.clear);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 shadow-lg">
      <span className="text-sm font-bold text-slate-200 mr-2">System Design Sandbox</span>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <button
        onClick={save}
        className="px-2 py-1 text-xs text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors"
      >
        Save
      </button>
      <button
        onClick={load}
        className="px-2 py-1 text-xs text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors"
      >
        Load
      </button>
      <button
        onClick={clear}
        className="px-2 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
