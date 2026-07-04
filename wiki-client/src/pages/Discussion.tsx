/**
 * Discussion - Talk page for a wiki page (like Wikipedia talk pages).
 * Shows threaded replies and provides a reply form with PoW.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import { useWikiPage } from '../hooks/useWikiPage';
import {
  ActionType,
  createChallenge,
  computePow,
  solutionToRpcParams,
  hexToBytes,
  bytesToHex,
  TESTNET_DIFFICULTY,
  TESTNET_CONFIG,
  type PoWSolution,
} from '@swimchain/frontend';
import { useWikiIdentity } from '../hooks/useWikiIdentity';
import { renderMarkdown } from '../lib/markdown';
import { decodeRevisionBody } from '../lib/revision';
import { ReportModal } from '../components/ReportModal';
import './Discussion.css';

interface DiscussionReply {
  id: string;
  author: string;
  authorAddress: string;
  body: string;
  timestamp: number;
  parentId: string | null;
  children: DiscussionReply[];
}

interface RpcContentSummary {
  content_id: string;
  content_type: string;
  author_id: string;
  space_id: string;
  parent_id: string | null;
  created_at: number;
  last_engagement: number;
  title: string | null;
  body: string | null;
  body_preview: string | null;
  engagement_count: number;
  reply_count: number;
  display_name?: string;
}

interface RpcListContentResult {
  items: RpcContentSummary[];
  total: number;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDateTime(timestamp);
}

/** Build a tree of replies from a flat list */
function buildReplyTree(items: RpcContentSummary[], pageId: string): DiscussionReply[] {
  const map = new Map<string, DiscussionReply>();
  const roots: DiscussionReply[] = [];

  // Create nodes
  for (const item of items) {
    map.set(item.content_id, {
      id: item.content_id,
      author: item.display_name ?? item.author_id,
      authorAddress: item.author_id,
      body: item.body ?? item.body_preview ?? '',
      timestamp: item.created_at,
      parentId: item.parent_id,
      children: [],
    });
  }

  // Build tree
  for (const node of map.values()) {
    if (node.parentId === pageId || !node.parentId) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphaned reply — add to roots
        roots.push(node);
      }
    }
  }

  // Sort each level by timestamp ascending (oldest first, like a talk page)
  function sortTree(nodes: DiscussionReply[]) {
    nodes.sort((a, b) => a.timestamp - b.timestamp);
    for (const node of nodes) {
      sortTree(node.children);
    }
  }
  sortTree(roots);

  return roots;
}

