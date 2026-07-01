/**
 * Wiki Layout - Main layout with header, WikiSidebar, content area, footer.
 * Integrates the real WikiSidebar component for dynamic namespace navigation.
 */

import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useState, type ReactNode } from 'react';
import { WikiSidebar } from '../components/WikiSidebar';
import { NodeStatusBar } from '../components/NodeStatusBar';

interface WikiLayoutProps {
  children: ReactNode;
}

export function WikiLayout({ children }: WikiLayoutProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  const isActive = (path: string) =>
    location.pathname === path ? 'wiki-header__nav-link--active' : '';

  return (
    <div className="wiki-app">
      <a href="#wiki-main" className="wiki-skip-link">Skip to content</a>

      {/* Node Status */}
      <NodeStatusBar />

      {/* Header */}
      <header className="wiki-header">
        <Link to="/" className="wiki-header__logo">
          Swimchain Wiki
        </Link>

        <div className="wiki-header__search">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search wiki..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search wiki"
            />
          </form>
        </div>

        <nav className="wiki-header__nav" aria-label="Main navigation">
          <Link to="/" className={`wiki-header__nav-link ${isActive('/')}`}>Home</Link>
          <Link to="/search" className={`wiki-header__nav-link ${isActive('/search')}`}>Search</Link>
          <Link to="/identity" className={`wiki-header__nav-link ${isActive('/identity')}`}>Identity</Link>
        </nav>
      </header>

      {/* Body */}
      <div className="wiki-body">
        <WikiSidebar />

        {/* Content */}
        <main id="wiki-main" className="wiki-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="wiki-footer">
        <div className="wiki-footer__text">
          Swimchain Wiki — Decentralized knowledge, no central servers.
          Content decays naturally without engagement.
        </div>
        <NodeStatusBar />
      </footer>
    </div>
  );
}
