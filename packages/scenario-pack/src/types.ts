import type { ComponentType, ProtocolType } from '@system-design-sandbox/simulation-engine';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface SuccessCriteria {
  no_spof?: boolean;
  latency_p99?: string;
  message_loss?: string;
  max_cost_month?: number;
  min_rps?: number;
}

export interface ScenarioComponent {
  id: string;
  type: ComponentType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface ScenarioConnection {
  id: string;
  from: string;
  to: string;
  protocol: ProtocolType;
}

export interface Scenario {
  id: string;
  lessonNumber: number;
  module: number;
  title: string;
  description: string;
  goal: string;
  difficulty: Difficulty;
  availableComponents: ComponentType[];
  hints: string[];
  successCriteria: SuccessCriteria;
  startingArchitecture?: {
    components: ScenarioComponent[];
    connections: ScenarioConnection[];
  };
  tags: string[];
}
