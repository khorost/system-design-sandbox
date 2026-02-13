import { create } from 'zustand';
import type { SimulationMetrics, LoadProfile } from '@system-design-sandbox/simulation-engine';
import { useCanvasStore } from './canvasStore.ts';
import { convertNodesToComponents, convertEdgesToConnections, buildEdgeKeyToIdMap } from '../simulation/converter.ts';
import { workerManager } from '../simulation/workerManager.ts';

const MAX_HISTORY = 300;

// EMA alphas for tick interval = 0.1s
const EMA_ALPHA_1S = 1 - Math.exp(-0.1 / 1);   // ≈ 0.095
const EMA_ALPHA_5S = 1 - Math.exp(-0.1 / 5);   // ≈ 0.020
const EMA_ALPHA_30S = 1 - Math.exp(-0.1 / 30); // ≈ 0.003

export interface NodeEma {
  ema1: number;
  ema5: number;
  ema30: number;
}

interface SimulationState {
  isRunning: boolean;
  loadType: 'constant' | 'ramp' | 'spike';
  currentMetrics: SimulationMetrics | null;
  metricsHistory: SimulationMetrics[];
  nodeUtilization: Record<string, number>;
  nodeEma: Record<string, NodeEma>;
  edgeThroughput: Record<string, number>;
  edgeLatency: Record<string, number>;
  edgeEma: Record<string, NodeEma>;

  setLoadType: (type: 'constant' | 'ramp' | 'spike') => void;
  start: () => Promise<void>;
  stop: () => void;
  handleTick: (metrics: SimulationMetrics) => void;
  reconfigure: () => Promise<void>;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  isRunning: false,
  loadType: 'constant',
  currentMetrics: null,
  metricsHistory: [],
  nodeUtilization: {},
  nodeEma: {},
  edgeThroughput: {},
  edgeLatency: {},
  edgeEma: {},

  setLoadType: (type) => {
    set({ loadType: type });
    const { isRunning } = get();
    if (isRunning) {
      // RPS is now per-node, profile.rps is unused by engine but kept for compat
      workerManager.updateProfile({ type, rps: 0, durationSec: 300 });
    }
  },

  start: async () => {
    const { nodes, edges } = useCanvasStore.getState();
    const components = convertNodesToComponents(nodes);
    const connections = convertEdgesToConnections(edges);

    await workerManager.initialize(components, connections);

    workerManager.onTick((metrics) => {
      get().handleTick(metrics);
    });

    const { loadType } = get();
    const profile: LoadProfile = {
      type: loadType,
      rps: 0, // unused — RPS comes from each client node's generatedRps
      durationSec: 300,
    };

    workerManager.start(profile);
    set({ isRunning: true, metricsHistory: [], currentMetrics: null, nodeUtilization: {}, nodeEma: {}, edgeThroughput: {}, edgeLatency: {}, edgeEma: {} });
  },

  stop: () => {
    workerManager.stop();
    set({ isRunning: false, nodeUtilization: {}, nodeEma: {}, edgeThroughput: {}, edgeLatency: {}, edgeEma: {} });
  },

  handleTick: (metrics) => {
    set((state) => {
      const history = [...state.metricsHistory, metrics];
      if (history.length > MAX_HISTORY) history.shift();

      // Node EMA
      const prevEma = state.nodeEma;
      const newEma: Record<string, NodeEma> = {};
      for (const [nodeId, sample] of Object.entries(metrics.componentUtilization)) {
        const prev = prevEma[nodeId];
        if (prev) {
          newEma[nodeId] = {
            ema1: prev.ema1 + EMA_ALPHA_1S * (sample - prev.ema1),
            ema5: prev.ema5 + EMA_ALPHA_5S * (sample - prev.ema5),
            ema30: prev.ema30 + EMA_ALPHA_30S * (sample - prev.ema30),
          };
        } else {
          newEma[nodeId] = { ema1: sample, ema5: sample, ema30: sample };
        }
      }

      // Edge metrics: map engine keys ("source->target") to edge IDs
      const { edges } = useCanvasStore.getState();
      const keyToId = buildEdgeKeyToIdMap(edges);

      const newEdgeThroughput: Record<string, number> = {};
      const newEdgeLatency: Record<string, number> = {};
      for (const [key, value] of Object.entries(metrics.edgeThroughput)) {
        const edgeId = keyToId[key];
        if (edgeId) newEdgeThroughput[edgeId] = value;
      }
      for (const [key, value] of Object.entries(metrics.edgeLatency)) {
        const edgeId = keyToId[key];
        if (edgeId) newEdgeLatency[edgeId] = value;
      }

      // Edge EMA (on throughput)
      const prevEdgeEma = state.edgeEma;
      const newEdgeEma: Record<string, NodeEma> = {};
      for (const [edgeId, sample] of Object.entries(newEdgeThroughput)) {
        const prev = prevEdgeEma[edgeId];
        if (prev) {
          newEdgeEma[edgeId] = {
            ema1: prev.ema1 + EMA_ALPHA_1S * (sample - prev.ema1),
            ema5: prev.ema5 + EMA_ALPHA_5S * (sample - prev.ema5),
            ema30: prev.ema30 + EMA_ALPHA_30S * (sample - prev.ema30),
          };
        } else {
          newEdgeEma[edgeId] = { ema1: sample, ema5: sample, ema30: sample };
        }
      }

      return {
        currentMetrics: metrics,
        metricsHistory: history,
        nodeUtilization: { ...metrics.componentUtilization },
        nodeEma: newEma,
        edgeThroughput: newEdgeThroughput,
        edgeLatency: newEdgeLatency,
        edgeEma: newEdgeEma,
      };
    });
  },

  reconfigure: async () => {
    const { isRunning, loadType } = get();
    if (!isRunning) return;

    const { nodes, edges } = useCanvasStore.getState();
    const components = convertNodesToComponents(nodes);
    const connections = convertEdgesToConnections(edges);

    await workerManager.reconfigure(components, connections);

    const profile: LoadProfile = {
      type: loadType,
      rps: 0,
      durationSec: 300,
    };
    workerManager.start(profile);
  },
}));
