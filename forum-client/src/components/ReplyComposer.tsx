/**
 * Reply composer component
 *
 * Uses Argon2id action PoW for replies per SPEC_03.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { useReplySubmit } from '../hooks/useRpc';
import { useReplyPow } from '../hooks/useActionPow';
import { useSponsorship } from '../hooks/useSponsorship';
import { solutionToRpcParams } from '../lib/action-pow';
import { PowProgress } from './PowProgress';
import './ReplyComposer.css';

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

interface ReplyComposerProps {
  threadId: string;
  parentId?: string;
  onSuccess?: (replyId: string) => void;
  onCancel?: () => void;
}

export function ReplyComposer({
  threadId,
  parentId,
  onSuccess,
  onCancel,
}: ReplyComposerProps): JSX.Element {
  const [content, setContent] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { identity } = useIdentityContext();
  const { sign: nodeSign } = useNodeIdentity();
  const { state, mineReply, cancel, progress, reset, solution } = useReplyPow();
  const { submitReply, submitting, error: rpcError } = useReplySubmit();
  const { isSponsored } = useSponsorship();
  const contentRef = useRef<string>('');
  const submittedRef = useRef(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) return;
    if (!identity) {
      setSubmitError('Please wait for identity to load');
      return;
    }
    // Gate posting on sponsorship BEFORE spending any proof-of-work. Unsponsored
    // identities are rejected by the node's participation gate (SPEC_11), so mining
    // first just wastes the user's time and returns a generic failure.
    if (isSponsored === false) {
      setSubmitError(
        'You need a sponsor before you can post. Open "Get Sponsored" to redeem an invite or request sponsorship — no proof-of-work is spent until then.'
      );
      return;
    }

    // Store content for use after mining completes
    contentRef.current = content;
    setSubmitError(null);
    submittedRef.current = false;

    // Start mining with Argon2id action PoW
    // Convert hex public key to bytes for mining
    const publicKeyBytes = hexToBytes(identity.publicKey);
    try {
      await mineReply(content, publicKeyBytes, true /* testnet */);
    } catch (err) {
      // Mining cancelled or failed - error state is handled by hook
      console.log('[Reply] Mining ended:', err);
    }
  }, [content, identity, mineReply, isSponsored]);

  const handleMiningComplete = useCallback(async () => {
    // Prevent double submission
    if (submittedRef.current) return;
    submittedRef.current = true;

    // Submit the reply to the network
    if (!identity || !solution) {
      console.error('[Reply] Missing required data for submission');
      setSubmitError('Missing identity or PoW data');
      reset();
      return;
    }

    // Get PoW params in RPC format
    const powParams = solutionToRpcParams(solution);

    // The parent_id is either the explicit parentId prop (for nested replies)
    // or the threadId (for top-level replies to the main post)
    const targetParentId = parentId || threadId;

    console.log('[Reply] Submitting to network:', {
      threadId,
      parentId: targetParentId,
      contentLength: contentRef.current.length,
      powParams,
    });

    // Use node signing - nodeSign returns Uint8Array | null
    const signFn = async (message: Uint8Array): Promise<Uint8Array> => {
      const sig = await nodeSign(message);
      if (!sig) throw new Error('Failed to sign message');
      return sig;
    };

    try {
      const result = await submitReply(
        targetParentId,
        contentRef.current,
        identity.publicKey,
        signFn,
        powParams,
      );

      if (result.success && result.contentId) {
        console.log('[Reply] Successfully submitted:', result.contentId);
        setContent('');
        contentRef.current = '';
        reset();
        onSuccess?.(result.contentId);
      } else {
        console.error('[Reply] Submission failed');
        setSubmitError('Failed to submit reply');
        reset();
      }
    } catch (err) {
      console.error('[Reply] Submission error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Submission error');
      reset();
    }
  }, [threadId, parentId, identity, nodeSign, solution, submitReply, reset, onSuccess]);

  // Trigger submission when mining completes
  useEffect(() => {
    if (state === 'complete' && !submitting && !submittedRef.current) {
      handleMiningComplete();
    }
  }, [state, submitting, handleMiningComplete]);

  const isMining = state === 'mining';

  return (
    <form className="reply-composer" onSubmit={handleSubmit}>
      <label htmlFor="quick-reply" className="composer-label">
        {parentId ? 'Your Reply' : 'Add a Reply'}
      </label>

      <textarea
        id="quick-reply"
        className="composer-textarea"
        placeholder="Write your reply..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isMining || submitting}
        rows={4}
        required
      />

      {isMining && (
        <div className="composer-mining">
          <PowProgress
            attempts={progress.attempts}
            elapsedMs={progress.elapsedMs}
            difficulty={8} /* Testnet Reply difficulty */
            onCancel={cancel}
          />
        </div>
      )}

      {state === 'cancelled' && (
        <p className="composer-cancelled">Mining cancelled.</p>
      )}

      {state === 'error' && (
        <p className="composer-error">An error occurred. Please try again.</p>
      )}

      {(submitError || rpcError) && (
        <p className="composer-error">{submitError || rpcError}</p>
      )}

      {submitting && (
        <div className="composer-submitting">
          <span>Submitting to network...</span>
        </div>
      )}

      {!isMining && !submitting && state !== 'complete' && (
        <div className="composer-actions">
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!content.trim() || !identity}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Post Reply
          </button>
        </div>
      )}

      <p className="composer-hint">
        Posting requires proof-of-work mining (~30 seconds)
      </p>
    </form>
  );
}
