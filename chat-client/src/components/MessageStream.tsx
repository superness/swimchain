/**
 * Message stream component with auto-scroll and date separators
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Message, PresenceStatus } from '../types';
import { getDateSeparator, isSameDay, shouldGroupMessages } from '../utils/time';
import { MessageBubble } from './MessageBubble';
import { getPresenceForUser } from '../mocks/data';
import './MessageStream.css';

interface MessageStreamProps {
  messages: Message[];
  selectedMessageId: string | null;
  expandedThreadId: string | null;
  onSelectMessage: (messageId: string) => void;
  onToggleThread: (messageId: string) => void;
  onReplyTo: (messageId: string) => void;
}

export function MessageStream({
  messages,
  selectedMessageId,
  expandedThreadId,
  onSelectMessage,
  onToggleThread,
  onReplyTo,
}: MessageStreamProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const prevMessagesLengthRef = useRef(messages.length);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsScrolledUp(!isAtBottom);

    if (isAtBottom) {
      setNewMessageCount(0);
    }
  }, []);

  // Auto-scroll to bottom on new messages (if not scrolled up)
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      if (!isScrolledUp && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      } else {
        setNewMessageCount((prev) => prev + (messages.length - prevMessagesLengthRef.current));
      }
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, isScrolledUp]);

  // Scroll to bottom when first loaded
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setNewMessageCount(0);
    }
  }, []);

  // Sort messages chronologically
  const sortedMessages = [...messages].sort((a, b) => a.createdAt - b.createdAt);

  // Group messages and add date separators
  const renderItems: Array<{ type: 'separator' | 'message'; data: string | Message; showHeader: boolean }> = [];
  let lastDate: number | null = null;
  let lastAuthor: string | null = null;
  let lastTimestamp: number | null = null;

  for (const message of sortedMessages) {
    // Add date separator if needed
    if (lastDate === null || !isSameDay(lastDate, message.createdAt)) {
      renderItems.push({
        type: 'separator',
        data: getDateSeparator(message.createdAt),
        showHeader: true,
      });
      lastAuthor = null;
      lastTimestamp = null;
    }

    // Determine if we should group with previous message
    const shouldGroup =
      lastAuthor !== null &&
      lastTimestamp !== null &&
      shouldGroupMessages(lastTimestamp, message.createdAt, lastAuthor, message.authorAddress);

    renderItems.push({
      type: 'message',
      data: message,
      showHeader: !shouldGroup,
    });

    lastDate = message.createdAt;
    lastAuthor = message.authorAddress;
    lastTimestamp = message.createdAt;
  }

  return (
    <div className="message-stream" ref={containerRef} onScroll={handleScroll}>
      <div className="message-stream__content">
        {renderItems.map((item, index) => {
          if (item.type === 'separator') {
            return (
              <div key={`sep-${index}`} className="message-stream__separator">
                <span className="message-stream__separator-line" />
                <span className="message-stream__separator-text">
                  {item.data as string}
                </span>
                <span className="message-stream__separator-line" />
              </div>
            );
          }

          const message = item.data as Message;
          const presence = getPresenceForUser(message.authorAddress);

          return (
            <MessageBubble
              key={message.id}
              message={message}
              isExpanded={expandedThreadId === message.id}
              isSelected={selectedMessageId === message.id}
              presenceStatus={presence?.status as PresenceStatus | undefined}
              showHeader={item.showHeader}
              onToggleThread={() => onToggleThread(message.id)}
              onReply={() => onReplyTo(message.id)}
              onSelect={() => onSelectMessage(message.id)}
            />
          );
        })}
      </div>

      {newMessageCount > 0 && (
        <button
          className="message-stream__new-indicator"
          onClick={scrollToBottom}
          aria-label={`${newMessageCount} new messages, click to scroll to bottom`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {newMessageCount} new {newMessageCount === 1 ? 'message' : 'messages'}
        </button>
      )}
    </div>
  );
}
