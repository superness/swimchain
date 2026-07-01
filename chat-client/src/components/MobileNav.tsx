/**
 * Mobile navigation component with hamburger menu
 */

import { useCallback } from 'react';
import './MobileNav.css';

interface MobileNavProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function MobileNav({
  isOpen,
  onToggle,
}: MobileNavProps): JSX.Element {
  const handleToggle = useCallback(() => {
    onToggle();
  }, [onToggle]);

  return (
    <button
      className={`mobile-nav__button ${isOpen ? 'mobile-nav__button--open' : ''}`}
      onClick={handleToggle}
      aria-label={isOpen ? 'Close navigation' : 'Open navigation'}
      aria-expanded={isOpen}
    >
      <span className="mobile-nav__line" />
      <span className="mobile-nav__line" />
      <span className="mobile-nav__line" />
    </button>
  );
}
