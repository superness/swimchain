/**
 * Main layout with header navigation and status bar footer
 */

import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NodeStatusBar } from '../components/NodeStatusBar';
import './MainLayout.css';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps): JSX.Element {
  const location = useLocation();

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
          <Link to="/identity" className={`main-layout__nav-link ${location.pathname === '/identity' ? 'main-layout__nav-link--active' : ''}`}>Identity</Link>
        </nav>
      </header>
      <main id="main-content" className="main-layout__content" tabIndex={-1}>{children}</main>
      <NodeStatusBar />
    </div>
  );
}
