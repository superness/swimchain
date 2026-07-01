/**
 * Rate Limiter Service
 *
 * Implements sliding window rate limiting for bridged posts.
 */

import type { SpaceId, RateLimitState } from '../types';
import {
  MAX_BRIDGE_POSTS_PER_HOUR,
  RATE_LIMIT_WINDOW_MS,
  STORAGE_KEYS,
} from '../types/constants';

/**
 * Sliding window rate limiter for bridged content.
 */
export class HourlyRateLimiter {
  private limits = new Map<SpaceId, number[]>(); // spaceId -> array of timestamps
  private readonly maxPerHour: number;
  private readonly windowMs: number;

  constructor(
    maxPerHour: number = MAX_BRIDGE_POSTS_PER_HOUR,
    windowMs: number = RATE_LIMIT_WINDOW_MS
  ) {
    this.maxPerHour = maxPerHour;
    this.windowMs = windowMs;
    this.loadState();
  }

  /**
   * Check if a post can be made to a space.
   *
   * @param spaceId - Space to check
   * @returns Whether posting is allowed
   */
  canPost(spaceId: SpaceId): boolean {
    this.pruneOld(spaceId);
    const timestamps = this.limits.get(spaceId) ?? [];
    return timestamps.length < this.maxPerHour;
  }

  /**
   * Record a post to a space.
   *
   * @param spaceId - Space that was posted to
   */
  recordPost(spaceId: SpaceId): void {
    this.pruneOld(spaceId);
    const timestamps = this.limits.get(spaceId) ?? [];
    timestamps.push(Date.now());
    this.limits.set(spaceId, timestamps);
    this.saveState();
  }

  /**
   * Get remaining posts allowed for a space.
   *
   * @param spaceId - Space to check
   * @returns Number of posts remaining
   */
  getRemaining(spaceId: SpaceId): number {
    this.pruneOld(spaceId);
    const timestamps = this.limits.get(spaceId) ?? [];
    return Math.max(0, this.maxPerHour - timestamps.length);
  }

  /**
   * Get when the next post will be available.
   *
   * @param spaceId - Space to check
   * @returns Date when a slot opens, or null if available now
   */
  getNextAvailableTime(spaceId: SpaceId): Date | null {
    this.pruneOld(spaceId);
    const timestamps = this.limits.get(spaceId) ?? [];

    if (timestamps.length < this.maxPerHour) {
      return null; // Available now
    }

    // Oldest timestamp will expire first
    const oldest = timestamps[0];
    if (oldest === undefined) return null;

    return new Date(oldest + this.windowMs);
  }

  /**
   * Get rate limit state for a space.
   *
   * @param spaceId - Space to check
   * @returns Rate limit state
   */
  getState(spaceId: SpaceId): RateLimitState {
    this.pruneOld(spaceId);
    const timestamps = this.limits.get(spaceId) ?? [];
    const oldest = timestamps[0] ?? Date.now();

    return {
      spaceId,
      postTimestamps: timestamps,
      resetsAt: new Date(oldest + this.windowMs),
    };
  }

  /**
   * Get all rate limit states.
   */
  getAllStates(): RateLimitState[] {
    const states: RateLimitState[] = [];
    for (const spaceId of this.limits.keys()) {
      states.push(this.getState(spaceId));
    }
    return states;
  }

  /**
   * Prune old timestamps for a space.
   */
  private pruneOld(spaceId: SpaceId): void {
    const cutoff = Date.now() - this.windowMs;
    const timestamps = this.limits.get(spaceId) ?? [];
    const pruned = timestamps.filter((t) => t > cutoff);

    if (pruned.length > 0) {
      this.limits.set(spaceId, pruned);
    } else {
      this.limits.delete(spaceId);
    }
  }

  /**
   * Load state from localStorage.
   */
  private loadState(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.RATE_LIMITS);
      if (stored) {
        const data = JSON.parse(stored) as Record<SpaceId, number[]>;
        this.limits = new Map(Object.entries(data));

        // Prune on load
        for (const spaceId of this.limits.keys()) {
          this.pruneOld(spaceId);
        }
      }
    } catch {
      // Use empty state
    }
  }

  /**
   * Save state to localStorage.
   */
  private saveState(): void {
    try {
      const data: Record<SpaceId, number[]> = {};
      for (const [spaceId, timestamps] of this.limits) {
        data[spaceId] = timestamps;
      }
      localStorage.setItem(STORAGE_KEYS.RATE_LIMITS, JSON.stringify(data));
    } catch {
      // Ignore save errors
    }
  }

  /**
   * Clear all rate limits.
   */
  clear(): void {
    this.limits.clear();
    this.saveState();
  }
}

/**
 * Singleton instance.
 */
let _instance: HourlyRateLimiter | null = null;

export function getRateLimiter(): HourlyRateLimiter {
  if (!_instance) {
    _instance = new HourlyRateLimiter();
  }
  return _instance;
}
