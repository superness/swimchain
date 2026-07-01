/**
 * Individual message bubble component
 */

import { useState, useCallback } from 'react';
import type { Message, PresenceStatus } from '../types';
import { getHeatClass } from '../types';
import { formatMessageTime } from '../utils/time';
import { truncateAddress } from '../mocks/data';
import { AddressDisplay } from '@swimchain/frontend';
import { HeatIndicator } from './HeatIndicator';
import { QuickActions } from './QuickActions';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
  isExpanded: boolean;
  isSelected: boolean;
  presenceStatus?: PresenceStatus;
  showHeader?: boolean;
  onToggleThread: () => void;
  onReply: () => void;
  onSelect: () => void;
}

export function MessageBubble({
  message,
  isExpanded,
  isSelected,
  presenceStatus = 'offline',
  showHeader = true,
  onToggleThread,
  onReply,
  onSelect,
}: MessageBubbleProps): JSX.Element {
  const [showActions, setShowActions] = useState(false);
  const [isReacting, setIsReacting] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setShowActions(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setShowActions(false);
  }, []);

  const handleReactQuick = useCallback(async () => {
    setIsReacting(true);
    // Simulate PoW delay
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsReacting(false);
  }, []);

  const handleReactStandard = useCallback(async () => {
    setIsReacting(true);
    // Simulate PoW delay
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setIsReacting(false);
  }, []);

  const handleShare = useCallback(() => {
    // Copy message link to clipboard
    navigator.clipboard.writeText(
      `${window.location.origin}/m/${message.id}`
    );
  }, [message.id]);

  const handleMore = useCallback(() => {
    // TODO: Show more options menu
  }, []);

  const heatClass = getHeatClass(message.heatPercent);
  const hasReplies = message.replyCount > 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      className={`message-bubble ${heatClass} ${
        isSelected ? 'message-bubble--selected' : ''
      } ${isExpanded ? 'message-bubble--expanded' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Message from ${truncateAddress(message.authorAddress)}`}
      aria-pressed={isSelected}
    >
      {showHeader && (
        <header className="message-bubble__header">
          <span
            className={`presence-dot presence-dot--${presenceStatus}`}
            aria-label={presenceStatus}
          />
          <AddressDisplay
            address={message.authorAddress}
            chars={6}
            showCopy={false}
          />
          <time
            className="message-bubble__time"
            dateTime={new Date(message.createdAt * 1000).toISOString()}
          >
            {formatMessageTime(message.createdAt)}
          </time>
        </header>
      )}

      <div className="message-bubble__content">
        <p className="message-bubble__text">{message.content}</p>
      </div>

      <footer className="message-bubble__footer">
        <HeatIndicator heatPercent={message.heatPercent} />

        <span className="message-bubble__pool">
          ⚡ {message.poolCurrent}s/{message.poolTarget}s
        </span>

        {message.reactions.quickCount > 0 && (
          <span className="message-bubble__reaction">
            ⚡+5 × {message.reactions.quickCount}
          </span>
        )}

        {message.reactions.standardCount > 0 && (
          <span className="message-bubble__reaction">
            ⚡+15 × {message.reactions.standardCount}
          </span>
        )}

        {hasReplies && (
          <button
            className="message-bubble__thread-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleThread();
            }}
            aria-expanded={isExpanded}
          >
            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </footer>

      {showActions && (
        <div className="message-bubble__actions">
          <QuickActions
            messageId={message.id}
            onReply={onReply}
            onReactQuick={handleReactQuick}
            onReactStandard={handleReactStandard}
            onShare={handleShare}
            onMore={handleMore}
            isReacting={isReacting}
          />
        </div>
      )}
    </div>
  );
}
