/**
 * Main layout component with header, navigation, and footer
 * Extracted from App.tsx to separate layout concerns from routing
 */

import { type ReactNode, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { isInIframe } from '../hooks/useParentRpcConfig';
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
  // Unified identity: node mode has a usable identity (the node's) even with no
  // browser identity, so gate the profile/settings actions on `hasIdentity` rather
  // than the browser identity (which would wrongly show "Create Identity" in the
  // desktop app). DMs need the X25519 seed the node doesn't expose → browser only.
  const { mode, hasIdentity } = useFeedIdentity();

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
          {mode === 'browser' && hasIdentity && (
            <Link
              to="/dm"
              className={`app-header__nav-link ${location.pathname === '/dm' ? 'app-header__nav-link--active' : ''}`}
            >
              Messages
            </Link>
          )}
        </nav>

        <div className="app-header__actions">
          {hasIdentity ? (
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
  const { hasIdentity } = useFeedIdentity();

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
      {hasIdentity ? (
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

  // When embedded in a shell (mobile/desktop iframe), the WebView won't hand
  // `target="_blank"` links to the system browser — taps just do nothing. Intercept
  // clicks on external http(s) links and ask the parent shell to open them natively.
  useEffect(() => {
    if (!isInIframe()) return;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      // Use the RESOLVED absolute URL (.href), and treat any http(s) link to a
      // different origin as external — hand it to the shell to open natively.
      let resolved: URL;
      try {
        resolved = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      const isExternalHttp =
        (resolved.protocol === 'http:' || resolved.protocol === 'https:') &&
        resolved.origin !== window.location.origin;
      if (isExternalHttp) {
        e.preventDefault();
        window.parent.postMessage({ type: 'SWIMCHAIN_OPEN_EXTERNAL', url: resolved.href }, '*');
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

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
