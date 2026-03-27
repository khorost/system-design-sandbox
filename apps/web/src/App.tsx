import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { CodeVerifyPage } from './components/auth/CodeVerifyPage.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { OnboardingPage } from './components/auth/OnboardingPage.tsx';
import { UserMenu } from './components/auth/UserMenu.tsx';
import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { InventoryTable } from './components/inventory/InventoryTable.tsx';
import { MetricsPanel } from './components/panels/MetricsPanel.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';
import { SimulationPanel } from './components/panels/SimulationPanel.tsx';
import { TrafficPanel } from './components/panels/TrafficPanel.tsx';
import { PlatformStatus } from './components/ui/PlatformStatus.tsx';
import { ToastContainer } from './components/ui/ToastContainer.tsx';
import { usePlatformMetrics } from './hooks/usePlatformMetrics.ts';
import { useVersionCheck } from './hooks/useVersionCheck.ts';
import { useWhatIfMode } from './hooks/useWhatIfMode.ts';
import { useAuthStore } from './store/authStore.ts';
import { useCanvasStore } from './store/canvasStore.ts';
import { useSimulationStore } from './store/simulationStore.ts';

type ViewMode = 'canvas' | 'table';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-sm text-red-400">
          <p className="font-bold">Render error:</p>
          <pre className="mt-1 text-xs whitespace-pre-wrap text-red-300">{this.state.error.message}</pre>
          <button onClick={() => this.setState({ error: null })} className="mt-2 px-3 py-1.5 bg-red-500/20 rounded hover:bg-red-500/30">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const TOP_TABS = ['Properties', 'Traffic'] as const;
type TopTab = (typeof TOP_TABS)[number];

const BOTTOM_TABS = ['Simulation', 'Metrics'] as const;
type BottomTab = (typeof BOTTOM_TABS)[number];

function tabClass(active: boolean) {
  return `flex-1 inline-flex items-center justify-center py-1.5 px-2 text-[10px] leading-none uppercase tracking-[0.18em] font-semibold rounded-md transition-all ${
    active
      ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(110,220,255,0.32)]'
      : 'text-slate-400 hover:text-slate-200'
  }`;
}

function WorkspaceBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warm' }) {
  const toneClass = tone === 'accent'
    ? 'border-[rgba(110,220,255,0.28)] bg-[rgba(110,220,255,0.10)] text-[var(--color-accent)]'
    : tone === 'warm'
      ? 'border-[rgba(255,180,84,0.24)] bg-[rgba(255,180,84,0.10)] text-[var(--color-accent-warm)]'
      : 'border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] text-slate-300';

  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClass}`}>
      {children}
    </span>
  );
}

function RightPanel() {
  const [activeTopTab, setActiveTopTab] = useState<TopTab>('Properties');
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('Simulation');

  return (
    <div className="border-l border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(18,30,42,0.98),rgba(11,18,28,0.98))] p-1.5 flex flex-col gap-1.5 h-full overflow-y-auto">
      <div className="flex flex-col min-h-[180px] flex-[1.08] overflow-hidden rounded-lg border border-[rgba(138,167,198,0.16)] bg-[rgba(20,32,46,0.9)]">
        <div className="px-3 pt-3 pb-2 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(110,220,255,0.06),rgba(0,0,0,0))]">
          <div className="text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)]">Inspector</div>
          <div className="mt-2 flex gap-0.5 rounded-md border border-[var(--color-border)] bg-[rgba(6,13,19,0.52)] p-0.5">
            {TOP_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTopTab(tab)}
                className={tabClass(activeTopTab === tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto rounded-b-lg">
          <ErrorBoundary key={activeTopTab}>
            {activeTopTab === 'Properties' && <PropertiesPanel />}
            {activeTopTab === 'Traffic' && <TrafficPanel />}
          </ErrorBoundary>
        </div>
      </div>

      <div className="flex flex-col min-h-[160px] flex-[0.92] overflow-hidden rounded-lg border border-[rgba(255,180,84,0.16)] bg-[rgba(20,28,40,0.9)]">
        <div className="px-3 pt-3 pb-2 border-b border-[rgba(255,180,84,0.12)] bg-[linear-gradient(180deg,rgba(255,180,84,0.07),rgba(0,0,0,0))]">
          <div className="text-[9px] font-semibold uppercase tracking-[0.32em] text-[var(--color-accent-warm)]">Workspace Simulation</div>
          <div className="mt-2 flex gap-0.5 rounded-md border border-[var(--color-border)] bg-[rgba(6,13,19,0.52)] p-0.5">
            {BOTTOM_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveBottomTab(tab)}
                className={tabClass(activeBottomTab === tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto rounded-b-lg">
          <ErrorBoundary key={activeBottomTab}>
            {activeBottomTab === 'Simulation' && <SimulationPanel />}
            {activeBottomTab === 'Metrics' && <MetricsPanel />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtBw(kbps: number): string {
  if (kbps >= 1_048_576) return `${(kbps / 1_048_576).toFixed(1)} GB/s`;
  if (kbps >= 1_024) return `${(kbps / 1_024).toFixed(1)} MB/s`;
  return `${kbps.toFixed(0)} KB/s`;
}

function FloatingSimControls() {
  const isRunning = useSimulationStore((s) => s.isRunning);
  const isPaused = useSimulationStore((s) => s.isPaused);
  const currentMetrics = useSimulationStore((s) => s.currentMetrics);
  const { start, stop, pause, resume } = useSimulationStore.getState();
  const statusLabel = isRunning ? (isPaused ? 'Paused' : 'Running') : 'Stopped';
  const statusClass = isRunning
    ? isPaused
      ? 'border-[rgba(251,191,36,0.26)] bg-[rgba(251,191,36,0.10)] text-amber-300'
      : 'border-[rgba(34,197,94,0.26)] bg-[rgba(34,197,94,0.10)] text-emerald-300'
    : 'border-[rgba(138,167,198,0.18)] bg-[rgba(138,167,198,0.08)] text-slate-300';

  return (
    <div className="absolute bottom-36 right-4 z-20 w-[200px] rounded-xl border border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(24,39,54,0.96),rgba(13,23,34,0.98))] p-2.5 shadow-[var(--shadow-panel)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-warm)]">Sim</div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-2.5 rounded-lg border border-[var(--color-border)] bg-[rgba(7,12,19,0.28)] p-2">
        {!isRunning ? (
          <button onClick={() => start()} className="flex w-full min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-500/28 bg-emerald-500/14 px-3 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/22">
            <span className="text-xs">▶</span>
            <span>Start</span>
          </button>
        ) : isPaused ? (
          <div className="space-y-2">
            <button onClick={() => resume()} className="flex w-full min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-500/28 bg-emerald-500/14 px-3 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/22">
              <span className="text-xs">▶</span>
              <span>Resume</span>
            </button>
            <button onClick={() => stop()} className="flex w-full min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/24 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/16">
              <span className="text-xs">■</span>
              <span>Stop</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button onClick={() => pause()} className="flex w-full min-h-10 items-center justify-center gap-2 rounded-md border border-amber-500/28 bg-amber-500/12 px-3 py-2.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/18">
              <span className="text-xs">❚❚</span>
              <span>Pause</span>
            </button>
            <button onClick={() => stop()} className="flex w-full min-h-10 items-center justify-center gap-2 rounded-md border border-rose-500/24 bg-rose-500/10 px-3 py-2.5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/16">
              <span className="text-xs">■</span>
              <span>Stop</span>
            </button>
          </div>
        )}
      </div>

      {currentMetrics && (
        <div className="mt-2.5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Live</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-[rgba(138,167,198,0.14)] bg-[linear-gradient(180deg,rgba(18,28,40,0.94),rgba(10,18,28,0.98))] px-2.5 py-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">P95</div>
              <div className="mt-1 text-[13px] font-mono font-semibold leading-none text-slate-100">{currentMetrics.latencyP95.toFixed(1)} ms</div>
            </div>
            <div className="rounded-md border border-[rgba(138,167,198,0.14)] bg-[linear-gradient(180deg,rgba(18,28,40,0.94),rgba(10,18,28,0.98))] px-2.5 py-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">RPS</div>
              <div className="mt-1 text-[13px] font-mono font-semibold leading-none text-slate-100">{fmtNum(currentMetrics.throughput)}/s</div>
            </div>
            <div className="rounded-md border border-[rgba(138,167,198,0.14)] bg-[linear-gradient(180deg,rgba(18,28,40,0.94),rgba(10,18,28,0.98))] px-2.5 py-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">Err</div>
              <div className={`mt-1 text-[13px] font-mono font-semibold leading-none ${currentMetrics.errorRate > 0.05 ? 'text-rose-200' : 'text-slate-100'}`}>{(currentMetrics.errorRate * 100).toFixed(1)}%</div>
            </div>
            <div className="rounded-md border border-[rgba(138,167,198,0.14)] bg-[linear-gradient(180deg,rgba(18,28,40,0.94),rgba(10,18,28,0.98))] px-2.5 py-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">I/O</div>
              <div className="mt-1 space-y-1.5 text-[10px] font-mono font-semibold leading-none text-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">In</span>
                  <span className="text-right text-[10px]">{fmtBw(currentMetrics.totalInboundKBps)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Out</span>
                  <span className="text-right text-[10px]">{fmtBw(currentMetrics.totalOutboundKBps)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MainApp() {
  useWhatIfMode();
  usePlatformMetrics();
  const { updateAvailable, reload } = useVersionCheck();
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const selectNode = useCanvasStore((s) => s.selectNode);
  const schemaName = useCanvasStore((s) => s.schemaName);
  const architectureId = useCanvasStore((s) => s.architectureId);
  const isPublic = useCanvasStore((s) => s.isPublic);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        useCanvasStore.getState().redo();
      } else {
        useCanvasStore.getState().undo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Revalidate session on tab focus (throttled to 30s)
  const lastCheckRef = useRef(0);
  useEffect(() => {
    const onFocus = () => {
      const now = Date.now();
      if (now - lastCheckRef.current < 30_000) return;
      lastCheckRef.current = now;
      useAuthStore.getState().checkSession().then((ok) => {
        if (!ok) {
          localStorage.removeItem('has_session');
          useAuthStore.setState({ user: null, view: 'anonymous', email: '' });
        }
      });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const handleNavigateToNode = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      setViewMode('canvas');
    },
    [selectNode],
  );

  const workspaceName = schemaName.trim() || 'Untitled Architecture';
  const storageLabel = architectureId
    ? 'Cloud Saved'
    : user
      ? 'Local Draft'
      : 'Anonymous Local';

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-bg)] flex flex-col">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(19,32,44,0.94),rgba(13,23,34,0.96))] px-3 py-2 shadow-[0_10px_26px_rgba(2,8,14,0.35)] sm:px-4">
        <div className="flex min-h-12 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex flex-1 items-center gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)] sm:text-[10px] sm:tracking-[0.34em]">
              System Design Sandbox
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <span
                className="max-w-[11rem] truncate text-sm font-semibold text-[var(--color-text)] sm:max-w-[16rem]"
                style={{ fontFamily: 'var(--font-display)' }}
                title={workspaceName}
              >
                {workspaceName}
              </span>
              <WorkspaceBadge tone={architectureId ? 'accent' : 'neutral'}>{storageLabel}</WorkspaceBadge>
              {isPublic && <WorkspaceBadge tone="warm">Public</WorkspaceBadge>}
              {!user && <WorkspaceBadge tone="warm">Guest</WorkspaceBadge>}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:gap-3 xl:w-auto xl:flex-nowrap xl:justify-end">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[rgba(6,13,19,0.54)] p-1">
            <button
              onClick={() => setViewMode('canvas')}
              className={`inline-flex min-h-[2rem] min-w-[5.9rem] items-center justify-center px-4 py-1.5 text-[10px] leading-none font-semibold uppercase tracking-[0.1em] rounded-lg transition-all sm:min-h-[2.1rem] sm:min-w-[7.1rem] sm:px-5 md:min-w-[7.5rem] md:px-6 ${
                viewMode === 'canvas'
                  ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(110,220,255,0.32)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Designer
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`inline-flex min-h-[2rem] min-w-[5.9rem] items-center justify-center px-4 py-1.5 text-[10px] leading-none font-semibold uppercase tracking-[0.1em] rounded-lg transition-all sm:min-h-[2.1rem] sm:min-w-[7.1rem] sm:px-5 md:min-w-[7.5rem] md:px-6 ${
                viewMode === 'table'
                  ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(110,220,255,0.32)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Inventory
            </button>
          </div>
          <PlatformStatus />
          {user ? (
            <UserMenu />
          ) : (
            <button
              onClick={() => useAuthStore.getState().setView('login')}
              className="inline-flex min-h-10 min-w-[6.25rem] items-center justify-center rounded-xl border border-[rgba(110,220,255,0.34)] bg-[linear-gradient(180deg,rgba(110,220,255,0.20),rgba(110,220,255,0.08))] px-4 py-2 text-[12px] leading-none font-semibold tracking-[0.02em] text-[var(--color-accent)] shadow-[0_8px_18px_rgba(9,20,32,0.24),inset_0_0_0_1px_rgba(255,255,255,0.04)] transition-colors hover:bg-[linear-gradient(180deg,rgba(110,220,255,0.26),rgba(110,220,255,0.12))] sm:min-w-[7rem] sm:px-5"
            >
              Sign in
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Content area */}
      {viewMode === 'canvas' ? (
        <div
          className="flex-1 min-h-0 overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateColumns: `${leftOpen ? 'clamp(16rem, 18vw, 18rem)' : '0px'} minmax(0, 1fr) ${rightOpen ? 'clamp(20rem, 23vw, 22rem)' : '0px'}`,
            transition: 'grid-template-columns 0.2s ease',
          }}
        >
          <div className="overflow-hidden min-w-0">{leftOpen && <ComponentPalette />}</div>
          <div className="min-w-0 min-h-0 overflow-hidden relative">
            <Canvas />
            {/* Panel toggle buttons */}
            <button
              onClick={() => setLeftOpen((v) => !v)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-5 items-center justify-center rounded-r-lg border border-l-0 border-[var(--color-border)] bg-[rgba(19,32,44,0.92)] text-slate-400 hover:text-white hover:bg-[rgba(30,48,66,0.95)] transition-colors shadow-[var(--shadow-panel)]"
              title={leftOpen ? 'Hide library' : 'Show library'}
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none"><path d={leftOpen ? 'M7 1L1 7l6 6' : 'M3 1l6 6-6 6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              onClick={() => setRightOpen((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-5 items-center justify-center rounded-l-lg border border-r-0 border-[var(--color-border)] bg-[rgba(19,32,44,0.92)] text-slate-400 hover:text-white hover:bg-[rgba(30,48,66,0.95)] transition-colors shadow-[var(--shadow-panel)]"
              title={rightOpen ? 'Hide inspector' : 'Show inspector'}
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none"><path d={rightOpen ? 'M3 1l6 6-6 6' : 'M7 1L1 7l6 6'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            {/* Floating sim controls when right panel hidden */}
            {!rightOpen && <FloatingSimControls />}
          </div>
          <div className="overflow-hidden min-w-0">{rightOpen && <RightPanel />}</div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <InventoryTable onNavigateToNode={handleNavigateToNode} />
        </div>
      )}
      {updateAvailable && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-2.5 border border-[rgba(110,220,255,0.32)] bg-[rgba(19,32,44,0.94)] text-white text-sm rounded-xl shadow-[var(--shadow-panel)] backdrop-blur">
          <span>New version available</span>
          <button onClick={reload} className="px-3 py-1 rounded-lg bg-[rgba(110,220,255,0.18)] text-[var(--color-accent-hover)] hover:bg-[rgba(110,220,255,0.24)] font-medium transition-colors">
            Refresh
          </button>
        </div>
      )}
      <ToastContainer />
      <div className="fixed bottom-3 right-3 z-40">
        <div className="rounded-lg border border-[rgba(138,167,198,0.16)] bg-[rgba(12,19,28,0.76)] px-3 py-1.5 shadow-[0_8px_20px_rgba(2,8,14,0.24)] backdrop-blur supports-[backdrop-filter]:bg-[rgba(12,19,28,0.64)]">
          <div
            className="select-text text-[11px] font-medium tracking-[0.02em] text-slate-300"
            style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
            title="Select and copy"
          >
            <span className="font-semibold text-[var(--color-accent)]">v{__APP_VERSION__}</span>
            <span className="mx-1.5 text-slate-500">&middot;</span>
            <span className="text-slate-400">&copy; {new Date().getFullYear()} sdsandbox.ru</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const view = useAuthStore((s) => s.view);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  switch (view) {
    case 'loading':
      return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading...</p>
          </div>
        </div>
      );
    case 'login':
      return <LoginPage />;
    case 'verify-code':
      return <CodeVerifyPage />;
    case 'onboarding':
      return <OnboardingPage />;
    case 'anonymous':
    case 'authenticated':
      return <MainApp />;
  }
}
