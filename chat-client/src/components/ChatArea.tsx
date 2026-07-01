/**
 * ChatArea - Main message display area
 *
 * Discord-style chat interface with message list and input.
 * Maps: Messages = Replies in Swimchain terminology.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { MessageItem, type Message } from './MessageItem';
import { MessageInput } from './ChatMessageInput';
import { useBlocklist } from '../hooks/useBlocklist';
import type { SpamReason } from './ReportModal';
import './ChatArea.css';

interface Channel {
  id: string;
  name: string;
}

interface ChatAreaProps {
  channel: Channel;
  messages: Message[];
  loading: boolean;
  onSendMessage: (content: string, attachments?: File[]) => Promise<void>;
  onReaction?: (messageId: string, emoji: string) => void;
  onReport?: (messageId: string, reason: SpamReason) => Promise<boolean>;
  onReply?: (messageId: string) => void;
  currentUserId?: string;
  isSending?: boolean;
  /** Function to get media URL from hash */
  getMediaUrl?: (hash: string) => Promise<string | null>;
  /** ID of message being replied to */
  replyTargetId?: string;
  /** Cancel reply */
  onCancelReply?: () => void;
}

/**
 * Group consecutive messages from same author within 5 minutes
 */
function groupMessages(messages: Message[]): Array<{
  firstMessage: Message;
  followUpMessages: Message[];
}> {
  const groups: Array<{
    firstMessage: Message;
    followUpMessages: Message[];
  }> = [];

  const GROUPING_THRESHOLD = 5 * 60; // 5 minutes in seconds

  messages.forEach((message) => {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup) {
      const lastMessage = lastGroup.followUpMessages.length > 0
        ? lastGroup.followUpMessages[lastGroup.followUpMessages.length - 1]!
        : lastGroup.firstMessage;

      const sameAuthor = lastMessage.authorId === message.authorId;
      const withinTimeWindow = message.createdAt - lastMessage.createdAt < GROUPING_THRESHOLD;

      if (sameAuthor && withinTimeWindow) {
        lastGroup.followUpMessages.push(message);
        return;
      }
    }

    groups.push({
      firstMessage: message,
      followUpMessages: [],
    });
  });

  return groups;
}

/**
 * Format channel name for display
 */
function formatChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 32);
}

export function ChatArea({
  channel,
  messages,
  loading,
  onSendMessage,
  onReaction,
  onReport,
  onReply,
  currentUserId,
  isSending = false,
  getMediaUrl,
  replyTargetId,
  onCancelReply,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isUserBlocked, isMessageBlocked } = useBlocklist();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchQuery]);

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  // Filter out blocked users and messages, and apply search
  const filteredMessages = useMemo(() => {
    let filtered = messages.filter((msg) => {
      // Filter blocked users
      if (isUserBlocked(msg.authorId)) return false;
      // Filter blocked messages
      if (isMessageBlocked(msg.id)) return false;
      return true;
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((msg) => {
        const content = msg.content.toLowerCase();
        const authorId = msg.authorId.toLowerCase();
        const authorName = msg.authorName?.toLowerCase() || '';
        return content.includes(query) ||
               authorId.includes(query) ||
               authorName.includes(query);
      });
    }

    return filtered;
  }, [messages, isUserBlocked, isMessageBlocked, searchQuery]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages.length]);

  const messageGroups = groupMessages(filteredMessages);
  const channelName = formatChannelName(channel.name);

  return (
    <main className="chat-area" role="main" aria-label={`${channelName} channel`}>
      {/* Skip link for screen readers */}
      <a href="#message-input" className="visually-hidden focus-visible-only">
        Skip to message input
      </a>

      {/* Channel header */}
      <header className="chat-header" role="banner">
        <div className="chat-header-left">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="channel-hash">
            <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3505L15.4105 9H9.41045Z"/>
          </svg>
          <h2 className="chat-channel-name">{channelName}</h2>
        </div>
        <div className="chat-header-right">
          <div className="header-search">
            <input
              ref={searchInputRef}
              type="text"
              className="search-input"
              placeholder="Search..."
              value={searchQuery}
              onChange={handleSearchChange}
              aria-label="Search messages"
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={clearSearch}
                aria-label="Clear search"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Search results info */}
      {searchQuery && (
        <div className="search-results-info">
          <span>
            {filteredMessages.length === 0
              ? 'No messages found'
              : `${filteredMessages.length} message${filteredMessages.length === 1 ? '' : 's'} found`}
          </span>
          <button
            className="search-clear-link"
            onClick={clearSearch}
            type="button"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Messages container */}
      <div className="messages-container" ref={containerRef}>
        {loading ? (
          <div className="loading-messages">
            <div className="loading-spinner" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-icon">
              <svg width="68" height="68" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3505L15.4105 9H9.41045Z"/>
              </svg>
            </div>
            <h2>Welcome to #{channelName}!</h2>
            <p>This is the start of the #{channelName} channel.</p>
          </div>
        ) : (
          <div className="messages-list" role="log" aria-live="polite" aria-label="Message history">
            {messageGroups.map((group, _groupIndex) => (
              <div key={group.firstMessage.id} className="message-group">
                <MessageItem
                  message={group.firstMessage}
                  isGrouped={false}
                  onReaction={onReaction}
                  onReport={onReport}
                  onReply={onReply}
                  isOwnMessage={group.firstMessage.authorId === currentUserId}
                  getMediaUrl={getMediaUrl}
                />
                {group.followUpMessages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isGrouped={true}
                    onReaction={onReaction}
                    onReport={onReport}
                    onReply={onReply}
                    isOwnMessage={message.authorId === currentUserId}
                    getMediaUrl={getMediaUrl}
                  />
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message input */}
      <div className="chat-input-container" id="message-input">
        {replyTargetId && (
          <div className="reply-indicator">
            <span>Replying to message</span>
            <button
              className="reply-cancel-btn"
              onClick={onCancelReply}
              type="button"
              aria-label="Cancel reply"
            >
              Cancel
            </button>
          </div>
        )}
        <MessageInput
          channelName={channelName}
          onSend={onSendMessage}
          disabled={loading || isSending}
          isSending={isSending}
        />
      </div>
    </main>
  );
}
