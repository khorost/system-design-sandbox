import type { SimRequest, ComponentModel, SimulationMetrics } from './models.js';

export function aggregateMetrics(
  completedRequests: SimRequest[],
  components: Map<string, ComponentModel>,
  timestamp: number,
  tickDurationSec: number
): SimulationMetrics {
  const latencies = completedRequests
    .filter((r) => !r.failed)
    .map((r) => r.totalLatencyMs)
    .sort((a, b) => a - b);

  const total = completedRequests.length;
  const failed = completedRequests.filter((r) => r.failed).length;
  const succeeded = total - failed;

  const componentUtilization: Record<string, number> = {};
  const queueDepths: Record<string, number> = {};

  for (const [id, comp] of components) {
    componentUtilization[id] = comp.maxRps > 0 ? comp.currentLoad / comp.maxRps : 0;
    queueDepths[id] = comp.queueSize;
  }

  return {
    timestamp,
    latencyP50: percentile(latencies, 0.5),
    latencyP95: percentile(latencies, 0.95),
    latencyP99: percentile(latencies, 0.99),
    throughput: tickDurationSec > 0 ? succeeded / tickDurationSec : 0,
    errorRate: total > 0 ? failed / total : 0,
    componentUtilization,
    queueDepths,
  };
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil(p * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)];
}
