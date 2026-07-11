/**
 * Recursive reply tree component for deep threading
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { Reply as ReplyType, EmojiCount } from '../types';
import { AddressDisplay } from './AddressDisplay';
import { BlockButton } from './BlockButton';
import { ReplyComposer } from './ReplyComposer';
import { ReportModal, SpamBadge } from './ReportModal';
import { useBlocklist } from '../hooks/useBlocklist';
import { formatRelativeTime } from '../utils/time';
import { useReactions, usePoolContribution } from '../hooks/useRpc';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { useSponsorship } from '../hooks/useSponsorship';
import './ReplyTree.css';

interface ReplyTreeProps {
  replies: ReplyType[];
  threadId: string;
  spaceId?: string;
  depth?: number;
  maxVisibleDepth?: number;
  focusedReplyId?: string;
  onReplySuccess?: (replyId: string) => void;
}

export function ReplyTree({
  replies,
  threadId,
  spaceId,
  depth = 0,
  maxVisibleDepth = 5,
  focusedReplyId,
  onReplySuccess,
}: ReplyTreeProps): JSX.Element {
  const { filterBlocked } = useBlocklist();

  // Filter out blocked replies and replies from blocked authors
  const visibleReplies = filterBlocked(replies, 'reply', { alsoFilterByAuthor: true });

  return (
    <ul
      className="reply-tree"
      style={{ '--depth': depth } as React.CSSProperties}
      role={depth === 0 ? 'list' : undefined}
      aria-label={depth === 0 ? 'Replies' : undefined}
    >
      {visibleReplies.map((reply) => (
        <ReplyNode
          key={reply.id}
          reply={reply}
          threadId={threadId}
          spaceId={spaceId}
          depth={depth}
          maxVisibleDepth={maxVisibleDepth}
          focusedReplyId={focusedReplyId}
          onReplySuccess={onReplySuccess}
        />
      ))}
    </ul>
  );
}

interface ReplyNodeProps {
  reply: ReplyType;
  threadId: string;
  spaceId?: string;
  depth: number;
  maxVisibleDepth: number;
  focusedReplyId?: string;
  onReplySuccess?: (replyId: string) => void;
}

// Emoji options for reaction picker
const EMOJI_OPTIONS = [
  { code: 1, emoji: '❤️', label: 'Heart' },
  { code: 2, emoji: '👍', label: 'Thumbs up' },
  { code: 3, emoji: '👎', label: 'Thumbs down' },
  { code: 4, emoji: '😂', label: 'Laugh' },
  { code: 5, emoji: '🤔', label: 'Thinking' },
  { code: 6, emoji: '🤯', label: 'Mind blown' },
  { code: 7, emoji: '🔥', label: 'Fire' },
  { code: 8, emoji: '🏊', label: 'Swimming' },
];

function ReplyNode({
  reply,
  threadId,
  spaceId,
  depth,
  maxVisibleDepth,
  focusedReplyId,
  onReplySuccess,
}: ReplyNodeProps): JSX.Element {
  const replyRef = useRef<HTMLLIElement>(null);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // hasChildren: true if there are children at all (fetched or not)
  const hasChildren = reply.children.length > 0 || (reply.childCount ?? 0) > 0;
  // childCount from RPC = total children even if not fetched (for "Continue thread" link)
  // reply.children.length = fetched children (for "Show X more" when collapsed)
  const fetchedChildCount = countAllChildren(reply);
  const totalChildCount = reply.childCount ?? fetchedChildCount;
  const isFocused = focusedReplyId === reply.id;
  const isAtDepthLimit = depth >= maxVisibleDepth;

  // Check if this reply or any of its descendants contains the focused reply
  const containsFocusedReply = focusedReplyId ? containsReply(reply, focusedReplyId) : false;

  // Auto-expand if we contain the focused reply (but collapse otherwise if deep)
  const [isCollapsed, setIsCollapsed] = useState(!containsFocusedReply && depth >= 3);

  const { reactions, refetch: refetchReactions } = useReactions(reply.id);
  const { contribute, contributing } = usePoolContribution();
  const { publicKey, sign } = useStoredKeypair();
  const { isSponsored } = useSponsorship();

  // Scroll to and highlight focused reply
  useEffect(() => {
    if (isFocused && replyRef.current) {
      replyRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isFocused]);

  // Generate link to this reply
  const replyLink = spaceId
    ? `/spaces/${spaceId}/thread/${threadId}/reply/${reply.id}`
    : `#${reply.id}`;

  const handleCopyLink = useCallback(() => {
    const fullUrl = `${window.location.origin}${replyLink}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [replyLink]);

  const handleReplyClick = useCallback(() => {
    setShowReplyComposer(true);
  }, []);

  const handleEmojiSelect = useCallback(async (emojiCode: number) => {
    setShowEmojiPicker(false);
    setReactError(null);

    if (!publicKey || !sign) {
      setReactError('Please create an identity first');
      return;
    }

    // Gate on sponsorship BEFORE mining — the node rejects unsponsored engagements
    // (SPEC_11), so mining first only wastes ~10s of proof-of-work. This mirrors the
    // top-level post reaction in ThreadView.
    if (isSponsored === false) {
      setReactError('You need a sponsor before you can react. Redeem an invite or request sponsorship first — no proof-of-work is spent until then.');
      return;
    }

    try {
      const pubKeyHex = Array.from(publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
      // Use async signing - returns Uint8Array or null
      const signFn = async (message: Uint8Array): Promise<Uint8Array> => {
        const sig = await sign(message);
        if (!sig) throw new Error('Failed to sign');
        return sig;
      };
      const result = await contribute(
        reply.id,
        10, // 10 seconds of PoW per reaction
        pubKeyHex,
        signFn,
        emojiCode
      );
      if (result) {
        refetchReactions();
      }
    } catch (err) {
      setReactError(err instanceof Error ? err.message : 'Failed to react');
    }
  }, [reply.id, contribute, refetchReactions, publicKey, sign, isSponsored]);

  const handleReplySuccess = useCallback((replyId: string) => {
    setShowReplyComposer(false);
    onReplySuccess?.(replyId);
  }, [onReplySuccess]);

  const handleReplyCancel = useCallback(() => {
    setShowReplyComposer(false);
  }, []);

  return (
    <li
      ref={replyRef}
      className={`reply-item ${isCollapsed ? 'collapsed' : ''} ${isFocused ? 'reply-focused' : ''}`}
      id={`reply-${reply.id}`}
    >
      <article className="reply" aria-labelledby={`reply-author-${reply.id}`}>
        <div className="reply-header">
          <span className="reply-author" id={`reply-author-${reply.id}`}>
            <AddressDisplay address={reply.author} displayName={reply.displayName} showDM linkToProfile />
          </span>
          <time
            className="reply-time"
            dateTime={new Date(reply.createdAt * 1000).toISOString()}
          >
            {formatRelativeTime(reply.createdAt)}
          </time>
          <div className="reply-status">
            <SpamBadge contentId={reply.id} />
          </div>
        </div>

        <div className={`reply-content ${reply.bodyLoading ? 'reply-content-loading' : ''}`}>
          {reply.bodyLoading ? (
            <p className="reply-loading-text">
              <span className="reply-loading-spinner">⏳</span>
              Fetching content from network...
            </p>
          ) : (
            <p>{reply.content}</p>
          )}
        </div>

        <div className="reply-actions">
          <button
            type="button"
            className="reply-action"
            aria-label={`Reply to ${reply.author}`}
            onClick={handleReplyClick}
            disabled={showReplyComposer}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
            Reply
          </button>

          {/* Emoji reactions display */}
          {reactions?.reactions && reactions.reactions.length > 0 && (
            <div className="reply-emoji-counts">
              {reactions.reactions.map((ec: EmojiCount) => (
                <span key={ec.reactionType} className="reply-emoji-chip">
                  {EMOJI_OPTIONS.find(e => e.code === ec.reactionType)?.emoji || '❓'} {ec.count}
                </span>
              ))}
            </div>
          )}

          {/* React button with emoji picker */}
          <div className="reply-react-container">
            <button
              type="button"
              className="reply-action reply-react-btn"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={contributing || !publicKey}
              aria-expanded={showEmojiPicker}
              aria-haspopup="menu"
            >
              {contributing ? '⏳' : '😀'}
            </button>

            {showEmojiPicker && (
              <div className="reply-emoji-picker" role="menu">
                {EMOJI_OPTIONS.map(({ code, emoji, label }) => (
                  <button
                    key={code}
                    type="button"
                    className="reply-emoji-option"
                    onClick={() => handleEmojiSelect(code)}
                    aria-label={label}
                    role="menuitem"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {reactError && (
            <span className="reply-react-error">{reactError}</span>
          )}

          {/* Copy link button */}
          <button
            type="button"
            className="reply-action reply-link-btn"
            onClick={handleCopyLink}
            aria-label="Copy link to this reply"
            title="Copy link"
          >
            {linkCopied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Link
              </>
            )}
          </button>

          {/* Block button */}
          <BlockButton
            id={reply.id}
            type="reply"
            authorId={reply.author}
            variant="icon"
          />

          {/* Report button */}
          <button
            type="button"
            className="reply-action report-btn"
            onClick={() => setShowReportModal(true)}
            aria-label="Report this reply"
            title="Report"
          >
            Report
          </button>
        </div>

        {showReplyComposer && (
          <div className="nested-reply-composer">
            <ReplyComposer
              threadId={threadId}
              parentId={reply.id}
              onSuccess={handleReplySuccess}
              onCancel={handleReplyCancel}
            />
          </div>
        )}

        {/* Report Modal */}
        {showReportModal && (
          <ReportModal
            contentId={reply.id}
            onClose={() => setShowReportModal(false)}
          />
        )}
      </article>

      {hasChildren && (
        <>
          {isAtDepthLimit ? (
            /* At depth limit: show "Continue thread" link instead of inline children */
            <Link
              to={replyLink}
              className="continue-thread-link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
              Continue thread ({totalChildCount} {totalChildCount === 1 ? 'reply' : 'replies'})
            </Link>
          ) : isCollapsed ? (
            <button
              type="button"
              className="expand-button"
              onClick={() => setIsCollapsed(false)}
              aria-expanded={false}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
              Show {fetchedChildCount} more {fetchedChildCount === 1 ? 'reply' : 'replies'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="collapse-button"
                onClick={() => setIsCollapsed(true)}
                aria-expanded={true}
                aria-label="Collapse replies"
              >
                <div className="collapse-line" aria-hidden="true" />
              </button>
              <ReplyTree
                replies={reply.children}
                threadId={threadId}
                spaceId={spaceId}
                depth={depth + 1}
                maxVisibleDepth={maxVisibleDepth}
                focusedReplyId={focusedReplyId}
                onReplySuccess={onReplySuccess}
              />
            </>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Count all nested children recursively
 */
function countAllChildren(reply: ReplyType): number {
  let count = reply.children.length;
  for (const child of reply.children) {
    count += countAllChildren(child);
  }
  return count;
}

/**
 * Check if a reply or any of its descendants has the given ID
 */
function containsReply(reply: ReplyType, targetId: string): boolean {
  if (reply.id === targetId) return true;
  for (const child of reply.children) {
    if (containsReply(child, targetId)) return true;
  }
  return false;
}
