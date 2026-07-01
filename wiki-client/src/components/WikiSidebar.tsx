/**
 * Left navigation sidebar for the wiki.
 * Shows namespaces, recent pages, and quick links.
 * Collapsible on mobile with hamburger toggle.
 */

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import './WikiSidebar.css';

interface QuickLink {
  label: string;
  path: string;
}

const QUICK_LINKS: QuickLink[] = [
  { label: 'Home', path: '/' },
  { label: 'Search', path: '/search' },
  { label: 'My Identity', path: '/identity' },
];

export function WikiSidebar(): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  const { data: namespaces, loading } = useWikiNamespaces();
  const location = useLocation();

  return (
    <>
      <button
        className="sidebar-hamburger"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
        aria-expanded={!collapsed}
      >
        <span className="hamburger-line" />
        <span className="hamburger-line" />
        <span className="hamburger-line" />
      </button>

      <nav className={`wiki-sidebar ${collapsed ? 'wiki-sidebar-collapsed' : ''}`} aria-label="Wiki navigation">
        <div className="sidebar-section">
          <h3 className="sidebar-heading">Quick Links</h3>
          <ul className="sidebar-list">
            {QUICK_LINKS.map((link) => (
              <li key={link.path}>
                <Link
                  to={link.path}
                  className={`sidebar-link ${location.pathname === link.path ? 'sidebar-link-active' : ''}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-heading">Namespaces</h3>
          {loading ? (
            <div className="sidebar-loading">Loading...</div>
          ) : namespaces.length === 0 ? (
            <div className="sidebar-empty">No namespaces</div>
          ) : (
            <ul className="sidebar-list">
              {namespaces.map((ns) => (
                <li key={ns.id}>
                  <Link
                    to={`/ns/${encodeURIComponent(ns.id)}`}
                    className={`sidebar-link ${location.pathname.includes(ns.id) ? 'sidebar-link-active' : ''}`}
                  >
                    <span className="namespace-name">{ns.name}</span>
                    <span className="namespace-count">{ns.pageCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </>
  );
}
