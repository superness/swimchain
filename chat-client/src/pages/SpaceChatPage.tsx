/**
 * Main space chat page - uses real RPC data
 */

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { Message } from '../types';
import { Header } from '../components/Header';
import { MessageStream } from '../components/MessageStream';
import { MessageInput } from '../components/MessageInput';
import { ThreadPanel } from '../components/ThreadPanel';
import { TypingIndicator } from '../components/TypingIndicator';
import { Loading } from '../components/Loading';
import { useTypingIndicator } from '../hooks/useTypingIndicator';
import { useThread } from '../hooks/useThread';
import { useSpaces, useSpaceMessages } from '../hooks/useRpc';
import './SpaceChatPage.css';

export function SpaceChatPage(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { spaces, loading: spacesLoading } = useSpaces();
  const actualSpaceId = spaceId ?? spaces[0]?.id ?? '';

  const space = useMemo(
    () => spaces.find(s => s.id === actualSpaceId) ?? null,
    [spaces, actualSpaceId]
  );

  // Fetch messages from RPC
  const { messages: rpcMessages, loading: messagesLoading, refetch: refetchMessages } = useSpaceMessages(actualSpaceId);

  // Keep local messages state to allow optimistic updates
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  // Merge RPC messages with local optimistic updates
  const messages = useMemo(() => {
    const allMessages = [...rpcMessages];
    // Add any local messages that aren't in the RPC list yet
    for (const localMsg of localMessages) {
      if (!allMessages.find(m => m.id === localMsg.id)) {
        allMessages.push(localMsg);
      }
    }
    // Sort by creation time
    return allMessages.sort((a, b) => a.createdAt - b.createdAt);
  }, [rpcMessages, localMessages]);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const {
    expandedThreadId,
    toggleThread,
    closeThread,
    threadReplies,
    isLoadingReplies,
  } = useThread();

  const { startTyping, stopTyping, typingUsers } = useTypingIndicator(actualSpaceId);

  const handleMessageSent = useCallback((message: Message) => {
    // Add to local messages for immediate display
    setLocalMessages(prev => [...prev, message]);
    // Refetch from RPC to get the persisted version
    setTimeout(() => refetchMessages(), 1000);
  }, [refetchMessages]);

  const handleThreadReplySent = useCallback((reply: Message) => {
    // Update parent message reply count in local state
    setLocalMessages(prev =>
      prev.map(m =>
        m.id === reply.parentId
          ? { ...m, replyCount: m.replyCount + 1 }
          : m
      )
    );
    // Refetch to get updated data
    setTimeout(() => refetchMessages(), 1000);
  }, [refetchMessages]);

  const handleSelectMessage = useCallback((messageId: string) => {
    setSelectedMessageId(prev => (prev === messageId ? null : messageId));
  }, []);

  const handleReplyTo = useCallback((messageId: string) => {
    toggleThread(messageId);
  }, [toggleThread]);

  // Find the parent message for the expanded thread
  const expandedParentMessage = useMemo(() => {
    if (!expandedThreadId) return null;
    return messages.find(m => m.id === expandedThreadId) ?? null;
  }, [expandedThreadId, messages]);

  // Show loading state
  if (spacesLoading || (messagesLoading && messages.length === 0)) {
    return (
      <div className="space-chat-page">
        <Header space={null} />
        <div className="space-chat-page__loading">
          <Loading text="Loading messages..." />
        </div>
      </div>
    );
  }

  return (
    <div className="space-chat-page">
      <Header space={space} />

      <div className="space-chat-page__content">
        <MessageStream
          messages={messages}
          selectedMessageId={selectedMessageId}
          expandedThreadId={expandedThreadId}
          onSelectMessage={handleSelectMessage}
          onToggleThread={toggleThread}
          onReplyTo={handleReplyTo}
        />

        {expandedParentMessage && (
          <ThreadPanel
            parentMessage={expandedParentMessage}
            replies={threadReplies}
            isLoading={isLoadingReplies}
            onClose={closeThread}
            onReplySent={handleThreadReplySent}
          />
        )}
      </div>

      <div className="space-chat-page__input-area">
        <TypingIndicator typingUsers={typingUsers} />
        <MessageInput
          spaceId={actualSpaceId}
          spaceName={space?.name ?? 'channel'}
          onMessageSent={handleMessageSent}
          onTypingStart={startTyping}
          onTypingStop={stopTyping}
        />
      </div>
    </div>
  );
}
