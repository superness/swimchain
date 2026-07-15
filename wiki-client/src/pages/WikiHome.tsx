/**
 * Wiki Home - Landing page showing recent changes and namespace grid.
 * Uses useWikiNamespaces() for namespace cards and useRecentChanges() for activity feed.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import { useRecentChanges } from '../hooks/useRecentChanges';
import './WikiHome.css';

function formatTimeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function truncateAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`;
}

function decayLabel(prob: number): { text: string; className: string } {
  const survival = Math.round((1 - prob) * 100);
  if (survival > 75) return { text: `${survival}%`, className: 'wiki-decay--fresh' };
  if (survival > 25) return { text: `${survival}%`, className: 'wiki-decay--aging' };
  return { text: `${survival}%`, className: 'wiki-decay--decaying' };
}

export function WikiHome(): JSX.Element {
  const navigate = useNavigate();
  const { data: namespaces, loading: nsLoading, error: nsError } = useWikiNamespaces();
  const { data: recentChanges, loading: rcLoading, error: rcError } = useRecentChanges(30);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <div className="wiki-home">
      <h1 className="wiki-page-title">Swimchain Wiki</h1>
      <p className="wiki-home__intro">
        A collaborative knowledge base built on the decentralized network.
        Every page is a post, every namespace is a space, and every edit
        is preserved on the chain.
      </p>

      {/* Quick Search */}
      <form className="wiki-home__search" onSubmit={handleSearch}>
        <input
          type="text"
          className="wiki-search-input"
          placeholder="Search the wiki..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      {/* Namespaces Grid */}
      <section className="wiki-home__section">
        <h2 className="wiki-home__heading">Namespaces</h2>

        {nsLoading && <div className="wiki-loading">Loading namespaces...</div>}

        {nsError && (
          <div className="wiki-home__error">Failed to load namespaces: {nsError}</div>
        )}

        {!nsLoading && !nsError && namespaces.length === 0 && (
          <div className="wiki-empty">
            <div className="wiki-empty__title">No namespaces yet</div>
            {/* Namespaces are @wiki: app-class spaces synced from the network —
                follows play no part, and this client has no create flow yet. */}
            <p>No wiki namespaces exist on this network yet. They'll appear here as they sync.</p>
          </div>
        )}

        {namespaces.length > 0 && (
          <div className="wiki-ns-grid">
            {namespaces.map((ns) => (
              <Link
                key={ns.id}
                to={`/ns/${ns.id}`}
                className="wiki-ns-card"
                style={{ textDecoration: 'none' }}
              >
                <div className="wiki-ns-card__name">{ns.name}</div>
                {ns.description && (
                  <div className="wiki-ns-card__desc">{ns.description}</div>
                )}
                <div className="wiki-ns-card__stats">
                  {ns.pageCount} {ns.pageCount === 1 ? 'page' : 'pages'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent Changes */}
      <section className="wiki-home__section">
        <h2 className="wiki-home__heading">Recent Changes</h2>

        {rcLoading && <div className="wiki-loading">Loading recent changes...</div>}

        {rcError && (
          <div className="wiki-home__error">Failed to load recent changes: {rcError}</div>
        )}

        {!rcLoading && !rcError && recentChanges.length === 0 && (
          <div className="wiki-empty">
            <div className="wiki-empty__title">No recent changes</div>
            <p>Page edits will appear here as wiki namespaces sync.</p>
          </div>
        )}

        {recentChanges.length > 0 && (
          <ul className="wiki-recent-changes">
            {recentChanges.map((page) => {
              const decay = decayLabel(page.decayProbability);
              return (
                <li key={page.id} className="wiki-recent-change">
                  <span className="wiki-recent-change__time">
                    {formatTimeAgo(page.lastEdited)}
                  </span>
                  <span className="wiki-recent-change__page">
                    <Link to={`/ns/${page.namespaceId}/page/${page.id}`}>
                      {page.title}
                    </Link>
                  </span>
                  <span className="wiki-recent-change__ns">
                    in <Link to={`/ns/${page.namespaceId}`}>
                      {truncateAddr(page.namespaceId)}
                    </Link>
                  </span>
                  <span className="wiki-recent-change__author">
                    by {truncateAddr(page.authorAddress)}
                  </span>
                  <span className={`wiki-decay ${decay.className}`}>
                    {decay.text}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Quick links */}
      <div className="wiki-home__links">
        <Link to="/search" className="wiki-btn">Search the wiki</Link>
      </div>
    </div>
  );
}
