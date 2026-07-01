/**
 * Tests for type definitions and utilities
 */

import { describe, it, expect } from 'vitest';
import { getHeatState } from '../src/types';

describe('getHeatState', () => {
  it('returns "full" for heat >= 0.80', () => {
    expect(getHeatState(0.80)).toBe('full');
    expect(getHeatState(0.95)).toBe('full');
    expect(getHeatState(1.0)).toBe('full');
  });

  it('returns "warm" for heat 0.60-0.79', () => {
    expect(getHeatState(0.60)).toBe('warm');
    expect(getHeatState(0.70)).toBe('warm');
    expect(getHeatState(0.79)).toBe('warm');
  });

  it('returns "cooling" for heat 0.20-0.59', () => {
    expect(getHeatState(0.20)).toBe('cooling');
    expect(getHeatState(0.40)).toBe('cooling');
    expect(getHeatState(0.59)).toBe('cooling');
  });

  it('returns "fading" for heat 0.05-0.19', () => {
    expect(getHeatState(0.05)).toBe('fading');
    expect(getHeatState(0.10)).toBe('fading');
    expect(getHeatState(0.19)).toBe('fading');
  });

  it('returns "decayed" for heat < 0.05', () => {
    expect(getHeatState(0.04)).toBe('decayed');
    expect(getHeatState(0.01)).toBe('decayed');
    expect(getHeatState(0)).toBe('decayed');
  });
});
