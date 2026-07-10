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
  computePow,
  getDifficulty,
  getConfig,
  solutionToRpcParams,
} from '@swimchain/frontend';

// Re-export ActionType for convenience
export { ActionType } from '@swimchain/frontend';

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
    cancel,
    reset,
    getRpcParams,
  };
}

/**
 * Hook for engagement PoW (simplified for pool contributions)
 */
export function useEngagementPow() {
  const actionPow = useActionPow();

  const mineEngagement = useCallback(async (
    contentId: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    const content = new TextEncoder().encode(contentId);
    return actionPow.mine(ActionType.Engage, content, authorPubkey, isTestnet);
  }, [actionPow.mine]);

  return {
    ...actionPow,
    mineEngagement,
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
 * Hook for channel/space creation PoW
 * Used when creating new servers or channels
 */
export function useChannelCreationPow() {
  const actionPow = useActionPow();

  const mineChannelCreation = useCallback(async (
    channelName: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    const content = new TextEncoder().encode(channelName);
    return actionPow.mine(ActionType.SpaceCreation, content, authorPubkey, isTestnet);
  }, [actionPow.mine]);

  return {
    ...actionPow,
    mineChannelCreation,
  };
}
