/**
 * Archived Content Page
 *
 * Browse and search archived content.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useArchiveStorage } from '../hooks/useArchiveStorage';
import { ContentStatus } from '../components/ContentStatus';
import './ArchivedContent.css';

export function ArchivedContent(): JSX.Element {
  const { entries, isLoading, stats, formatBytes, deleteEntry, search, refresh } =
    useArchiveStorage();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof entries | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Filter entries by search or show all
  const displayEntries = searchResults ?? entries;

  // Group by space
  const groupedBySpace = useMemo(() => {
    const groups = new Map<string, typeof entries>();
    for (const entry of displayEntries) {
      const existing = groups.get(entry.spaceId) ?? [];
      groups.set(entry.spaceId, [...existing, entry]);
    }
    return groups;
  }, [displayEntries]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const results = await search(searchQuery);
    setSearchResults(results);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleDelete = async (postHash: string) => {
    if (!confirm('Are you sure you want to delete this archived entry?')) return;
    setDeleting(postHash);
    await deleteEntry(postHash);
    setDeleting(null);
    if (expandedHash === postHash) {
      setExpandedHash(null);
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  return (
    <div className="archived-page">
      <header className="archived-header">
        <div className="header-title">
          <Link to="/dashboard" className="back-link">
            \u2190 Back
          </Link>
          <h1>Archived Content</h1>
        </div>
        <div className="header-stats">
          {stats && (
            <>
              <span>{stats.entryCount} entries</span>
              <span>{formatBytes(stats.bytesUsed)} used</span>
            </>
          )}
        </div>
      </header>

      <main className="archived-main">
        {/* Search Bar */}
        <section className="search-section">
          <div className="search-input-group">
            <input
              type="text"
              className="search-input"
              placeholder="Search archived content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn btn-primary" onClick={handleSearch}>
              Search
            </button>
            {searchResults && (
              <button className="btn btn-ghost" onClick={handleClearSearch}>
                Clear
              </button>
            )}
            <button className="btn btn-secondary" onClick={refresh}>
              Refresh
            </button>
          </div>
          {searchResults && (
            <p className="search-results-count">
              Found {searchResults.length} results
            </p>
          )}
        </section>

        {/* Content List */}
        <section className="content-list-section">
          {isLoading ? (
            <div className="loading-state">Loading archives...</div>
          ) : displayEntries.length === 0 ? (
            <div className="empty-state">
              {searchResults
                ? 'No matching content found.'
                : 'No archived content yet.'}
            </div>
          ) : (
            Array.from(groupedBySpace.entries()).map(([spaceId, spaceEntries]) => (
              <div key={spaceId} className="space-group">
                <h2 className="space-group__title">{spaceId}</h2>
                <ul className="archive-list">
                  {spaceEntries.map((entry) => (
                    <li
                      key={entry.postHash}
                      className="archive-item"
                      aria-expanded={expandedHash === entry.postHash}
                    >
                      <div
                        className="archive-item__header"
                        onClick={() =>
                          setExpandedHash(
                            expandedHash === entry.postHash ? null : entry.postHash
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedHash(
                              expandedHash === entry.postHash ? null : entry.postHash
                            );
                          }
                        }}
                        tabIndex={0}
                        role="button"
                      >
                        <h3 className="archive-item__title">{entry.title}</h3>
                        <div className="archive-item__meta">
                          <ContentStatus createdAt={entry.timestamp} archived />
                          <span>Archived: {formatDate(entry.archivedAt)}</span>
                          <span>Heat: {(entry.originalHeat * 100).toFixed(1)}%</span>
                        </div>
                      </div>

                      {expandedHash === entry.postHash && (
                        <div className="archive-item__body">
                          <p className="archive-body-text">{entry.body}</p>
                          <div className="archive-item__footer">
                            <span className="author">By: {entry.author}</span>
                            <span className="date">Created: {formatDate(entry.timestamp)}</span>
                            <button
                              className="btn btn-ghost delete-btn"
                              onClick={() => handleDelete(entry.postHash)}
                              disabled={deleting === entry.postHash}
                            >
                              {deleting === entry.postHash ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
