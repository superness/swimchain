/**
 * MessageItem - Individual message display component
 *
 * Discord-style message with avatar, author, timestamp, and reactions.
 */

import { useState, useRef } from 'react';
import './MessageItem.css';
import { ReportButton, ReportModal, type SpamReason } from './ReportModal';
import { BlockButton } from './BlockButton';
import { ImageGallery } from './ImageGallery';
import { UserProfileModal } from './UserProfileModal';

export interface MediaRef {
  mediaHash: string;
  mediaType: string;
  url?: string;
  sizeBytes?: number;
}

export interface Message {
  id: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  createdAt: number; // Unix timestamp in seconds
  editedAt?: number;
  status?: 'sending' | 'sent' | 'failed';
  reactions?: Array<{
    emoji: string;
    count: number;
    hasReacted: boolean;
  }>;
  isPinned?: boolean;
  /** Attached media (images, etc.) */
  mediaRefs?: MediaRef[];
}

interface MessageItemProps {
  message: Message;
  isGrouped: boolean;
  onReaction?: (messageId: string, emoji: string) => void;
  onReport?: (messageId: string, reason: SpamReason) => Promise<boolean>;
  onReply?: (messageId: string) => void;
  isOwnMessage?: boolean;
  /** Function to get media URL from hash */
  getMediaUrl?: (hash: string) => Promise<string | null>;
}

/**
 * Generate consistent color from author ID
 */
function getAuthorColor(authorId: string): string {
  const colors = [
    '#f47067', // Red
    '#f692b2', // Pink
    '#e79ce6', // Purple
    '#a894fc', // Violet
    '#7cb7f9', // Blue
    '#68dfe0', // Cyan
    '#70c299', // Green
    '#cec677', // Yellow
    '#e9a46b', // Orange
  ];

  let hash = 0;
  for (let i = 0; i < authorId.length; i++) {
    hash = ((hash << 5) - hash) + authorId.charCodeAt(i);
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }) + ' ' + timeStr;
  }
}

/**
 * Format compact timestamp for grouped messages
 */
function formatCompactTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get display name from author ID
 */
function getDisplayName(authorId: string, authorName?: string): string {
  if (authorName) return authorName;

  // For sw1... addresses, show truncated version
  if (authorId.startsWith('sw1') || authorId.startsWith('cs1')) {
    return authorId.slice(0, 8) + '...' + authorId.slice(-4);
  }

  return authorId.slice(0, 12);
}

/**
 * Get initials for avatar
 */
function getInitials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  }
  return name.slice(0, 2);
}

/**
 * Default emoji reactions
 */
const DEFAULT_REACTIONS = ['❤️', '👍', '😂', '🔥', '🤔', '🎉'];

