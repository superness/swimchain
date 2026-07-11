/**
 * Post - Single post detail view with replies
 *
 * Displays a post and its reply tree with ability to add replies.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useThread, useReplies, useReplySubmit, usePrivateContent, usePrivateSpaceIds, isPrivateCiphertext, stripTitleSeparator, useMediaUpload } from '../hooks/useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { useBlocklist } from '../hooks/useBlocklist';
import { useReplyPow } from '../hooks/useActionPow';
import { useSponsorship } from '../hooks/useSponsorship';
import { solutionToRpcParams } from '../lib/action-pow';
import { PowProgress } from '../components/PowProgress';
import { SpamBadge, ReportModal } from '../components/ReportModal';
import { ImageGallery } from '../components/ImageGallery';
import './Post.css';

// Use the Reply type from types, but re-define for clarity in this component
interface LocalReply {
  id: string;
  author: string;
  content: string;
  createdAt: number;
  children: LocalReply[];
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Format full datetime
 */
function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Reply item component
 */
function ReplyItem({
  reply,
  depth = 0,
  onReply,
  decrypted = {},
}: {
  reply: LocalReply;
  depth?: number;
  onReply: (parentId: string) => void;
  /** Node-decrypted reply bodies keyed by reply id (private-space, node mode). */
  decrypted?: Record<string, string>;
}): JSX.Element {
  const maxDepth = 4;
  const actualDepth = Math.min(depth, maxDepth);
  const displayContent = decrypted[reply.id]
    ?? (isPrivateCiphertext(reply.content) ? '🔒 Encrypted — decrypting…' : reply.content);

  return (
    <div
      className="reply-item"
      style={{ '--depth': actualDepth } as React.CSSProperties}
    >
      <div className="reply-header">
        <span className="reply-author">
          {truncateAddress(reply.author)}
        </span>
        <time
          className="reply-time"
          dateTime={new Date(reply.createdAt * 1000).toISOString()}
          title={formatDateTime(reply.createdAt)}
        >
          {formatRelativeTime(reply.createdAt)}
        </time>
      </div>

      <div className="reply-content">
        {displayContent || <span className="reply-empty">Content loading...</span>}
      </div>

      <div className="reply-actions">
        <button
          type="button"
          className="reply-action-btn"
          onClick={() => onReply(reply.id)}
        >
          Reply
        </button>
      </div>

      {reply.children && reply.children.length > 0 && (
        <div className="reply-children">
          {reply.children.map(child => (
            <ReplyItem
              key={child.id}
              reply={child}
              depth={depth + 1}
              onReply={onReply}
              decrypted={decrypted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Reply composer component
 */
function ReplyComposer({
  onSubmit,
  onCancel,
  disabled,
}: {
  onSubmit: (body: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}): JSX.Element {
  const [body, setBody] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim()) {
      onSubmit(body.trim());
    }
  };

  return (
    <form className="reply-composer" onSubmit={handleSubmit}>
      <textarea
        className="reply-textarea"
        placeholder="Write a reply..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={disabled}
        rows={3}
        maxLength={4096}
        autoFocus
      />
      <div className="reply-composer-actions">
        <span className="reply-char-count">{body.length}/4096</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={disabled || !body.trim()}
        >
          Reply
        </button>
      </div>
    </form>
  );
}

export function Post(): JSX.Element {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  const { thread: post, loading, error, fetching } = useThread(postId || '');
  const { replies, loading: repliesLoading, fetching: repliesFetching, refetch: refetchReplies } = useReplies(postId || '');
  const { getMediaUrl } = useMediaUpload();

  const { identity, hasValidIdentity, mode } = useIdentityContext();
  // Node-managed private-space crypto (desktop mode): encrypt/decrypt via the node.
  const { encryptForSpace, decryptForSpace } = usePrivateContent();
  const privateSpaceIds = usePrivateSpaceIds(identity?.publicKey);
  const [decryptedPost, setDecryptedPost] = useState<{ title: string; body: string } | null>(null);
  const [decryptedReplies, setDecryptedReplies] = useState<Record<string, string>>({});
  // Sponsorship gate (#8/#11): block replies BEFORE mining PoW if the identity is
  // not sponsored, instead of wasting ~5s of PoW then failing with a generic error.
  const { isSponsored } = useSponsorship();
  // Unified signer: node's sign_message RPC when embedded, browser keypair otherwise.
  const { sign } = useFeedIdentity();
  const { isPostBlocked, isUserBlocked } = useBlocklist();
  const { state: miningState, mineReply, cancel, progress, reset, solution } = useReplyPow();
  const { submitReply, submitting, error: rpcError } = useReplySubmit();

  // Filter out blocked replies and replies from blocked users
  const filteredReplies = useMemo(() => {
    function filterRepliesRecursive(items: typeof replies): typeof replies {
      return items
        .filter(r => !isPostBlocked(r.id) && !isUserBlocked(r.author))
        .map(r => ({
          ...r,
          children: r.children ? filterRepliesRecursive(r.children) : [],
        }));
    }
    return filterRepliesRecursive(replies);
  }, [replies, isPostBlocked, isUserBlocked]);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const replyBodyRef = useRef<string>('');
  const replyParentRef = useRef<string>('');
  const submittedRef = useRef(false);

  // Start replying to a post or reply
  const handleReply = useCallback((parentId: string) => {
    if (!hasValidIdentity) {
      navigate('/identity', { state: { from: { pathname: `/post/${postId}` } } });
      return;
    }
    setReplyingTo(parentId);
    setSubmitError(null);
  }, [hasValidIdentity, navigate, postId]);

  // Cancel replying
  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
    setSubmitError(null);
    reset();
  }, [reset]);

  // Submit reply
  const handleSubmitReply = useCallback(async (body: string) => {
    if (!replyingTo || !identity || !hasValidIdentity) return;

    // Don't burn PoW for an identity the node will reject at the sponsorship gate.
    if (isSponsored === false) {
      setSubmitError('You need a sponsor before you can reply. Ask a member to sponsor you, or redeem an invite to get sponsored.');
      return;
    }

    setSubmitError(null);
    submittedRef.current = false;

    // Private space in node mode: encrypt the reply body via the node, then mine PoW
    // over the CIPHERTEXT (submit_reply binds PoW to sha256(body)).
    let finalBody = body;
    if (mode === 'node' && post?.spaceId && privateSpaceIds.has(post.spaceId)) {
      const cipher = await encryptForSpace(post.spaceId, body);
      if (!cipher) {
        setSubmitError('Could not encrypt your reply for this private space. Are you a member?');
        return;
      }
      finalBody = cipher;
    }

    replyBodyRef.current = finalBody;
    replyParentRef.current = replyingTo;

    // Convert hex public key to Uint8Array for PoW
    const publicKeyBytes = new Uint8Array(
      identity.publicKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );

    try {
      await mineReply(finalBody, publicKeyBytes, true /* testnet */);
    } catch {
      // Mining aborted or failed
    }
  }, [replyingTo, identity, hasValidIdentity, isSponsored, mineReply, mode, post?.spaceId, privateSpaceIds, encryptForSpace]);

  // Handle mining complete
  const handleMiningComplete = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    if (!identity || !solution || !replyParentRef.current) {
      setSubmitError('Missing required data');
      reset();
      return;
    }

    const powParams = solutionToRpcParams(solution);

    try {
      const result = await submitReply(
        replyParentRef.current,
        replyBodyRef.current,
        identity.publicKey,
        sign,
        powParams,
      );

      if (result.success) {
        setReplyingTo(null);
        reset();
        refetchReplies();
      } else {
        setSubmitError('Failed to submit reply');
        reset();
      }
    } catch (err) {
      console.error('[Post] Reply submission error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Submission error');
      reset();
    }
  }, [identity, solution, sign, submitReply, reset, refetchReplies]);

  // Trigger submission when mining completes
  useEffect(() => {
    if (miningState === 'complete' && !submitting && !submittedRef.current) {
      handleMiningComplete();
    }
  }, [miningState, submitting, handleMiningComplete]);

  // Decrypt the post body via the node when it's private-space ciphertext (node mode).
  useEffect(() => {
    if (mode !== 'node' || !post?.spaceId || !isPrivateCiphertext(post.content)) {
      setDecryptedPost(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const plain = await decryptForSpace(post.spaceId as string, stripTitleSeparator(post.content as string));
      if (cancelled || plain == null) return;
      const i = plain.indexOf('\n\n');
      setDecryptedPost(i === -1 ? { title: '', body: plain } : { title: plain.slice(0, i), body: plain.slice(i + 2) });
    })();
    return () => { cancelled = true; };
  }, [mode, post?.spaceId, post?.content, decryptForSpace]);

  // Decrypt private-space replies via the node (node mode), walking the reply tree.
  useEffect(() => {
    if (mode !== 'node' || !post?.spaceId) return;
    const flat: LocalReply[] = [];
    const walk = (items: LocalReply[]) => items.forEach(r => { flat.push(r); if (r.children) walk(r.children); });
    walk(filteredReplies);
    const pending = flat.filter(r => isPrivateCiphertext(r.content) && !decryptedReplies[r.id]);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const r of pending) {
        const plain = await decryptForSpace(post.spaceId as string, stripTitleSeparator(r.content));
        if (plain != null) updates[r.id] = plain;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDecryptedReplies(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [filteredReplies, mode, post?.spaceId, decryptForSpace, decryptedReplies]);

  const isMining = miningState === 'mining';

  // Loading state
  if (loading) {
    return (
      <div className="post-page">
        <div className="post-loading">Loading post...</div>
      </div>
    );
  }

  // Fetching from network
  if (fetching) {
    return (
      <div className="post-page">
        <div className="post-loading">
          <p>Fetching content from network...</p>
          <p className="post-loading-hint">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  // Blocked post
  if (post && (isPostBlocked(post.id ?? postId ?? '') || isUserBlocked(post.author))) {
    return (
      <div className="post-page">
        <div className="post-error">
          <h2>Content Hidden</h2>
          <p>This post is from a blocked user or has been blocked.</p>
          <Link to="/" className="btn btn-primary">
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !post) {
    return (
      <div className="post-page">
        <div className="post-error">
          <h2>Post Not Found</h2>
          <p>{error || 'The post you\'re looking for doesn\'t exist or has decayed.'}</p>
          <Link to="/" className="btn btn-primary">
            Back to Feed
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="post-page">
      {/* Header */}
      <header className="post-page__header">
        <button
          type="button"
          className="post-page__back"
          onClick={() => navigate(-1)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
      </header>

      {/* Post Content */}
      <article className="post-detail">
        <header className="post-detail__header">
          {(decryptedPost?.title || post.title) && (
            <h1 className="post-detail__title">{decryptedPost?.title || post.title}</h1>
          )}
          <SpamBadge contentId={post.id ?? postId ?? ''} />
          <div className="post-detail__meta">
            <Link
              to={`/profile/${post.author}`}
              className="post-detail__author"
            >
              {truncateAddress(post.author)}
            </Link>
            <time
              className="post-detail__time"
              dateTime={new Date(post.createdAt * 1000).toISOString()}
              title={formatDateTime(post.createdAt)}
            >
              {formatRelativeTime(post.createdAt)}
            </time>
            {post.spaceId && (
              <Link
                to={`/space/${post.spaceId}`}
                className="post-detail__space"
              >
                in {truncateAddress(post.spaceId)}
              </Link>
            )}
          </div>
        </header>

        <div className="post-detail__content">
          {decryptedPost
            ? decryptedPost.body
            : isPrivateCiphertext(post.content)
              ? <em>🔒 Encrypted — decrypting…</em>
              : post.content}
        </div>

        {/* Attached images (the detail page previously never rendered media) */}
        {post.mediaRefs && post.mediaRefs.length > 0 && (
          <ImageGallery
            mediaRefs={post.mediaRefs}
            thumbnailMode={false}
            getMediaUrl={getMediaUrl}
          />
        )}

        <footer className="post-detail__footer">
          <button
            type="button"
            className="post-action-btn"
            onClick={() => handleReply(postId!)}
            disabled={isMining || submitting}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Reply
          </button>
          <span className="post-reply-count">
            {filteredReplies.length} {filteredReplies.length === 1 ? 'reply' : 'replies'}
          </span>
          {identity && post.author !== identity.publicKey && (
            <button
              type="button"
              className="post-action-btn post-action-btn--danger"
              onClick={() => setShowReportModal(true)}
            >
              Report
            </button>
          )}
        </footer>
      </article>

      {/* Reply Composer for post */}
      {replyingTo === postId && (
        <div className="post-reply-composer">
          <h3>Reply to post</h3>

          {isMining ? (
            <div className="reply-mining">
              <PowProgress
                attempts={progress.attempts}
                elapsedMs={progress.elapsedMs}
                difficulty={10}
                onCancel={cancel}
              />
            </div>
          ) : submitting ? (
            <div className="reply-submitting">Submitting reply...</div>
          ) : (
            <ReplyComposer
              onSubmit={handleSubmitReply}
              onCancel={handleCancelReply}
              disabled={isMining || submitting}
            />
          )}

          {(submitError || rpcError) && (
            <p className="reply-error">{submitError || rpcError}</p>
          )}
        </div>
      )}

      {/* Replies Section */}
      <section className="post-replies">
        <h2 className="post-replies__title">
          {repliesLoading ? 'Loading replies...' : (
            <>Replies ({filteredReplies.length})</>
          )}
          {repliesFetching && <span className="fetching-indicator"> (fetching...)</span>}
        </h2>

        {filteredReplies.length === 0 && !repliesLoading ? (
          <div className="post-no-replies">
            <p>No replies yet. Be the first to reply!</p>
          </div>
        ) : (
          <div className="reply-tree">
            {filteredReplies.map(reply => (
              <div key={reply.id}>
                <ReplyItem
                  reply={reply as unknown as LocalReply}
                  onReply={handleReply}
                  decrypted={decryptedReplies}
                />

                {/* Reply composer for this reply */}
                {replyingTo === reply.id && (
                  <div className="nested-reply-composer" style={{ marginLeft: '1rem' }}>
                    {isMining ? (
                      <div className="reply-mining">
                        <PowProgress
                          attempts={progress.attempts}
                          elapsedMs={progress.elapsedMs}
                          difficulty={10}
                          onCancel={cancel}
                        />
                      </div>
                    ) : submitting ? (
                      <div className="reply-submitting">Submitting reply...</div>
                    ) : (
                      <ReplyComposer
                        onSubmit={handleSubmitReply}
                        onCancel={handleCancelReply}
                        disabled={isMining || submitting}
                      />
                    )}

                    {(submitError || rpcError) && (
                      <p className="reply-error">{submitError || rpcError}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          contentId={post.id ?? postId ?? ''}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}
