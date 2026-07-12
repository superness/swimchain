import { withBase } from '@/lib/base-path';

/**
 * Render a post/reply body, resolving content-addressed image refs.
 *
 * Bodies are plain text that may embed media as `![alt](swim:<hash>)` (markdown
 * image) or a bare `swim:<hash>`. We tokenize on those refs and render each as an
 * <img> pointing at the gateway media proxy; everything else stays literal text
 * (no HTML injection). Wiki-revision comment markers are stripped.
 */
const MEDIA_RE = /!\[[^\]]*\]\(swim:([0-9a-fA-F]{64})\)|swim:([0-9a-fA-F]{64})/g;

export function PostBody({ body, className }: { body: string | null; className?: string }) {
  if (!body) return <div className={className}>[Content unavailable]</div>;

  // Strip HTML-style wiki revision markers: <!--wiki-revision ... -->
  const cleaned = body.replace(/<!--[\s\S]*?-->/g, '').trim();

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  MEDIA_RE.lastIndex = 0;
  while ((m = MEDIA_RE.exec(cleaned)) !== null) {
    if (m.index > last) parts.push(cleaned.slice(last, m.index));
    const hash = (m[1] || m[2] || '').toLowerCase();
    parts.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`img-${key++}`}
        src={withBase(`/api/media/${hash}`)}
        alt="attached media"
        loading="lazy"
        className="post-image"
      />
    );
    last = m.index + m[0].length;
  }
  if (last < cleaned.length) parts.push(cleaned.slice(last));

  return <div className={className}>{parts}</div>;
}
