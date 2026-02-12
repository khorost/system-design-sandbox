export type {
  ComponentType,
  ProtocolType,
  ComponentModel,
  ConnectionModel,
  SimulationMetrics,
  FailureReport,
  LoadProfile,
} from './models.js';

export {
  calculateLatency,
  propagateFailure,
  createSimulationEngine,
} from './engine.js';

export type { SimulationEngine } from './engine.js';
