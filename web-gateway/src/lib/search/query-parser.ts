import type { ParsedQuery, SortOption } from '@/types/search';

/**
 * Parse a search query string into structured components.
 *
 * Supports:
 * - Simple keywords: `async traits`
 * - Exact phrases: `"stable in Rust"`
 * - Exclusion terms: `-deprecated`
 * - Space filter: `space:rust-lang`
 * - Author filter: `author:cs1q...`
 * - Heat filter: `heat:50` (minimum heat %)
 * - Time filter: `time:week`
 * - Sort: `sort:heat`
 */
export function parseQuery(input: string): ParsedQuery {
  const result: ParsedQuery = {
    keywords: [],
    exactPhrases: [],
    exclusions: [],
    filters: {},
    sortBy: 'relevance',
  };

  if (!input || input.trim() === '') {
    return result;
  }

  const trimmed = input.trim();

  // Extract exact phrases first (quoted strings)
  const phraseRegex = /"([^"]+)"/g;
  let remaining = trimmed;
  let phraseMatch: RegExpExecArray | null;

  while ((phraseMatch = phraseRegex.exec(trimmed)) !== null) {
    const phrase = phraseMatch[1];
    if (phrase && phrase.trim()) {
      result.exactPhrases.push(phrase.trim());
    }
    remaining = remaining.replace(phraseMatch[0], ' ');
  }

  // Split remaining text into tokens
  const tokens = remaining.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    // Check for filter syntax: key:value
    const colonIndex = token.indexOf(':');
    if (colonIndex > 0) {
      const key = token.slice(0, colonIndex).toLowerCase();
      const value = token.slice(colonIndex + 1);

      switch (key) {
        case 'space':
        case 's':
          result.filters.space = value;
          break;

        case 'author':
        case 'from':
        case 'by':
          result.filters.author = value;
          break;

        case 'heat':
        case 'h':
          const heatValue = parseInt(value, 10);
          if (!isNaN(heatValue) && heatValue >= 0 && heatValue <= 100) {
            result.filters.minHeat = heatValue;
          }
          break;

        case 'time':
        case 't':
          const timeValue = value.toLowerCase();
          if (['day', 'week', 'month', 'year', 'all'].includes(timeValue)) {
            result.filters.timeRange = timeValue as ParsedQuery['filters']['timeRange'];
          }
          break;

        case 'sort':
        case 'order':
          const sortValue = value.toLowerCase();
          if (['relevance', 'heat', 'engagement', 'newest', 'replies'].includes(sortValue)) {
            result.sortBy = sortValue as SortOption;
          }
          break;

        default:
          // Unknown filter, treat as keyword
          result.keywords.push(token);
      }
      continue;
    }

    // Check for exclusion: -term
    if (token.startsWith('-') && token.length > 1) {
      result.exclusions.push(token.slice(1));
      continue;
    }

    // Regular keyword
    result.keywords.push(token);
  }

  return result;
}

/**
 * Convert parsed query back to lunr.js query string
 */
export function toLunrQuery(parsed: ParsedQuery): string {
  const parts: string[] = [];

  // Add keywords
  for (const keyword of parsed.keywords) {
    // Escape special lunr characters
    const escaped = escapeLunrTerm(keyword);
    parts.push(escaped);
  }

  // Add exact phrases (use +term for required matching)
  for (const phrase of parsed.exactPhrases) {
    // For phrases, we add each word as required
    const words = phrase.split(/\s+/).filter(Boolean);
    for (const word of words) {
      parts.push(`+${escapeLunrTerm(word)}`);
    }
  }

  // Add exclusions
  for (const exclusion of parsed.exclusions) {
    parts.push(`-${escapeLunrTerm(exclusion)}`);
  }

  return parts.join(' ');
}

/**
 * Escape special characters for lunr.js
 */
function escapeLunrTerm(term: string): string {
  // Lunr special characters: : ^ ~ * + -
  // Also escape parentheses and brackets
  return term.replace(/[:\^~*+\-()[\]{}]/g, '\\$&');
}

/**
 * Build a display string from parsed query (for showing in UI)
 */
export function toDisplayString(parsed: ParsedQuery): string {
  const parts: string[] = [];

  // Keywords
  parts.push(...parsed.keywords);

  // Phrases
  for (const phrase of parsed.exactPhrases) {
    parts.push(`"${phrase}"`);
  }

  // Exclusions
  for (const exclusion of parsed.exclusions) {
    parts.push(`-${exclusion}`);
  }

  // Filters
  if (parsed.filters.space) {
    parts.push(`space:${parsed.filters.space}`);
  }
  if (parsed.filters.author) {
    parts.push(`author:${parsed.filters.author}`);
  }
  if (parsed.filters.minHeat !== undefined) {
    parts.push(`heat:${parsed.filters.minHeat}`);
  }
  if (parsed.filters.timeRange) {
    parts.push(`time:${parsed.filters.timeRange}`);
  }

  return parts.join(' ');
}

/**
 * Extract search suggestions from a partial query
 */
export function getSuggestions(
  input: string,
  availableSpaces: string[],
  _recentSearches: string[]
): string[] {
  const suggestions: string[] = [];
  const inputLower = input.toLowerCase();

  // If typing a filter prefix, suggest completions
  if (inputLower.endsWith('space:') || inputLower.endsWith('s:')) {
    suggestions.push(...availableSpaces.slice(0, 5).map(s => `space:${s}`));
  } else if (inputLower.endsWith('time:') || inputLower.endsWith('t:')) {
    suggestions.push('time:day', 'time:week', 'time:month', 'time:year');
  } else if (inputLower.endsWith('sort:') || inputLower.endsWith('order:')) {
    suggestions.push('sort:relevance', 'sort:heat', 'sort:newest', 'sort:replies');
  } else if (inputLower.endsWith('heat:') || inputLower.endsWith('h:')) {
    suggestions.push('heat:25', 'heat:50', 'heat:75', 'heat:90');
  }

  // Space name completions
  const spaceMatch = input.match(/(?:space:|s:)(\w*)$/);
  if (spaceMatch) {
    const partial = spaceMatch[1]?.toLowerCase() ?? '';
    const matches = availableSpaces
      .filter(s => s.toLowerCase().startsWith(partial))
      .slice(0, 5);
    suggestions.push(...matches.map(s => `space:${s}`));
  }

  return suggestions;
}
