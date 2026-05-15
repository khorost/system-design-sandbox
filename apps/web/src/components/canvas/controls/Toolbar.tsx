import { type ReactNode, useEffect, useRef, useState } from 'react';

import { createArchitecture, updateArchitecture } from '../../../api/architectures.ts';
import { useAuthStore } from '../../../store/authStore.ts';
import type { CanvasDisplayMode, EdgeLabelMode, EdgeRoutingMode } from '../../../store/canvasStore.ts';
import { useCanvasStore } from '../../../store/canvasStore.ts';
import type { ArchitectureSchema } from '../../../types/index.ts';
import { notify } from '../../../utils/notifications.ts';
import { SavedArchitecturesModal } from '../../SavedArchitecturesModal.tsx';

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

const labelByRoutingMode: Record<EdgeRoutingMode, string> = {
  bezier: 'Curved',
  orthogonal: 'Ortho',
};

const tooltipByRoutingMode: Record<EdgeRoutingMode, string> = {
  bezier: 'Edges: Bezier curves',
  orthogonal: 'Edges: Orthogonal (Manhattan)',
};

const labelByDisplayMode: Record<CanvasDisplayMode, string> = {
  '2d': '2D',
  '3d': 'Iso',
};

const tooltipByDisplayMode: Record<CanvasDisplayMode, string> = {
  '2d': 'Canvas: flat 2D view',
  '3d': 'Canvas: isometric diorama view (read-only)',
};

const IconRoute = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 16 15 20 7" />
  </svg>
);

const IconCube = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
    <path d="M12 20v-9.5" />
    <path d="M20 6.5l-8 4.5-8-4.5" />
  </svg>
);

