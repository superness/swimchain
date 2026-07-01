/**
 * ReactionPicker - Emoji reaction component
 *
 * Allows users to add emoji reactions to posts.
 * Displays existing reaction counts and provides a picker for adding new reactions.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { REACTION_EMOJIS, ReactionType, ReactionCounts } from '../types/feed';
import './ReactionPicker.css';

interface ReactionPickerProps {
  /** Callback when user reacts with emoji */
  onReact?: (emoji: string, reactionType: ReactionType) => void;
  /** True while reaction is being processed */
  isReacting?: boolean;
  /** Existing reaction counts */
  reactions?: ReactionCounts | null;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Read-only mode (no reaction button) */
  readOnly?: boolean;
}

const EMOJI_OPTIONS: { emoji: string; type: ReactionType }[] = [
  { emoji: REACTION_EMOJIS.heart, type: 'heart' },
  { emoji: REACTION_EMOJIS.thumbs_up, type: 'thumbs_up' },
  { emoji: REACTION_EMOJIS.fire, type: 'fire' },
  { emoji: REACTION_EMOJIS.laugh, type: 'laugh' },
  { emoji: REACTION_EMOJIS.thinking, type: 'thinking' },
  { emoji: REACTION_EMOJIS.mind_blown, type: 'mind_blown' },
  { emoji: REACTION_EMOJIS.swimming, type: 'swimming' },
  { emoji: REACTION_EMOJIS.thumbs_down, type: 'thumbs_down' },
];

export function ReactionPicker({
  onReact,
  isReacting = false,
  reactions,
  compact = false,
  readOnly = false,
}: ReactionPickerProps): JSX.Element {
  const [showPicker, setShowPicker] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalReactions = reactions?.total ?? 0;
  const hasReactions = totalReactions > 0;
  const emojiCounts = reactions?.reactions ?? [];

  const handleEmojiClick = (emoji: string, type: ReactionType) => {
    setShowPicker(false);
    onReact?.(emoji, type);
  };

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPicker]);

  // Focus the first emoji button when picker opens
  useEffect(() => {
    if (showPicker && buttonRefs.current[0]) {
      setFocusedIndex(0);
      buttonRefs.current[0]?.focus();
    }
  }, [showPicker]);

  // Handle keyboard navigation within the emoji picker (roving tabindex pattern)
  const handlePickerKeyDown = useCallback((e: React.KeyboardEvent) => {
    const emojiCount = EMOJI_OPTIONS.length;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = (prev + 1) % emojiCount;
          buttonRefs.current[next]?.focus();
          return next;
        });
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = (prev - 1 + emojiCount) % emojiCount;
          buttonRefs.current[next]?.focus();
          return next;
        });
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        buttonRefs.current[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(emojiCount - 1);
        buttonRefs.current[emojiCount - 1]?.focus();
        break;
      case 'Escape':
        e.preventDefault();
        setShowPicker(false);
        break;
    }
  }, []);

  // Compact mode: just show emoji counts inline
  if (compact) {
    if (!hasReactions) return <></>;
    return (
      <div className="reaction-picker reaction-picker--compact">
        {emojiCounts.map((ec) => (
          <span key={ec.reactionType} className="reaction-chip reaction-chip--compact">
            <span>{ec.emoji}</span>
            <span>{ec.count}</span>
          </span>
        ))}
      </div>
    );
  }

  // Read-only mode or no callback: just show counts
  if (readOnly || !onReact) {
    if (!hasReactions) return <></>;
    return (
      <div className="reaction-picker">
        <div className="reaction-counts">
          {emojiCounts.map((ec) => (
            <span key={ec.reactionType} className="reaction-chip">
              <span>{ec.emoji}</span>
              <span>{ec.count}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="reaction-picker" ref={containerRef}>
      {/* Existing emoji counts */}
      {hasReactions && (
        <div className="reaction-counts">
          {emojiCounts.map((ec) => (
            <span key={ec.reactionType} className="reaction-chip">
              <span>{ec.emoji}</span>
              <span>{ec.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      <div className="reaction-picker-container">
        <button
          className={`reaction-add-btn ${isReacting ? 'reaction-add-btn--reacting' : ''}`}
          onClick={() => !isReacting && setShowPicker(!showPicker)}
          disabled={isReacting}
          aria-label={isReacting ? 'Adding reaction...' : 'Add reaction'}
          aria-expanded={showPicker}
        >
          {isReacting ? (
            <span className="reaction-spinner" aria-hidden="true" />
          ) : (
            <span aria-hidden="true">+</span>
          )}
        </button>

        {showPicker && !isReacting && (
          <div
            className="reaction-picker-dropdown"
            role="listbox"
            aria-label="Choose an emoji"
            ref={pickerRef}
            onKeyDown={handlePickerKeyDown}
          >
            {EMOJI_OPTIONS.map(({ emoji, type }, index) => (
              <button
                key={type}
                ref={el => buttonRefs.current[index] = el}
                className="reaction-option"
                onClick={() => handleEmojiClick(emoji, type)}
                aria-label={`React with ${type.replace('_', ' ')}`}
                role="option"
                aria-selected={focusedIndex === index}
                tabIndex={focusedIndex === index ? 0 : -1}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Simple reaction display component (no interaction)
 */
export function ReactionDisplay({
  reactions,
  compact = false,
}: {
  reactions?: ReactionCounts | null;
  compact?: boolean;
}): JSX.Element | null {
  const total = reactions?.total ?? 0;
  if (total === 0) return null;

  const emojiCounts = reactions?.reactions ?? [];

  if (compact) {
    return (
      <span className="reaction-display reaction-display--compact">
        {emojiCounts.slice(0, 3).map((ec) => (
          <span key={ec.reactionType}>{ec.emoji}</span>
        ))}
        {total > 0 && <span className="reaction-display__count">{total}</span>}
      </span>
    );
  }

  return (
    <div className="reaction-display">
      {emojiCounts.map((ec) => (
        <span key={ec.reactionType} className="reaction-chip">
          <span>{ec.emoji}</span>
          <span>{ec.count}</span>
        </span>
      ))}
    </div>
  );
}