export function MessageItem({
  message,
  isGrouped,
  onReaction,
  onReport,
  onReply,
  isOwnMessage = false,
  getMediaUrl,
}: MessageItemProps) {
  const [showActions, setShowActions] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  const displayName = getDisplayName(message.authorId, message.authorName);
  const authorColor = getAuthorColor(message.authorId);
  const initials = getInitials(displayName);

  const handleReaction = (emoji: string) => {
    onReaction?.(message.id, emoji);
    setShowReactionPicker(false);
  };

  // Show actions on hover or focus for keyboard accessibility
  const actionsVisible = showActions || isFocused;

  /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      className={`message-item ${isGrouped ? 'grouped' : ''} ${message.status === 'sending' ? 'sending' : ''} ${message.status === 'failed' ? 'failed' : ''}`}
      tabIndex={0}
      role="article"
      aria-label={`Message from ${displayName}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowReactionPicker(false);
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={(e) => {
        // Only hide if focus is leaving the message entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsFocused(false);
          setShowReactionPicker(false);
        }
      }}
    >
      {/* Avatar or timestamp gutter */}
      <div className="message-gutter">
        {isGrouped ? (
          <span className="hover-timestamp">{formatCompactTimestamp(message.createdAt)}</span>
        ) : (
          <div
            ref={avatarRef}
            className="message-avatar clickable"
            style={{ backgroundColor: authorColor }}
            onClick={() => setShowProfileModal(true)}
            onKeyDown={(e) => e.key === 'Enter' && setShowProfileModal(true)}
            role="button"
            tabIndex={0}
            aria-label={`View ${displayName}'s profile`}
          >
            {message.authorAvatar ? (
              <img src={message.authorAvatar} alt="" />
            ) : (
              <span>{initials.toUpperCase()}</span>
            )}
          </div>
        )}
      </div>

      {/* Message content */}
      <div className="message-content">
        {!isGrouped && (
          <div className="message-header">
            <span
              className="message-author clickable"
              style={{ color: authorColor }}
              onClick={() => setShowProfileModal(true)}
              onKeyDown={(e) => e.key === 'Enter' && setShowProfileModal(true)}
              role="button"
              tabIndex={0}
            >
              {displayName}
            </span>
            <span className="message-timestamp">
              {formatTimestamp(message.createdAt)}
            </span>
            {message.editedAt && (
              <span className="message-edited">(edited)</span>
            )}
          </div>
        )}

        <div className="message-body">
          {message.content}
          {message.status === 'sending' && (
            <span className="message-status-indicator">Sending...</span>
          )}
          {message.status === 'failed' && (
            <span className="message-status-indicator failed">Failed to send</span>
          )}
        </div>

        {/* Attached images */}
        {message.mediaRefs && message.mediaRefs.length > 0 && (
          <ImageGallery
            mediaRefs={message.mediaRefs}
            thumbnailMode={false}
            getMediaUrl={getMediaUrl}
          />
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="message-reactions" role="group" aria-label="Reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                className={`reaction-badge ${reaction.hasReacted ? 'reacted' : ''}`}
                onClick={() => handleReaction(reaction.emoji)}
                aria-label={`${reaction.emoji} reaction, ${reaction.count} ${reaction.count === 1 ? 'person' : 'people'}${reaction.hasReacted ? ', you reacted' : ''}`}
                aria-pressed={reaction.hasReacted}
              >
                <span className="reaction-emoji" aria-hidden="true">{reaction.emoji}</span>
                <span className="reaction-count">{reaction.count}</span>
              </button>
            ))}
            <button
              className="add-reaction-btn"
              onClick={() => setShowReactionPicker(!showReactionPicker)}
              aria-label="Add Reaction"
              aria-expanded={showReactionPicker}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.0001 0.499893C5.65025 0.499893 0.500122 5.6499 0.500122 11.9998C0.500122 18.3497 5.65025 23.4998 12.0001 23.4998C18.35 23.4998 23.5001 18.3497 23.5001 11.9998C23.5001 5.6499 18.35 0.499893 12.0001 0.499893ZM12.0001 21.4998C6.75525 21.4998 2.50012 17.2447 2.50012 11.9998C2.50012 6.75494 6.75525 2.49989 12.0001 2.49989C17.245 2.49989 21.5001 6.75494 21.5001 11.9998C21.5001 17.2447 17.245 21.4998 12.0001 21.4998ZM8.00012 8.99989H10.0001V10.9999H8.00012V8.99989ZM14.0001 8.99989H16.0001V10.9999H14.0001V8.99989ZM7.56515 14.9999C8.35737 16.5818 9.98899 17.6249 12.0001 17.6249C14.0113 17.6249 15.6429 16.5818 16.4351 14.9999H18.6208C17.6908 17.6988 15.1105 19.6249 12.0001 19.6249C8.88973 19.6249 6.30943 17.6988 5.37943 14.9999H7.56515Z"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Actions toolbar - visible on hover or focus */}
      {actionsVisible && (
        <div className="message-actions" role="toolbar" aria-label="Message actions">
          <button
            className="action-btn"
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            title="Add Reaction"
            aria-label="Add reaction"
            aria-expanded={showReactionPicker}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.0001 0.499893C5.65025 0.499893 0.500122 5.6499 0.500122 11.9998C0.500122 18.3497 5.65025 23.4998 12.0001 23.4998C18.35 23.4998 23.5001 18.3497 23.5001 11.9998C23.5001 5.6499 18.35 0.499893 12.0001 0.499893ZM12.0001 21.4998C6.75525 21.4998 2.50012 17.2447 2.50012 11.9998C2.50012 6.75494 6.75525 2.49989 12.0001 2.49989C17.245 2.49989 21.5001 6.75494 21.5001 11.9998C21.5001 17.2447 17.245 21.4998 12.0001 21.4998ZM8.00012 8.99989H10.0001V10.9999H8.00012V8.99989ZM14.0001 8.99989H16.0001V10.9999H14.0001V8.99989ZM7.56515 14.9999C8.35737 16.5818 9.98899 17.6249 12.0001 17.6249C14.0113 17.6249 15.6429 16.5818 16.4351 14.9999H18.6208C17.6908 17.6988 15.1105 19.6249 12.0001 19.6249C8.88973 19.6249 6.30943 17.6988 5.37943 14.9999H7.56515Z"/>
            </svg>
          </button>
          <button
            className="action-btn"
            title="Reply"
            aria-label="Reply to message"
            onClick={() => onReply?.(message.id)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M10 8.26667V4L3 11.4667L10 18.9333V14.56C15 14.56 18.5 16.2667 21 20C20 14.6667 17 9.33333 10 8.26667Z"/>
            </svg>
          </button>
          {!isOwnMessage && (
            <>
              <BlockButton id={message.id} type="message" authorId={message.authorId} variant="icon" />
              <ReportButton onReport={() => setShowReportModal(true)} />
            </>
          )}
        </div>
      )}

      {/* Reaction picker */}
      {showReactionPicker && (
        <div className="reaction-picker" role="group" aria-label="Select a reaction">
          {DEFAULT_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className="reaction-picker-btn"
              onClick={() => handleReaction(emoji)}
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          contentId={message.id}
          onClose={() => setShowReportModal(false)}
          onSubmit={onReport ? (contentId, reason) => onReport(contentId, reason) : undefined}
        />
      )}

      {/* User Profile Modal */}
      {showProfileModal && (
        <UserProfileModal
          userId={message.authorId}
          displayName={displayName}
          onClose={() => setShowProfileModal(false)}
          anchorElement={avatarRef.current}
        />
      )}
    </div>
  );
  /* eslint-enable jsx-a11y/no-noninteractive-tabindex */
}
