/**
 * Wiki Page View - Displays a wiki page with rendered markdown, table of contents,
 * wiki links, tabs for Read/Edit/History/Discuss, and decay status.
 */

import { useParams, Link } from 'react-router-dom';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useWikiPage } from '../hooks/useWikiPage';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import { usePageEngagement } from '../hooks/usePageEngagement';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { useIsSponsored } from '../hooks/useIsSponsored';
import { useRpc } from '../hooks/useRpc';
import { renderMarkdown } from '../lib/markdown';
import { parseWikiLinks } from '../lib/wikilinks';
import { markMediaImages, resolveMediaImages } from '../lib/mediaImages';
import { extractTableOfContents } from '../lib/toc';
import { ReportModal, ReportButton, SpamBadge } from '../components/ReportModal';
import type { TableOfContentsItem } from '../types/wiki';
import './WikiPageView.css';

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function formatTimeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return formatDate(unixSeconds);
}

function truncateAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`;
}

function decayInfo(prob: number): { text: string; className: string; label: string } {
  const survival = Math.round((1 - prob) * 100);
  if (survival > 75) return { text: `${survival}%`, className: 'wiki-decay--fresh', label: 'Healthy' };
  if (survival > 25) return { text: `${survival}%`, className: 'wiki-decay--aging', label: 'Aging' };
  return { text: `${survival}%`, className: 'wiki-decay--decaying', label: 'Decaying' };
}

function TocTree({ items, activeId }: { items: TableOfContentsItem[]; activeId: string | null }): JSX.Element {
  return (
    <ul className="wiki-toc__list">
      {items.map((item) => (
        <li key={item.id} className={`toc-level-${item.level}${activeId === item.id ? ' toc-active' : ''}`}>
          <a href={`#${item.id}`}>{item.text}</a>
          {item.children.length > 0 && (
            <TocTree items={item.children} activeId={activeId} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function WikiPageView(): JSX.Element {
  const { namespaceId, pageId } = useParams<{ namespaceId: string; pageId: string }>();
  const { data: page, loading, error } = useWikiPage(pageId ?? null);
  const { data: namespaces } = useWikiNamespaces();
  const { rpc } = useRpc();
  const [activeTocId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Container for the rendered page body, so we can resolve node-hosted images in it.
  const contentRef = useRef<HTMLDivElement>(null);
  // Fetch image bytes from the node's blob store and return a data: URL (get_media has
  // no HTTP route). Used to resolve `![alt](swim:<hash>)` images in page content.
  const getMediaUrl = useCallback(
    async (hash: string): Promise<string | null> => {
      if (!rpc) return null;
      try {
        const r = await rpc.call<{ media_type: string; data: string }>('get_media', {
          media_hash: hash,
        });
        return `data:${r.media_type};base64,${r.data}`;
      } catch {
        return null;
      }
    },
    [rpc],
  );

  // "Keep alive" engagement — resets the page's decay (SPEC_02).
  const { engage, engaging } = usePageEngagement();
  const { identity, sign } = useNodeIdentity();
  const isSponsored = useIsSponsored();
  const [engageMsg, setEngageMsg] = useState<string | null>(null);
  const handleEngage = async () => {
    setEngageMsg(null);
    if (!pageId || !identity?.publicKey) return;
    if (isSponsored === false) {
      setEngageMsg('You need a sponsor before you can engage.');
      return;
    }
    const ok = await engage(pageId, identity.publicKey, sign);
    setEngageMsg(ok ? 'Kept alive! Decay reset.' : 'Engagement failed — try again.');
  };

  // Find namespace name
  const namespaceName = useMemo(() => {
    const ns = namespaces.find((n) => n.id === namespaceId);
    return ns?.name ?? truncateAddr(namespaceId ?? '');
  }, [namespaces, namespaceId]);

  // Render markdown -> HTML -> wiki links -> TOC
  const { renderedHtml, toc } = useMemo(() => {
    if (!page?.content) return { renderedHtml: '', toc: [] as TableOfContentsItem[] };

    // Step 1: Render markdown to HTML
    const rawHtml = renderMarkdown(page.content);

    // Step 2: Convert [[wiki links]] to anchors (no existing pages list yet)
    const htmlWithLinks = parseWikiLinks(rawHtml, []);

    // Step 3: Rewrite node-media images (`swim:<hash>`) so they resolve via get_media
    // once mounted, instead of the browser trying to load an unloadable ref.
    const htmlWithMedia = markMediaImages(htmlWithLinks);

    // Step 4: Extract table of contents from rendered HTML
    const tocItems = extractTableOfContents(htmlWithMedia);

    return { renderedHtml: htmlWithMedia, toc: tocItems };
  }, [page?.content]);

  // Resolve node-hosted images (data-swim) by fetching their bytes via get_media.
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !rpc) return;
    resolveMediaImages(container, getMediaUrl).catch(() => {});
  }, [renderedHtml, rpc, getMediaUrl]);

  // Decay status
  const decay = page ? decayInfo(page.decayProbability) : null;

  return (
    <div className="wiki-page-view">
      {/* Breadcrumbs */}
      <div className="wiki-breadcrumbs">
        <Link to="/">Home</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <Link to={`/ns/${namespaceId}`}>{namespaceName}</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <span>{page?.title ?? 'Loading...'}</span>
      </div>

      {/* Tab bar */}
      <div className="wiki-tabs">
        <Link to={`/ns/${namespaceId}/page/${pageId}`} className="wiki-tab wiki-tab--active">Read</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/edit`} className="wiki-tab">Edit</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/history`} className="wiki-tab">History</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/discuss`} className="wiki-tab">Discuss</Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="wiki-loading">Loading page...</div>
      )}

      {/* Error state */}
      {error && (
        <div className="wiki-page-view__error">
          <h2>Page not found</h2>
          <p>{error}</p>
          <Link to={`/ns/${namespaceId}/page/${pageId}/edit`} className="wiki-btn wiki-btn--primary">
            Create this page
          </Link>
        </div>
      )}

      {/* Page content */}
      {page && !loading && !error && (
        <>
          {/* Page header */}
          <div className="wiki-page-header">
            <h1 className="wiki-page-title">
              {page.title}
              <Link
                to={`/ns/${namespaceId}/page/${pageId}/edit`}
                className="wiki-page-title__edit"
                title="Edit this page"
              >
                edit
              </Link>
            </h1>
            <div className="wiki-page-meta">
              <span>
                Last edited {formatTimeAgo(page.lastEdited)} by{' '}
                <span className="wiki-page-meta__author">{truncateAddr(page.authorAddress)}</span>
              </span>
              <span>Created {formatDate(page.createdAt)}</span>
              {page.revisionCount > 0 && (
                <span>
                  <Link to={`/ns/${namespaceId}/page/${pageId}/history`}>
                    {page.revisionCount} {page.revisionCount === 1 ? 'revision' : 'revisions'}
                  </Link>
                </span>
              )}
              {decay && (
                <span className={`wiki-decay ${decay.className}`}>
                  {decay.label}: {decay.text} alive
                </span>
              )}
              <button
                type="button"
                className="wiki-engage-btn"
                onClick={handleEngage}
                disabled={engaging}
                title="Engage to reset this page's decay and keep it alive"
              >
                {engaging ? 'Keeping alive…' : '♥ Keep alive'}
              </button>
              {engageMsg && <span className="wiki-engage-msg">{engageMsg}</span>}
              {pageId && <SpamBadge contentId={pageId} />}
              <ReportButton onReport={() => setShowReportModal(true)} />
            </div>
          </div>

          {/* Report modal (spam attestation, SPEC_12 §3) */}
          {showReportModal && pageId && (
            <ReportModal contentId={pageId} onClose={() => setShowReportModal(false)} />
          )}

          {/* Layout: TOC + content */}
          <div className="wiki-page-view__body">
            {/* Table of Contents (inline, Wikipedia-style) */}
            {toc.length > 2 && (
              <div className="wiki-toc">
                <div className="wiki-toc__title">Contents</div>
                <TocTree items={toc} activeId={activeTocId} />
              </div>
            )}

            {/* Rendered page content */}
            <div
              ref={contentRef}
              className="wiki-page-content"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>

          {/* Page footer with categories/tags */}
          {page.tags.length > 0 && (
            <div className="wiki-page-view__tags">
              <span className="wiki-page-view__tags-label">Categories:</span>
              <div className="wiki-tags">
                {page.tags.map((tag) => (
                  <Link key={tag} to={`/search?q=tag:${encodeURIComponent(tag)}`} className="wiki-tag">
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
