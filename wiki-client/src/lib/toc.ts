/**
 * Table of contents extractor.
 * Parses <h1> through <h6> tags from rendered HTML into a nested tree structure.
 */

import type { TableOfContentsItem } from '../types/wiki';

/**
 * Extract a table of contents from HTML by parsing h1-h6 tags.
 * Returns a nested tree of TableOfContentsItem where children
 * contain headings of a higher level (h2 under h1, h3 under h2, etc.).
 *
 * Headings must have an `id` attribute for anchor linking.
 * Text is extracted from the inner HTML with tags stripped.
 */
export function extractTableOfContents(html: string): TableOfContentsItem[] {
  const headingRegex = /<h([1-6])(?:\s+id="([^"]*)")?[^>]*>(.*?)<\/h\1>/gi;
  const flatItems: TableOfContentsItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    const levelStr = match[1];
    if (levelStr === undefined) continue;
    const level = parseInt(levelStr, 10);
    const id = match[2] ?? '';
    const rawText = match[3] ?? '';
    // Strip any inner HTML tags to get plain text
    const text = rawText.replace(/<[^>]+>/g, '').trim();

    flatItems.push({ id, text, level, children: [] });
  }

  return buildTree(flatItems);
}

/**
 * Build a nested tree from a flat list of headings.
 * Each heading's children are the consecutive headings at a deeper level
 * that follow it before the next heading at the same or shallower level.
 */
function buildTree(items: TableOfContentsItem[]): TableOfContentsItem[] {
  const root: TableOfContentsItem[] = [];
  const stack: TableOfContentsItem[] = [];

  for (const item of items) {
    // Pop items from the stack that are at the same or deeper level
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (!top || top.level < item.level) break;
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(item);
    } else {
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(item);
      }
    }

    stack.push(item);
  }

  return root;
}
