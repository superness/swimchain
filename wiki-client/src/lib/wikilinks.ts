/**
 * Wiki-style link parser and transformer.
 * Converts [[Page Name]] syntax to HTML anchor tags.
 * Supports namespace prefixes: [[Namespace:Page]].
 * Red links for pages that don't exist.
 */

import type { WikiLink } from '../types/wiki';

/**
 * Extract all [[wiki links]] from raw markdown text.
 * Handles:
 *   [[Page Name]]         → target: "Page Name", namespace: undefined
 *   [[Namespace:Page]]    → target: "Page", namespace: "Namespace"
 *   [[Page|Display Text]] → target: "Page", text: "Display Text"
 */
export function extractWikiLinks(md: string): WikiLink[] {
  const links: WikiLink[] = [];
  const seen = new Set<string>();
  const regex = /\[\[([^\]]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(md)) !== null) {
    const inner = match[1];
    if (inner === undefined) continue;

    // Split on pipe for display text: [[Target|Display]]
    const pipeIdx = inner.indexOf('|');
    const rawTarget = pipeIdx !== -1 ? inner.slice(0, pipeIdx).trim() : inner.trim();
    const displayText = pipeIdx !== -1 ? inner.slice(pipeIdx + 1).trim() : inner.trim();

    // Split on colon for namespace: [[Namespace:Page]]
    const colonIdx = rawTarget.indexOf(':');
    let namespace: string | undefined;
    let target: string;
    if (colonIdx !== -1) {
      namespace = rawTarget.slice(0, colonIdx).trim();
      target = rawTarget.slice(colonIdx + 1).trim();
    } else {
      target = rawTarget;
    }

    const key = namespace ? `${namespace}:${target}` : target;
    if (!seen.has(key)) {
      seen.add(key);
      links.push({
        text: displayText,
        target,
        namespace,
        exists: false, // caller must resolve against known pages
      });
    }
  }

  return links;
}

/**
 * Convert [[wiki links]] in HTML to anchor tags.
 * Existing pages get normal links; missing pages get red links.
 *
 * @param html - HTML string (output of renderMarkdown) that may still contain [[...]] syntax
 * @param existingPages - Array of known page titles (case-insensitive match)
 */
export function parseWikiLinks(html: string, existingPages: string[]): string {
  const existingLower = new Set(existingPages.map((p) => p.toLowerCase()));

  return html.replace(/\[\[([^\]]+)\]\]/g, (_match, rawInner: unknown) => {
    const inner = String(rawInner);
    const pipeIdx = inner.indexOf('|');
    const rawTarget = pipeIdx !== -1 ? inner.slice(0, pipeIdx).trim() : inner.trim();
    const displayText = pipeIdx !== -1 ? inner.slice(pipeIdx + 1).trim() : inner.trim();

    // Parse namespace
    const colonIdx = rawTarget.indexOf(':');
    let pageName: string;
    if (colonIdx !== -1) {
      pageName = rawTarget.slice(colonIdx + 1).trim();
    } else {
      pageName = rawTarget;
    }

    const slug = pageName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');

    const exists = existingLower.has(pageName.toLowerCase());
    const href = `/wiki/${encodeURIComponent(slug)}`;

    if (exists) {
      return `<a href="${href}" class="wiki-link">${displayText}</a>`;
    }

    return `<a href="${href}" class="wiki-link wiki-link-missing" title="This page does not exist yet">${displayText}</a>`;
  });
}
