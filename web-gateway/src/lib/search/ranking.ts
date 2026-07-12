import type { ContentResponse } from '@/types/gateway';
import type { ScoreBreakdown } from '@/types/search';
import { RANKING_WEIGHTS } from '@/types/search';

/**
 * Calculate the search ranking score for a content item.
 *
 * Ranking is based on 4 transparent factors:
 * - TEXT_RELEVANCE (45%): How well content matches search query
 * - HEAT_DECAY (30%): Content's survival probability (engagement health)
 * - ENGAGEMENT (10%): Real engagement — how many times content was engaged
 *   and how recently. Each engagement is an individual proof-of-work action
 *   that resets the content's decay timer.
 * - RECENCY (15%): How recently content was created
 *
 * All factors are normalized to 0-100 scale, then weighted.
 * The final score is also 0-100.
 *
 * @param textScore - Text relevance score from lunr.js (0-100)
 * @param content - ContentResponse from the node
 * @param nowMs - Current time in milliseconds
 * @returns ScoreBreakdown with all factors visible for transparency
 */
export function calculateScore(
  textScore: number,
  content: ContentResponse,
  nowMs: number
): ScoreBreakdown {
  // Normalize all factors to 0-100
  const textRelevance = normalizeTextRelevance(textScore);
  const heatDecay = normalizeHeatDecay(content.survival_probability);
  const engagement = normalizeEngagement(content, nowMs);
  const recency = normalizeRecency(content.item.created_at, nowMs);

  // Calculate weighted contributions
  const contributions = {
    textRelevance: textRelevance * RANKING_WEIGHTS.TEXT_RELEVANCE,
    heatDecay: heatDecay * RANKING_WEIGHTS.HEAT_DECAY,
    engagement: engagement * RANKING_WEIGHTS.ENGAGEMENT,
    recency: recency * RANKING_WEIGHTS.RECENCY,
  };

  // Total score is sum of contributions
  const totalScore =
    contributions.textRelevance +
    contributions.heatDecay +
    contributions.engagement +
    contributions.recency;

  return {
    textRelevance,
    heatDecay,
    engagement,
    recency,
    totalScore,
    contributions,
  };
}

/**
 * Normalize text relevance score to 0-100.
 * Lunr.js scores can exceed 100, so we clamp.
 */
function normalizeTextRelevance(score: number): number {
  return Math.min(100, Math.max(0, score));
}

/**
 * Normalize heat/decay to 0-100.
 * survival_probability is 0.0-1.0, multiply by 100.
 */
function normalizeHeatDecay(survivalProbability: number): number {
  return Math.min(100, Math.max(0, survivalProbability * 100));
}

/**
 * Normalize real engagement to 0-100.
 *
 * Combines how much content has been engaged (engagement_count) with how
 * recently it was last engaged (last_engagement). Each engagement is an
 * individual proof-of-work action, so counts stay small — a handful of
 * engagements already signals strong community investment.
 *
 * No engagements = 0. Engagement count saturates at ~5, weighted equally
 * with recency of the most recent engagement (72-hour decay).
 */
function normalizeEngagement(content: ContentResponse, nowMs: number): number {
  const count = content.item.engagement_count ?? 0;
  if (count <= 0) {
    return 0;
  }

  // Count signal: saturates at 5 engagements (each is expensive PoW).
  const countScore = Math.min(100, count * 20);

  // Recency signal: exponential decay on time since last engagement (72h).
  const ageMs = nowMs - content.item.last_engagement;
  const hoursSince = ageMs > 0 ? ageMs / (1000 * 60 * 60) : 0;
  const recencyScore = 100 * Math.exp(-hoursSince / 72);

  const score = 0.5 * countScore + 0.5 * recencyScore;
  return Math.min(100, Math.max(0, score));
}

/**
 * Normalize recency to 0-100.
 * Uses exponential decay: full score (100) at 0 hours,
 * ~50 at 24 hours, ~0 at 7 days.
 *
 * Formula: 100 * e^(-hoursOld / 24)
 */
function normalizeRecency(createdAt: number, nowMs: number): number {
  const ageMs = nowMs - createdAt;
  if (ageMs <= 0) {
    return 100; // Just created or clock skew
  }

  const hoursOld = ageMs / (1000 * 60 * 60);
  // Exponential decay with 24-hour half-life
  const score = 100 * Math.exp(-hoursOld / 24);
  return Math.max(0, score);
}

/**
 * Sort search results by the specified sort option
 */
export type SortOption = 'relevance' | 'heat' | 'engagement' | 'newest' | 'replies';

export function sortResults(
  results: Array<{ scoreBreakdown: ScoreBreakdown; [key: string]: unknown }>,
  sortBy: SortOption
): void {
  switch (sortBy) {
    case 'relevance':
      results.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);
      break;
    case 'heat':
      results.sort((a, b) => b.scoreBreakdown.heatDecay - a.scoreBreakdown.heatDecay);
      break;
    case 'engagement':
      results.sort((a, b) => b.scoreBreakdown.engagement - a.scoreBreakdown.engagement);
      break;
    case 'newest':
      results.sort((a, b) => b.scoreBreakdown.recency - a.scoreBreakdown.recency);
      break;
    case 'replies':
      // For replies, we need the actual reply count - delegate to caller
      // Default to relevance sort here
      results.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);
      break;
  }
}

/**
 * Format score for display with explanation
 */
export function formatScoreExplanation(breakdown: ScoreBreakdown): string {
  const lines = [
    `Total Score: ${breakdown.totalScore.toFixed(1)}/100`,
    '',
    'Breakdown:',
    `  Text Match:  ${breakdown.textRelevance.toFixed(0)}% × 45% = ${breakdown.contributions.textRelevance.toFixed(1)}`,
    `  Heat:        ${breakdown.heatDecay.toFixed(0)}% × 30% = ${breakdown.contributions.heatDecay.toFixed(1)}`,
    `  Engagement:  ${breakdown.engagement.toFixed(0)}% × 10% = ${breakdown.contributions.engagement.toFixed(1)}`,
    `  Recency:     ${breakdown.recency.toFixed(0)}% × 15% = ${breakdown.contributions.recency.toFixed(1)}`,
  ];
  return lines.join('\n');
}

/**
 * Verify ranking weights sum to 1.0 (runtime check)
 */
export function verifyWeights(): boolean {
  const sum =
    RANKING_WEIGHTS.TEXT_RELEVANCE +
    RANKING_WEIGHTS.HEAT_DECAY +
    RANKING_WEIGHTS.ENGAGEMENT +
    RANKING_WEIGHTS.RECENCY;
  return Math.abs(sum - 1.0) < 0.0001;
}
