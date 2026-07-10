/**
 * React hook for Action Proof-of-Work mining
 *
 * Uses Argon2id for actual PoW per SPEC_03.
 * This is the correct PoW for posts, replies, and engagements.
 */

import { useState, useCallback, useRef } from 'react';
import {
  ActionType,
  type PoWSolution,
  createChallenge,
  createChallengeWithRawHash,
  computePow,
  getDifficulty,
  getConfig,
  solutionToRpcParams,
  hexToBytes,
} from '../lib/action-pow';

// Re-export ActionType for convenience
export { ActionType } from '../lib/action-pow';

/** Mining state */
export type MiningState = 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';

/** Mining progress */
export interface MiningProgress {
  attempts: number;
  elapsedMs: number;
  hashRate: number;
}

/** Hook return type */
export interface UseActionPowResult {
  /** Current mining state */
  state: MiningState;
  /** Mining progress */
  progress: MiningProgress;
  /** Solution when complete */
  solution: PoWSolution | null;
  /** Error message if failed */
  error: string | null;
  /** Start mining for an action */
  mine: (
    actionType: ActionType,
    content: Uint8Array,
    authorPubkey: Uint8Array,
    isTestnet?: boolean,
  ) => Promise<PoWSolution>;
  /**
   * Start mining with a pre-computed raw 32-byte content hash (no
   * re-hashing). Required for engagement challenges, where the node
   * rebuilds the challenge from the raw content hash.
   */
  mineWithRawHash: (
    actionType: ActionType,
    contentHash: Uint8Array,
    authorPubkey: Uint8Array,
    isTestnet?: boolean,
  ) => Promise<PoWSolution>;
  /** Cancel current mining */
  cancel: () => void;
  /** Reset state */
  reset: () => void;
  /** Get RPC params from solution */
  getRpcParams: () => ReturnType<typeof solutionToRpcParams> | null;
}

/**
 * Hook for mining action PoW (posts, replies, engagements)
 */
export function useActionPow(): UseActionPowResult {
  const [state, setState] = useState<MiningState>('idle');
  const [progress, setProgress] = useState<MiningProgress>({
    attempts: 0,
    elapsedMs: 0,
    hashRate: 0,
  });
  const [solution, setSolution] = useState<PoWSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const mine = useCallback(async (
    actionType: ActionType,
    content: Uint8Array,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    // Reset state
    setState('mining');
    setSolution(null);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0, hashRate: 0 });
    cancelledRef.current = false;

    try {
      const difficulty = getDifficulty(actionType, isTestnet);
      const config = getConfig(isTestnet);

      // Create challenge
      const challenge = await createChallenge(actionType, content, authorPubkey, difficulty);

      // Mine solution
      const result = await computePow(
        challenge,
        config,
        (attempts, elapsedMs, hashRate) => {
          setProgress({ attempts, elapsedMs, hashRate });
        },
        () => cancelledRef.current,
      );

      setSolution(result);
      setState('complete');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mining failed';
      console.error('[ActionPow] Mining error:', message);
      setError(message);
      setState(message.includes('cancelled') ? 'cancelled' : 'error');
      throw err;
    }
  }, []);

  /**
   * Mine with a pre-computed raw 32-byte content hash (no re-hashing).
   * Required for engagement, where contentId is already a hash and the node
   * rebuilds the challenge from the raw bytes.
   */
  const mineWithRawHash = useCallback(async (
    actionType: ActionType,
    contentHash: Uint8Array,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    setState('mining');
    setSolution(null);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0, hashRate: 0 });
    cancelledRef.current = false;

    try {
      const difficulty = getDifficulty(actionType, isTestnet);
      const config = getConfig(isTestnet);

      const challenge = createChallengeWithRawHash(actionType, contentHash, authorPubkey, difficulty);

      const result = await computePow(
        challenge,
        config,
        (attempts, elapsedMs, hashRate) => {
          setProgress({ attempts, elapsedMs, hashRate });
        },
        () => cancelledRef.current,
      );

      setSolution(result);
      setState('complete');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mining failed';
      console.error('[ActionPow] Mining error:', message);
      setError(message);
      setState(message.includes('cancelled') ? 'cancelled' : 'error');
      throw err;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setState('cancelled');
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setState('idle');
    setSolution(null);
    setError(null);
    setProgress({ attempts: 0, elapsedMs: 0, hashRate: 0 });
  }, []);

  const getRpcParams = useCallback(() => {
    if (!solution) return null;
    return solutionToRpcParams(solution);
  }, [solution]);

  return {
    state,
    progress,
    solution,
    error,
    mine,
    mineWithRawHash,
    cancel,
    reset,
    getRpcParams,
  };
}

/**
 * Hook for post PoW
 */
export function usePostPow() {
  const actionPow = useActionPow();

  const minePost = useCallback(async (
    body: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    const content = new TextEncoder().encode(body);
    return actionPow.mine(ActionType.Post, content, authorPubkey, isTestnet);
  }, [actionPow.mine]);

  return {
    ...actionPow,
    minePost,
  };
}

/**
 * Hook for reply PoW
 */
export function useReplyPow() {
  const actionPow = useActionPow();

  const mineReply = useCallback(async (
    body: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    const content = new TextEncoder().encode(body);
    return actionPow.mine(ActionType.Reply, content, authorPubkey, isTestnet);
  }, [actionPow.mine]);

  return {
    ...actionPow,
    mineReply,
  };
}

/**
 * Hook for engagement PoW (reactions, etc.)
 *
 * IMPORTANT: For engagement, the contentId is already a hash ("sha256:abc...").
 * The node reconstructs the challenge with the raw 32-byte hash
 * (verify_pow_submission_raw), NOT SHA256 of the contentId string. Mining
 * over the string produced "PoW verification failed: hash mismatch" on a
 * real node — same bug forum-client fixed with createChallengeWithRawHash.
 */
export function useEngagementPow() {
  const actionPow = useActionPow();

  const mineEngagement = useCallback(async (
    contentId: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    // Extract raw hash bytes from contentId ("sha256:abc123..." -> bytes)
    const hashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
    const contentHash = hexToBytes(hashHex);
    if (contentHash.length !== 32) {
      throw new Error(`Invalid content hash length: expected 32 bytes, got ${contentHash.length}`);
    }
    return actionPow.mineWithRawHash(ActionType.Engage, contentHash, authorPubkey, isTestnet);
  }, [actionPow.mineWithRawHash]);

  return {
    ...actionPow,
    mineEngagement,
  };
}

/**
 * Hook for space creation PoW
 */
export function useSpaceCreationPow() {
  const actionPow = useActionPow();

  const mineSpaceCreation = useCallback(async (
    spaceName: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    const content = new TextEncoder().encode(spaceName);
    return actionPow.mine(ActionType.SpaceCreation, content, authorPubkey, isTestnet);
  }, [actionPow.mine]);

  return {
    ...actionPow,
    mineSpaceCreation,
  };
}

/**
 * Hook for edit PoW
 */
export function useEditPow() {
  const actionPow = useActionPow();

  const mineEdit = useCallback(async (
    body: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    const content = new TextEncoder().encode(body);
    return actionPow.mine(ActionType.Edit, content, authorPubkey, isTestnet);
  }, [actionPow.mine]);

  return {
    ...actionPow,
    mineEdit,
  };
}
