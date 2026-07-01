/**
 * Heat Decay Color Utilities
 * Per SPEC_09: Engagement pool decay visualization
 */

import { COLORS } from './index';

export type HeatLevel = 'full' | 'warm' | 'cooling' | 'fading' | 'decayed';

/**
 * Calculate heat level based on decay percentage
 * @param decayPercentage - 0 (no decay) to 100 (fully decayed)
 */
export function getHeatLevel(decayPercentage: number): HeatLevel {
  if (decayPercentage <= 20) return 'full';
  if (decayPercentage <= 40) return 'warm';
  if (decayPercentage <= 60) return 'cooling';
  if (decayPercentage <= 80) return 'fading';
  return 'decayed';
}

/**
 * Get heat color from decay percentage
 */
export function getHeatColor(decayPercentage: number): string {
  const level = getHeatLevel(decayPercentage);
  return COLORS.heat[level];
}

/**
 * Calculate decay percentage from timestamps
 * @param createdAt - Creation timestamp (ms)
 * @param lastEngagement - Last engagement timestamp (ms)
 * @param decayPeriodMs - Time for full decay (default 24 hours)
 */
export function calculateDecayPercentage(
  createdAt: number,
  lastEngagement: number,
  decayPeriodMs: number = 24 * 60 * 60 * 1000
): number {
  const now = Date.now();
  const timeSinceEngagement = now - lastEngagement;
  const decayPercentage = Math.min(100, (timeSinceEngagement / decayPeriodMs) * 100);
  return Math.max(0, decayPercentage);
}

/**
 * Get human-readable time until decay
 */
export function getTimeUntilDecay(
  lastEngagement: number,
  decayPeriodMs: number = 24 * 60 * 60 * 1000
): string {
  const now = Date.now();
  const remaining = lastEngagement + decayPeriodMs - now;

  if (remaining <= 0) return 'Decayed';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
