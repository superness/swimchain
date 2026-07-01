/**
 * Hook for keyboard navigation in chat
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Message } from '../types';

interface UseChatNavigationOptions {
  messages: Message[];
  selectedMessageId: string | null;
  expandedThreadId: string | null;
  onSelectMessage: (messageId: string | null) => void;
  onToggleThread: (messageId: string) => void;
  onReplyTo: (messageId: string) => void;
  onReactQuick: (messageId: string) => void;
  onReactStandard: (messageId: string) => void;
  onCloseThread: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

interface UseChatNavigationReturn {
  selectedMessageId: string | null;
  handleKeyDown: (event: KeyboardEvent) => void;
}

/**
 * Keyboard shortcuts:
 * j - Select next message
 * k - Select previous message
 * Enter - Expand thread (if selected has replies)
 * Escape - Close thread / clear selection
 * / - Focus message input
 * e - Quick engage +5s on selected
 * E (Shift+E) - Standard engage +15s on selected
 * r - Reply to selected message
 */
export function useChatNavigation({
  messages,
  selectedMessageId,
  expandedThreadId,
  onSelectMessage,
  onToggleThread,
  onReplyTo,
  onReactQuick,
  onReactStandard,
  onCloseThread,
  inputRef,
}: UseChatNavigationOptions): UseChatNavigationReturn {
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if typing in input
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Escape always works
      if (event.key === 'Escape') {
        event.preventDefault();
        if (expandedThreadId) {
          onCloseThread();
        } else if (selectedMessageId) {
          onSelectMessage(null);
        }
        // Also blur input
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        return;
      }

      // Other shortcuts only work when not in input
      if (isInputFocused) return;

      const currentMessages = messagesRef.current;
      const sortedMessages = [...currentMessages].sort(
        (a, b) => a.createdAt - b.createdAt
      );

      switch (event.key) {
        case 'j': {
          // Select next message
          event.preventDefault();
          if (!selectedMessageId) {
            const first = sortedMessages[0];
            if (first) onSelectMessage(first.id);
          } else {
            const currentIndex = sortedMessages.findIndex(
              (m) => m.id === selectedMessageId
            );
            const next = sortedMessages[currentIndex + 1];
            if (next) onSelectMessage(next.id);
          }
          break;
        }

        case 'k': {
          // Select previous message
          event.preventDefault();
          if (!selectedMessageId) {
            const last = sortedMessages[sortedMessages.length - 1];
            if (last) onSelectMessage(last.id);
          } else {
            const currentIndex = sortedMessages.findIndex(
              (m) => m.id === selectedMessageId
            );
            const prev = sortedMessages[currentIndex - 1];
            if (prev) onSelectMessage(prev.id);
          }
          break;
        }

        case 'Enter': {
          // Expand thread if selected message has replies
          if (selectedMessageId) {
            event.preventDefault();
            const message = sortedMessages.find(
              (m) => m.id === selectedMessageId
            );
            if (message && message.replyCount > 0) {
              onToggleThread(selectedMessageId);
            }
          }
          break;
        }

        case '/': {
          // Focus message input
          event.preventDefault();
          inputRef.current?.focus();
          break;
        }

        case 'e': {
          // Quick engage +5s
          if (selectedMessageId && !event.shiftKey) {
            event.preventDefault();
            onReactQuick(selectedMessageId);
          }
          break;
        }

        case 'E': {
          // Standard engage +15s (Shift+E)
          if (selectedMessageId && event.shiftKey) {
            event.preventDefault();
            onReactStandard(selectedMessageId);
          }
          break;
        }

        case 'r': {
          // Reply to selected message
          if (selectedMessageId) {
            event.preventDefault();
            onReplyTo(selectedMessageId);
          }
          break;
        }
      }
    },
    [
      selectedMessageId,
      expandedThreadId,
      onSelectMessage,
      onToggleThread,
      onReplyTo,
      onReactQuick,
      onReactStandard,
      onCloseThread,
      inputRef,
    ]
  );

  // Register global keydown listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    selectedMessageId,
    handleKeyDown,
  };
}
