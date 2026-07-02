/**
 * Revision History - Lists all revisions of a wiki page with diff support.
 * Uses useWikiRevisions hook and computeDiff from lib/diff.
 */

import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWikiRevisions } from '../hooks/useWikiRevisions';
import { useWikiPage } from '../hooks/useWikiPage';
import { computeDiff, type DiffLine } from '../lib/diff';
import { renderMarkdown } from '../lib/markdown';
import './RevisionHistory.css';

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDateTime(timestamp);
}

function DiffView({ diffLines }: { diffLines: DiffLine[] }): JSX.Element {
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === 'added') added++;
      if (line.type === 'removed') removed++;
    }
    return { added, removed };
  }, [diffLines]);

  return (
    <div className="rev-diff">
      <div className="rev-diff__stats">
        <span className="rev-diff__stat rev-diff__stat--added">+{stats.added}</span>
        <span className="rev-diff__stat rev-diff__stat--removed">-{stats.removed}</span>
      </div>
      <div className="wiki-diff">
        {diffLines.map((line, i) => (
          <div key={i} className={`wiki-diff__line wiki-diff__line--${line.type}`}>
            <span className="wiki-diff__line-num">
              {line.oldLineNumber ?? ''}
            </span>
            <span className="wiki-diff__line-num">
              {line.newLineNumber ?? ''}
            </span>
            <span className="wiki-diff__prefix">
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span>{line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ViewMode = 'list' | 'view' | 'diff';

export function RevisionHistory(): JSX.Element {
  const { namespaceId, pageId } = useParams<{ namespaceId: string; pageId: string }>();
  const { data: page } = useWikiPage(pageId ?? null);
  const { data: revisions, loading, error, refetch } = useWikiRevisions(pageId ?? null);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([null, null]);

  const pageTitle = page?.title ?? 'Page';

  const selectedRevision = revisions.find(r => r.id === selectedRevisionId);

  const diffLines = useMemo<DiffLine[]>(() => {
    if (viewMode !== 'diff') return [];
    const [oldId, newId] = compareIds;
    if (!oldId || !newId) return [];

    let oldContent = '';
    let newContent = '';

    // If comparing with the original page (baseContent = the original post
    // body; page.content is the latest revision)
    if (oldId === 'original') {
      oldContent = page?.baseContent ?? '';
    } else {
      oldContent = revisions.find(r => r.id === oldId)?.content ?? '';
    }

    if (newId === 'original') {
      newContent = page?.baseContent ?? '';
    } else {
      newContent = revisions.find(r => r.id === newId)?.content ?? '';
    }

    return computeDiff(oldContent, newContent);
  }, [viewMode, compareIds, revisions, page]);

  const handleViewRevision = (id: string) => {
    setSelectedRevisionId(id);
    setViewMode('view');
  };

  const handleCompare = () => {
    if (compareIds[0] && compareIds[1]) {
      setViewMode('diff');
    }
  };

  const handleToggleCompare = (id: string, slot: 0 | 1) => {
    setCompareIds(prev => {
      const next: [string | null, string | null] = [...prev];
      next[slot] = next[slot] === id ? null : id;
      return next;
    });
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedRevisionId(null);
  };

  // Build the full revision list: original page + all revisions
  const allRevisions = useMemo(() => {
    const list: { id: string; author: string; authorAddress: string; timestamp: number; summary: string; isOriginal: boolean }[] = [];

    if (page) {
      list.push({
        id: 'original',
        author: page.author,
        authorAddress: page.authorAddress,
        timestamp: page.createdAt,
        summary: 'Original page created',
        isOriginal: true,
      });
    }

    for (const rev of revisions) {
      list.push({
        id: rev.id,
        author: rev.author,
        authorAddress: rev.authorAddress,
        timestamp: rev.timestamp,
        summary: rev.summary,
        isOriginal: false,
      });
    }

    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }, [page, revisions]);

  return (
    <div className="rev-page">
      <div className="wiki-breadcrumbs">
        <Link to="/">Home</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <Link to={`/ns/${namespaceId}`}>Namespace</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <Link to={`/ns/${namespaceId}/page/${pageId}`}>{pageTitle}</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <span>History</span>
      </div>

      <div className="wiki-tabs">
        <Link to={`/ns/${namespaceId}/page/${pageId}`} className="wiki-tab">Read</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/edit`} className="wiki-tab">Edit</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/history`} className="wiki-tab wiki-tab--active">History</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/discuss`} className="wiki-tab">Discuss</Link>
      </div>

      <h1 className="wiki-page-title">
        Revision history of &ldquo;{pageTitle}&rdquo;
      </h1>

      {loading && <div className="wiki-loading">Loading revision history...</div>}

      {error && (
        <div className="rev-page__error">
          <p>{error}</p>
          <button className="wiki-btn" onClick={refetch}>Retry</button>
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && !loading && !error && (
        <>
          {allRevisions.length === 0 ? (
            <div className="wiki-empty">
              <div className="wiki-empty__title">No revisions found</div>
              <p>This page has no revision history yet.</p>
            </div>
          ) : (
            <>
              <div className="rev-page__compare-bar">
                <button
                  className="wiki-btn wiki-btn--primary wiki-btn--small"
                  onClick={handleCompare}
                  disabled={!compareIds[0] || !compareIds[1]}
                >
                  Compare selected revisions
                </button>
                <span className="rev-page__compare-hint">
                  Select two revisions to compare using the radio buttons.
                </span>
              </div>

              <ul className="wiki-revisions">
                {allRevisions.map(rev => (
                  <li key={rev.id} className="wiki-revision">
                    <input
                      type="radio"
                      name="compare-old"
                      className="rev-page__radio"
                      checked={compareIds[0] === rev.id}
                      onChange={() => handleToggleCompare(rev.id, 0)}
                      title="Select as older revision"
                    />
                    <input
                      type="radio"
                      name="compare-new"
                      className="rev-page__radio"
                      checked={compareIds[1] === rev.id}
                      onChange={() => handleToggleCompare(rev.id, 1)}
                      title="Select as newer revision"
                    />
                    <span className="wiki-revision__time" title={formatDateTime(rev.timestamp)}>
                      {formatRelative(rev.timestamp)}
                    </span>
                    <span className="wiki-revision__author" title={rev.authorAddress}>
                      {truncateAddress(rev.authorAddress)}
                    </span>
                    <span className="wiki-revision__summary">
                      {rev.summary || '(no summary)'}
                    </span>
                    {!rev.isOriginal && (
                      <button
                        className="wiki-btn wiki-btn--small"
                        onClick={() => handleViewRevision(rev.id)}
                      >
                        View
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {/* View single revision */}
      {viewMode === 'view' && selectedRevision && (
        <div className="rev-page__view">
          <div className="rev-page__view-header">
            <button className="wiki-btn" onClick={handleBackToList}>
              &larr; Back to history
            </button>
            <div className="rev-page__view-meta">
              <span>Revision by <strong>{truncateAddress(selectedRevision.authorAddress)}</strong></span>
              <span>{formatDateTime(selectedRevision.timestamp)}</span>
              {selectedRevision.summary && (
                <span className="rev-page__view-summary">{selectedRevision.summary}</span>
              )}
            </div>
          </div>
          <div
            className="wiki-page-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedRevision.content) }}
          />
        </div>
      )}

      {/* Diff view */}
      {viewMode === 'diff' && (
        <div className="rev-page__diff-view">
          <div className="rev-page__view-header">
            <button className="wiki-btn" onClick={handleBackToList}>
              &larr; Back to history
            </button>
            <span className="rev-page__diff-label">
              Comparing revisions
            </span>
          </div>
          {diffLines.length === 0 ? (
            <div className="wiki-empty">
              <div className="wiki-empty__title">No differences</div>
              <p>The selected revisions have identical content.</p>
            </div>
          ) : (
            <DiffView diffLines={diffLines} />
          )}
        </div>
      )}
    </div>
  );
}
