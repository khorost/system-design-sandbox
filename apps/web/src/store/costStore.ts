import { create } from 'zustand';
import { useCanvasStore } from './canvasStore.ts';
import { estimateMonthlyCost } from '@system-design-sandbox/component-library';
import type { ComponentType } from '../types/index.ts';

interface CostItem {
  nodeId: string;
  label: string;
  type: ComponentType;
  category: string;
  monthlyCost: number;
}

interface CostState {
  items: CostItem[];
  totalMonthlyCost: number;
  byCategory: Record<string, number>;
  recalculate: () => void;
}

const CATEGORY_MAP: Record<string, string> = {
  service: 'compute',
  serverless_function: 'compute',
  worker: 'compute',
  cron_job: 'compute',
  postgresql: 'storage',
  mongodb: 'storage',
  cassandra: 'storage',
  redis: 'storage',
  memcached: 'storage',
  s3: 'storage',
  elasticsearch: 'storage',
  load_balancer: 'network',
  cdn: 'network',
  api_gateway: 'network',
  dns: 'network',
  waf: 'network',
  kafka: 'messaging',
  rabbitmq: 'messaging',
  event_bus: 'messaging',
};

export const useCostStore = create<CostState>((set) => ({
  items: [],
  totalMonthlyCost: 0,
  byCategory: {},

  recalculate: () => {
    const { nodes } = useCanvasStore.getState();
    const items: CostItem[] = [];
    const byCategory: Record<string, number> = {};

    for (const node of nodes) {
      const type = node.data.componentType;
      const cost = estimateMonthlyCost(type, node.data.config);
      if (cost > 0) {
        const cat = CATEGORY_MAP[type] || 'other';
        items.push({
          nodeId: node.id,
          label: (node.data.config.name as string) || node.data.label,
          type,
          category: cat,
          monthlyCost: cost,
        });
        byCategory[cat] = (byCategory[cat] || 0) + cost;
      }
    }

    const totalMonthlyCost = items.reduce((sum, i) => sum + i.monthlyCost, 0);
    set({ items, totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100, byCategory });
  },
}));
