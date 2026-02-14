import { create } from 'zustand';
import type { SimulationMetrics, LoadProfile, NodeTagTraffic, EdgeTagTraffic } from '@system-design-sandbox/simulation-engine';
import { useCanvasStore } from './canvasStore.ts';
import { convertNodesToComponents, convertEdgesToConnections, buildEdgeKeyToIdMap } from '../simulation/converter.ts';
import { workerManager } from '../simulation/workerManager.ts';
import { CONFIG } from '../config/constants.ts';

/** Lightweight chart point — only the 5 numbers needed for graphs */
export interface ChartPoint {
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  throughput: number;
  errorRate: number;
}

const MAX_HISTORY = CONFIG.SIMULATION.MAX_CHART_POINTS;

const TICK = CONFIG.SIMULATION.TICK_INTERVAL_SEC;
const EMA_ALPHA_1S = 1 - Math.exp(-TICK / 1);   // ≈ 0.095
const EMA_ALPHA_5S = 1 - Math.exp(-TICK / 5);   // ≈ 0.020
const EMA_ALPHA_30S = 1 - Math.exp(-TICK / 30); // ≈ 0.003

/** Module-level unsub for tick listener */
let tickUnsub: (() => void) | null = null;

/** Mutable ring-buffer for chart points only */
let historyBuf: ChartPoint[] = [];
let historyVersion = 0;

export interface NodeEma {
  ema1: number;
  ema5: number;
  ema30: number;
}

interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  loadType: 'constant' | 'ramp' | 'spike';
  currentMetrics: SimulationMetrics | null;
  metricsHistory: ChartPoint[];
  nodeUtilization: Record<string, number>;
  nodeEma: Record<string, NodeEma>;
  edgeThroughput: Record<string, number>;
  edgeLatency: Record<string, number>;
  edgeEma: Record<string, NodeEma>;
  nodeTagTraffic: Record<string, NodeTagTraffic>;
  edgeTagTraffic: Record<string, EdgeTagTraffic>;

  setLoadType: (type: 'constant' | 'ramp' | 'spike') => void;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  handleTick: (metrics: SimulationMetrics) => void;
  reconfigure: () => Promise<void>;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  isRunning: false,
  isPaused: false,
  loadType: 'constant',
  currentMetrics: null,
  metricsHistory: [],
  nodeUtilization: {},
  nodeEma: {},
  edgeThroughput: {},
  edgeLatency: {},
  edgeEma: {},
  nodeTagTraffic: {},
  edgeTagTraffic: {},

  setLoadType: (type) => {
    set({ loadType: type });
    const { isRunning } = get();
    if (isRunning) {
      workerManager.updateProfile({ type, rps: 0, durationSec: CONFIG.SIMULATION.DEFAULT_DURATION_SEC });
    }
  },

  start: async () => {
    const { nodes, edges } = useCanvasStore.getState();
    const components = convertNodesToComponents(nodes);
    const connections = convertEdgesToConnections(edges, nodes);

    await workerManager.initialize(components, connections);

    // Remove previous tick listener, register fresh one
    if (tickUnsub) tickUnsub();
    tickUnsub = workerManager.onTick((metrics) => {
      get().handleTick(metrics);
    });

    const { loadType } = get();
    const profile: LoadProfile = {
      type: loadType,
      rps: 0,
      durationSec: CONFIG.SIMULATION.DEFAULT_DURATION_SEC,
    };

    // Reset buffer and set isRunning BEFORE starting worker
    historyBuf = [];
    historyVersion = 0;
    set({ isRunning: true, isPaused: false, metricsHistory: [], currentMetrics: null, nodeUtilization: {}, nodeEma: {}, edgeThroughput: {}, edgeLatency: {}, edgeEma: {}, nodeTagTraffic: {}, edgeTagTraffic: {} });
    workerManager.start(profile);
  },

  stop: () => {
    workerManager.stop();
    if (tickUnsub) { tickUnsub(); tickUnsub = null; }
    set({ isRunning: false, isPaused: false, nodeUtilization: {}, nodeEma: {}, edgeThroughput: {}, edgeLatency: {}, edgeEma: {}, nodeTagTraffic: {}, edgeTagTraffic: {} });
  },

  pause: () => {
    workerManager.pause();
    set({ isPaused: true });
  },

  resume: () => {
    workerManager.resume();
    set({ isPaused: false });
  },

  handleTick: (metrics) => {
    // Extract only the 5 chart numbers — discard heavy maps
    const point: ChartPoint = {
      latencyP50: metrics.latencyP50,
      latencyP95: metrics.latencyP95,
      latencyP99: metrics.latencyP99,
      throughput: metrics.throughput,
      errorRate: metrics.errorRate,
    };

    historyBuf.push(point);
    if (historyBuf.length > MAX_HISTORY) {
      historyBuf = historyBuf.slice(-MAX_HISTORY);
    }
    historyVersion++;

    // Snapshot for React every N ticks, immediate for first 10
    const snapshot = historyVersion % CONFIG.SIMULATION.SNAPSHOT_EVERY_N_TICKS === 0 || historyBuf.length <= 10
      ? historyBuf.slice()
      : get().metricsHistory;

    const state = get();

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

    // Map edgeTagTraffic keys from engine format to React Flow edge IDs
    const newEdgeTagTraffic: Record<string, EdgeTagTraffic> = {};
    for (const [key, value] of Object.entries(metrics.edgeTagTraffic)) {
      const edgeId = keyToId[key];
      if (edgeId) newEdgeTagTraffic[edgeId] = value;
    }

    set({
      currentMetrics: metrics,
      metricsHistory: snapshot,
      nodeUtilization: metrics.componentUtilization,
      nodeEma: newEma,
      edgeThroughput: newEdgeThroughput,
      edgeLatency: newEdgeLatency,
      edgeEma: newEdgeEma,
      nodeTagTraffic: metrics.nodeTagTraffic,
      edgeTagTraffic: newEdgeTagTraffic,
    });
  },

  reconfigure: async () => {
    const { isRunning, isPaused, loadType } = get();
    if (!isRunning || isPaused) return;

    const { nodes, edges } = useCanvasStore.getState();
    const components = convertNodesToComponents(nodes);
    const connections = convertEdgesToConnections(edges, nodes);

    await workerManager.reconfigure(components, connections);

    const profile: LoadProfile = {
      type: loadType,
      rps: 0,
      durationSec: CONFIG.SIMULATION.DEFAULT_DURATION_SEC,
    };
    workerManager.start(profile);
  },
}));
