import { describe, expect,it } from 'vitest';

/**
 * NumberInput clamp logic (extracted for testing without DOM).
 * Mirrors the onBlur behavior from NumberInput.tsx.
 */
function clamp(raw: string, min?: number, max?: number): number {
  let num = Number(raw);
  if (isNaN(num) || !isFinite(num) || raw === '') {
    num = min ?? 0;
  }
  if (min != null && num < min) num = min;
  if (max != null && num > max) num = max;
  return num;
}

function rangeTitle(min?: number, max?: number): string | undefined {
  if (min != null && max != null) return `Range: ${min} – ${max}`;
  if (min != null) return `Min: ${min}`;
  if (max != null) return `Max: ${max}`;
  return undefined;
}

describe('NumberInput clamp logic', () => {
  it('clamps value below min to min', () => {
    expect(clamp('-5', 1, 1000)).toBe(1);
  });

  it('clamps value above max to max', () => {
    expect(clamp('2000', 1, 1000)).toBe(1000);
  });

  it('keeps value within range unchanged', () => {
    expect(clamp('50', 1, 1000)).toBe(50);
  });

  it('handles NaN input by falling back to min', () => {
    expect(clamp('abc', 1, 1000)).toBe(1);
  });

  it('handles empty string by falling back to min', () => {
    expect(clamp('', 1, 1000)).toBe(1);
  });

  it('handles Infinity by falling back to min', () => {
    expect(clamp('Infinity', 1, 1000)).toBe(1);
  });

  it('handles -Infinity by falling back to min', () => {
    expect(clamp('-Infinity', 1, 1000)).toBe(1);
  });

  it('falls back to 0 when min is not specified and value is NaN', () => {
    expect(clamp('abc', undefined, 100)).toBe(0);
  });

  it('clamps with only min specified', () => {
    expect(clamp('-10', 0)).toBe(0);
    expect(clamp('50', 0)).toBe(50);
  });

  it('clamps with only max specified', () => {
    expect(clamp('200', undefined, 100)).toBe(100);
    expect(clamp('50', undefined, 100)).toBe(50);
  });

  it('handles no constraints', () => {
    expect(clamp('42')).toBe(42);
    expect(clamp('-100')).toBe(-100);
  });

  it('handles fractional values correctly', () => {
    expect(clamp('0.5', 0, 1)).toBe(0.5);
    expect(clamp('1.5', 0, 1)).toBe(1);
    expect(clamp('-0.1', 0, 1)).toBe(0);
  });

  it('handles zero as valid min boundary', () => {
    expect(clamp('0', 0, 60000)).toBe(0);
  });
});

describe('NumberInput rangeTitle', () => {
  it('returns range when both min and max provided', () => {
    expect(rangeTitle(1, 1000)).toBe('Range: 1 – 1000');
  });

  it('returns min-only when only min provided', () => {
    expect(rangeTitle(0, undefined)).toBe('Min: 0');
  });

  it('returns max-only when only max provided', () => {
    expect(rangeTitle(undefined, 100)).toBe('Max: 100');
  });

  it('returns undefined when neither provided', () => {
    expect(rangeTitle()).toBeUndefined();
  });
});
