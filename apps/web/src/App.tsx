import { useState } from 'react';
import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';
import { SimulationPanel } from './components/panels/SimulationPanel.tsx';
import { MetricsPanel } from './components/panels/MetricsPanel.tsx';
import { CostPanel } from './components/panels/CostPanel.tsx';
import { useWhatIfMode } from './hooks/useWhatIfMode.ts';

const TABS = ['Properties', 'Simulation', 'Metrics', 'Cost'] as const;
type Tab = (typeof TABS)[number];

function RightPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('Properties');

  return (
    <div className="w-64 bg-[var(--color-surface)] border-l border-[var(--color-border)] flex flex-col overflow-hidden">
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-1 py-2 text-[10px] uppercase tracking-wider font-semibold transition-colors ${
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
        {activeTab === 'Properties' && <PropertiesPanel />}
        {activeTab === 'Simulation' && <SimulationPanel />}
        {activeTab === 'Metrics' && <MetricsPanel />}
        {activeTab === 'Cost' && <CostPanel />}
      </div>
    </div>
  );
}

export default function App() {
  useWhatIfMode();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg)]">
      <ComponentPalette />
      <Canvas />
      <RightPanel />
    </div>
  );
}
