/**
 * Quick actions bar that appears on message hover
 * Per CLIENT_DESIGN.md §5.5
 */

import './QuickActions.css';

interface QuickActionsProps {
  messageId: string;
  onReply: () => void;
  onReactQuick: () => void;
  onReactStandard: () => void;
  onShare: () => void;
  onMore: () => void;
  isReacting?: boolean;
}

export function QuickActions({
  onReply,
  onReactQuick,
  onReactStandard,
  onShare,
  onMore,
  isReacting = false,
}: QuickActionsProps): JSX.Element {
  return (
    <div className="quick-actions" role="toolbar" aria-label="Message actions">
      <button
        className="quick-actions__btn"
        onClick={onReply}
        title="Reply"
        aria-label="Reply"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>

      <button
        className={`quick-actions__btn quick-actions__btn--react ${
          isReacting ? 'quick-actions__btn--loading' : ''
        }`}
        onClick={onReactQuick}
        title="+5s (~1s PoW)"
        aria-label="Add 5 seconds"
        disabled={isReacting}
      >
        {isReacting ? (
          <span className="quick-actions__spinner" />
        ) : (
          <span>⚡+5s</span>
        )}
      </button>

      <button
        className={`quick-actions__btn quick-actions__btn--react ${
          isReacting ? 'quick-actions__btn--loading' : ''
        }`}
        onClick={onReactStandard}
        title="+15s (~3-5s PoW)"
        aria-label="Add 15 seconds"
        disabled={isReacting}
      >
        {isReacting ? (
          <span className="quick-actions__spinner" />
        ) : (
          <span>⚡+15s</span>
        )}
      </button>

      <button
        className="quick-actions__btn"
        onClick={onShare}
        title="Share"
        aria-label="Share"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>

      <button
        className="quick-actions__btn"
        onClick={onMore}
        title="More actions"
        aria-label="More actions"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
    </div>
  );
}
