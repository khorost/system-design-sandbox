import { Component, type ErrorInfo,type ReactNode, useCallback, useEffect, useState } from 'react';

import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { InventoryTable } from './components/inventory/InventoryTable.tsx';
import { CostPanel } from './components/panels/CostPanel.tsx';
import { MetricsPanel } from './components/panels/MetricsPanel.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';
import { SimulationPanel } from './components/panels/SimulationPanel.tsx';
import { TrafficPanel } from './components/panels/TrafficPanel.tsx';
import { ToastContainer } from './components/ui/ToastContainer.tsx';
import { useWhatIfMode } from './hooks/useWhatIfMode.ts';
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

function RightPanel() {
  const [activeTopTab, setActiveTopTab] = useState<TopTab>('Properties');
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>('Simulation');

  return (
    <div className="bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col overflow-hidden">
      {/* Top zone: Properties / Cost */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex border-b border-[var(--color-border)]">
          {TOP_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTopTab(tab)}
              className={`flex-1 px-2 py-2.5 text-xs uppercase tracking-wider font-semibold transition-colors ${
                activeTopTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary key={activeTopTab}>
            {activeTopTab === 'Properties' && <PropertiesPanel />}
            {activeTopTab === 'Traffic' && <TrafficPanel />}
            {activeTopTab === 'Cost' && <CostPanel />}
          </ErrorBoundary>
        </div>
      </div>
      {/* Bottom zone: Simulation / Metrics */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden border-t border-[var(--color-border)]">
        <div className="flex border-b border-[var(--color-border)]">
          {BOTTOM_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveBottomTab(tab)}
              className={`flex-1 px-2 py-2.5 text-xs uppercase tracking-wider font-semibold transition-colors ${
                activeBottomTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <ErrorBoundary key={activeBottomTab}>
            {activeBottomTab === 'Simulation' && <SimulationPanel />}
            {activeBottomTab === 'Metrics' && <MetricsPanel />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useWhatIfMode();
  const [viewMode, setViewMode] = useState<ViewMode>('canvas');
  const selectNode = useCanvasStore((s) => s.selectNode);

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

  const handleNavigateToNode = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      setViewMode('canvas');
    },
    [selectNode],
  );

  return (
    <div className="h-screen overflow-hidden bg-[var(--color-bg)] flex flex-col">
      {/* Top navigation bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        <div className="flex items-center gap-1 bg-[var(--color-bg)] rounded-lg p-1">
          <button
            onClick={() => setViewMode('canvas')}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition-colors ${
              viewMode === 'canvas'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Designer
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-5 py-2 text-sm font-semibold rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Inventory
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>v0.1.0</span>
          <span>&middot;</span>
          <span>&copy; {new Date().getFullYear()} sdsandbox.ru</span>
        </div>
      </div>

      {/* Content area */}
      {viewMode === 'canvas' ? (
        <div
          className="flex-1 min-h-0 overflow-hidden"
          style={{ display: 'grid', gridTemplateColumns: '16rem 1fr 20rem' }}
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
      <ToastContainer />
    </div>
  );
}
