import type { ComponentModel, ConnectionModel, LoadProfile, SimulationMetrics, FailureReport } from '@system-design-sandbox/simulation-engine';

// Main → Worker messages
export type WorkerCommand =
  | { type: 'INIT'; components: [string, ComponentModel][]; connections: ConnectionModel[] }
  | { type: 'START'; profile: LoadProfile }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'UPDATE_PROFILE'; profile: LoadProfile }
  | { type: 'INJECT_FAILURE'; nodeId: string }
  | { type: 'RECONFIGURE'; components: [string, ComponentModel][]; connections: ConnectionModel[] };

// Worker → Main messages
export type WorkerEvent =
  | { type: 'READY' }
  | { type: 'TICK'; metrics: SimulationMetrics }
  | { type: 'FAILURE_REPORT'; report: FailureReport }
  | { type: 'ERROR'; message: string };
