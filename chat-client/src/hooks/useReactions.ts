/**
 * Hook for managing reactions with optimistic updates
 */

import { useState, useCallback, useRef } from 'react';
import { REACTION_DIFFICULTY, ENGAGE_QUICK_SECONDS } from '../types';

interface ReactionCounts {
  quick: number;
  standard: number;
}

interface UseReactionsReturn {
  addReaction: (messageId: string, seconds: 5 | 15) => Promise<void>;
  getReactions: (messageId: string) => ReactionCounts;
  pendingReactions: Map<string, number>;
  isMining: boolean;
}

export function useReactions(
  initialReactions: Map<string, ReactionCounts> = new Map()
): UseReactionsReturn {
  const [reactions, setReactions] = useState<Map<string, ReactionCounts>>(
    initialReactions
  );
  const [pendingReactions, setPendingReactions] = useState<Map<string, number>>(
    new Map()
  );
  const [isMining, setIsMining] = useState(false);
  const queueRef = useRef<Array<{ messageId: string; seconds: 5 | 15 }>>([]);

  const processQueue = useCallback(async () => {
    if (queueRef.current.length === 0 || isMining) return;

    const item = queueRef.current.shift();
    if (!item) return;

    setIsMining(true);

    // Add to pending
    setPendingReactions((prev) => {
      const next = new Map(prev);
      const current = next.get(item.messageId) ?? 0;
      next.set(item.messageId, current + item.seconds);
      return next;
    });

    try {
      // Simulate PoW delay based on difficulty
      // REACTION_DIFFICULTY = 8 means ~1s
      const miningTime = REACTION_DIFFICULTY * 125 * (0.8 + Math.random() * 0.4);
      await new Promise((resolve) => setTimeout(resolve, miningTime));

      // Update confirmed reactions
      setReactions((prev) => {
        const next = new Map(prev);
        const current = next.get(item.messageId) ?? { quick: 0, standard: 0 };
        if (item.seconds === ENGAGE_QUICK_SECONDS) {
          next.set(item.messageId, { ...current, quick: current.quick + 1 });
        } else {
          next.set(item.messageId, { ...current, standard: current.standard + 1 });
        }
        return next;
      });

      // Remove from pending
      setPendingReactions((prev) => {
        const next = new Map(prev);
        const current = next.get(item.messageId) ?? 0;
        const remaining = current - item.seconds;
        if (remaining <= 0) {
          next.delete(item.messageId);
        } else {
          next.set(item.messageId, remaining);
        }
        return next;
      });
    } catch {
      // Revert optimistic update on failure
      setPendingReactions((prev) => {
        const next = new Map(prev);
        const current = next.get(item.messageId) ?? 0;
        const remaining = current - item.seconds;
        if (remaining <= 0) {
          next.delete(item.messageId);
        } else {
          next.set(item.messageId, remaining);
        }
        return next;
      });
    } finally {
      setIsMining(false);

      // Process next item in queue
      if (queueRef.current.length > 0) {
        processQueue();
      }
    }
  }, [isMining]);

  const addReaction = useCallback(
    async (messageId: string, seconds: 5 | 15) => {
      // Limit queue size
      if (queueRef.current.length >= 3) {
        return;
      }

      queueRef.current.push({ messageId, seconds });

      if (!isMining) {
        processQueue();
      }
    },
    [isMining, processQueue]
  );

  const getReactions = useCallback(
    (messageId: string): ReactionCounts => {
      return reactions.get(messageId) ?? { quick: 0, standard: 0 };
    },
    [reactions]
  );

  return {
    addReaction,
    getReactions,
    pendingReactions,
    isMining,
  };
}
