/**
 * Inline thread expansion panel
 * Per CLIENT_DESIGN.md §5.4
 */

import type { Message } from '../types';
import { formatMessageTime } from '../utils/time';
import { truncateAddress, getPresenceForUser } from '../mocks/data';
import { MessageInput } from './MessageInput';
import { Loading } from './Loading';
import './ThreadPanel.css';

interface ThreadPanelProps {
  parentMessage: Message;
  replies: Message[];
  isLoading: boolean;
  onClose: () => void;
  onReplySent: (message: Message) => void;
}

export function ThreadPanel({
  parentMessage,
  replies,
  isLoading,
  onClose,
  onReplySent,
}: ThreadPanelProps): JSX.Element {
  return (
    <div className="thread-panel">
      <header className="thread-panel__header">
        <h3 className="thread-panel__title">
          THREAD — {parentMessage.replyCount} {parentMessage.replyCount === 1 ? 'reply' : 'replies'}
        </h3>
        <button
          className="thread-panel__close btn btn-ghost btn-sm"
          onClick={onClose}
          aria-label="Close thread"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="thread-panel__replies">
        {isLoading ? (
          <Loading size="sm" text="Loading replies..." />
        ) : replies.length === 0 ? (
          <div className="thread-panel__empty">
            No replies yet. Be the first to reply!
          </div>
        ) : (
          replies.map((reply) => {
            const presence = getPresenceForUser(reply.authorAddress);
            return (
              <div key={reply.id} className="thread-panel__reply">
                <div className="thread-panel__reply-header">
                  <span
                    className={`presence-dot presence-dot--${presence?.status ?? 'offline'}`}
                    aria-label={presence?.status ?? 'offline'}
                  />
                  <span className="thread-panel__reply-author">
                    {truncateAddress(reply.authorAddress, 6)}
                  </span>
                  <time
                    className="thread-panel__reply-time"
                    dateTime={new Date(reply.createdAt * 1000).toISOString()}
                  >
                    {formatMessageTime(reply.createdAt)}
                  </time>
                </div>
                <p className="thread-panel__reply-content">{reply.content}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="thread-panel__input">
        <MessageInput
          spaceId={parentMessage.spaceId}
          spaceName="thread"
          parentId={parentMessage.id}
          onMessageSent={onReplySent}
          placeholder="Reply to thread..."
        />
      </div>
    </div>
  );
}
