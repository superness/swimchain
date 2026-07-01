/**
 * Content decay calculations
 *
 * Implements the half-life decay model from SPEC_02.
 */
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
export declare function calculateDecay(createdAtSecs: number, lastEngagementSecs: number, nowSecs?: number): DecayState;
/**
 * Calculate decay state with custom half-life
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @param nowSecs - Current timestamp (UNIX seconds)
 * @param halfLifeSecs - Custom half-life in seconds
 * @returns Decay state information
 */
export declare function calculateDecayWithHalfLife(createdAtSecs: number, lastEngagementSecs: number, nowSecs: number, halfLifeSecs: number): DecayState;
/**
 * Get decay constants from the protocol
 *
 * @returns Protocol decay constants
 */
export declare function getDecayConstants(): DecayConstants;
/**
 * Calculate survival probability at a given time
 *
 * @param halfLivesElapsed - Number of half-lives elapsed
 * @returns Survival probability (0 to 1)
 */
export declare function survivalProbability(halfLivesElapsed: number): number;
/**
 * Calculate half-lives from survival probability
 *
 * @param probability - Survival probability (0 to 1)
 * @returns Number of half-lives elapsed
 */
export declare function halfLivesFromProbability(probability: number): number;
/**
 * Check if content would be decayed at a given survival probability
 *
 * @param probability - Survival probability
 * @returns true if below decay threshold
 */
export declare function isDecayedAtProbability(probability: number): boolean;
/**
 * Format decay state as a human-readable string
 *
 * @param state - Decay state
 * @returns Formatted string
 */
export declare function formatDecayState(state: DecayState): string;
/**
 * Format a duration in seconds to a human-readable string
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "2h 30m", "3d 12h")
 */
export declare function formatDuration(seconds: number): string;
//# sourceMappingURL=decay.d.ts.map