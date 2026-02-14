import type { ComponentModel, ConnectionModel, LoadProfile, SimulationMetrics, FailureReport } from '@system-design-sandbox/simulation-engine';
import type { WorkerCommand, WorkerEvent } from './protocol.ts';
import { notify } from '../utils/notifications.ts';

type TickCallback = (metrics: SimulationMetrics) => void;
type FailureCallback = (report: FailureReport) => void;

class WorkerManager {
  private worker: Worker | null = null;
  private tickCallbacks: TickCallback[] = [];
  private failureCallbacks: FailureCallback[] = [];
  private readyResolve: (() => void) | null = null;

  initialize(components: Map<string, ComponentModel>, connections: ConnectionModel[]): Promise<void> {
    this.terminate();

    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'READY':
          this.readyResolve?.();
          this.readyResolve = null;
          break;
        case 'TICK':
          for (const cb of this.tickCallbacks) cb(msg.metrics);
          break;
        case 'FAILURE_REPORT':
          for (const cb of this.failureCallbacks) cb(msg.report);
          break;
        case 'ERROR':
          notify.error(msg.message);
          break;
      }
    };

    return new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      this.send({
        type: 'INIT',
        components: [...components.entries()],
        connections,
      });
    });
  }

  start(profile: LoadProfile) {
    this.send({ type: 'START', profile });
  }

  stop() {
    this.send({ type: 'STOP' });
  }

  pause() {
    this.send({ type: 'PAUSE' });
  }

  resume() {
    this.send({ type: 'RESUME' });
  }

  updateProfile(profile: LoadProfile) {
    this.send({ type: 'UPDATE_PROFILE', profile });
  }

  injectFailure(nodeId: string) {
    this.send({ type: 'INJECT_FAILURE', nodeId });
  }

  reconfigure(components: Map<string, ComponentModel>, connections: ConnectionModel[]): Promise<void> {
    return new Promise<void>((resolve) => {
      this.readyResolve = resolve;
      this.send({
        type: 'RECONFIGURE',
        components: [...components.entries()],
        connections,
      });
    });
  }

  onTick(callback: TickCallback) {
    this.tickCallbacks.push(callback);
    return () => {
      this.tickCallbacks = this.tickCallbacks.filter((cb) => cb !== callback);
    };
  }

  onFailureReport(callback: FailureCallback) {
    this.failureCallbacks.push(callback);
    return () => {
      this.failureCallbacks = this.failureCallbacks.filter((cb) => cb !== callback);
    };
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private send(cmd: WorkerCommand) {
    this.worker?.postMessage(cmd);
  }
}

export const workerManager = new WorkerManager();
