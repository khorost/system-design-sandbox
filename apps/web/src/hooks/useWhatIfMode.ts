import { useEffect, useRef } from 'react';
import { useCanvasStore } from '../store/canvasStore.ts';
import { useSimulationStore } from '../store/simulationStore.ts';

export function useWhatIfMode() {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const isRunning = useSimulationStore((s) => s.isRunning);
  const reconfigure = useSimulationStore((s) => s.reconfigure);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialRef = useRef(true);

  useEffect(() => {
    // Skip initial render
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }

    if (!isRunning) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      reconfigure();
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [nodes, edges, isRunning, reconfigure]);
}
