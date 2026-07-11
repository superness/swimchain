/**
 * FeedCard - Individual post card in the feed
 *
 * Displays a single post with author info, content, media,
 * engagement metrics, and action buttons.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { FeedItem, ReactionType } from '../types/feed';
import { ImageGallery, ImageThumbnailIndicator } from './ImageGallery';
import { ReactionPicker, ReactionDisplay } from './ReactionPicker';
import { UserProfileModal } from './UserProfileModal';
import { ReportModal, SpamBadge } from './ReportModal';
import { usePoolContribution, useMediaUpload } from '../hooks/useRpc';
import { useSponsorship } from '../hooks/useSponsorship';
import { useEngagementPow } from '../hooks/useActionPow';
import { useStoredIdentity } from '../hooks/useStoredIdentity';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { useBlocklist } from '../hooks/useBlocklist';
import { useToast } from './Toast';
import './FeedCard.css';

interface FeedCardProps {
  item: FeedItem;
  compact?: boolean;
  onSave?: (itemId: string) => void;
  onUnsave?: (itemId: string) => void;
  isSaved?: boolean;
  /** Called when reactions change (for cache invalidation) */
  onReactionChange?: (itemId: string) => void;
  /** Called when user blocks content */
  onBlock?: (type: 'user' | 'post', id: string) => void;
}

/** Map reaction type to emoji code */
const REACTION_CODE_MAP: Record<ReactionType, number> = {
  heart: 1,
  thumbs_up: 2,
  thumbs_down: 3,
  laugh: 4,
  thinking: 5,
  mind_blown: 6,
  fire: 7,
  swimming: 8,
};

/**
 * Format relative time (e.g., "2h", "3d")
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w`;
  return `${Math.floor(diff / 2592000)}mo`;
}

/**
 * Get initials from an address or name
 */
function getInitials(name?: string, address?: string): string {
  if (name) {
    return name.substring(0, 2).toUpperCase();
  }
  if (address) {
    return address.substring(0, 2).toUpperCase();
  }
  return '??';
}

/**
 * Generate a consistent color from a string
 */
