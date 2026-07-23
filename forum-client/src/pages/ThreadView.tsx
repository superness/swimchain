/**
 * Thread view page with deep threaded replies
 * Uses RPC to fetch real content from the node
 */

import { useState } from 'react';
import { linkify } from '../lib/linkify';
import { useParams, Link } from 'react-router-dom';
import { useThread, usePoolContribution, useReplies, useReactions, useSpaces } from '../hooks/useRpc';
import { useSponsorship } from '../hooks/useSponsorship';
import { ImageGallery } from '../components/ImageGallery';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { usePassphraseStore } from '../hooks/usePassphraseStore';
import { ContentStatus } from '../components/ContentStatus';
import { ReplyTree } from '../components/ReplyTree';
import { ReplyComposer } from '../components/ReplyComposer';
import { AddressDisplay } from '../components/AddressDisplay';
import { ReportModal, SpamBadge } from '../components/ReportModal';
import { EncryptedContent, EncryptedBadge } from '../components/EncryptedContent';
import { isEncrypted } from '../lib/encryption';
import { formatRelativeTime, formatDateTime } from '../utils/time';
import { REACTION_EMOJIS, REACTION_CODES, ReactionType } from '../types';
import { formatErrorMessage, getErrorAction, isAuthenticationError } from '../lib/errorMessages';
import './ThreadView.css';

