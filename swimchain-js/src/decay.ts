/**
 * Content decay calculations
 *
 * Implements the half-life decay model from SPEC_02.
 */

import { getWasm } from "./wasm-loader";
import type { DecayState, DecayConstants } from "./types";

/**
 * Calculate decay state for content
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @param nowSecs - Current timestamp (UNIX seconds, defaults to now)
 * @returns Decay state information
 *
 * @example
 * ```ts
 * const nowSecs = Math.floor(Date.now() / 1000);
 * const createdSecs = nowSecs - 86400; // 1 day ago
 * const state = calculateDecay(createdSecs, createdSecs, nowSecs);
 * console.log(state.isProtected); // true (within 48h floor)
 * ```
 */
export function calculateDecay(
  createdAtSecs: number,
  lastEngagementSecs: number,
  nowSecs?: number
): DecayState {
  const now = nowSecs ?? Math.floor(Date.now() / 1000);
  const wasm = getWasm();

  const state = wasm.calculate_decay(
    BigInt(createdAtSecs),
    BigInt(lastEngagementSecs),
    BigInt(now)
  );

  const result: DecayState = {
    currentHeat: state.currentHeat,
    isDecayed: state.isDecayed,
    isProtected: state.isProtected,
    halfLivesElapsed: state.halfLivesElapsed,
    ageSeconds: Number(state.ageSeconds),
    timeSinceEngagement: Number(state.timeSinceEngagement),
    decayPercent: state.decayPercent(),
    description: state.description(),
    timeUntilDecay: Number(state.timeUntilDecay()),
  };

  state.free();
  return result;
}

/**
 * Calculate decay state with custom half-life
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @param nowSecs - Current timestamp (UNIX seconds)
 * @param halfLifeSecs - Custom half-life in seconds
 * @returns Decay state information
 */
export function calculateDecayWithHalfLife(
  createdAtSecs: number,
  lastEngagementSecs: number,
  nowSecs: number,
  halfLifeSecs: number
): DecayState {
  const wasm = getWasm();

  const state = wasm.calculateDecayWithHalfLife(
    BigInt(createdAtSecs),
    BigInt(lastEngagementSecs),
    BigInt(nowSecs),
    BigInt(halfLifeSecs)
  );

  const result: DecayState = {
    currentHeat: state.currentHeat,
    isDecayed: state.isDecayed,
    isProtected: state.isProtected,
    halfLivesElapsed: state.halfLivesElapsed,
    ageSeconds: Number(state.ageSeconds),
    timeSinceEngagement: Number(state.timeSinceEngagement),
    decayPercent: state.decayPercent(),
    description: state.description(),
    timeUntilDecay: Number(state.timeUntilDecay()),
  };

  state.free();
  return result;
}

/**
 * Get decay constants from the protocol
 *
 * @returns Protocol decay constants
 */
export function getDecayConstants(): DecayConstants {
  const wasm = getWasm();
  return {
    floorSecs: Number(wasm.getDecayFloorSecs()),
    halfLifeSecs: Number(wasm.getHalfLifeSecs()),
    threshold: wasm.getDecayThreshold(),
  };
}

/**
 * Calculate survival probability at a given time
 *
 * @param halfLivesElapsed - Number of half-lives elapsed
 * @returns Survival probability (0 to 1)
 */
export function survivalProbability(halfLivesElapsed: number): number {
  return Math.pow(0.5, halfLivesElapsed);
}

/**
 * Calculate half-lives from survival probability
 *
 * @param probability - Survival probability (0 to 1)
 * @returns Number of half-lives elapsed
 */
export function halfLivesFromProbability(probability: number): number {
  if (probability <= 0 || probability > 1) {
    throw new Error("Probability must be between 0 and 1");
  }
  return -Math.log2(probability);
}

/**
 * Check if content would be decayed at a given survival probability
 *
 * @param probability - Survival probability
 * @returns true if below decay threshold
 */
export function isDecayedAtProbability(probability: number): boolean {
  return probability < getDecayConstants().threshold;
}

/**
 * Format decay state as a human-readable string
 *
 * @param state - Decay state
 * @returns Formatted string
 */
export function formatDecayState(state: DecayState): string {
  if (state.isProtected) {
    return `Protected (${formatDuration(state.ageSeconds)} old)`;
  }

  const heat = (state.currentHeat * 100).toFixed(1);
  const timeLeft = formatDuration(state.timeUntilDecay);

  if (state.isDecayed) {
    return `Decayed (${heat}% heat)`;
  }

  return `Active: ${heat}% heat, ${timeLeft} until decay`;
}

/**
 * Format a duration in seconds to a human-readable string
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "2h 30m", "3d 12h")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}
