/**
 * Content reactions component
 * Simple emoji reactions for posts
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { EmojiCount } from '../types';
import { REACTION_EMOJIS, ReactionType } from '../types';
import './ContentStatus.css';

interface ContentStatusProps {
  onReact?: (emoji: string) => void; // Callback when user reacts with emoji
  isReacting?: boolean;      // True while reaction is being processed
  emojiCounts?: EmojiCount[]; // Existing emoji reaction counts
  compact?: boolean;
  createdAt?: number;        // Unix timestamp for decay calculation
}

/** Calculate content survival percentage based on 7-day half-life decay (SPEC_02) */
function getDecayInfo(createdAt: number): { survivalPct: number; label: string; className: string } {
  const ageMs = Date.now() - createdAt * 1000;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const survivalPct = Math.max(0, Math.min(100, Math.pow(0.5, ageDays / 7) * 100));

  if (survivalPct >= 75) return { survivalPct, label: 'Healthy', className: 'decay-healthy' };
  if (survivalPct >= 40) return { survivalPct, label: 'Active', className: 'decay-active' };
  if (survivalPct >= 15) return { survivalPct, label: 'Stale', className: 'decay-stale' };
  return { survivalPct, label: 'Decaying', className: 'decay-decaying' };
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

export function ContentStatus({
  onReact,
  isReacting = false,
  emojiCounts,
  compact = false,
  createdAt,
}: ContentStatusProps): JSX.Element {
  const decay = createdAt ? getDecayInfo(createdAt) : null;
  const [showPicker, setShowPicker] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const totalReactions = emojiCounts?.reduce((sum, e) => sum + e.count, 0) ?? 0;
  const hasReactions = totalReactions > 0;

  const handleEmojiClick = (emoji: string) => {
    setShowPicker(false);
    onReact?.(emoji);
  };

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
      <div className="content-status content-status-compact">
        {emojiCounts?.map((ec) => (
          <span key={ec.reactionType} className="emoji-count-chip-compact">
            <span>{ec.emoji}</span>
            <span>{ec.count}</span>
          </span>
        ))}
      </div>
    );
  }

  // No reaction callback = read-only mode, just show counts
  if (!onReact) {
    if (!hasReactions) return <></>;
    return (
      <div className="content-status">
        <div className="emoji-counts">
          {emojiCounts?.map((ec) => (
            <span key={ec.reactionType} className="emoji-count-chip">
              <span>{ec.emoji}</span>
              <span>{ec.count}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="content-status">
      {/* Existing emoji counts */}
      {hasReactions && (
        <div className="emoji-counts">
          {emojiCounts?.map((ec) => (
            <span key={ec.reactionType} className="emoji-count-chip">
              <span>{ec.emoji}</span>
              <span>{ec.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Decay indicator */}
      {decay && (
        <div className={`decay-indicator ${decay.className}`} title={`${decay.survivalPct.toFixed(0)}% survival - ${decay.label}`}>
          <div className="decay-bar">
            <div className="decay-bar-fill" style={{ width: `${decay.survivalPct}%` }} />
          </div>
          <span className="decay-label">{decay.survivalPct.toFixed(0)}% {decay.label}</span>
        </div>
      )}

      {/* Emoji picker */}
      <div className="emoji-picker-container">
        <button
          className={`reaction-button ${isReacting ? 'reacting' : ''}`}
          onClick={() => !isReacting && setShowPicker(!showPicker)}
          disabled={isReacting}
          aria-label="Add reaction"
        >
          <span className={`reaction-icon ${isReacting ? 'reacting' : ''}`}>
            {isReacting ? '⏳' : '😀'}
          </span>
          <span>{isReacting ? 'Reacting...' : 'React'}</span>
        </button>

        {showPicker && !isReacting && (
          <div
            className="emoji-picker"
            role="listbox"
            aria-label="Choose an emoji"
            ref={pickerRef}
            onKeyDown={handlePickerKeyDown}
          >
            {EMOJI_OPTIONS.map(({ emoji, type }, index) => (
              <button
                key={type}
                ref={el => buttonRefs.current[index] = el}
                className="emoji-option"
                onClick={() => handleEmojiClick(emoji)}
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
