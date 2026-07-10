/**
 * Wiki Page Edit - Markdown editor with live preview, toolbar, and real PoW submission.
 *
 * For new pages: mines Post PoW, calls submit_post RPC.
 * For edits: mines Reply PoW, calls submit_reply RPC (edits are revisions).
 */

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useCallback, useRef, useMemo } from 'react';
import { useWikiPage } from '../hooks/useWikiPage';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import { useRpc } from '../hooks/useRpc';
import {
  ActionType,
  createChallenge,
  computePow,
  solutionToRpcParams,
  getDifficulty,
  getConfig,
  hexToBytes,
} from '@swimchain/frontend';
import { useWikiIdentity } from '../hooks/useWikiIdentity';
import { useIsSponsored } from '../hooks/useIsSponsored';
import { renderMarkdown } from '../lib/markdown';
import { parseWikiLinks } from '../lib/wikilinks';
import { encodeRevisionBody } from '../lib/revision';
import './WikiPageEdit.css';

type MiningState = 'idle' | 'mining' | 'submitting' | 'complete' | 'error' | 'cancelled';

interface MiningProgress {
  attempts: number;
  elapsedMs: number;
  hashRate: number;
}

function truncateAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.substring(0, 10)}...${addr.substring(addr.length - 6)}`;
}

export function WikiPageEdit(): JSX.Element {
  const { namespaceId, pageId } = useParams<{ namespaceId: string; pageId: string }>();
  const navigate = useNavigate();
  const { rpc, connected } = useRpc();
  const identity = useWikiIdentity();
  const isSponsored = useIsSponsored();
  const { data: namespaces } = useWikiNamespaces();
  const isNew = !pageId;

  // For edits, load the existing page content
  const { data: existingPage, loading: pageLoading } = useWikiPage(isNew ? null : (pageId ?? null));

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [miningState, setMiningState] = useState<MiningState>('idle');
  const [progress, setProgress] = useState<MiningProgress>({ attempts: 0, elapsedMs: 0, hashRate: 0 });
  const [initialized, setInitialized] = useState(false);
  const cancelledRef = useRef(false);

  // Initialize editor with existing page content (for edits)
  if (!isNew && existingPage && !initialized && !pageLoading) {
    setTitle(existingPage.title);
    setContent(existingPage.content);
    setInitialized(true);
  }

  // Namespace name
  const namespaceName = useMemo(() => {
    const ns = namespaces.find((n) => n.id === namespaceId);
    return ns?.name ?? truncateAddr(namespaceId ?? '');
  }, [namespaces, namespaceId]);

  // Live preview
  const previewHtml = useMemo(() => {
    if (!content.trim()) return '';
    const html = renderMarkdown(content);
    return parseWikiLinks(html, []);
  }, [content]);

  // Toolbar actions
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertAtCursor = useCallback((before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);
    const replacement = `${before}${selected || 'text'}${after}`;

    const newContent = content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    // Restore focus and selection
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + before.length;
      textarea.setSelectionRange(cursorPos, cursorPos + (selected || 'text').length);
    });
  }, [content]);

  const handleBold = useCallback(() => insertAtCursor('**', '**'), [insertAtCursor]);
  const handleItalic = useCallback(() => insertAtCursor('*', '*'), [insertAtCursor]);
  const handleHeading = useCallback(() => insertAtCursor('## ', ''), [insertAtCursor]);
  const handleLink = useCallback(() => insertAtCursor('[', '](url)'), [insertAtCursor]);
  const handleCode = useCallback(() => insertAtCursor('`', '`'), [insertAtCursor]);
  const handleList = useCallback(() => insertAtCursor('- ', ''), [insertAtCursor]);
  const handleWikiLink = useCallback(() => insertAtCursor('[[', ']]'), [insertAtCursor]);

  // Submit handler — mines PoW then submits via RPC
  const handleSubmit = useCallback(async () => {
    if (!identity.hasIdentity || !identity.publicKey) {
      setSubmitError('Identity required — go to Identity page first.');
      return;
    }
    const authorPublicKey = identity.publicKey;
    if (!rpc || !connected) {
      setSubmitError('Not connected to node.');
      return;
    }
    // Gate on sponsorship BEFORE spending PoW — the node rejects unsponsored posts
    // (SPEC_11), so mining first only wastes the user's time.
    if (isSponsored === false) {
      setSubmitError(
        'You need a sponsor before you can create or edit pages. Redeem an invite or request sponsorship — no proof-of-work is spent until then.'
      );
      return;
    }
    if (!namespaceId) {
      setSubmitError('No namespace selected.');
      return;
    }
    if (isNew && !title.trim()) {
      setSubmitError('Title is required for new pages.');
      return;
    }
    if (!content.trim()) {
      setSubmitError('Page content cannot be empty.');
      return;
    }

    setSubmitError(null);
    cancelledRef.current = false;

    // Determine action type: new page = Post, edit = Reply (revision reply)
    const actionType = isNew ? ActionType.Post : ActionType.Reply;
    const difficulty = getDifficulty(actionType, true /* testnet */);
    const config = getConfig(true /* testnet */);

    // Edits are submitted as revision replies: the body carries a
    // machine-readable header with the edit summary (see lib/revision.ts)
    // so revisions are distinguishable from discussion comments.
    const revisionBody = isNew ? '' : encodeRevisionBody(content.trim(), summary.trim());

    // Build content to mine over — MUST match the exact bytes the node
    // re-hashes in verify_pow_submission (Post: "title\n\nbody", Reply: body)
    const postContent = isNew
      ? `${title.trim()}\n\n${content.trim()}`
      : revisionBody;

    const contentBytes = new TextEncoder().encode(postContent);
    const authorPubkey = hexToBytes(authorPublicKey);

    setMiningState('mining');
    setProgress({ attempts: 0, elapsedMs: 0, hashRate: 0 });

    try {
      // Create challenge
      const challenge = await createChallenge(
        actionType,
        contentBytes,
        authorPubkey,
        difficulty,
      );

      // Mine PoW
      const solution = await computePow(
        challenge,
        config,
        (attempts, elapsedMs, hashRate) => {
          setProgress({ attempts, elapsedMs, hashRate });
        },
        () => cancelledRef.current,
      );

      if (cancelledRef.current) {
        setMiningState('cancelled');
        return;
      }

      // Convert solution to RPC params
      const powParams = solutionToRpcParams(solution);

      // Sign the content via the unified signer: the node's sign_message RPC
      // when embedded in the desktop shell, or the local WASM keypair when
      // standalone. The signed bytes are identical in both modes — only WHO
      // holds the key changes, so the PoW/hash contract is untouched.
      const signMessage = isNew
        ? `post:${namespaceId}:${title.trim()}:${content.trim()}:${powParams.timestamp}`
        : `reply:${pageId}:${revisionBody}:${powParams.timestamp}`;
      const msgBytes = new TextEncoder().encode(signMessage);
      const signature = await identity.sign(msgBytes);
      if (!signature) {
        throw new Error('Signing failed — identity unavailable.');
      }
      const signatureHex = Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');

      setMiningState('submitting');

      // Submit to RPC
      if (isNew) {
        const result = await rpc.call<{ content_id: string }>('submit_post', {
          space_id: namespaceId,
          title: title.trim(),
          body: content.trim(),
          author_id: authorPublicKey,
          pow_nonce: powParams.pow_nonce,
          pow_difficulty: powParams.pow_difficulty,
          pow_nonce_space: powParams.pow_nonce_space,
          pow_hash: powParams.pow_hash,
          signature: signatureHex,
          timestamp: powParams.timestamp,
        });

        setMiningState('complete');
        navigate(`/ns/${namespaceId}/page/${result.content_id}`);
      } else {
        await rpc.call<{ content_id: string }>('submit_reply', {
          parent_id: pageId,
          body: revisionBody,
          author_id: authorPublicKey,
          pow_nonce: powParams.pow_nonce,
          pow_difficulty: powParams.pow_difficulty,
          pow_nonce_space: powParams.pow_nonce_space,
          pow_hash: powParams.pow_hash,
          signature: signatureHex,
          timestamp: powParams.timestamp,
        });

        setMiningState('complete');
        // The page keeps its original content ID — revisions are replies to it.
        // (Navigating to the revision's content_id would 404 the page view.)
        navigate(`/ns/${namespaceId}/page/${pageId}`);
      }
    } catch (err) {
      if (cancelledRef.current) {
        setMiningState('cancelled');
      } else {
        setMiningState('error');
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
      }
    }
  }, [identity, rpc, connected, namespaceId, pageId, isNew, title, content, summary, navigate, isSponsored]);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    setMiningState('cancelled');
  }, []);

  const handleReset = useCallback(() => {
    cancelledRef.current = false;
    setMiningState('idle');
    setSubmitError(null);
    setProgress({ attempts: 0, elapsedMs: 0, hashRate: 0 });
  }, []);

  const isBusy = miningState === 'mining' || miningState === 'submitting';

  // Loading existing page for edit
  if (!isNew && pageLoading) {
    return (
      <div className="wiki-page-edit">
        <div className="wiki-loading">Loading page content...</div>
      </div>
    );
  }

  return (
    <div className="wiki-page-edit">
      {/* Breadcrumbs */}
      <div className="wiki-breadcrumbs">
        <Link to="/">Home</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <Link to={`/ns/${namespaceId}`}>{namespaceName}</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <span>{isNew ? 'New Page' : 'Editing'}</span>
      </div>

      <h1 className="wiki-page-title">{isNew ? 'Create New Page' : `Editing: ${existingPage?.title ?? 'Page'}`}</h1>

      <div className="wiki-editor">
        {/* Title (new pages only) */}
        {isNew && (
          <input
            type="text"
            className="wiki-editor__title"
            placeholder="Page title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isBusy}
            maxLength={256}
          />
        )}

        {/* Toolbar */}
        <div className="wiki-editor__toolbar">
          <button onClick={handleBold} disabled={isBusy} title="Bold (**text**)">B</button>
          <button onClick={handleItalic} disabled={isBusy} title="Italic (*text*)"><em>I</em></button>
          <button onClick={handleHeading} disabled={isBusy} title="Heading (## text)">H</button>
          <button onClick={handleLink} disabled={isBusy} title="Link ([text](url))">[]</button>
          <button onClick={handleCode} disabled={isBusy} title="Inline code (`code`)">&lt;/&gt;</button>
          <button onClick={handleList} disabled={isBusy} title="List item (- text)">-</button>
          <button onClick={handleWikiLink} disabled={isBusy} title="Wiki link ([[Page]])">[[]]</button>
        </div>

        {/* Split editor: textarea + live preview */}
        <div className="wiki-editor__split">
          <textarea
            ref={textareaRef}
            className="wiki-editor__textarea"
            placeholder="Write your page content in Markdown...&#10;&#10;Supports [[Wiki Links]], **bold**, *italic*, ## headings, and more."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isBusy}
          />
          <div className="wiki-editor__preview wiki-page-content">
            {previewHtml ? (
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <p style={{ color: 'var(--wiki-text-muted)' }}>Preview will appear here...</p>
            )}
          </div>
        </div>

        {/* Edit summary */}
        <div className="wiki-editor__summary">
          <label>Edit summary:</label>
          <input
            type="text"
            placeholder="Briefly describe your changes"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={isBusy}
          />
        </div>

        {/* Mining progress */}
        {miningState === 'mining' && (
          <div className="wiki-editor__mining">
            <div className="wiki-editor__mining-header">
              <span className="wiki-editor__mining-label">Mining proof-of-work...</span>
              <button className="wiki-btn wiki-btn--small wiki-btn--danger" onClick={handleCancel}>
                Cancel
              </button>
            </div>
            <div className="wiki-editor__mining-stats">
              <span>Attempts: {progress.attempts.toLocaleString()}</span>
              <span>Elapsed: {(progress.elapsedMs / 1000).toFixed(1)}s</span>
              {progress.hashRate > 0 && <span>Rate: {progress.hashRate.toFixed(1)} H/s</span>}
            </div>
            <div className="wiki-editor__mining-bar">
              <div className="wiki-editor__mining-bar-fill" />
            </div>
          </div>
        )}

        {miningState === 'submitting' && (
          <div className="wiki-editor__mining">
            <span className="wiki-editor__mining-label">Submitting to network...</span>
          </div>
        )}

        {miningState === 'cancelled' && (
          <div className="wiki-editor__status wiki-editor__status--cancelled">
            Mining cancelled.{' '}
            <button className="wiki-btn wiki-btn--small" onClick={handleReset}>Try again</button>
          </div>
        )}

        {miningState === 'error' && (
          <div className="wiki-editor__status wiki-editor__status--error">
            {submitError ?? 'An error occurred.'}{' '}
            <button className="wiki-btn wiki-btn--small" onClick={handleReset}>Try again</button>
          </div>
        )}

        {submitError && miningState === 'idle' && (
          <div className="wiki-editor__status wiki-editor__status--error">
            {submitError}
          </div>
        )}

        {/* Actions */}
        {!isBusy && miningState !== 'complete' && (
          <div className="wiki-editor__actions">
            <button
              className="wiki-btn wiki-btn--primary"
              onClick={handleSubmit}
              disabled={!identity.hasIdentity || !connected || (isNew && !title.trim()) || !content.trim()}
            >
              {isNew ? 'Create Page' : 'Save Changes'}
            </button>
            <Link
              to={pageId ? `/ns/${namespaceId}/page/${pageId}` : `/ns/${namespaceId}`}
              className="wiki-btn"
            >
              Cancel
            </Link>
          </div>
        )}

        {!identity.hasIdentity && identity.mode !== 'node' && (
          <p className="wiki-editor__hint wiki-editor__hint--warn">
            You need an <Link to="/identity">identity</Link> to create or edit pages.
          </p>
        )}

        <p className="wiki-editor__hint">
          {isNew ? 'Creating' : 'Editing'} a page requires proof-of-work mining (~60 seconds on testnet).
        </p>
      </div>
    </div>
  );
}
