/**
 * WikiLinkResolver — the `/wiki/:slug` route that [[wikilinks]] point at.
 *
 * The wikilink parser only knows a page TITLE, not where it lives, so links are
 * emitted as `/wiki/<slug>`. Before this route existed those links fell through
 * the `*` catch-all and dumped the reader on Home — every wikilink was broken.
 * This resolves the slug against each wiki namespace's page index and redirects
 * to the canonical `/ns/<namespace>/page/<contentId>` route, or shows a
 * MediaWiki-style "no such page" view when nothing matches.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import { wikiSlug } from '../hooks/useNamespacePages';

interface RpcContentItem {
  content_id: string;
  title?: string | null;
  content_type?: string;
  parent_id?: string | null;
}

export function WikiLinkResolver(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const { rpc, connected } = useRpc();
  const { data: namespaces, loading: nsLoading } = useWikiNamespaces();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!rpc || !connected || !slug || nsLoading) return;
    let cancelled = false;

    (async () => {
      const wanted = decodeURIComponent(slug);
      for (const ns of namespaces) {
        try {
          const result = await rpc.call<{ items: RpcContentItem[] }>('list_space_content', {
            space_id: ns.id,
            limit: 500,
            offset: 0,
            sort: 'recent',
          });
          const hit = (result.items ?? []).find(
            (item) =>
              !!item.title &&
              (item.content_type === 'Post' || (!item.parent_id && item.content_type !== 'Reply')) &&
              !/0{24,}$/.test(item.content_id) &&
              wikiSlug(item.title) === wanted,
          );
          if (hit) {
            if (!cancelled) {
              navigate(
                `/ns/${encodeURIComponent(ns.id)}/page/${encodeURIComponent(hit.content_id)}`,
                { replace: true },
              );
            }
            return;
          }
        } catch {
          /* try the next namespace */
        }
      }
      if (!cancelled) setNotFound(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [rpc, connected, slug, namespaces, nsLoading, navigate]);

  if (notFound) {
    return (
      <div className="wiki-page-view" style={{ padding: '2rem' }}>
        <h1>No page called “{decodeURIComponent(slug ?? '')}” yet</h1>
        <p>
          This wiki link points to a page that hasn't been written (or hasn't reached your
          node). You can <Link to="/search">search the wiki</Link> or go back{' '}
          <Link to="/">home</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="wiki-page-view" style={{ padding: '2rem', color: 'var(--text-muted, #666)' }}>
      Resolving “{decodeURIComponent(slug ?? '')}”…
    </div>
  );
}

export default WikiLinkResolver;
