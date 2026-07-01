import type { SearchFilters, SearchResult, SortOption } from '@/types/search';

/**
 * Time range boundaries in milliseconds
 */
const TIME_RANGES: Record<NonNullable<SearchFilters['timeRange']>, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  all: Infinity,
};

/**
 * Apply filters to search results
 */
export function applyFilters(
  results: SearchResult[],
  filters: SearchFilters,
  nowMs: number = Date.now()
): SearchResult[] {
  return results.filter(result => {
    // Space filter
    if (filters.space && result.spaceName !== filters.space && result.spaceId !== filters.space) {
      return false;
    }

    // Author filter
    if (filters.author && !result.authorId.includes(filters.author)) {
      return false;
    }

    // Heat filter
    if (filters.minHeat !== undefined && filters.minHeat > 0) {
      const heatPercent = result.survivalProbability * 100;
      if (heatPercent < filters.minHeat) {
        return false;
      }
    }

    // Engagement filter
    if (filters.minEngagement !== undefined && filters.minEngagement > 0) {
      const engagementSeconds = result.pool?.contributedSeconds ?? 0;
      if (engagementSeconds < filters.minEngagement) {
        return false;
      }
    }

    // Time range filter
    if (filters.timeRange && filters.timeRange !== 'all') {
      const maxAge = TIME_RANGES[filters.timeRange];
      const age = nowMs - result.createdAt;
      if (age > maxAge) {
        return false;
      }
    }

    // Decaying filter (exclude low heat by default)
    if (!filters.includeDecaying) {
      const heatPercent = result.survivalProbability * 100;
      if (heatPercent < 20) {
        return false;
      }
    }

    // Exclude decayed content
    if (result.isDecayed) {
      return false;
    }

    return true;
  });
}

/**
 * Sort search results
 */
export function sortResults(
  results: SearchResult[],
  sortBy: SortOption
): SearchResult[] {
  const sorted = [...results];

  switch (sortBy) {
    case 'relevance':
      sorted.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);
      break;

    case 'heat':
      sorted.sort((a, b) => b.survivalProbability - a.survivalProbability);
      break;

    case 'engagement':
      sorted.sort((a, b) => {
        const aProgress = a.pool?.contributedSeconds ?? 0;
        const bProgress = b.pool?.contributedSeconds ?? 0;
        return bProgress - aProgress;
      });
      break;

    case 'newest':
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;

    case 'replies':
      sorted.sort((a, b) => b.replyCount - a.replyCount);
      break;
  }

  return sorted;
}

/**
 * Paginate search results
 */
export function paginateResults(
  results: SearchResult[],
  page: number,
  pageSize: number
): { results: SearchResult[]; hasMore: boolean } {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const paginatedResults = results.slice(start, end);

  return {
    results: paginatedResults,
    hasMore: end < results.length,
  };
}

/**
 * Parse filters from URL search params
 */
export function parseFiltersFromParams(params: URLSearchParams): SearchFilters {
  const filters: SearchFilters = {};

  const space = params.get('space');
  if (space) {
    filters.space = space;
  }

  const author = params.get('author');
  if (author) {
    filters.author = author;
  }

  const minHeat = params.get('minHeat');
  if (minHeat) {
    const value = parseInt(minHeat, 10);
    if ([0, 25, 50, 75, 90].includes(value)) {
      filters.minHeat = value as 0 | 25 | 50 | 75 | 90;
    }
  }

  const minEngagement = params.get('minEngagement');
  if (minEngagement) {
    const value = parseInt(minEngagement, 10);
    if ([0, 20, 40, 60].includes(value)) {
      filters.minEngagement = value as 0 | 20 | 40 | 60;
    }
  }

  const time = params.get('time');
  if (time && ['day', 'week', 'month', 'year', 'all'].includes(time)) {
    filters.timeRange = time as SearchFilters['timeRange'];
  }

  const decaying = params.get('decaying');
  if (decaying === 'true') {
    filters.includeDecaying = true;
  }

  return filters;
}

/**
 * Parse sort option from URL search params
 */
export function parseSortFromParams(params: URLSearchParams): SortOption {
  const sort = params.get('sort');
  if (sort && ['relevance', 'heat', 'engagement', 'newest', 'replies'].includes(sort)) {
    return sort as SortOption;
  }
  return 'relevance';
}

/**
 * Convert filters to URL search params
 */
export function filtersToParams(
  filters: SearchFilters,
  sortBy: SortOption = 'relevance'
): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.space) {
    params.set('space', filters.space);
  }

  if (filters.author) {
    params.set('author', filters.author);
  }

  if (filters.minHeat !== undefined && filters.minHeat > 0) {
    params.set('minHeat', String(filters.minHeat));
  }

  if (filters.minEngagement !== undefined && filters.minEngagement > 0) {
    params.set('minEngagement', String(filters.minEngagement));
  }

  if (filters.timeRange && filters.timeRange !== 'all') {
    params.set('time', filters.timeRange);
  }

  if (filters.includeDecaying) {
    params.set('decaying', 'true');
  }

  if (sortBy !== 'relevance') {
    params.set('sort', sortBy);
  }

  return params;
}

/**
 * Get human-readable description of filters
 */
export function describeFilters(filters: SearchFilters, sortBy: SortOption): string {
  const parts: string[] = [];

  if (filters.space) {
    parts.push(`in ${filters.space}`);
  }

  if (filters.author) {
    parts.push(`by ${filters.author}`);
  }

  if (filters.minHeat && filters.minHeat > 0) {
    parts.push(`heat >${filters.minHeat}%`);
  }

  if (filters.minEngagement && filters.minEngagement > 0) {
    parts.push(`engagement >${filters.minEngagement}s`);
  }

  if (filters.timeRange && filters.timeRange !== 'all') {
    parts.push(`from ${filters.timeRange}`);
  }

  if (sortBy !== 'relevance') {
    parts.push(`sorted by ${sortBy}`);
  }

  return parts.length > 0 ? parts.join(', ') : 'no filters';
}
