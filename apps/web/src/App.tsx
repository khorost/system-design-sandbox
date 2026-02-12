import { Canvas } from './components/canvas/Canvas.tsx';
import { ComponentPalette } from './components/canvas/controls/ComponentPalette.tsx';
import { PropertiesPanel } from './components/panels/PropertiesPanel.tsx';

export default function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-bg)]">
      <ComponentPalette />
      <Canvas />
      <PropertiesPanel />
    </div>
  );
}
