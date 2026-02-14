import { describe, it, expect } from 'vitest';
import { poissonSample } from '../generator.js';

describe('poissonSample', () => {
  it('returns 0 for lambda=0', () => {
    expect(poissonSample(0)).toBe(0);
  });

  it('returns 0 for negative lambda', () => {
    expect(poissonSample(-5)).toBe(0);
  });

  it('returns non-negative integer for lambda > 0', () => {
    for (let i = 0; i < 100; i++) {
      const sample = poissonSample(5);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(sample)).toBe(true);
    }
  });

  it('uses normal approximation for large lambda (>30) and still returns non-negative integer', () => {
    for (let i = 0; i < 100; i++) {
      const sample = poissonSample(50);
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(sample)).toBe(true);
    }
  });

  it('mean is approximately lambda over many samples', () => {
    const lambda = 10;
    const n = 10000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += poissonSample(lambda);
    }
    const mean = sum / n;
    // Allow 20% tolerance for statistical test
    expect(mean).toBeGreaterThan(lambda * 0.8);
    expect(mean).toBeLessThan(lambda * 1.2);
  });
});
