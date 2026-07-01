/**
 * ChatMessageInput - Discord-style message input for ChatArea
 *
 * Simplified message input that accepts async onSend handler.
 * Supports image attachments with preview.
 */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ChangeEvent } from 'react';
import './ChatMessageInput.css';

/** Pending image attachment */
export interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
}

interface ChatMessageInputProps {
  channelName: string;
  onSend: (content: string, attachments?: File[]) => Promise<void>;
  disabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  /** Maximum file size in bytes (default 10MB) */
  maxFileSize?: number;
  /** Maximum number of attachments (default 4) */
  maxAttachments?: number;
}

export function ChatMessageInput({
  channelName,
  onSend,
  disabled = false,
  isSending = false,
  placeholder,
  maxFileSize = 10 * 1024 * 1024, // 10MB
  maxAttachments = 4,
}: ChatMessageInputProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [content]);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
    };
  }, [attachments]);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  }, []);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setAttachError(null);

    const newAttachments: PendingAttachment[] = [];
    const remainingSlots = maxAttachments - attachments.length;

    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];
      if (!file) continue;

      // Check file type (images only)
      if (!file.type.startsWith('image/')) {
        setAttachError('Only image files are supported');
        continue;
      }

      // Check file size
      if (file.size > maxFileSize) {
        setAttachError(`File too large (max ${Math.round(maxFileSize / 1024 / 1024)}MB)`);
        continue;
      }

      newAttachments.push({
        id: `${Date.now()}-${i}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (files.length > remainingSlots) {
      setAttachError(`Maximum ${maxAttachments} attachments allowed`);
    }

    setAttachments(prev => [...prev, ...newAttachments]);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [attachments.length, maxAttachments, maxFileSize]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const attachment = prev.find(a => a.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const handleSend = useCallback(async () => {
    const trimmedContent = content.trim();
    const hasContent = trimmedContent.length > 0;
    const hasAttachments = attachments.length > 0;

    if ((!hasContent && !hasAttachments) || disabled || isSending) return;

    try {
      const files = attachments.map(a => a.file);
      await onSend(trimmedContent, files.length > 0 ? files : undefined);
      setContent('');
      // Cleanup and clear attachments
      attachments.forEach(a => URL.revokeObjectURL(a.previewUrl));
      setAttachments([]);
    } catch (err) {
      console.error('[ChatMessageInput] Send failed:', err);
    }
  }, [content, attachments, disabled, isSending, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send (without shift for new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const placeholderText = placeholder ?? `Message #${channelName}`;
  const canSend = (content.trim().length > 0 || attachments.length > 0) && !disabled && !isSending;

  return (
    <div className={`chat-message-input ${disabled ? 'disabled' : ''}`}>
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="attachment-previews">
          {attachments.map(attachment => (
            <div key={attachment.id} className="attachment-preview">
              <img src={attachment.previewUrl} alt="Attachment preview" />
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(attachment.id)}
                aria-label="Remove attachment"
                type="button"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {attachError && (
        <div className="attachment-error">{attachError}</div>
      )}

      {/* Input row */}
      <div className="input-row">
        {/* Attach button */}
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || attachments.length >= maxAttachments}
          aria-label="Attach image"
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          aria-hidden="true"
        />

        {/* Text input */}
        <div className="input-wrapper">
          <textarea
            ref={textareaRef}
            className="message-textarea"
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={disabled}
            rows={1}
            aria-label={`Message input for ${channelName}`}
          />
        </div>

        {/* Send button */}
        {canSend && (
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={disabled || isSending}
            aria-label="Send message"
            type="button"
          >
            {isSending ? (
              <div className="send-spinner" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.2 5.21L3 6.92V2.62L8.2 5.21ZM8.2 10.79L3 13.38V9.08L8.2 10.79ZM16 8L3 16V0L16 8Z"/>
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Re-export as MessageInput for ChatArea compatibility
export { ChatMessageInput as MessageInput };
