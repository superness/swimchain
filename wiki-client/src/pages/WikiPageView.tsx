/**
 * Wiki Page View - Displays a wiki page with rendered markdown, table of contents,
 * wiki links, tabs for Read/Edit/History/Discuss, and decay status.
 */

import { useParams, Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useWikiPage } from '../hooks/useWikiPage';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import { renderMarkdown } from '../lib/markdown';
import { parseWikiLinks } from '../lib/wikilinks';
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
  const [activeTocId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

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

    // Step 3: Extract table of contents from rendered HTML
    const tocItems = extractTableOfContents(htmlWithLinks);

    return { renderedHtml: htmlWithLinks, toc: tocItems };
  }, [page?.content]);

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
