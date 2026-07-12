/**
 * Hook for mining action PoW for bridge operations
 */

import { useState, useCallback, useRef } from 'react';
import { useStoredKeypair } from './useStoredKeypair';
import {
  ActionType,
  computePow,
  createChallenge,
  solutionToRpcParams,
  getDifficulty,
  getConfig,
  bytesToHex,
  sha256,
} from '../lib/action-pow';

export interface MiningProgress {
  attempts: number;
  elapsedMs: number;
  hashRate: number;
}

export interface ActionPowResult {
  pow_nonce: number;
  pow_difficulty: number;
  pow_nonce_space: string;
  pow_hash: string;
  timestamp: number;
  signature: string;
  author_id: string;
}

export interface UseActionPowResult {
  /** Mine PoW for posting a reply */
  mineForReply: (content: string) => Promise<ActionPowResult | null>;
  /** Mine PoW for posting a new post */
  mineForPost: (title: string, body: string) => Promise<ActionPowResult | null>;
  /** Whether mining is in progress */
  isMining: boolean;
  /** Current progress */
  progress: MiningProgress | null;
  /** Cancel current mining */
  cancel: () => void;
  /** Last error */
  error: string | null;
  /** Whether identity is ready */
  isReady: boolean;
}

/**
 * Hook for mining action PoW
 */
export function useActionPow(): UseActionPowResult {
  const { keypair, publicKey, publicKeyHex, sign, hasIdentity, isLoading } = useStoredKeypair();
  const [isMining, setIsMining] = useState(false);
  const [progress, setProgress] = useState<MiningProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const mine = useCallback(async (
    actionType: ActionType,
    content: Uint8Array,
    signContent: Uint8Array,
  ): Promise<ActionPowResult | null> => {
    if (!keypair || !publicKey || !publicKeyHex) {
      setError('No identity available');
      return null;
    }

    setIsMining(true);
    setProgress(null);
    setError(null);
    cancelledRef.current = false;

    try {
      // Use testnet settings
      const difficulty = getDifficulty(actionType, true);
      const config = getConfig(true);

      console.log(`[ActionPow] Mining ${ActionType[actionType]} with difficulty ${difficulty}`);

      // Create challenge
      const challenge = await createChallenge(
        actionType,
        content,
        publicKey,
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

      // Convert to RPC params
      const powParams = solutionToRpcParams(solution);

      // Create signature over the canonical action preimage the node verifies:
      //   content_hash(32) || timestamp_u64_LE(8) || private(1)
      // content_hash = sha256(post: `${title}\n\n${body}` | reply: body)
      const sigContentHash = await sha256(signContent);
      const preimage = new Uint8Array(41);
      preimage.set(sigContentHash, 0);
      new DataView(preimage.buffer).setBigUint64(32, BigInt(challenge.timestamp), true);
      preimage[40] = 0; // public space

      const signature = sign(preimage);
      if (!signature) {
        throw new Error('Failed to sign');
      }

      console.log(`[ActionPow] Mining complete after ${progress?.attempts ?? 0} attempts`);

      return {
        ...powParams,
        signature: bytesToHex(signature),
        author_id: publicKeyHex,
      };
    } catch (err) {
      if (err instanceof Error && err.message === 'Mining cancelled') {
        console.log('[ActionPow] Mining cancelled');
        return null;
      }
      const message = err instanceof Error ? err.message : 'Mining failed';
      setError(message);
      console.error('[ActionPow] Mining failed:', err);
      return null;
    } finally {
      setIsMining(false);
    }
  }, [keypair, publicKey, publicKeyHex, sign, progress?.attempts]);

  const mineForReply = useCallback(async (content: string): Promise<ActionPowResult | null> => {
    const contentBytes = new TextEncoder().encode(content);
    // Reply signature content_hash = sha256(body)
    return mine(ActionType.Reply, contentBytes, contentBytes);
  }, [mine]);

  const mineForPost = useCallback(async (title: string, body: string): Promise<ActionPowResult | null> => {
    const contentBytes = new TextEncoder().encode(title + '\n' + body);
    // Post signature content_hash = sha256(`${title}\n\n${body}`) (double newline, distinct from PoW content)
    const signContent = new TextEncoder().encode(`${title}\n\n${body}`);
    return mine(ActionType.Post, contentBytes, signContent);
  }, [mine]);

  return {
    mineForReply,
    mineForPost,
    isMining,
    progress,
    cancel,
    error,
    isReady: hasIdentity && !isLoading,
  };
}

/**
 * Non-hook version for use in services (requires keypair from elsewhere)
 */
export async function mineActionPow(
  actionType: ActionType,
  content: Uint8Array,
  publicKey: Uint8Array,
  signFn: (message: Uint8Array) => Uint8Array,
  onProgress?: (attempts: number, elapsedMs: number, hashRate: number) => void,
  isCancelled?: () => boolean,
): Promise<ActionPowResult> {
  const difficulty = getDifficulty(actionType, true);
  const config = getConfig(true);

  const challenge = await createChallenge(
    actionType,
    content,
    publicKey,
    difficulty,
  );

  const solution = await computePow(
    challenge,
    config,
    onProgress,
    isCancelled,
  );

  const powParams = solutionToRpcParams(solution);

  // Create signature over the canonical action preimage the node verifies:
  //   content_hash(32) || timestamp_u64_LE(8) || private(1)
  // Caller passes the canonical content (post: `${title}\n\n${body}`, reply: body).
  const sigContentHash = await sha256(content);
  const preimage = new Uint8Array(41);
  preimage.set(sigContentHash, 0);
  new DataView(preimage.buffer).setBigUint64(32, BigInt(challenge.timestamp), true);
  preimage[40] = 0; // public space

  const signature = signFn(preimage);

  return {
    ...powParams,
    signature: bytesToHex(signature),
    author_id: bytesToHex(publicKey),
  };
}
