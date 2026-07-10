/**
 * Namespace Page - Lists all wiki pages in a namespace (space).
 * Fetches pages via list_space_content RPC and shows sortable page listing.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import type { WikiPage } from '../types/wiki';
import './NamespacePage.css';

type SortField = 'title' | 'date' | 'activity';

interface RpcContentSummary {
  content_id: string;
  content_type: string;
  author_id: string;
  space_id: string;
  parent_id: string | null;
  created_at: number;
  last_engagement: number;
  title: string | null;
  body: string | null;
  body_preview: string | null;
  engagement_count: number;
  reply_count: number;
  display_name?: string;
}

interface RpcListContentResult {
  items: RpcContentSummary[];
  total: number;
}

function mapToWikiPage(raw: RpcContentSummary): WikiPage {
  return {
    id: raw.content_id,
    namespaceId: raw.space_id,
    title: raw.title ?? raw.body_preview ?? '(Untitled)',
    content: raw.body ?? '',
    author: raw.display_name ?? raw.author_id,
    authorAddress: raw.author_id,
    createdAt: raw.created_at,
    lastEdited: raw.last_engagement,
    revisionCount: raw.reply_count,
    discussionCount: 0,
    tags: [],
    isDecaying: false,
    decayProbability: 0,
  };
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelative(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(timestamp);
}

export function NamespacePage(): JSX.Element {
  const { namespaceId } = useParams<{ namespaceId: string }>();
  const { rpc, connected } = useRpc();
  const { data: namespaces } = useWikiNamespaces();

  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortField>('date');

  const namespace = namespaces.find(ns => ns.id === namespaceId);
  const namespaceName = namespace?.name ?? namespaceId?.substring(0, 12) ?? 'Unknown';

  const fetchPages = useCallback(async () => {
    if (!rpc || !connected || !namespaceId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call<RpcListContentResult>('list_space_content', {
        space_id: namespaceId,
        limit: 200,
        offset: 0,
        sort: 'recent',
      });

      // Wiki pages are top-level posts (the node stores them as
      // content_type 'Post', not 'Thread' — the old 'Thread' filter matched
      // nothing, so the list was always empty while the namespace count,
      // sourced from post_count, showed pages existed). Show top-level posts
      // as pages: Post type, or anything without a parent that isn't a reply.
      const pageItems = result.items.filter(
        (item) =>
          (item.content_type === 'Post' ||
            (!item.parent_id && item.content_type !== 'Reply')) &&
          // Skip malformed entries whose content hash is a short (16-byte space/
          // thread) id zero-padded to 32 bytes — they aren't real pages and open to
          // "Content not found" (-32004). A real sha256 never has 12+ trailing zero
          // bytes, so this only drops the padded artifacts.
          !/0{24,}$/.test(item.content_id),
      );
      setPages(pageItems.map(mapToWikiPage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pages');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, namespaceId]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const sortedPages = useMemo(() => {
    const sorted = [...pages];
    switch (sortBy) {
      case 'title':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'date':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'activity':
        sorted.sort((a, b) => b.lastEdited - a.lastEdited);
        break;
    }
    return sorted;
  }, [pages, sortBy]);

  return (
    <div className="ns-page">
      <div className="wiki-breadcrumbs">
        <Link to="/">Home</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <span>{namespaceName}</span>
      </div>

      <div className="ns-page__header">
        <h1 className="wiki-page-title">Namespace: {namespaceName}</h1>
        {namespace && (
          <div className="wiki-page-meta">
            <span>{namespace.pageCount} page{namespace.pageCount !== 1 ? 's' : ''}</span>
            {namespace.description && <span>{namespace.description}</span>}
          </div>
        )}
      </div>

      <div className="ns-page__toolbar">
        <Link to={`/ns/${namespaceId}/new`} className="wiki-btn wiki-btn--primary">
          + New Page
        </Link>

        <div className="ns-page__sort">
          <span className="ns-page__sort-label">Sort by:</span>
          <button
            className={`wiki-btn wiki-btn--small${sortBy === 'title' ? ' ns-page__sort-btn--active' : ''}`}
            onClick={() => setSortBy('title')}
          >
            Title
          </button>
          <button
            className={`wiki-btn wiki-btn--small${sortBy === 'date' ? ' ns-page__sort-btn--active' : ''}`}
            onClick={() => setSortBy('date')}
          >
            Date
          </button>
          <button
            className={`wiki-btn wiki-btn--small${sortBy === 'activity' ? ' ns-page__sort-btn--active' : ''}`}
            onClick={() => setSortBy('activity')}
          >
            Activity
          </button>
        </div>
      </div>

      {loading && (
        <div className="wiki-loading">Loading pages...</div>
      )}

      {error && (
        <div className="ns-page__error">
          <p>{error}</p>
          <button className="wiki-btn" onClick={fetchPages}>Retry</button>
        </div>
      )}

      {!loading && !error && sortedPages.length === 0 && (
        <div className="wiki-empty">
          <div className="wiki-empty__title">No pages yet</div>
          <p>Create the first page in this namespace.</p>
        </div>
      )}

      {!loading && sortedPages.length > 0 && (
        <div className="ns-page__list">
          <div className="ns-page__list-header">
            <span className="ns-page__col-title">Page</span>
            <span className="ns-page__col-author">Author</span>
            <span className="ns-page__col-date">Last Edited</span>
            <span className="ns-page__col-revisions">Revisions</span>
          </div>
          {sortedPages.map(page => (
            <div key={page.id} className="ns-page__list-item">
              <div className="ns-page__col-title">
                <Link to={`/ns/${namespaceId}/page/${page.id}`} className="ns-page__page-link">
                  {page.title}
                </Link>
              </div>
              <div className="ns-page__col-author" title={page.authorAddress}>
                {truncateAddress(page.authorAddress)}
              </div>
              <div className="ns-page__col-date" title={formatDate(page.lastEdited)}>
                {formatRelative(page.lastEdited)}
              </div>
              <div className="ns-page__col-revisions">
                {page.revisionCount}
              </div>
            </div>
          ))}
          <div className="ns-page__list-footer">
            {sortedPages.length} page{sortedPages.length !== 1 ? 's' : ''} in this namespace
          </div>
        </div>
      )}
    </div>
  );
}
