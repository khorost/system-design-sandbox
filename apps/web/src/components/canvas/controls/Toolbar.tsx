import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { EdgeLabelMode } from '../../../store/canvasStore.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import { notify } from '../../../utils/notifications.ts';

/* ── tiny inline SVG icons (stroke-based) ── */
const s = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const sLg = { ...s, width: 18, height: 18 };

const IconSave = <svg {...s}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
const IconLoad = <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconTrash = <svg {...s}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
const IconTag = <svg {...sLg}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const IconExport = <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
const IconImport = <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconChevron = <svg {...s}><polyline points="6 9 12 15 18 9"/></svg>;

const labelByMode: Record<EdgeLabelMode, string> = {
  auto: 'Auto',
  protocol: 'Protocol',
  traffic: 'Traffic',
  full: 'Full',
};

const tooltipByMode: Record<EdgeLabelMode, string> = {
  auto: 'Labels: Auto — show on select',
  protocol: 'Labels: Protocol & latency',
  traffic: 'Labels: Throughput & bandwidth',
  full: 'Labels: All info',
};

function MenuItem({ onClick, icon, children, hint, variant = 'default' }: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  hint?: string;
  variant?: 'default' | 'danger';
}) {
  const cls = variant === 'danger'
    ? 'w-full px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded transition-colors flex items-center gap-2.5 whitespace-nowrap'
    : 'w-full px-3 py-2 text-sm text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors flex items-center gap-2.5 whitespace-nowrap';
  return (
    <button onClick={onClick} className={cls}>
      {icon}
      <span className="flex flex-col items-start">
        <span>{children}</span>
        {hint && <span className="text-[10px] leading-tight text-slate-500">{hint}</span>}
      </span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1.5 h-px bg-[var(--color-border)]" />;
}

function FileMenu({ items }: { items: { icon: ReactNode; label: string; hint?: string; onClick: () => void; variant?: 'default' | 'danger' }[][] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 text-xs text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors inline-flex items-center gap-1"
      >
        File {IconChevron}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[180px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1.5 shadow-lg z-50">
          {items.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <MenuDivider />}
              {group.map((item, ii) => (
                <MenuItem
                  key={ii}
                  icon={item.icon}
                  hint={item.hint}
                  variant={item.variant}
                  onClick={() => { setOpen(false); item.onClick(); }}
                >
                  {item.label}
                </MenuItem>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const IconUndo = <svg {...s}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>;
const IconRedo = <svg {...s}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>;

export function Toolbar() {
  const save = useCanvasStore((s) => s.save);
  const load = useCanvasStore((s) => s.load);
  const clear = useCanvasStore((s) => s.clear);
  const exportSchema = useCanvasStore((s) => s.exportSchema);
  const importSchema = useCanvasStore((s) => s.importSchema);
  const exportDsl = useCanvasStore((s) => s.exportDsl);
  const importDsl = useCanvasStore((s) => s.importDsl);
  const edgeLabelMode = useCanvasStore((s) => s.edgeLabelMode);
  const cycleEdgeLabelMode = useCanvasStore((s) => s.cycleEdgeLabelMode);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s._history.past.length > 0);
  const canRedo = useCanvasStore((s) => s._history.future.length > 0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dslFileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportSchema();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importSchema(reader.result as string);
      if (!result.ok) {
        notify.error(`Import failed: ${result.error}`);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  const handleDslExport = () => {
    const dsl = exportDsl();
    const blob = new Blob([dsl], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-${date}.sds`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDslImport = () => {
    dslFileInputRef.current?.click();
  };

  const handleDslFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = importDsl(reader.result as string);
      if (!result.ok) {
        notify.error(`DSL import failed: ${result.error}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClear = () => {
    if (window.confirm('Clear canvas? You can undo with Ctrl+Z.')) {
      clear();
    }
  };

  const menuItems = [
    [
      { icon: IconSave, label: 'Save', onClick: save },
      { icon: IconLoad, label: 'Load', onClick: load },
    ],
    [
      { icon: IconExport, label: 'Export JSON', hint: 'Full schema with positions (.json)', onClick: handleExport },
      { icon: IconImport, label: 'Import JSON', hint: 'Restore from .json file', onClick: handleImport },
    ],
    [
      { icon: IconExport, label: 'Export DSL', hint: 'Compact text format (.sds)', onClick: handleDslExport },
      { icon: IconImport, label: 'Import DSL', hint: 'Restore from .sds file', onClick: handleDslImport },
    ],
    [
      { icon: IconTrash, label: 'Clear canvas', onClick: handleClear, variant: 'danger' as const },
    ],
  ];

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 shadow-lg">
      <span className="text-sm font-bold text-slate-200 mr-2">System Design Sandbox</span>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <FileMenu items={menuItems} />
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <button
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="px-1.5 py-1 text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {IconUndo}
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className="px-1.5 py-1 text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {IconRedo}
      </button>
      <div className="w-px h-5 bg-[var(--color-border)]" />
      <button
        onClick={cycleEdgeLabelMode}
        title={tooltipByMode[edgeLabelMode]}
        className="px-2 py-1 text-sm text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors inline-flex items-center gap-1.5"
      >
        {IconTag} {labelByMode[edgeLabelMode]}
      </button>
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
      <input ref={dslFileInputRef} type="file" accept=".sds,.txt" className="hidden" onChange={handleDslFileChange} />
    </div>
  );
}
