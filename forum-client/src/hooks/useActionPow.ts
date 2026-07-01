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
  computePowViaWorker,
  cancelMining,
  getDifficulty,
  getConfig,
  solutionToRpcParams,
  hexToBytes,
} from '../lib/action-pow';
import { logger } from '../lib/logger';

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
  const requestIdRef = useRef<string | null>(null);

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

      logger.info('[ActionPow] ===== STARTING MINING =====', {
        actionType: ActionType[actionType],
        difficulty,
        config,
        contentLength: content.length,
        isTestnet,
      });

      // Create challenge
      const challenge = await createChallenge(actionType, content, authorPubkey, difficulty);

      logger.info('[ActionPow] Challenge created', {
        timestamp: challenge.timestamp,
        nonceSpace: Array.from(challenge.nonceSpace).map(b => b.toString(16).padStart(2, '0')).join(''),
      });

      logger.info('[ActionPow] Starting Web Worker mining...');

      // Mine solution using Web Worker (M-FORUM-2: non-blocking)
      const { promise, requestId } = computePowViaWorker(
        challenge,
        config,
        (attempts, elapsedMs, hashRate) => {
          setProgress({ attempts, elapsedMs, hashRate });
          // Log progress every 1000 attempts
          if (attempts % 1000 === 0) {
            logger.info('[ActionPow] Mining progress:', { attempts, elapsedMs, hashRate });
          }
        },
        () => cancelledRef.current,
      );
      requestIdRef.current = requestId;

      logger.info('[ActionPow] Waiting for mining to complete...');
      const result = await promise;

      logger.info('[ActionPow] ===== MINING COMPLETE =====', {
        nonce: result.nonce.toString(),
        attempts: progress.attempts,
        elapsedMs: progress.elapsedMs,
      });

      setSolution(result);
      setState('complete');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mining failed';
      logger.error('[ActionPow] ===== MINING ERROR =====', message, err);
      setError(message);
      setState(message.includes('cancelled') ? 'cancelled' : 'error');
      throw err;
    }
  }, []);

  const cancel = useCallback(() => {
    logger.info('[ActionPow] CANCEL called');
    cancelledRef.current = true;
    // Cancel the worker-based mining if in progress
    if (requestIdRef.current) {
      logger.info('[ActionPow] Cancelling worker mining, requestId:', requestIdRef.current);
      cancelMining(requestIdRef.current);
      requestIdRef.current = null;
    }
    setState('cancelled');
  }, []);

  const reset = useCallback(() => {
    logger.info('[ActionPow] RESET called');
    cancelledRef.current = false;
    requestIdRef.current = null;
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
 *
 * IMPORTANT: For engagement, the contentId is already a hash (e.g., "sha256:abc123...").
 * The server expects the raw 32-byte hash in the PoW challenge, NOT SHA256(contentId string).
 * This function extracts the raw hash bytes and uses createChallengeWithRawHash to avoid
 * the hash mismatch that caused "PoW verification failed: hash mismatch" errors.
 */
export function useEngagementPow() {
  const [state, setState] = useState<MiningState>('idle');
  const [progress, setProgress] = useState<MiningProgress>({
    attempts: 0,
    elapsedMs: 0,
    hashRate: 0,
  });
  const [solution, setSolution] = useState<PoWSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  const mineEngagement = useCallback(async (
    contentId: string,
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
      // Extract raw hash bytes from contentId (e.g., "sha256:abc123..." -> bytes)
      // This is the key fix: server expects raw hash bytes, not SHA256(contentId string)
      let contentHash: Uint8Array;
      if (contentId.startsWith('sha256:')) {
        const hashHex = contentId.slice(7); // Skip "sha256:" prefix
        contentHash = hexToBytes(hashHex);
      } else {
        // Fallback: treat as raw hex
        contentHash = hexToBytes(contentId);
      }

      if (contentHash.length !== 32) {
        throw new Error(`Invalid content hash length: expected 32 bytes, got ${contentHash.length}`);
      }

      const difficulty = getDifficulty(ActionType.Engage, isTestnet);
      const config = getConfig(isTestnet);

      logger.info('[EngagementPow] ===== STARTING ENGAGEMENT MINING =====', {
        contentId,
        difficulty,
        config,
        isTestnet,
      });

      // Create challenge with raw hash (no re-hashing!)
      const challenge = createChallengeWithRawHash(
        ActionType.Engage,
        contentHash,
        authorPubkey,
        difficulty
      );

      logger.info('[EngagementPow] Challenge created with raw content hash', {
        timestamp: challenge.timestamp,
        nonceSpace: Array.from(challenge.nonceSpace).map(b => b.toString(16).padStart(2, '0')).join(''),
      });

      // Mine solution using Web Worker
      const { promise, requestId } = computePowViaWorker(
        challenge,
        config,
        (attempts, elapsedMs, hashRate) => {
          setProgress({ attempts, elapsedMs, hashRate });
          if (attempts % 1000 === 0) {
            logger.info('[EngagementPow] Mining progress:', { attempts, elapsedMs, hashRate });
          }
        },
        () => cancelledRef.current,
      );
      requestIdRef.current = requestId;

      logger.info('[EngagementPow] Waiting for mining to complete...');
      const result = await promise;

      logger.info('[EngagementPow] ===== MINING COMPLETE =====', {
        nonce: result.nonce.toString(),
      });

      setSolution(result);
      setState('complete');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mining failed';
      logger.error('[EngagementPow] ===== MINING ERROR =====', message, err);
      setError(message);
      setState(message.includes('cancelled') ? 'cancelled' : 'error');
      throw err;
    }
  }, []);

  const cancel = useCallback(() => {
    logger.info('[EngagementPow] CANCEL called');
    cancelledRef.current = true;
    if (requestIdRef.current) {
      cancelMining(requestIdRef.current);
      requestIdRef.current = null;
    }
    setState('cancelled');
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    requestIdRef.current = null;
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
    mineEngagement,
    cancel,
    reset,
    getRpcParams,
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
 * Hook for space creation PoW
 */
export function useSpaceCreationPow() {
  const actionPow = useActionPow();

  const mineSpaceCreation = useCallback(async (
    spaceName: string,
    authorPubkey: Uint8Array,
    isTestnet: boolean = true,
  ): Promise<PoWSolution> => {
    logger.info('[useSpaceCreationPow] mineSpaceCreation CALLED', {
      spaceName,
      authorPubkeyLength: authorPubkey.length,
      isTestnet,
    });
    const content = new TextEncoder().encode(spaceName);
    logger.info('[useSpaceCreationPow] Calling actionPow.mine...');
    const result = await actionPow.mine(ActionType.SpaceCreation, content, authorPubkey, isTestnet);
    logger.info('[useSpaceCreationPow] actionPow.mine returned', { hasResult: !!result });
    return result;
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