function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.substring(0, 8)}...${address.substring(address.length - 4)}`;
}

/**
 * Get decay state display info
 */
function getDecayDisplay(state: string): { label: string; className: string; percent: number } {
  switch (state) {
    case 'protected':
      return { label: 'Protected', className: 'decay-protected', percent: 100 };
    case 'active':
      return { label: 'Active', className: 'decay-active', percent: 80 };
    case 'stale':
      return { label: 'Stale', className: 'decay-stale', percent: 40 };
    case 'decayed':
      return { label: 'Decayed', className: 'decay-decayed', percent: 10 };
    default:
      return { label: 'Unknown', className: 'decay-unknown', percent: 50 };
  }
}

export function FeedCard({
  item,
  compact = false,
  onSave,
  onUnsave,
  isSaved = false,
  onReactionChange,
  onBlock,
}: FeedCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isReacting, setIsReacting] = useState(false);
  const [profileModal, setProfileModal] = useState<{ x: number; y: number } | null>(null);

  // Refs
  const menuRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  // Hooks for interactions
  const { identity } = useStoredIdentity();
  // Unified signer: node's sign_message RPC when embedded, browser keypair otherwise.
  const { sign } = useFeedIdentity();
  const { contribute, contributing } = usePoolContribution();
  const { isSponsored } = useSponsorship();
  const { state: engagementPowState, mineEngagement, solution: engagementSolution, reset: resetEngagementPow } = useEngagementPow();
  const { block } = useBlocklist();
  const { success, info } = useToast();

  const timeAgo = useMemo(() => formatTimeAgo(item.createdAt), [item.createdAt]);
  const avatarColor = useMemo(() => getAvatarColor(item.authorId), [item.authorId]);
  const initials = useMemo(() => getInitials(item.authorName, item.authorId), [item.authorName, item.authorId]);
  const displayName = item.authorName ?? truncateAddress(item.authorId);
  const decay = useMemo(() => getDecayDisplay(item.decayState), [item.decayState]);

  const handleSaveClick = useCallback(() => {
    if (isSaved) {
      onUnsave?.(item.id);
      info('Post unsaved');
    } else {
      onSave?.(item.id);
      success('Post saved');
    }
  }, [isSaved, item.id, onSave, onUnsave, success, info]);

  // Get media URL from hash via the getMedia RPC (base64 data URL, cached).
  // The old `/api/media/<hash>` path only works behind the web gateway, so
  // images never loaded in the desktop/mobile app (no such HTTP endpoint).
  const { getMediaUrl } = useMediaUpload();

  // Handle reaction with PoW
  const handleReact = useCallback(async (_emoji: string, _reactionType: ReactionType) => {
    if (!identity || isReacting) return;

    // Gate on sponsorship BEFORE mining — the node rejects unsponsored engagements
    // (SPEC_11), so mining first only wastes proof-of-work.
    if (isSponsored === false) {
      info('You need a sponsor before you can react. Redeem an invite or request sponsorship first — no proof-of-work is spent until then.');
      return;
    }

    setIsReacting(true);
    try {
      // Convert hex public key to Uint8Array
      const publicKeyBytes = new Uint8Array(
        identity.publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
      );

      // Mine engagement PoW
      await mineEngagement(item.id, publicKeyBytes, true);
    } catch (err) {
      console.error('[FeedCard] Reaction error:', err);
      setIsReacting(false);
      resetEngagementPow();
    }
  }, [identity, isReacting, isSponsored, info, item.id, mineEngagement, resetEngagementPow]);

  // Handle engagement PoW completion
  const pendingReactionRef = useRef<ReactionType | null>(null);

  // Watch for engagement PoW completion and submit
  useMemo(() => {
    if (engagementPowState === 'complete' && engagementSolution && identity && sign) {
      const submitReaction = async () => {
        try {
          // Note: powParams would be used by contribute() internally
          // solutionToRpcParams(engagementSolution) converts the solution
          const emojiCode = pendingReactionRef.current
            ? REACTION_CODE_MAP[pendingReactionRef.current]
            : 1; // default to heart

          await contribute(
            item.id,
            0, // targetSeconds not used
            identity.publicKey,
            sign,
            emojiCode
          );

          onReactionChange?.(item.id);
        } catch (err) {
          console.error('[FeedCard] Failed to submit reaction:', err);
        } finally {
          setIsReacting(false);
          resetEngagementPow();
          pendingReactionRef.current = null;
        }
      };
      submitReaction();
    } else if (engagementPowState === 'error' || engagementPowState === 'cancelled') {
      setIsReacting(false);
      resetEngagementPow();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementPowState, engagementSolution, identity, sign, contribute, item.id, onReactionChange, resetEngagementPow]);

  // Handle profile modal
  const handleAvatarClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setProfileModal({ x: rect.left, y: rect.bottom });
  }, []);

  const closeProfileModal = useCallback(() => {
    setProfileModal(null);
  }, []);

  // Handle menu
  const toggleMenu = useCallback(() => {
    setShowMenu(prev => !prev);
  }, []);

  // Handle block
  const handleBlockUser = useCallback(() => {
    block(item.authorId, 'user');
    onBlock?.('user', item.authorId);
    setShowMenu(false);
    info(`Blocked ${displayName}`);
  }, [block, item.authorId, onBlock, info, displayName]);

  const handleBlockPost = useCallback(() => {
    block(item.id, 'post');
    onBlock?.('post', item.id);
    setShowMenu(false);
    info('Post hidden');
  }, [block, item.id, onBlock, info]);

  // Handle report
  const openReport = useCallback(() => {
    setShowMenu(false);
    setShowReportModal(true);
  }, []);

  // Determine if content should be truncated
  const contentTooLong = item.body.length > 280;
  const displayContent = contentTooLong && !expanded
    ? item.body.substring(0, 280) + '...'
    : item.body;

  return (
    <article className={`feed-card ${compact ? 'feed-card--compact' : ''} ${item.pending ? 'feed-card--pending' : ''}`}>
      {/* Header: Avatar, Name, Time, Space */}
      <header className="feed-card__header">
        <button
          ref={avatarRef}
          type="button"
          className="feed-card__avatar"
          style={{ backgroundColor: avatarColor }}
          onClick={handleAvatarClick}
          aria-label={`View ${displayName}'s profile`}
        >
          {initials}
        </button>

        <div className="feed-card__meta">
          <div className="feed-card__author-line">
            <Link to={`/profile/${item.authorId}`} className="feed-card__author-name">
              {displayName}
            </Link>
            <span className="feed-card__time" title={new Date(item.createdAt * 1000).toLocaleString()}>
              {timeAgo}
            </span>
            {item.spaceName && (
              <>
                <span className="feed-card__separator">in</span>
                <Link to={`/space/${item.spaceId}`} className="feed-card__space">
                  #{item.spaceName}
                </Link>
              </>
            )}
          </div>
          <span className="feed-card__address" title={item.authorId}>
            {truncateAddress(item.authorId)}
          </span>
        </div>

        <div className="feed-card__menu-container" ref={menuRef}>
          <button
            className="feed-card__menu-btn"
            aria-label="More options"
            type="button"
            onClick={toggleMenu}
            aria-expanded={showMenu}
          >
            <span aria-hidden="true">...</span>
          </button>

          {showMenu && (
            <div className="feed-card__menu" role="menu">
              <button
                type="button"
                className="feed-card__menu-item"
                onClick={handleBlockUser}
                role="menuitem"
              >
                Block {displayName}
              </button>
              <button
                type="button"
                className="feed-card__menu-item"
                onClick={handleBlockPost}
                role="menuitem"
              >
                Hide this post
              </button>
              <button
                type="button"
                className="feed-card__menu-item feed-card__menu-item--danger"
                onClick={openReport}
                role="menuitem"
              >
                Report
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Profile Modal */}
      {profileModal && (
        <UserProfileModal
          userPk={item.authorId}
          anchorPosition={profileModal}
          onClose={closeProfileModal}
          displayName={item.authorName}
        />
      )}

      {/* Title (if post) */}
      {item.title && (
        <h2 className="feed-card__title">
          <Link to={`/post/${item.id}`}>{item.title}</Link>
        </h2>
      )}

      {/* Content */}
      <div className="feed-card__content">
        {displayContent ? (
          <>
            <p>{displayContent}</p>
            {contentTooLong && (
              <button
                className="feed-card__expand-btn"
                onClick={() => setExpanded(!expanded)}
                type="button"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        ) : (
          <p className="feed-card__content-empty">[Content not available]</p>
        )}
      </div>

      {/* Media Preview - Full gallery for expanded, thumbnails for compact */}
      {item.mediaRefs && item.mediaRefs.length > 0 && (
        compact ? (
          <div className="feed-card__media-indicator">
            <ImageThumbnailIndicator count={item.mediaRefs.length} />
          </div>
        ) : (
          <ImageGallery
            mediaRefs={item.mediaRefs}
            thumbnailMode={false}
            getMediaUrl={getMediaUrl}
          />
        )
      )}

      {/* Actions Bar */}
      <footer className="feed-card__actions">
        {/* Reactions - show picker if identity exists, otherwise read-only display */}
        <div className="feed-card__reactions">
          {compact ? (
            <ReactionDisplay reactions={item.reactions} compact />
          ) : identity ? (
            <ReactionPicker
              reactions={item.reactions}
              onReact={(emoji, type) => {
                pendingReactionRef.current = type;
                handleReact(emoji, type);
              }}
              isReacting={isReacting || contributing}
            />
          ) : (
            <ReactionDisplay reactions={item.reactions} />
          )}
        </div>

        <Link to={`/post/${item.id}`} className="feed-card__action" aria-label={`${item.replyCount} comments`}>
          <span className="feed-card__action-icon" aria-hidden="true">💬</span>
          <span className="feed-card__action-count">{item.replyCount || ''}</span>
        </Link>

        <button className="feed-card__action" type="button" aria-label="Share">
          <span className="feed-card__action-icon" aria-hidden="true">🔄</span>
        </button>

        <button
          className={`feed-card__action ${isSaved ? 'feed-card__action--active' : ''}`}
          onClick={handleSaveClick}
          type="button"
          aria-label={isSaved ? 'Unsave post' : 'Save post'}
        >
          <span className="feed-card__action-icon" aria-hidden="true">
            {isSaved ? '📌' : '📍'}
          </span>
        </button>
      </footer>

      {/* Spam Badge */}
      <SpamBadge contentId={item.id} />

      {/* Decay Indicator - includes text label for accessibility (WCAG 1.4.1) */}
      <div className={`feed-card__decay ${decay.className}`} title={`${decay.label}: ${decay.percent}% fresh`}>
        <div className="feed-card__decay-container">
          <span className="feed-card__decay-label">{decay.label}</span>
          <div className="feed-card__decay-bar">
            <div className="feed-card__decay-fill" style={{ width: `${decay.percent}%` }} />
          </div>
        </div>
      </div>

      {/* Pending indicator */}
      {item.pending && (
        <div className="feed-card__pending-badge">Pending</div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          contentId={item.id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </article>
  );
}