/** Recursive reply thread component */
function ReplyThread({
  reply,
  depth,
  onReply,
  onReport,
}: {
  reply: DiscussionReply;
  depth: number;
  onReply: (parentId: string) => void;
  onReport: (contentId: string) => void;
}): JSX.Element {
  return (
    <div className={`disc-reply${depth > 0 ? ' disc-reply--nested' : ''}`}>
      <div className="disc-reply__header">
        <span className="disc-reply__author" title={reply.authorAddress}>
          {truncateAddress(reply.authorAddress)}
        </span>
        <span className="disc-reply__time" title={formatDateTime(reply.timestamp)}>
          {formatRelative(reply.timestamp)}
        </span>
        <button
          className="disc-reply__reply-btn"
          onClick={() => onReply(reply.id)}
          title="Reply to this comment"
        >
          Reply
        </button>
        <button
          className="disc-reply__reply-btn"
          onClick={() => onReport(reply.id)}
          title="Report this comment"
        >
          Report
        </button>
      </div>
      <div
        className="disc-reply__body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.body) }}
      />
      {reply.children.length > 0 && (
        <div className="disc-reply__children">
          {reply.children.map(child => (
            <ReplyThread
              key={child.id}
              reply={child}
              depth={depth + 1}
              onReply={onReply}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type MiningState = 'idle' | 'mining' | 'submitting' | 'done' | 'error';

export function Discussion(): JSX.Element {
  const { namespaceId, pageId } = useParams<{ namespaceId: string; pageId: string }>();
  const { rpc, connected } = useRpc();
  const { data: page } = useWikiPage(pageId ?? null);
  const identity = useWikiIdentity();

  const [replies, setReplies] = useState<DiscussionReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportContentId, setReportContentId] = useState<string | null>(null);

  // Reply form state
  const [replyBody, setReplyBody] = useState('');
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [miningState, setMiningState] = useState<MiningState>('idle');
  const [miningProgress, setMiningProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pageTitle = page?.title ?? 'Page';

  const fetchReplies = useCallback(async () => {
    if (!rpc || !connected || !namespaceId || !pageId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await rpc.call<RpcListContentResult>('list_space_content', {
        space_id: namespaceId,
        content_type: 'Reply',
        limit: 200,
        offset: 0,
        sort: 'recent',
      });

      // Filter to only replies under this page, excluding revision replies
      // (page edits carry the wiki-revision header — they belong in History)
      const nonRevisionItems = result.items.filter(
        item => !decodeRevisionBody(item.body ?? item.body_preview ?? '').isRevision
      );
      const pageReplies = nonRevisionItems.filter(item => {
        if (item.parent_id === pageId) return true;
        // Also include nested replies whose parent is already in the set
        const parentIds = new Set(nonRevisionItems.map(i => i.content_id));
        return parentIds.has(item.parent_id ?? '');
      });

      setReplies(buildReplyTree(pageReplies, pageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load discussion');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, namespaceId, pageId]);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const handleReplyTo = (parentId: string) => {
    setReplyParentId(parentId);
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleCancelReply = () => {
    setReplyParentId(null);
    setReplyBody('');
    setMiningState('idle');
    setSubmitError(null);
    cancelledRef.current = true;
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || !rpc || !connected || !identity.hasIdentity || !identity.publicKey || !pageId) return;

    const authorPublicKey = identity.publicKey;
    const targetParentId = replyParentId ?? pageId;
    cancelledRef.current = false;
    setSubmitError(null);
    setMiningState('mining');
    setMiningProgress(0);

    try {
      // Create PoW challenge for reply.
      // IMPORTANT: mine over the exact body bytes submitted — the node
      // re-hashes params.body in verify_pow_submission, so any prefix here
      // makes the content hash mismatch and every comment gets rejected
      // with "PoW verification failed".
      const contentBytes = new TextEncoder().encode(replyBody.trim());
      const authorPubkey = hexToBytes(authorPublicKey);
      const difficulty = TESTNET_DIFFICULTY[ActionType.Reply];
      const challenge = await createChallenge(ActionType.Reply, contentBytes, authorPubkey, difficulty);

      // Mine PoW
      const solution: PoWSolution = await computePow(
        challenge,
        TESTNET_CONFIG,
        (attempts: number) => {
          setMiningProgress(attempts);
        },
        () => cancelledRef.current,
      );

      if (cancelledRef.current) {
        setMiningState('idle');
        return;
      }

      setMiningState('submitting');

      // Build PoW params
      const powParams = solutionToRpcParams(solution);

      // Sign the reply via the unified signer: the node's sign_message RPC when
      // embedded in the desktop shell, or the local WASM keypair when
      // standalone. The signed bytes are identical in both modes — only WHO
      // holds the key changes, so the PoW/hash contract (PR #45) is untouched.
      const timestamp = powParams.timestamp;
      const signMessage = new TextEncoder().encode(
        `reply:${targetParentId}:${replyBody.trim()}:${timestamp}`
      );
      const signature = await identity.sign(signMessage);
      if (!signature) {
        throw new Error('Signing failed — identity unavailable.');
      }
      const signatureHex = bytesToHex(signature);

      // Submit via RPC
      await rpc.call('submit_reply', {
        parent_id: targetParentId,
        body: replyBody.trim(),
        author_id: authorPublicKey,
        pow_nonce: powParams.pow_nonce,
        pow_difficulty: powParams.pow_difficulty,
        pow_nonce_space: powParams.pow_nonce_space,
        pow_hash: powParams.pow_hash,
        signature: signatureHex,
        timestamp,
      });

      setReplyBody('');
      setReplyParentId(null);
      setMiningState('done');

      // Refresh replies
      setTimeout(() => {
        fetchReplies();
        setMiningState('idle');
      }, 1000);
    } catch (err) {
      if (cancelledRef.current) {
        setMiningState('idle');
        return;
      }
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit reply');
      setMiningState('error');
    }
  };

  const totalReplies = replies.reduce(function countAll(sum, r): number {
    return r.children.reduce(countAll, sum + 1);
  }, 0);

  return (
    <div className="disc-page">
      <div className="wiki-breadcrumbs">
        <Link to="/">Home</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <Link to={`/ns/${namespaceId}`}>Namespace</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <Link to={`/ns/${namespaceId}/page/${pageId}`}>{pageTitle}</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <span>Discussion</span>
      </div>

      <div className="wiki-tabs">
        <Link to={`/ns/${namespaceId}/page/${pageId}`} className="wiki-tab">Read</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/edit`} className="wiki-tab">Edit</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/history`} className="wiki-tab">History</Link>
        <Link to={`/ns/${namespaceId}/page/${pageId}/discuss`} className="wiki-tab wiki-tab--active">Discuss</Link>
      </div>

      <h1 className="wiki-page-title">
        Discussion: {pageTitle}
      </h1>

      <p className="disc-page__subtitle">
        {totalReplies} comment{totalReplies !== 1 ? 's' : ''} on this page
      </p>

      {loading && <div className="wiki-loading">Loading discussion...</div>}

      {error && (
        <div className="disc-page__error">
          <p>{error}</p>
          <button className="wiki-btn" onClick={fetchReplies}>Retry</button>
        </div>
      )}

      {/* Threaded replies */}
      {!loading && !error && replies.length === 0 && (
        <div className="wiki-empty">
          <div className="wiki-empty__title">No discussion yet</div>
          <p>Be the first to start a discussion about this page.</p>
        </div>
      )}

      {!loading && replies.length > 0 && (
        <div className="disc-page__threads">
          {replies.map(reply => (
            <ReplyThread
              key={reply.id}
              reply={reply}
              depth={0}
              onReply={handleReplyTo}
              onReport={setReportContentId}
            />
          ))}
        </div>
      )}

      {/* Report modal (spam attestation, SPEC_12 §3) */}
      {reportContentId && (
        <ReportModal contentId={reportContentId} onClose={() => setReportContentId(null)} />
      )}

      {/* Reply form */}
      <div className="disc-page__reply-form">
        <h2 className="disc-page__reply-heading">
          {replyParentId ? 'Reply to comment' : 'Add a comment'}
        </h2>

        {replyParentId && (
          <div className="disc-page__replying-to">
            Replying to a specific comment.{' '}
            <button className="disc-page__cancel-reply" onClick={() => setReplyParentId(null)}>
              Reply to page instead
            </button>
          </div>
        )}

        {!identity.hasIdentity && identity.mode !== 'node' && (
          <div className="disc-page__identity-notice">
            <Link to="/identity">Create or load an identity</Link> to participate in discussions.
          </div>
        )}

        <form onSubmit={handleSubmitReply}>
          <textarea
            ref={textareaRef}
            className="disc-page__textarea"
            placeholder="Write your comment (Markdown supported)..."
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            disabled={!identity.hasIdentity || miningState === 'mining' || miningState === 'submitting'}
            rows={5}
          />

          {miningState === 'mining' && (
            <div className="disc-page__mining">
              Mining proof-of-work... ({miningProgress.toLocaleString()} attempts)
              <button
                type="button"
                className="wiki-btn wiki-btn--small wiki-btn--danger"
                onClick={handleCancelReply}
              >
                Cancel
              </button>
            </div>
          )}

          {miningState === 'submitting' && (
            <div className="disc-page__mining">
              Submitting to network...
            </div>
          )}

          {miningState === 'done' && (
            <div className="disc-page__success">
              Comment posted successfully.
            </div>
          )}

          {(submitError || miningState === 'error') && (
            <div className="disc-page__submit-error">
              {submitError ?? 'An error occurred. Please try again.'}
            </div>
          )}

          <div className="disc-page__form-actions">
            {replyParentId && (
              <button type="button" className="wiki-btn" onClick={handleCancelReply}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="wiki-btn wiki-btn--primary"
              disabled={!replyBody.trim() || !identity.hasIdentity || miningState === 'mining' || miningState === 'submitting'}
            >
              Post Comment
            </button>
          </div>

          <p className="disc-page__hint">
            Posting requires proof-of-work mining (~30 seconds).
          </p>
        </form>
      </div>
    </div>
  );
}
