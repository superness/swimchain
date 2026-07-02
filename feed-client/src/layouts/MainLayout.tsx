/**
 * Main layout component with header, navigation, and footer
 * Extracted from App.tsx to separate layout concerns from routing
 */

import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';
import { SponsorshipBanner } from '../components/SponsorshipBanner';
import { NodeStatusBar } from '../components/NodeStatusBar';
import '../styles/app.css';

interface MainLayoutProps {
  children: ReactNode;
}

/**
 * Header component with navigation
 */
function Header(): JSX.Element {
  const location = useLocation();
  const { identity } = useIdentityContext();

  return (
    <header className="app-header">
      <div className="app-header__container">
        <Link to="/" className="app-header__logo">
          <span className="app-header__logo-icon" aria-hidden="true">🌊</span>
          <span className="app-header__logo-text">Swimchain Feed</span>
        </Link>

        <nav className="app-header__nav" aria-label="Main navigation">
          <Link
            to="/"
            className={`app-header__nav-link ${location.pathname === '/' ? 'app-header__nav-link--active' : ''}`}
          >
            Feed
          </Link>
          <Link
            to="/discover"
            className={`app-header__nav-link ${location.pathname === '/discover' ? 'app-header__nav-link--active' : ''}`}
          >
            Discover
          </Link>
          <Link
            to="/sponsorship"
            className={`app-header__nav-link ${location.pathname === '/sponsorship' ? 'app-header__nav-link--active' : ''}`}
          >
            Sponsorship
          </Link>
          {identity && (
            <Link
              to="/dm"
              className={`app-header__nav-link ${location.pathname === '/dm' ? 'app-header__nav-link--active' : ''}`}
            >
              Messages
            </Link>
          )}
        </nav>

        <div className="app-header__actions">
          {identity ? (
            <>
              <Link to="/settings" className="app-header__action-btn" aria-label="Settings">
                <span aria-hidden="true">⚙</span>
              </Link>
              <Link to="/profile" className="app-header__profile-btn" aria-label="Profile">
                <span aria-hidden="true">👤</span>
              </Link>
            </>
          ) : (
            <Link to="/identity" className="app-header__action-btn app-header__action-btn--primary">
              Create Identity
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Mobile bottom navigation
 */
function MobileNav(): JSX.Element {
  const location = useLocation();
  const { identity } = useIdentityContext();

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <Link
        to="/"
        className={`mobile-nav__link ${location.pathname === '/' ? 'mobile-nav__link--active' : ''}`}
      >
        <span className="mobile-nav__icon" aria-hidden="true">🏠</span>
        <span className="mobile-nav__label">Feed</span>
      </Link>
      <Link
        to="/discover"
        className={`mobile-nav__link ${location.pathname === '/discover' ? 'mobile-nav__link--active' : ''}`}
      >
        <span className="mobile-nav__icon" aria-hidden="true">🔍</span>
        <span className="mobile-nav__label">Discover</span>
      </Link>
      <Link
        to="/sponsorship"
        className={`mobile-nav__link ${location.pathname === '/sponsorship' ? 'mobile-nav__link--active' : ''}`}
      >
        <span className="mobile-nav__icon" aria-hidden="true">🤝</span>
        <span className="mobile-nav__label">Sponsor</span>
      </Link>
      {identity ? (
        <Link
          to="/profile"
          className={`mobile-nav__link ${location.pathname === '/profile' ? 'mobile-nav__link--active' : ''}`}
        >
          <span className="mobile-nav__icon" aria-hidden="true">👤</span>
          <span className="mobile-nav__label">Profile</span>
        </Link>
      ) : (
        <Link
          to="/identity"
          className={`mobile-nav__link ${location.pathname === '/identity' ? 'mobile-nav__link--active' : ''}`}
        >
          <span className="mobile-nav__icon" aria-hidden="true">🔑</span>
          <span className="mobile-nav__label">Identity</span>
        </Link>
      )}
    </nav>
  );
}

export function MainLayout({ children }: MainLayoutProps): JSX.Element {
  const location = useLocation();

  useEffect(() => {
    const main = document.getElementById('main');
    if (main) main.focus();
  }, [location.pathname]);

  return (
    <div className="app">
      {/* Skip link for keyboard accessibility (WCAG 2.4.1) */}
      <a href="#main" className="skip-link">Skip to main content</a>
      <Header />
      <SponsorshipBanner />
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
      <MobileNav />
      <NodeStatusBar />
    </div>
  );
}
