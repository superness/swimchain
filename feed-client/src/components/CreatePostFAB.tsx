/**
 * CreatePostFAB - Floating Action Button for creating new posts
 *
 * Fixed-position button that opens a compose modal or navigates
 * to the compose page.
 */

import { Link } from 'react-router-dom';
import './CreatePostFAB.css';

interface CreatePostFABProps {
  /** Use Link instead of button */
  to?: string;
  /** Click handler (if not using Link) */
  onClick?: () => void;
  /** Tooltip text */
  tooltip?: string;
  /** Whether to show the FAB */
  visible?: boolean;
}

export function CreatePostFAB({
  to = '/compose',
  onClick,
  tooltip = 'Create post',
  visible = true,
}: CreatePostFABProps): JSX.Element | null {
  if (!visible) return null;

  const fabContent = (
    <>
      <span className="create-fab__icon" aria-hidden="true">+</span>
      <span className="create-fab__label">Post</span>
    </>
  );

  if (to && !onClick) {
    return (
      <Link
        to={to}
        className="create-fab"
        aria-label={tooltip}
        title={tooltip}
      >
        {fabContent}
      </Link>
    );
  }

  return (
    <button
      className="create-fab"
      onClick={onClick}
      aria-label={tooltip}
      title={tooltip}
      type="button"
    >
      {fabContent}
    </button>
  );
}
