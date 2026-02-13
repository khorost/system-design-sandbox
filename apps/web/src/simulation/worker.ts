import { createSimulationEngine, type SimulationEngine, type ComponentModel, type ConnectionModel } from '@system-design-sandbox/simulation-engine';
import type { WorkerCommand, WorkerEvent } from './protocol.ts';

let engine: SimulationEngine | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

function post(event: WorkerEvent) {
  self.postMessage(event);
}

function buildEngine(entries: [string, ComponentModel][], connections: ConnectionModel[]) {
  const components = new Map<string, ComponentModel>(entries);
  return createSimulationEngine(components, connections);
}

self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const cmd = event.data;

  switch (cmd.type) {
    case 'INIT': {
      engine = buildEngine(cmd.components, cmd.connections);
      post({ type: 'READY' });
      break;
    }

    case 'START': {
      if (!engine) {
        post({ type: 'ERROR', message: 'Engine not initialized' });
        return;
      }
      engine.start(cmd.profile);
      if (intervalId !== null) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!engine) return;
        const t0 = performance.now();
        const metrics = engine.tick();
        const tickMs = performance.now() - t0;
        if (metrics.engineStats) {
          metrics.engineStats.tickDurationMs = tickMs;
        }
        post({ type: 'TICK', metrics });
      }, 100);
      break;
    }

    case 'STOP': {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      engine?.stop();
      break;
    }

    case 'PAUSE': {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      break;
    }

    case 'RESUME': {
      if (!engine) {
        post({ type: 'ERROR', message: 'Engine not initialized' });
        return;
      }
      if (intervalId !== null) break; // already running
      intervalId = setInterval(() => {
        if (!engine) return;
        const t0 = performance.now();
        const metrics = engine.tick();
        const tickMs = performance.now() - t0;
        if (metrics.engineStats) {
          metrics.engineStats.tickDurationMs = tickMs;
        }
        post({ type: 'TICK', metrics });
      }, 100);
      break;
    }

    case 'UPDATE_PROFILE': {
      if (!engine) {
        post({ type: 'ERROR', message: 'Engine not initialized' });
        return;
      }
      engine.updateProfile(cmd.profile);
      break;
    }

    case 'INJECT_FAILURE': {
      if (!engine) {
        post({ type: 'ERROR', message: 'Engine not initialized' });
        return;
      }
      const report = engine.injectFailure(cmd.nodeId);
      post({ type: 'FAILURE_REPORT', report });
      break;
    }

    case 'RECONFIGURE': {
      const wasRunning = intervalId !== null;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      engine = buildEngine(cmd.components, cmd.connections);
      post({ type: 'READY' });
      // Note: caller must re-send START if simulation was running
      if (wasRunning) {
        // Signal that reconfiguration happened — the main thread
        // will need to re-start with the current profile
      }
      break;
    }
  }
};
