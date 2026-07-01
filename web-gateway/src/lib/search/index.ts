/**
 * Search module exports
 */

// Ranking
export { calculateScore, sortResults, verifyWeights, formatScoreExplanation } from './ranking';

// Normalization utilities
export * from './normalize';

// Query parsing
export { parseQuery, toLunrQuery, toDisplayString, getSuggestions } from './query-parser';

// Indexer
export { SearchIndexer, getSearchIndexer, resetSearchIndexer } from './indexer';

// Filters
export {
  applyFilters,
  sortResults as sortFilteredResults,
  paginateResults,
  parseFiltersFromParams,
  parseSortFromParams,
  filtersToParams,
  describeFilters,
} from './filters';
