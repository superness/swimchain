/**
 * Message input with state machine
 * Per CLIENT_DESIGN.md §5.3
 */

import { useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import type { Message } from '../types';
import { useMessageInput } from '../hooks/useMessageInput';
import { MiningProgress } from './MiningProgress';
import './MessageInput.css';

interface MessageInputProps {
  spaceId: string;
  spaceName: string;
  parentId?: string | null;
  onMessageSent: (message: Message) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function MessageInput({
  spaceId,
  spaceName,
  parentId = null,
  onMessageSent,
  onTypingStart,
  onTypingStop,
  placeholder,
  autoFocus = false,
}: MessageInputProps): JSX.Element {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastTypingRef = useRef<number>(0);

  const { state, content, setContent, submit, cancel, progress } = useMessageInput({
    spaceId,
    parentId,
    onMessageSent,
  });

  // Auto-focus input
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle typing events
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setContent(value);

      // Trigger typing indicator (debounced)
      const now = Date.now();
      if (value.length > 0 && now - lastTypingRef.current > 3000) {
        lastTypingRef.current = now;
        onTypingStart?.();
      } else if (value.length === 0) {
        onTypingStop?.();
      }
    },
    [setContent, onTypingStart, onTypingStop]
  );

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send (without shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (content.trim().length > 0 && state !== 'mining') {
          onTypingStop?.();
          submit();
        }
      }

      // Escape to cancel mining
      if (e.key === 'Escape' && state === 'mining') {
        cancel();
      }
    },
    [content, state, submit, cancel, onTypingStop]
  );

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    return `Message #${spaceName}...`;
  };

  const getButtonLabel = () => {
    switch (state) {
      case 'ready':
        return 'Send ~15s PoW';
      case 'typing':
        return 'Send';
      case 'mining':
        return 'Mining...';
      case 'sent':
        return 'Sent!';
    }
  };

  return (
    <div className="message-input">
      {state === 'mining' && progress && (
        <MiningProgress progress={progress} onCancel={cancel} />
      )}

      {state === 'sent' && (
        <div className="message-input__sent">
          <span className="message-input__sent-icon">✓</span>
          <span>Message sent!</span>
        </div>
      )}

      {state !== 'mining' && state !== 'sent' && (
        <div className="message-input__container">
          <button
            className="message-input__attach btn btn-ghost btn-icon"
            aria-label="Attach file"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>

          <textarea
            ref={inputRef}
            className="message-input__textarea"
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            rows={1}
            aria-label={`Message input for ${spaceName}`}
          />

          <button
            className={`message-input__send btn ${
              content.trim().length > 0 ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={submit}
            disabled={content.trim().length === 0}
            aria-label={getButtonLabel()}
          >
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span className="message-input__send-label">
                {getButtonLabel()}
              </span>
            </>
          </button>
        </div>
      )}
    </div>
  );
}
