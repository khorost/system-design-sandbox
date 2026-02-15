import { describe, expect,it } from 'vitest';

import { CONFIG } from '../constants.ts';

describe('CONFIG', () => {
  it('TICK_INTERVAL_SEC is positive', () => {
    expect(CONFIG.SIMULATION.TICK_INTERVAL_SEC).toBeGreaterThan(0);
  });

  it('MAX_UNDO_ENTRIES is positive', () => {
    expect(CONFIG.HISTORY.MAX_UNDO_ENTRIES).toBeGreaterThan(0);
  });

  it('CONTAINER_DEFAULT_WIDTH > CONTAINER_MIN_WIDTH', () => {
    expect(CONFIG.CANVAS.CONTAINER_DEFAULT_WIDTH).toBeGreaterThan(CONFIG.CANVAS.CONTAINER_MIN_WIDTH);
  });

  it('CONTAINER_DEFAULT_HEIGHT > CONTAINER_MIN_HEIGHT', () => {
    expect(CONFIG.CANVAS.CONTAINER_DEFAULT_HEIGHT).toBeGreaterThan(CONFIG.CANVAS.CONTAINER_MIN_HEIGHT);
  });

  it('MAX_CHART_POINTS equals DEFAULT_DURATION_SEC / TICK_INTERVAL_SEC', () => {
    expect(CONFIG.SIMULATION.MAX_CHART_POINTS).toBe(
      CONFIG.SIMULATION.DEFAULT_DURATION_SEC / CONFIG.SIMULATION.TICK_INTERVAL_SEC,
    );
  });

  it('SNAP_GRID is positive', () => {
    expect(CONFIG.CANVAS.SNAP_GRID).toBeGreaterThan(0);
  });

  it('DEBOUNCE_SAVE_MS is positive', () => {
    expect(CONFIG.UI.DEBOUNCE_SAVE_MS).toBeGreaterThan(0);
  });

  it('LABEL_MAX_LENGTH and CONFIG_VALUE_MAX_LENGTH are positive', () => {
    expect(CONFIG.UI.LABEL_MAX_LENGTH).toBeGreaterThan(0);
    expect(CONFIG.UI.CONFIG_VALUE_MAX_LENGTH).toBeGreaterThan(0);
  });
});
