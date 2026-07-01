/**
 * Query Parser for Advanced Search Syntax
 *
 * Parses Google-like search operators:
 * - "exact phrase" - Match exact phrase
 * - author:alice - Filter by author
 * - space:programming - Filter by space
 * - type:thread - Filter by content type
 * - before:2024-01-01 - Content before date
 * - after:2024-06-01 - Content after date
 * - has:media - Content with attachments
 * - -term - Exclude term
 * - OR - Match either term
 * - replies:>10 - Min reply count
 * - reactions:>50 - Min reaction count
 */

import type { ParsedQuery, SearchResultType } from '../types';

// Pre-compiled regexes for better performance (avoid re-compilation on every call)
const PHRASE_REGEX = /"([^"]+)"/g;
const OPERATOR_REGEX = /(\w+):(\S+)/g;
const EXCLUDE_REGEX = /-(\S+)/g;
const OR_REGEX = /\bOR\b/gi;
const WHITESPACE_REGEX = /\s+/;

/**
 * Parse a search query string into structured parameters
 */
export function parseQuery(input: string): ParsedQuery {
  const result: ParsedQuery = {
    terms: [],
    phrases: [],
    excludeTerms: [],
  };

  let workingInput = input.trim();

  // Reset regex lastIndex for global patterns (required for reuse)
  PHRASE_REGEX.lastIndex = 0;
  OPERATOR_REGEX.lastIndex = 0;
  EXCLUDE_REGEX.lastIndex = 0;

  // Extract quoted phrases first (they can contain operators)
  let match;
  while ((match = PHRASE_REGEX.exec(workingInput)) !== null) {
    if (match[1]) {
      result.phrases.push(match[1]);
    }
  }
  workingInput = workingInput.replace(PHRASE_REGEX, ' ');

  // Extract operators
  while ((match = OPERATOR_REGEX.exec(workingInput)) !== null) {
    const [, op, value] = match;
    if (!op || !value) continue;

    switch (op.toLowerCase()) {
      case 'author':
        result.author = value;
        break;
      case 'space':
        result.space = value;
        break;
      case 'type':
        result.type = parseContentType(value);
        break;
      case 'before':
        result.before = parseDateValue(value);
        break;
      case 'after':
        result.after = parseDateValue(value);
        break;
      case 'has':
        if (value.toLowerCase() === 'media') {
          result.hasMedia = true;
        }
        break;
      case 'replies':
        result.minReplies = parseComparison(value);
        break;
      case 'reactions':
        result.minReactions = parseComparison(value);
        break;
    }
  }
  workingInput = workingInput.replace(OPERATOR_REGEX, ' ');

  // Extract exclusions (-term)
  while ((match = EXCLUDE_REGEX.exec(workingInput)) !== null) {
    if (match[1]) {
      result.excludeTerms.push(match[1]);
    }
  }
  workingInput = workingInput.replace(EXCLUDE_REGEX, ' ');

  // Handle OR operator - for now, just treat as separate terms
  // Could be expanded later for more sophisticated boolean logic
  workingInput = workingInput.replace(OR_REGEX, ' ');

  // Remaining words are search terms
  result.terms = workingInput
    .trim()
    .split(WHITESPACE_REGEX)
    .filter(Boolean)
    .filter(term => term.length > 0);

  return result;
}

/**
 * Parse a content type value
 */
function parseContentType(value: string): SearchResultType | undefined {
  const normalized = value.toLowerCase();
  switch (normalized) {
    case 'space':
    case 'spaces':
      return 'space';
    case 'thread':
    case 'threads':
    case 'post':
    case 'posts':
      return 'thread';
    case 'reply':
    case 'replies':
    case 'comment':
    case 'comments':
      return 'reply';
    case 'user':
    case 'users':
    case 'identity':
    case 'identities':
      return 'user';
    default:
      return undefined;
  }
}

/**
 * Parse a date value to timestamp
 * Supports: YYYY-MM-DD, relative dates (today, yesterday, 7d, 1w, 1m, 1y)
 */
function parseDateValue(value: string): number | undefined {
  // Try ISO date format first
  const isoDate = Date.parse(value);
  if (!isNaN(isoDate)) {
    return Math.floor(isoDate / 1000);
  }

  // Try relative date formats
  const now = Date.now();
  const lower = value.toLowerCase();

  if (lower === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor(today.getTime() / 1000);
  }

  if (lower === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    return Math.floor(yesterday.getTime() / 1000);
  }

  // Parse relative formats: 7d, 1w, 1m, 1y
  const relativeMatch = lower.match(/^(\d+)([dwmy])$/);
  if (relativeMatch) {
    const [, numStr, unit] = relativeMatch;
    const num = parseInt(numStr ?? '0', 10);

    let ms = 0;
    switch (unit) {
      case 'd':
        ms = num * 24 * 60 * 60 * 1000;
        break;
      case 'w':
        ms = num * 7 * 24 * 60 * 60 * 1000;
        break;
      case 'm':
        ms = num * 30 * 24 * 60 * 60 * 1000;
        break;
      case 'y':
        ms = num * 365 * 24 * 60 * 60 * 1000;
        break;
    }

    return Math.floor((now - ms) / 1000);
  }

  return undefined;
}

/**
 * Parse comparison operators like >10, <5, >=20
 */
function parseComparison(value: string): number | undefined {
  // Handle >10, <5, >=20, <=15, =10
  const match = value.match(/^([<>]=?|=)?(\d+)$/);
  if (match && match[2]) {
    const num = parseInt(match[2], 10);
    // For simplicity, we just return the number
    // The operator (>, <, >=, <=, =) could be used for more precise filtering
    // but for now we use it as a minimum threshold
    return num;
  }
  return undefined;
}

/**
 * Build a search query string from parsed parameters
 * Useful for URL generation or displaying the query
 */
export function buildQueryString(parsed: ParsedQuery): string {
  const parts: string[] = [];

  // Add phrases
  for (const phrase of parsed.phrases) {
    parts.push(`"${phrase}"`);
  }

  // Add terms
  parts.push(...parsed.terms);

  // Add exclusions
  for (const term of parsed.excludeTerms) {
    parts.push(`-${term}`);
  }

  // Add operators
  if (parsed.author) {
    parts.push(`author:${parsed.author}`);
  }
  if (parsed.space) {
    parts.push(`space:${parsed.space}`);
  }
  if (parsed.type) {
    parts.push(`type:${parsed.type}`);
  }
  if (parsed.hasMedia) {
    parts.push('has:media');
  }
  if (parsed.minReplies !== undefined) {
    parts.push(`replies:>${parsed.minReplies}`);
  }
  if (parsed.minReactions !== undefined) {
    parts.push(`reactions:>${parsed.minReactions}`);
  }
  if (parsed.before !== undefined) {
    const date = new Date(parsed.before * 1000);
    parts.push(`before:${date.toISOString().split('T')[0]}`);
  }
  if (parsed.after !== undefined) {
    const date = new Date(parsed.after * 1000);
    parts.push(`after:${date.toISOString().split('T')[0]}`);
  }

  return parts.join(' ');
}

/**
 * Get search terms for highlighting (combines terms and phrases)
 */
export function getHighlightTerms(parsed: ParsedQuery): { terms: string[]; phrases: string[] } {
  return {
    terms: parsed.terms,
    phrases: parsed.phrases,
  };
}
