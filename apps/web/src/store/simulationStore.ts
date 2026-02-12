import { create } from 'zustand';
import type { SimulationMetrics, LoadProfile } from '@system-design-sandbox/simulation-engine';
import { useCanvasStore } from './canvasStore.ts';
import { convertNodesToComponents, convertEdgesToConnections } from '../simulation/converter.ts';
import { workerManager } from '../simulation/workerManager.ts';

const MAX_HISTORY = 300;

interface SimulationState {
  isRunning: boolean;
  rps: number;
  payloadSizeKb: number;
  loadType: 'constant' | 'ramp' | 'spike';
  currentMetrics: SimulationMetrics | null;
  metricsHistory: SimulationMetrics[];
  nodeUtilization: Record<string, number>;

  setRps: (rps: number) => void;
  setPayloadSizeKb: (size: number) => void;
  setLoadType: (type: 'constant' | 'ramp' | 'spike') => void;
  start: () => Promise<void>;
  stop: () => void;
  handleTick: (metrics: SimulationMetrics) => void;
  reconfigure: () => Promise<void>;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  isRunning: false,
  rps: 1000,
  payloadSizeKb: 10,
  loadType: 'constant',
  currentMetrics: null,
  metricsHistory: [],
  nodeUtilization: {},

  setRps: (rps) => set({ rps }),
  setPayloadSizeKb: (size) => set({ payloadSizeKb: size }),
  setLoadType: (type) => set({ loadType: type }),

  start: async () => {
    const { nodes, edges } = useCanvasStore.getState();
    const components = convertNodesToComponents(nodes);
    const connections = convertEdgesToConnections(edges);

    await workerManager.initialize(components, connections);

    workerManager.onTick((metrics) => {
      get().handleTick(metrics);
    });

    const { rps, loadType } = get();
    const profile: LoadProfile = {
      type: loadType,
      rps,
      durationSec: 300,
    };

    workerManager.start(profile);
    set({ isRunning: true, metricsHistory: [], currentMetrics: null, nodeUtilization: {} });
  },

  stop: () => {
    workerManager.stop();
    set({ isRunning: false, nodeUtilization: {} });
  },

  handleTick: (metrics) => {
    set((state) => {
      const history = [...state.metricsHistory, metrics];
      if (history.length > MAX_HISTORY) history.shift();

      return {
        currentMetrics: metrics,
        metricsHistory: history,
        nodeUtilization: { ...metrics.componentUtilization },
      };
    });
  },

  reconfigure: async () => {
    const { isRunning, rps, loadType } = get();
    if (!isRunning) return;

    const { nodes, edges } = useCanvasStore.getState();
    const components = convertNodesToComponents(nodes);
    const connections = convertEdgesToConnections(edges);

    await workerManager.reconfigure(components, connections);

    const profile: LoadProfile = {
      type: loadType,
      rps,
      durationSec: 300,
    };
    workerManager.start(profile);
  },
}));