function MenuItem({ onClick, icon, children, hint, variant = 'default', disabled = false }: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  hint?: string;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}) {
  const base = 'w-full px-3 py-2 text-sm rounded transition-colors flex items-center gap-2.5 whitespace-nowrap';
  const cls = disabled
    ? `${base} text-slate-500 cursor-not-allowed`
    : variant === 'danger'
      ? `${base} text-red-400 hover:bg-red-400/10`
      : `${base} text-slate-300 hover:bg-[var(--color-surface-hover)]`;
  return (
    <button onClick={disabled ? undefined : onClick} className={cls} role="menuitem" aria-disabled={disabled}>
      {icon}
      <span className="flex flex-col items-start">
        <span>{children}</span>
        {hint && <span className="text-[10px] leading-tight text-slate-400">{hint}</span>}
      </span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1.5 h-px bg-[var(--color-border)]" />;
}

type ToolbarMenuGroup = {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
};

function DropdownMenu({
  label,
  ariaLabel,
  items,
}: {
  label: string;
  ariaLabel: string;
  items: ToolbarMenuGroup[][];
}) {
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
        aria-label={ariaLabel}
        aria-haspopup="true"
        aria-expanded={open}
        className="px-2 py-1 text-xs text-slate-300 hover:bg-[var(--color-surface-hover)] rounded transition-colors inline-flex items-center gap-1"
      >
        {label} {IconChevron}
      </button>
      {open && (
        <div role="menu" className="absolute top-full left-0 mt-1 min-w-[180px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1.5 shadow-lg z-50">
          {items.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <MenuDivider />}
              {group.map((item, ii) => (
                <MenuItem
                  key={ii}
                  icon={item.icon}
                  hint={item.hint}
                  variant={item.variant}
                  disabled={item.disabled}
                  onClick={() => { if (!item.disabled) { setOpen(false); item.onClick(); } }}
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
const IconCloud = <svg {...s}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>;
const IconCopy = <svg {...s}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
const IconClipboardCopy = <svg {...s}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="17 8 12 3 7 8"/></svg>;
const IconClipboardPaste = <svg {...s}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><polyline points="7 14 12 19 17 14"/></svg>;
const IconFolder = <svg {...s}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;

function buildSchemaForSave(): ArchitectureSchema {
  const { nodes, edges, schemaName } = useCanvasStore.getState();
  const now = new Date().toISOString();
  return {
    version: '1.0',
    metadata: { name: schemaName || 'My Architecture', createdAt: now, updatedAt: now },
    nodes,
    edges,
  };
}

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
  const edgeRoutingMode = useCanvasStore((s) => s.edgeRoutingMode);
  const cycleEdgeRoutingMode = useCanvasStore((s) => s.cycleEdgeRoutingMode);
  const displayMode = useCanvasStore((s) => s.displayMode);
  const toggleDisplayMode = useCanvasStore((s) => s.toggleDisplayMode);
  const rotateIso = useCanvasStore((s) => s.rotateIso);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const canUndo = useCanvasStore((s) => s._history.past.length > 0);
  const canRedo = useCanvasStore((s) => s._history.future.length > 0);
  const schemaName = useCanvasStore((s) => s.schemaName);
  const architectureId = useCanvasStore((s) => s.architectureId);
  const isPublic = useCanvasStore((s) => s.isPublic);
  const setArchitectureId = useCanvasStore((s) => s.setArchitectureId);
  const setSchemaName = useCanvasStore((s) => s.setSchemaName);

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = !!user;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dslFileInputRef = useRef<HTMLInputElement>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);

  const canSaveToServer = isAuthenticated && schemaName.trim().length > 0;

  const handleSaveToServer = async () => {
    if (!user || !schemaName.trim()) return;
    const { schemaDescription, schemaTags } = useCanvasStore.getState();
    try {
      const data = buildSchemaForSave();
      if (architectureId) {
        await updateArchitecture(architectureId, schemaName, schemaDescription, data, isPublic, schemaTags);
        notify.success('Saved');
      } else {
        const result = await createArchitecture(schemaName, schemaDescription, data, isPublic, schemaTags);
        setArchitectureId(result.id);
        notify.success('Saved');
      }
    } catch (e) {
      notify.error(`Save failed: ${(e as Error).message}`);
    }
  };

  const handleSaveAs = async () => {
    if (!user) return;
    const name = window.prompt('Name for the copy:', schemaName || 'My Architecture');
    if (!name?.trim()) return;
    const { schemaDescription, schemaTags } = useCanvasStore.getState();
    try {
      const data = buildSchemaForSave();
      const result = await createArchitecture(name, schemaDescription, data, isPublic, schemaTags);
      setArchitectureId(result.id);
      setSchemaName(name);
      notify.success('Saved as new copy');
    } catch (e) {
      notify.error(`Save failed: ${(e as Error).message}`);
    }
  };

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

  const handleCopyToClipboard = async () => {
    const json = exportSchema();
    await navigator.clipboard.writeText(json);
    notify.success('Schema copied to clipboard');
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const result = importSchema(text);
      if (!result.ok) {
        notify.error(`Paste failed: ${result.error}`);
      } else {
        notify.success('Schema imported from clipboard');
      }
    } catch {
      notify.error('Cannot read clipboard. Check browser permissions.');
    }
  };

  const handleClear = () => {
    if (window.confirm('Clear canvas? You can undo with Ctrl+Z.')) {
      clear();
    }
  };

  // Ctrl+S handler for save to server
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (canSaveToServer) {
          handleSaveToServer();
        } else {
          save();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  const fileMenuItems: ToolbarMenuGroup[][] = [
    [
      { icon: IconCloud, label: 'Save to server', hint: 'Ctrl+S — Requires sign-in', onClick: handleSaveToServer, disabled: !canSaveToServer },
      { icon: IconCopy, label: 'Save As...', hint: 'Save a copy with a new name', onClick: handleSaveAs, disabled: !isAuthenticated },
      { icon: IconFolder, label: 'Open from server...', hint: 'Load a saved architecture', onClick: () => setShowOpenModal(true), disabled: !isAuthenticated },
    ],
    [
      { icon: IconSave, label: 'Save locally', hint: 'Browser storage', onClick: save },
      { icon: IconLoad, label: 'Load local', hint: 'From browser storage', onClick: load },
    ],
    [
      { icon: IconExport, label: 'Export JSON', hint: 'Full schema with positions (.json)', onClick: handleExport },
      { icon: IconImport, label: 'Import JSON', hint: 'Restore from .json file', onClick: handleImport },
    ],
    [
      { icon: IconExport, label: 'Export DSL', hint: 'Compact text format (.sds)', onClick: handleDslExport },
      { icon: IconImport, label: 'Import DSL', hint: 'Restore from .sds file', onClick: handleDslImport },
    ],
  ];

  const bufferMenuItems: ToolbarMenuGroup[][] = [
    [
      { icon: IconClipboardCopy, label: 'Copy to clipboard', hint: 'Copy schema as JSON', onClick: handleCopyToClipboard },
      { icon: IconClipboardPaste, label: 'Paste from clipboard', hint: 'Import schema from clipboard', onClick: handlePasteFromClipboard },
    ],
    [
      { icon: IconUndo, label: 'Undo', hint: 'Ctrl+Z', onClick: undo, disabled: !canUndo },
      { icon: IconRedo, label: 'Redo', hint: 'Ctrl+Shift+Z', onClick: redo, disabled: !canRedo },
    ],
    [
      { icon: IconTrash, label: 'Clear canvas', onClick: handleClear, variant: 'danger' as const },
    ],
  ];

  return (
    <>
      <div className="absolute top-3 left-3 right-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-[var(--color-border)] bg-[rgba(19,32,44,0.88)] px-3 py-2 shadow-[var(--shadow-panel)] backdrop-blur lg:left-1/2 lg:right-auto lg:w-auto lg:max-w-none lg:-translate-x-1/2 lg:flex-nowrap lg:gap-1 lg:py-1.5">
        <span className="mr-1 flex min-w-[4.5rem] flex-col lg:mr-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">Workbench</span>
          <span className="text-sm font-bold text-slate-100 lg:hidden">Tools</span>
          <span className="hidden text-sm font-bold text-slate-100 lg:block">Canvas Tools</span>
        </span>
        <div className="hidden h-5 w-px bg-[var(--color-border)] lg:block" />
        <DropdownMenu label="Files" ariaLabel="File actions menu" items={fileMenuItems} />
        <div className="hidden h-5 w-px bg-[var(--color-border)] lg:block" />
        <DropdownMenu label="Buffer" ariaLabel="Buffer actions menu" items={bufferMenuItems} />
        <div className="hidden h-5 w-px bg-[var(--color-border)] lg:block" />
        <button
          onClick={toggleDisplayMode}
          title={tooltipByDisplayMode[displayMode]}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          {IconCube} {labelByDisplayMode[displayMode]}
        </button>
        {displayMode === '3d' && (
          <>
            <button
              onClick={() => rotateIso(-1)}
              title="Rotate view left"
              className="inline-flex items-center justify-center rounded w-7 h-7 text-slate-400 transition-colors hover:bg-[var(--color-surface-hover)] hover:text-slate-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <button
              onClick={() => rotateIso(1)}
              title="Rotate view right"
              className="inline-flex items-center justify-center rounded w-7 h-7 text-slate-400 transition-colors hover:bg-[var(--color-surface-hover)] hover:text-slate-200"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
            </button>
          </>
        )}
        <button
          onClick={cycleEdgeLabelMode}
          title={tooltipByMode[edgeLabelMode]}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          {IconTag} {labelByMode[edgeLabelMode]}
        </button>
        <button
          onClick={cycleEdgeRoutingMode}
          title={tooltipByRoutingMode[edgeRoutingMode]}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-[var(--color-surface-hover)]"
        >
          {IconRoute} {labelByRoutingMode[edgeRoutingMode]}
        </button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        <input ref={dslFileInputRef} type="file" accept=".sds,.txt" className="hidden" onChange={handleDslFileChange} />
      </div>
      {showOpenModal && <SavedArchitecturesModal onClose={() => setShowOpenModal(false)} />}
    </>
  );
}
