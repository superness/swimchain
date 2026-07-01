/**
 * Header component with logo, search, and profile
 */

import { Link } from 'react-router-dom';
import { SearchBox } from './SearchBox';
import { ProfileButton } from './ProfileButton';
import './Header.css';

export function Header(): JSX.Element {
  return (
    <header className="header" role="banner">
      <div className="header-content">
        <Link to="/" className="header-logo" aria-label="Swimchain Home">
          <span className="logo-icon" aria-hidden="true">CS</span>
          <span className="logo-text">Swimchain</span>
        </Link>

        <SearchBox />

        <nav className="header-nav" aria-label="Main navigation">
          <ProfileButton />
        </nav>
      </div>
    </header>
  );
}
