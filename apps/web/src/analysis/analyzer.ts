import type { ComponentEdge, ComponentNode } from '../types/index.ts';
import { type AnalysisWarning, detectMissingLoadBalancer } from './rules/spof.ts';

export type { AnalysisWarning };

/**
 * Run all analysis rules on the current architecture.
 */
export function analyzeArchitecture(
  nodes: ComponentNode[],
  edges: ComponentEdge[],
): AnalysisWarning[] {
  return [
    ...detectMissingLoadBalancer(nodes, edges),
  ];
}
