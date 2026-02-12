import { create } from 'zustand';

interface SimulationState {
  isRunning: boolean;
  rps: number;
  setRps: (rps: number) => void;
  start: () => void;
  stop: () => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  isRunning: false,
  rps: 1000,
  setRps: (rps) => set({ rps }),
  start: () => set({ isRunning: true }),
  stop: () => set({ isRunning: false }),
}));
