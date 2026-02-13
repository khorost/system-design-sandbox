export type {
  ComponentType,
  ProtocolType,
  ComponentModel,
  ConnectionModel,
  SimulationMetrics,
  EngineStats,
  FailureReport,
  LoadProfile,
  SimRequest,
  RoutingRule,
  TagWeight,
  TagTraffic,
  NodeTagTraffic,
  EdgeTagTraffic,
} from './models.js';

export {
  calculateLatency,
  propagateFailure,
  createSimulationEngine,
} from './engine.js';

export type { SimulationEngine } from './engine.js';

export { buildAdjacencyList, findEntryNodes, resolveRequestPath, pickTag, resolveNextHops } from './graph.js';
export type { NextHop } from './graph.js';
export { poissonSample } from './generator.js';
export { aggregateMetrics } from './metrics.js';
