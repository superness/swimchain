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

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/matrix', label: 'Matrix' },
    { to: '/irc', label: 'IRC' },
    { to: '/activity', label: 'Activity' },
    { to: '/identity', label: 'Identity' },
    { to: '/settings', label: 'Settings' },
  ];

  return (
    <div className="main-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="main-layout__header">
        <Link to="/dashboard" className="main-layout__logo">Swimchain Bridge</Link>
        <nav className="main-layout__nav" aria-label="Main navigation">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`main-layout__nav-link ${location.pathname === link.to ? 'main-layout__nav-link--active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" className="main-layout__content" tabIndex={-1}>{children}</main>
      <NodeStatusBar />
    </div>
  );
}
