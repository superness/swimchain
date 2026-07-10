/**
 * Main layout with header navigation and status bar footer
 */

import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NodeStatusBar } from '../components/NodeStatusBar';
import { isInIframe } from '../hooks/useParentRpcConfig';
import './MainLayout.css';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps): JSX.Element {
  const location = useLocation();
  // Node-wide centralized identity: when embedded in the Swimchain desktop shell
  // the NODE owns the single identity, so hide this client's own Identity UI.
  const embedded = isInIframe();

  useEffect(() => {
    const main = document.getElementById('main-content');
    if (main) main.focus();
  }, [location.pathname]);

  return (
    <div className="main-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="main-layout__header">
        <Link to="/" className="main-layout__logo">Swimchain Search</Link>
        <nav className="main-layout__nav" aria-label="Main navigation">
          <Link to="/" className={`main-layout__nav-link ${location.pathname === '/' ? 'main-layout__nav-link--active' : ''}`}>Home</Link>
          <Link to="/search" className={`main-layout__nav-link ${location.pathname === '/search' ? 'main-layout__nav-link--active' : ''}`}>Search</Link>
          {!embedded && (
            <Link to="/identity" className={`main-layout__nav-link ${location.pathname === '/identity' ? 'main-layout__nav-link--active' : ''}`}>Identity</Link>
          )}
        </nav>
      </header>
      <main id="main-content" className="main-layout__content" tabIndex={-1}>{children}</main>
      <NodeStatusBar />
    </div>
  );
}
