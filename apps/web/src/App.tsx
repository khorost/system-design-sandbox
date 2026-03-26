import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { CodeVerifyPage } from './components/auth/CodeVerifyPage.tsx';
import { LoginPage } from './components/auth/LoginPage.tsx';
import { OnboardingPage } from './components/auth/OnboardingPage.tsx';
import { UserMenu } from './components/auth/UserMenu.tsx';
import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { InventoryTable } from './components/inventory/InventoryTable.tsx';
import { CostPanel } from './components/panels/CostPanel.tsx';
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

const TOP_TABS = ['Properties', 'Traffic', 'Cost'] as const;
type TopTab = (typeof TOP_TABS)[number];

const BOTTOM_TABS = ['Simulation', 'Metrics'] as const;
type BottomTab = (typeof BOTTOM_TABS)[number];

function tabClass(active: boolean) {
  return `flex-1 px-3 py-2 text-[11px] uppercase tracking-[0.22em] font-semibold rounded-lg transition-all ${
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
    <div className="border-l border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(24,39,54,0.98),rgba(13,23,34,0.98))] flex flex-col overflow-hidden">
      <div className="flex flex-col min-h-0 flex-[1.08] overflow-hidden border-b border-[var(--color-border)]">
        <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(110,220,255,0.07),rgba(0,0,0,0))]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-accent)]">Inspector</div>
          <div className="mt-3 flex gap-1 rounded-xl border border-[var(--color-border)] bg-[rgba(6,13,19,0.52)] p-1">
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
        <div className="flex-1 overflow-y-auto bg-[rgba(19,32,44,0.7)]">
          <ErrorBoundary key={activeTopTab}>
            {activeTopTab === 'Properties' && <PropertiesPanel />}
            {activeTopTab === 'Traffic' && <TrafficPanel />}
            {activeTopTab === 'Cost' && <CostPanel />}
          </ErrorBoundary>
        </div>
      </div>

      <div className="flex flex-col min-h-0 flex-[0.92] overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(255,180,84,0.08),rgba(0,0,0,0))]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[var(--color-accent-warm)]">Telemetry</div>
          <div className="mt-3 flex gap-1 rounded-xl border border-[var(--color-border)] bg-[rgba(6,13,19,0.52)] p-1">
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
        <div className="flex-1 overflow-y-auto bg-[rgba(13,23,34,0.76)]">
          <ErrorBoundary key={activeBottomTab}>
            {activeBottomTab === 'Simulation' && <SimulationPanel />}
            {activeBottomTab === 'Metrics' && <MetricsPanel />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  useWhatIfMode();
  usePlatformMetrics();
  const { updateAvailable, reload } = useVersionCheck();
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
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
      <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--color-border)] bg-[linear-gradient(180deg,rgba(19,32,44,0.94),rgba(13,23,34,0.96))] shrink-0 shadow-[0_10px_26px_rgba(2,8,14,0.35)]">
        <div className="min-w-0 flex items-center gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-[var(--color-accent)]">
              System Design Sandbox
            </div>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <span
                className="truncate text-sm font-semibold text-[var(--color-text)]"
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--color-border)] bg-[rgba(6,13,19,0.54)] p-1">
            <button
              onClick={() => setViewMode('canvas')}
              className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] rounded-lg transition-all ${
                viewMode === 'canvas'
                  ? 'bg-[rgba(110,220,255,0.14)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_rgba(110,220,255,0.32)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Designer
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] rounded-lg transition-all ${
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
              className="px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)] border border-[rgba(110,220,255,0.28)] bg-[rgba(110,220,255,0.08)] rounded-lg hover:bg-[rgba(110,220,255,0.14)] transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {viewMode === 'canvas' ? (
        <div
          className="flex-1 min-h-0 overflow-hidden"
          style={{ display: 'grid', gridTemplateColumns: 'clamp(16rem, 18vw, 18rem) minmax(0, 1fr) clamp(20rem, 23vw, 22rem)' }}
        >
          <ComponentPalette />
          <div className="min-w-0 min-h-0 overflow-hidden">
            <Canvas />
          </div>
          <RightPanel />
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
      <div className="fixed bottom-2 right-2 z-40 flex items-center gap-2 text-[10px] text-slate-500 pointer-events-none">
        <span>v{__APP_VERSION__}</span>
        <span>&middot;</span>
        <span>&copy; {new Date().getFullYear()} sdsandbox.ru</span>
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