export function ThreadView(): JSX.Element {
  const { spaceId, threadId, replyId } = useParams<{ spaceId: string; threadId: string; replyId?: string }>();
  const { thread, loading, error, fetching } = useThread(threadId || '');
  const { replies, loading: repliesLoading, fetching: repliesFetching, error: repliesError, refetch: refetchReplies } = useReplies(threadId || '');
  const { reactions, refetch: refetchReactions } = useReactions(threadId || '');
  const { identity } = useIdentityContext();
  const { sign: nodeSign } = useNodeIdentity();
  const { contribute, contributing, progress, error: poolError } = usePoolContribution();
  const { isSponsored } = useSponsorship();
  const { getPassphrase } = usePassphraseStore();
  const [contributionStatus, setContributionStatus] = useState<string | null>(null);
  const [contributionPhase, setContributionPhase] = useState<'idle' | 'connecting' | 'mining' | 'submitting' | 'done'>('idle');
  const [showReportModal, setShowReportModal] = useState(false);
  const [decryptedTitle, setDecryptedTitle] = useState<string | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [activePassphrase, setActivePassphrase] = useState<string | null>(null);

  // Check if content is encrypted
  const contentIsEncrypted = thread?.content ? isEncrypted(thread.content) : false;

  // Displayed title - use decrypted if available
  const displayTitle = decryptedTitle || thread?.title || 'Thread';
  const displayContent = decryptedContent || thread?.content || '';

  // Breadcrumb space name: prefer the resolved name, fall back to a short id.
  const { spaces } = useSpaces();
  const spaceName =
    spaces.find((s) => s.id === spaceId)?.name ??
    (spaceId ? `Space ${spaceId.substring(0, 12)}...` : 'Space');

  if (loading) {
    return (
      <div className="thread-view">
        <div className="loading-state">Loading thread...</div>
      </div>
    );
  }

  if (fetching) {
    return (
      <div className="thread-view">
        <div className="loading-state">
          <p>Fetching content from network...</p>
          <p className="loading-hint">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  if (error) {
    const friendlyError = formatErrorMessage(error);
    const errorAction = getErrorAction(error);
    const isAuthError = isAuthenticationError(error);

    return (
      <div className="thread-not-found">
        <div className="error-icon" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1>Content Unavailable</h1>
        <p className="error-message">{friendlyError}</p>
        {errorAction && <p className="error-action">{errorAction}</p>}
        <div className="error-actions">
          <Link to={spaceId ? `/spaces/${spaceId}` : '/spaces'} className="btn btn-secondary">
            Back to Space
          </Link>
          {isAuthError && (
            <Link to="/identity" className="btn btn-primary">
              Set Up Identity
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="thread-not-found">
        <h1>Thread Not Found</h1>
        <p>The thread you're looking for doesn't exist or has decayed.</p>
        <Link to={spaceId ? `/spaces/${spaceId}` : '/spaces'} className="btn btn-primary">
          Back to Space
        </Link>
      </div>
    );
  }

  // Handle reaction - accepts emoji string from ContentStatus
  const handleReact = async (emoji: string) => {
    if (!threadId || !identity) {
      setContributionStatus('Please create an identity first');
      return;
    }

    // Find reaction type from emoji and get numeric code
    const reactionEntry = Object.entries(REACTION_EMOJIS).find(([, e]) => e === emoji);
    const reactionType = reactionEntry?.[0] as ReactionType | undefined;
    const emojiCode = reactionType ? REACTION_CODES[reactionType] : undefined;

    if (!emojiCode) {
      console.error('[React] Unknown emoji:', emoji);
      setContributionStatus('Unknown reaction type');
      return;
    }

    // Gate on sponsorship BEFORE mining — the node rejects unsponsored engagements
    // (SPEC_11), so mining first only wastes proof-of-work.
    if (isSponsored === false) {
      setContributionStatus('You need a sponsor before you can react. Redeem an invite or request sponsorship first — no proof-of-work is spent until then.');
      return;
    }

    setContributionPhase('connecting');
    setContributionStatus('Adding your reaction...');

    // Use a moderate 10s contribution per reaction
    const seconds = 10;

    try {
      // Use node signing - nodeSign returns Uint8Array | null
      const signFn = async (message: Uint8Array): Promise<Uint8Array> => {
        const sig = await nodeSign(message);
        if (!sig) throw new Error('Failed to sign message');
        return sig;
      };

      const result = await contribute(
        threadId,
        seconds,
        identity.publicKey,
        signFn,
        emojiCode
      );

      if (result.success) {
        setContributionPhase('done');
        setContributionStatus('Reaction added!');

        // Refetch reactions to show updated count
        refetchReactions();

        setTimeout(() => {
          setContributionStatus(null);
          setContributionPhase('idle');
        }, 2000);
      } else {
        setContributionPhase('idle');
        setContributionStatus('Failed - try again');
      }
    } catch (err) {
      console.error('[React] Contribution error:', err);
      setContributionPhase('idle');
      setContributionStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Derive display status based on state - no setState in render
  const displayStatus = (() => {
    if (!contributing) {
      return contributionStatus;
    }
    if (progress.attempts > 0) {
      return `Mining PoW... ${progress.attempts} hashes (${(progress.elapsedMs / 1000).toFixed(1)}s)`;
    }
    return contributionStatus || 'Connecting to pool...';
  })();

  return (
    <article className="thread-view">
      <nav className="thread-breadcrumb" aria-label="Breadcrumb">
        <Link to="/spaces">Spaces</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/spaces/${spaceId}`}>{spaceName}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{displayTitle}</span>
      </nav>

      <header className="thread-header">
        <h1>
          {displayTitle}
          {contentIsEncrypted && !decryptedContent && <EncryptedBadge />}
          <SpamBadge contentId={thread.id} />
        </h1>
        <div className="thread-meta">
          <span className="thread-author">
            Posted by <AddressDisplay address={thread.author} displayName={thread.displayName} showDM linkToProfile />
          </span>
          <time
            dateTime={new Date(thread.createdAt * 1000).toISOString()}
            title={formatDateTime(thread.createdAt)}
          >
            {formatRelativeTime(thread.createdAt)}
          </time>
          <button
            className="report-btn"
            onClick={() => setShowReportModal(true)}
            title="Report this content"
          >
            Report
          </button>
        </div>
      </header>

      <div className="thread-content">
        <div className="thread-body">
          {contentIsEncrypted ? (
            <EncryptedContent
              contentId={thread.id}
              encryptedBody={thread.content}
              encryptedTitle={thread.title}
              onDecrypted={(title, body) => {
                setDecryptedTitle(title);
                setDecryptedContent(body);
                // Get the passphrase from store after successful decryption
                const pass = getPassphrase(thread.id);
                setActivePassphrase(pass);
              }}
              onLocked={() => {
                // Clear decrypted state when user locks content
                setDecryptedTitle(null);
                setDecryptedContent(null);
                setActivePassphrase(null);
              }}
            />
          ) : (
            <p>{linkify(displayContent)}</p>
          )}
          {thread.mediaRefs && thread.mediaRefs.length > 0 && (
            <ImageGallery
              mediaRefs={thread.mediaRefs}
              encryptionPassphrase={contentIsEncrypted ? activePassphrase ?? undefined : undefined}
            />
          )}
        </div>

        <aside className="thread-sidebar">
          {/* Reactions */}
          <ContentStatus
            onReact={identity ? handleReact : undefined}
            isReacting={contributing}
            emojiCounts={reactions?.reactions}
            createdAt={thread.createdAt}
          />

          {/* Status messages */}
          {displayStatus && (
            <p className={`contribution-status ${contributing ? 'mining' : contributionPhase === 'done' ? 'success' : ''}`}>
              {displayStatus}
            </p>
          )}
          {poolError && (
            <p className="contribution-error">{poolError}</p>
          )}
          {!identity && (
            <div className="react-prompt">
              <Link to="/identity" className="btn btn-secondary btn-sm">
                Create identity to react
              </Link>
            </div>
          )}

          <div className="sidebar-section sidebar-stats">
            <h3>Thread Stats</h3>
            <dl className="thread-stats">
              <div>
                <dt>Replies</dt>
                <dd>{thread.replyCount}</dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>{formatRelativeTime(thread.lastEngagement)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <section className="thread-replies" aria-labelledby="replies-heading">
        <h2 id="replies-heading">
          {thread.replyCount} {thread.replyCount === 1 ? 'Reply' : 'Replies'}
          {repliesFetching && (
            <span className="replies-fetching-badge">
              <span className="fetching-spinner">⏳</span>
              Syncing from network...
            </span>
          )}
        </h2>

        {repliesLoading ? (
          <p className="loading-replies">Loading replies...</p>
        ) : repliesError ? (
          <p className="replies-error">Error loading replies: {repliesError}</p>
        ) : replies.length > 0 ? (
          <ReplyTree
            replies={replies}
            threadId={thread.id}
            spaceId={spaceId}
            focusedReplyId={replyId}
            onReplySuccess={refetchReplies}
          />
        ) : (
          <p className="no-replies">No replies yet. Be the first to respond!</p>
        )}
      </section>

      <section className="reply-section" aria-labelledby="reply-heading">
        <h2 id="reply-heading" className="visually-hidden">Post a Reply</h2>
        {contentIsEncrypted && !decryptedContent ? (
          <div className="reply-prompt card">
            <p>Unlock the encrypted content to reply to this thread.</p>
          </div>
        ) : identity ? (
          <ReplyComposer threadId={thread.id} onSuccess={refetchReplies} />
        ) : (
          <div className="reply-prompt card">
            <p>Create an identity to participate in this discussion.</p>
            <Link to="/identity" className="btn btn-primary">
              Create Identity
            </Link>
          </div>
        )}
      </section>

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          contentId={thread.id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </article>
  );
}
