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
  {
    type: 'mongodb',
    calculate: (config) => {
      const replicas = (config.replicas as number) || 3;
      const shards = (config.shards as number) || 1;
      const nodePrice = 0.28; // $/hour per node
      return replicas * shards * nodePrice * HOURS_PER_MONTH;
    },
  },
  {
    type: 'cassandra',
    calculate: (config) => {
      const nodes = (config.nodes as number) || 3;
      const nodePrice = 0.35; // $/hour per node
      return nodes * nodePrice * HOURS_PER_MONTH;
    },
  },
  {
    type: 'elasticsearch',
    calculate: (config) => {
      const nodes = (config.nodes as number) || 3;
      const nodePrice = 0.32; // $/hour per node
      return nodes * nodePrice * HOURS_PER_MONTH;
    },
  },
  {
    type: 'rabbitmq',
    calculate: (config) => {
      const haMode = (config.ha_mode as boolean) ?? true;
      const nodes = haMode ? 3 : 1;
      const nodePrice = 0.14; // $/hour per node
      return nodes * nodePrice * HOURS_PER_MONTH;
    },
  },
  {
    type: 's3',
    calculate: (config) => {
      const storageClass = (config.storage_class as string) || 'standard';
      const storageGb = (config.storage_gb as number) || 100;
      const pricePerGb = storageClass === 'glacier' ? 0.004 : storageClass === 'infrequent' ? 0.0125 : 0.023;
      return storageGb * pricePerGb;
    },
  },
  {
    type: 'serverless_function',
    calculate: (config) => {
      const maxConcurrent = (config.max_concurrent as number) || 1000;
      // Estimate: ~1M invocations/month at avg 200ms, 256MB
      const invocations = maxConcurrent * 1000;
      const pricePerInvocation = 0.0000002; // $0.20 per 1M
      const computeGbSec = invocations * 0.2 * 0.25; // 200ms avg, 256MB
      const computePrice = 0.0000166667; // per GB-second
      return invocations * pricePerInvocation + computeGbSec * computePrice;
    },
  },
  {
    type: 'local_ssd',
    calculate: (config) => {
      const capacityGb = (config.capacity_gb as number) || 500;
      return capacityGb * 0.08; // $/GB/month (local NVMe instance store priced into instance)
    },
  },
  {
    type: 'nvme',
    calculate: (config) => {
      const capacityGb = (config.capacity_gb as number) || 1000;
      return capacityGb * 0.12; // $/GB/month (high-perf NVMe)
    },
  },
  {
    type: 'network_disk',
    calculate: (config) => {
      const capacityGb = (config.capacity_gb as number) || 500;
      const diskType = (config.disk_type as string) || 'gp3';
      const iops = (config.max_rps_per_instance as number) || 16000;
      const pricePerGb = diskType === 'io2' ? 0.125 : diskType === 'st1' ? 0.045 : diskType === 'sc1' ? 0.015 : 0.08;
      const iopsCost = diskType === 'io2' ? iops * 0.065 : 0; // io2 charges per provisioned IOPS
      return capacityGb * pricePerGb + iopsCost;
    },
  },
  {
    type: 'api_gateway',
    calculate: (config) => {
      const maxRps = (config.max_rps as number) || 50000;
      // Estimate monthly requests from max RPS * 30% average utilization
      const monthlyRequests = maxRps * 0.3 * 86400 * 30;
      const pricePerMillion = 3.5;
      return (monthlyRequests / 1_000_000) * pricePerMillion;
    },
  },
];

export function estimateMonthlyCost(type: ComponentType, config: Record<string, unknown>): number {
  const model = pricingModels.find((m) => m.type === type);
  if (!model) return 0;
  return Math.round(model.calculate(config) * 100) / 100;
}
