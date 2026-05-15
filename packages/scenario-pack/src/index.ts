export type { Scenario, Difficulty, SuccessCriteria, ScenarioComponent, ScenarioConnection } from './types.js';

export { messengerScenario } from './scenarios/messenger.js';
export { shardingScenario } from './scenarios/sharding.js';
export { dbPoolContentionScenario } from './scenarios/db-pool-contention.js';
export { asyncProcessingScenario } from './scenarios/async-processing.js';

import { messengerScenario } from './scenarios/messenger.js';
import { shardingScenario } from './scenarios/sharding.js';
import { dbPoolContentionScenario } from './scenarios/db-pool-contention.js';
import { asyncProcessingScenario } from './scenarios/async-processing.js';
import type { Scenario } from './types.js';

export const allScenarios: Scenario[] = [
  messengerScenario,
  shardingScenario,
  dbPoolContentionScenario,
  asyncProcessingScenario,
];

export function getScenarioById(id: string): Scenario | undefined {
  return allScenarios.find((s) => s.id === id);
}

export function getScenariosByModule(module: number): Scenario[] {
  return allScenarios.filter((s) => s.module === module);
}
