import { Component, useState, type ReactNode, type ErrorInfo } from 'react';
import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';
import { SimulationPanel } from './components/panels/SimulationPanel.tsx';
import { MetricsPanel } from './components/panels/MetricsPanel.tsx';
import { CostPanel } from './components/panels/CostPanel.tsx';
import { TrafficPanel } from './components/panels/TrafficPanel.tsx';
import { useWhatIfMode } from './hooks/useWhatIfMode.ts';

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
                  : 'text-slate-500 hover:text-slate-300'
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
                  : 'text-slate-500 hover:text-slate-300'
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

  return (
    <div
      className="h-screen overflow-hidden bg-[var(--color-bg)]"
      style={{ display: 'grid', gridTemplateColumns: '16rem 1fr 20rem' }}
    >
      <ComponentPalette />
      <div className="min-w-0 min-h-0 overflow-hidden">
        <Canvas />
      </div>
      <RightPanel />
    </div>
  );
}
