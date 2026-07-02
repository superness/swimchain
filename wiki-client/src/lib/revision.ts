/**
 * Wiki revision encoding (client convention, v1).
 *
 * The Swimchain content model has no native wiki-revision type that is
 * queryable per-page without node changes:
 *   - `submit_edit` (ActionType::Edit) is restricted to the original author,
 *     which contradicts collaborative wiki editing, and the `get_replies` RPC
 *     does not expose content_type, so Edit actions cannot be distinguished
 *     from discussion replies client-side.
 *
 * So revisions are stored as Replies to the page Post carrying a
 * machine-readable header. This cleanly separates revisions from discussion
 * comments (plain replies), persists the edit summary on-chain, and lets any
 * identity edit any page. The header is an HTML comment so a markdown
 * renderer that sees a raw revision body renders it invisibly.
 *
 * Format:
 *   <!--wiki-revision v1
 *   summary: <single-line edit summary>
 *   -->
 *   <markdown content>
 */

export const REVISION_MARKER = '<!--wiki-revision v1';

export interface DecodedRevision {
  /** True if the body carries the wiki-revision header */
  isRevision: boolean;
  /** Edit summary from the header ('' if none) */
  summary: string;
  /** The page content (header stripped), or the raw body if not a revision */
  content: string;
}

/**
 * Encode page content + edit summary into a revision reply body.
 */
export function encodeRevisionBody(content: string, summary: string): string {
  // Keep the header parseable: single-line summary, no comment terminator
  const safeSummary = summary
    .replace(/\r?\n/g, ' ')
    .replace(/-->/g, '--​>') // zero-width space so the terminator can't appear in the header
    .trim();
  return `${REVISION_MARKER}\nsummary: ${safeSummary}\n-->\n${content}`;
}

/**
 * Decode a reply body. Returns isRevision=false (content = raw body) for
 * plain replies (discussion comments).
 */
export function decodeRevisionBody(body: string): DecodedRevision {
  if (!body.startsWith(REVISION_MARKER)) {
    return { isRevision: false, summary: '', content: body };
  }

  const end = body.indexOf('-->');
  if (end === -1) {
    // Malformed header — treat as a plain reply
    return { isRevision: false, summary: '', content: body };
  }

  const header = body.substring(REVISION_MARKER.length, end);
  const summaryMatch = header.match(/summary:[ \t]*(.*)/);
  const summary = summaryMatch?.[1]?.trim() ?? '';

  let content = body.substring(end + '-->'.length);
  if (content.startsWith('\r\n')) {
    content = content.substring(2);
  } else if (content.startsWith('\n')) {
    content = content.substring(1);
  }

  return { isRevision: true, summary, content };
}
