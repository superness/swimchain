/**
 * Auto-linkify plain post text: turn URLs into clickable links WITHOUT
 * dangerouslySetInnerHTML — we split the string and emit React <a> nodes so the
 * surrounding text stays escaped (no XSS). Matches http(s):// and bare www.*.
 *
 * Links open in a new tab; rel="noopener noreferrer nofollow" so target pages
 * can't touch window.opener and we don't pass link equity to arbitrary content.
 */
import type { ReactNode } from 'react';

// http(s):// … or bare www. … up to the first whitespace or angle bracket.
const URL_RE = /(https?:\/\/[^\s<>]+|www\.[^\s<>]+)/gi;
// Punctuation that commonly trails a URL in prose but isn't part of it.
const TRAILING = /[.,;:!?)\]}'"»”’]+$/;

/**
 * Return the text as an array of strings and <a> elements, safe to render
 * directly inside JSX (e.g. `<p>{linkify(body)}</p>`).
 */
export function linkify(text: string | null | undefined): ReactNode[] {
  if (!text) return [text ?? ''];

  const nodes: ReactNode[] = [];
  let lastIndex = 0; // pointer into the plain text stream we've consumed
  let key = 0;
  URL_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    const matchStart = match.index;
    const fullMatch = match[0];

    // Trim trailing prose punctuation, and a dangling ')' with no '(' in the URL.
    let url = fullMatch.replace(TRAILING, '');
    if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1);

    // Always advance the regex past the full match so we can't loop forever.
    URL_RE.lastIndex = matchStart + fullMatch.length;

    if (!url) continue; // matched only punctuation — treat as text

    // Emit any plain text before the URL.
    if (matchStart > lastIndex) nodes.push(text.slice(lastIndex, matchStart));

    const href = url.startsWith('http') ? url : `https://${url}`;
    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="autolink"
        onClick={(e) => e.stopPropagation()} // don't also trigger the card's click
      >
        {url}
      </a>,
    );

    // Any trailing punctuation we peeled off flows back as text on the next slice.
    lastIndex = matchStart + url.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
