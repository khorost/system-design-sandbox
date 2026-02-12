import type { ComponentType } from '@system-design-sandbox/simulation-engine';

export interface PricingModel {
  type: ComponentType;
  calculate: (config: Record<string, unknown>) => number; // $/month
}

const HOURS_PER_MONTH = 730;

export const pricingModels: PricingModel[] = [
  {
    type: 'service',
    calculate: (config) => {
      const replicas = (config.replicas as number) || 3;
      const cpuCores = (config.cpu_cores as number) || 4;
      const memoryGb = (config.memory_gb as number) || 8;
      const cpuPrice = 0.048; // $/core/hour
      const memPrice = 0.006; // $/GB/hour
      return replicas * (cpuPrice * cpuCores + memPrice * memoryGb) * HOURS_PER_MONTH;
    },
  },
  {
    type: 'postgresql',
    calculate: (config) => {
      const instanceCost = 200; // $/month base
      const storageGb = (config.storage_gb as number) || 100;
      const readReplicas = (config.read_replicas as number) || 0;
      return instanceCost * (1 + readReplicas) + storageGb * 0.115;
    },
  },
  {
    type: 'redis',
    calculate: (config) => {
      const memoryGb = (config.memory_gb as number) || 8;
      const mode = (config.mode as string) || 'standalone';
      const nodes = mode === 'cluster' ? 6 : mode === 'sentinel' ? 3 : 1;
      return nodes * memoryGb * 0.068 * HOURS_PER_MONTH;
    },
  },
  {
    type: 'kafka',
    calculate: (config) => {
      const brokers = (config.brokers as number) || 3;
      const brokerPrice = 0.21; // $/hour
      return brokers * brokerPrice * HOURS_PER_MONTH;
    },
  },
  {
    type: 'load_balancer',
    calculate: () => {
      return 18; // $/month base + LCU
    },
  },
  {
    type: 'cdn',
    calculate: () => {
      return 50; // $/month estimate
    },
  },
];

export function estimateMonthlyCost(type: ComponentType, config: Record<string, unknown>): number {
  const model = pricingModels.find((m) => m.type === type);
  if (!model) return 0;
  return Math.round(model.calculate(config) * 100) / 100;
}
