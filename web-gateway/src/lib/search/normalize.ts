/**
 * Normalization utilities for search ranking.
 *
 * All normalization functions return values in 0-100 range
 * for consistent weighting in the ranking algorithm.
 */

/**
 * Normalize a value to 0-100 range
 */
export function clamp100(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Linear normalization from arbitrary range to 0-100
 */
export function linearNormalize(
  value: number,
  min: number,
  max: number
): number {
  if (max <= min) {
    return 0;
  }
  const normalized = ((value - min) / (max - min)) * 100;
  return clamp100(normalized);
}

/**
 * Logarithmic normalization for values with long tails
 * (e.g., reply counts where most posts have few but some have many)
 */
export function logNormalize(
  value: number,
  maxExpected: number
): number {
  if (value <= 0) {
    return 0;
  }
  // log(1 + value) / log(1 + maxExpected) * 100
  const normalized = (Math.log1p(value) / Math.log1p(maxExpected)) * 100;
  return clamp100(normalized);
}

/**
 * Exponential decay normalization for time-based values.
 * Returns 100 at time 0, decays toward 0 as time increases.
 *
 * @param ageHours - How old the item is in hours
 * @param halfLifeHours - Hours until score reaches 50%
 */
export function exponentialDecay(
  ageHours: number,
  halfLifeHours: number
): number {
  if (ageHours <= 0) {
    return 100;
  }
  // Using e^(-age/halfLife * ln(2)) = 0.5^(age/halfLife)
  const score = 100 * Math.pow(0.5, ageHours / halfLifeHours);
  return Math.max(0, score);
}

/**
 * Inverse exponential for values where higher is better
 * (e.g., engagement where more is good)
 *
 * @param value - Current value
 * @param target - Target value for ~63% score
 */
export function inverseExponential(
  value: number,
  target: number
): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= target) {
    return 100;
  }
  // 1 - e^(-value/target) gives smooth curve from 0 to ~63% at target
  const score = (1 - Math.exp(-value / target)) * 100;
  return clamp100(score);
}

/**
 * Step function for discrete thresholds
 * Useful for filter matching where exact values matter
 */
export function stepNormalize(
  value: number,
  thresholds: number[]
): number {
  // Sort thresholds ascending
  const sorted = [...thresholds].sort((a, b) => a - b);

  for (let i = sorted.length - 1; i >= 0; i--) {
    if (value >= sorted[i]!) {
      return ((i + 1) / sorted.length) * 100;
    }
  }
  return 0;
}

/**
 * Boolean to score conversion
 */
export function boolToScore(value: boolean, trueScore = 100, falseScore = 0): number {
  return value ? trueScore : falseScore;
}

/**
 * Combine multiple scores with weights
 */
export function weightedAverage(
  scores: number[],
  weights: number[]
): number {
  if (scores.length !== weights.length || scores.length === 0) {
    return 0;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < scores.length; i++) {
    weightedSum += scores[i]! * weights[i]!;
    totalWeight += weights[i]!;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return weightedSum / totalWeight;
}
