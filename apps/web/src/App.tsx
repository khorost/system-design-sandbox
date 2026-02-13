import { Component, useState, type ReactNode, type ErrorInfo } from 'react';
import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';
import { SimulationPanel } from './components/panels/SimulationPanel.tsx';
import { MetricsPanel } from './components/panels/MetricsPanel.tsx';
import { CostPanel } from './components/panels/CostPanel.tsx';
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

const TABS = ['Properties', 'Simulation', 'Metrics', 'Cost'] as const;
type Tab = (typeof TABS)[number];

function RightPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('Properties');

  return (
    <div className="bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-2 py-2.5 text-xs uppercase tracking-wider font-semibold transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <ErrorBoundary key={activeTab}>
          {activeTab === 'Properties' && <PropertiesPanel />}
          {activeTab === 'Simulation' && <SimulationPanel />}
          {activeTab === 'Metrics' && <MetricsPanel />}
          {activeTab === 'Cost' && <CostPanel />}
        </ErrorBoundary>
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
