import type { PoolSummary } from './gateway';

/**
 * Ranking weights.
 * MUST sum to 1.0 for proper weighting.
 *
 * ENGAGEMENT measures real engagement (count of engagements and how recently
 * the content was last engaged). Each engagement is an individual proof-of-work
 * action that resets the content's decay timer.
 */
export const RANKING_WEIGHTS = {
  TEXT_RELEVANCE: 0.45,
  HEAT_DECAY: 0.30,
  ENGAGEMENT: 0.10,
  RECENCY: 0.15,
} as const;

// Compile-time verification that weights sum to 1.0
const _weightSum: 1 = (
  RANKING_WEIGHTS.TEXT_RELEVANCE +
  RANKING_WEIGHTS.HEAT_DECAY +
  RANKING_WEIGHTS.ENGAGEMENT +
  RANKING_WEIGHTS.RECENCY
) as 1;

/**
 * Decay threshold from SPEC_02 - 6.25% (4 half-lives)
 */
export const DECAY_THRESHOLD = 0.0625;

/**
 * Score breakdown showing contribution of each factor
 * All values are normalized to 0-100 scale
 */
export interface ScoreBreakdown {
  /** Keyword match quality (0-100) */
  textRelevance: number;
  /** survival_probability * 100 (0-100) */
  heatDecay: number;
  /** Engagement signal from real engagement count + recency (0-100) */
  engagement: number;
  /** Time-based decay from now (0-100) */
  recency: number;
  /** Weighted sum (0-100) */
  totalScore: number;
  /** Show contribution of each factor */
  contributions: {
    textRelevance: number;    // textRelevance * 0.45
    heatDecay: number;        // heatDecay * 0.30
    engagement: number;       // engagement * 0.10
    recency: number;          // recency * 0.15
  };
}

/**
 * Search result with full content and ranking information
 */
export interface SearchResult {
  contentId: string;
  spaceId: string;
  spaceName: string;
  authorId: string;              // cs1-prefixed address
  title: string;                 // First 100 chars or extracted title
  body: string;                  // Body snippet (max 200 chars)
  createdAt: number;             // Unix timestamp
  lastEngagement: number;        // Unix timestamp
  replyCount: number;
  survivalProbability: number;   // 0.0-1.0 from ContentResponse
  isDecayed: boolean;
  isProtected: boolean;
  hoursUntilDecay: number | null;
  pool: PoolSummary | null;
  scoreBreakdown: ScoreBreakdown;
}

/**
 * Search filters from URL parameters
 */
export interface SearchFilters {
  space?: string;
  author?: string;
  minHeat?: 0 | 25 | 50 | 75 | 90;
  minEngagement?: 0 | 20 | 40 | 60;
  timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  includeDecaying?: boolean;
}

/**
 * Sort options for search results
 */
export type SortOption = 'relevance' | 'heat' | 'engagement' | 'newest' | 'replies';

/**
 * Parsed query from search input
 */
export interface ParsedQuery {
  /** Simple keywords */
  keywords: string[];
  /** Exact phrases in quotes */
  exactPhrases: string[];
  /** Terms to exclude (prefixed with -) */
  exclusions: string[];
  /** Filters extracted from query */
  filters: {
    space?: string;
    author?: string;
    minHeat?: number;
    minEngagement?: number;
    timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
  };
  /** Sort order */
  sortBy: SortOption;
}

/**
 * Indexed document for lunr.js
 */
export interface IndexedDocument {
  contentId: string;
  title: string;
  body: string;
  spaceName: string;
  authorAddress: string;
  createdAt: number;
  survivalProbability: number;
  isDecayed: boolean;
  pool: PoolSummary | null;
  replyCount: number;
}

/**
 * Search response with pagination
 */
export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  query: string;
  filters: SearchFilters;
  sortBy: SortOption;
}
