export type {
  ComponentType,
  ProtocolType,
  ComponentModel,
  ConnectionModel,
  SimulationMetrics,
  FailureReport,
  LoadProfile,
  SimRequest,
} from './models.js';

export {
  calculateLatency,
  propagateFailure,
  createSimulationEngine,
} from './engine.js';

export type { SimulationEngine } from './engine.js';

export { buildAdjacencyList, findEntryNodes, resolveRequestPath } from './graph.js';
export { poissonSample } from './generator.js';
export { aggregateMetrics } from './metrics.js';
