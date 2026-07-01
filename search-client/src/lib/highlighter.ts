/**
 * Search Result Highlighter
 *
 * Highlights matched search terms in text results.
 * Uses <mark> tags for styling with CSS.
 */

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Highlight matched terms in text
 *
 * @param text - The text to highlight
 * @param terms - Individual search terms to highlight
 * @param phrases - Exact phrases to highlight
 * @returns HTML string with <mark> tags around matches
 */
export function highlightMatches(
  text: string,
  terms: string[],
  phrases: string[] = []
): string {
  if (!text || (terms.length === 0 && phrases.length === 0)) {
    return escapeHtml(text);
  }

  let result = escapeHtml(text);

  // Highlight phrases first (they're longer and more specific)
  for (const phrase of phrases) {
    if (!phrase) continue;
    const regex = new RegExp(`(${escapeRegex(phrase)})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  }

  // Then highlight individual terms
  for (const term of terms) {
    if (!term || term.length < 2) continue; // Skip very short terms
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    result = result.replace(regex, '<mark>$1</mark>');
  }

  return result;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Create a snippet from text around matched terms
 *
 * @param text - Full text content
 * @param terms - Search terms to find
 * @param maxLength - Maximum snippet length (default 200)
 * @returns Snippet with highlighted terms, or start of text if no matches
 */
export function createSnippet(
  text: string,
  terms: string[],
  phrases: string[] = [],
  maxLength = 200
): string {
  if (!text) return '';

  // Find the first match position
  const allTerms = [...phrases, ...terms].filter(t => t && t.length >= 2);
  let firstMatchIndex = -1;

  for (const term of allTerms) {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index;
    }
  }

  let snippet: string;

  if (firstMatchIndex === -1) {
    // No match found, use start of text
    snippet = text.slice(0, maxLength);
  } else {
    // Center snippet around the first match
    const contextBefore = 50;
    const start = Math.max(0, firstMatchIndex - contextBefore);
    const end = Math.min(text.length, start + maxLength);

    snippet = text.slice(start, end);

    // Add ellipsis if truncated
    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < text.length) {
      snippet = snippet + '...';
    }
  }

  return highlightMatches(snippet, terms, phrases);
}

/**
 * Highlight a title (shorter, simpler highlighting)
 */
export function highlightTitle(
  title: string,
  terms: string[],
  phrases: string[] = []
): string {
  return highlightMatches(title, terms, phrases);
}

/**
 * React-safe version that returns an array of text and highlighted parts
 * Use this for rendering in React components without dangerouslySetInnerHTML
 */
export interface HighlightPart {
  text: string;
  isHighlighted: boolean;
}

export function highlightToReactParts(
  text: string,
  terms: string[],
  phrases: string[] = []
): HighlightPart[] {
  if (!text) return [];

  if (terms.length === 0 && phrases.length === 0) {
    return [{ text, isHighlighted: false }];
  }

  const parts: HighlightPart[] = [];

  // Build a regex that matches any of our terms/phrases
  const allTerms = [...phrases, ...terms]
    .filter(t => t && t.length >= 2)
    .map(escapeRegex);

  if (allTerms.length === 0) {
    return [{ text, isHighlighted: false }];
  }

  const pattern = new RegExp(`(${allTerms.join('|')})`, 'gi');

  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        isHighlighted: false,
      });
    }

    // Add the match
    parts.push({
      text: match[0],
      isHighlighted: true,
    });

    lastIndex = pattern.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      isHighlighted: false,
    });
  }

  return parts.length > 0 ? parts : [{ text, isHighlighted: false }];
}
