/**
 * HourlyRateLimiter unit tests
 *
 * Covers the sliding window: limit enforcement, per-space isolation,
 * window expiry, next-available-time reporting, and localStorage
 * persistence. Time is faked; no real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HourlyRateLimiter } from '../src/services/RateLimiter';
import { STORAGE_KEYS } from '../src/types/constants';

const MAX = 3;
const WINDOW_MS = 60_000;
const SPACE = 'sp1test';

let limiter: HourlyRateLimiter;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
  localStorage.removeItem(STORAGE_KEYS.RATE_LIMITS);
  limiter = new HourlyRateLimiter(MAX, WINDOW_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HourlyRateLimiter', () => {
  it('allows posting until the per-window maximum is reached', () => {
    for (let i = 0; i < MAX; i++) {
      expect(limiter.canPost(SPACE)).toBe(true);
      limiter.recordPost(SPACE);
    }
    expect(limiter.canPost(SPACE)).toBe(false);
    expect(limiter.getRemaining(SPACE)).toBe(0);
  });

  it('tracks remaining slots', () => {
    expect(limiter.getRemaining(SPACE)).toBe(MAX);
    limiter.recordPost(SPACE);
    expect(limiter.getRemaining(SPACE)).toBe(MAX - 1);
  });

  it('isolates limits per space', () => {
    for (let i = 0; i < MAX; i++) limiter.recordPost(SPACE);
    expect(limiter.canPost(SPACE)).toBe(false);
    expect(limiter.canPost('sp1other')).toBe(true);
    expect(limiter.getRemaining('sp1other')).toBe(MAX);
  });

  it('frees slots as the sliding window moves', () => {
    limiter.recordPost(SPACE); // t=0
    vi.advanceTimersByTime(30_000);
    limiter.recordPost(SPACE); // t=30s
    limiter.recordPost(SPACE); // t=30s
    expect(limiter.canPost(SPACE)).toBe(false);

    // t=60.001s: the t=0 post ages out, the two t=30s posts remain
    vi.advanceTimersByTime(30_001);
    expect(limiter.canPost(SPACE)).toBe(true);
    expect(limiter.getRemaining(SPACE)).toBe(1);

    // t=90.001s: everything aged out
    vi.advanceTimersByTime(30_000);
    expect(limiter.getRemaining(SPACE)).toBe(MAX);
  });

  it('reports null next-available-time when a slot is free', () => {
    expect(limiter.getNextAvailableTime(SPACE)).toBeNull();
  });

  it('reports when the oldest post expires once the window is full', () => {
    const start = Date.now();
    for (let i = 0; i < MAX; i++) limiter.recordPost(SPACE);
    const next = limiter.getNextAvailableTime(SPACE);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(start + WINDOW_MS);
  });

  it('exposes state with reset time derived from the oldest post', () => {
    const start = Date.now();
    limiter.recordPost(SPACE);
    vi.advanceTimersByTime(10_000);
    limiter.recordPost(SPACE);

    const state = limiter.getState(SPACE);
    expect(state.spaceId).toBe(SPACE);
    expect(state.postTimestamps).toHaveLength(2);
    expect(state.resetsAt.getTime()).toBe(start + WINDOW_MS);
  });

  it('persists timestamps to localStorage and reloads them', () => {
    limiter.recordPost(SPACE);
    limiter.recordPost(SPACE);

    const reloaded = new HourlyRateLimiter(MAX, WINDOW_MS);
    expect(reloaded.getRemaining(SPACE)).toBe(MAX - 2);
  });

  it('prunes stale persisted timestamps on load', () => {
    limiter.recordPost(SPACE);
    vi.advanceTimersByTime(WINDOW_MS + 1);

    const reloaded = new HourlyRateLimiter(MAX, WINDOW_MS);
    expect(reloaded.getRemaining(SPACE)).toBe(MAX);
    expect(reloaded.getAllStates()).toHaveLength(0);
  });

  it('clear resets all spaces', () => {
    limiter.recordPost(SPACE);
    limiter.recordPost('sp1other');
    limiter.clear();
    expect(limiter.getRemaining(SPACE)).toBe(MAX);
    expect(limiter.getAllStates()).toHaveLength(0);
  });
});
