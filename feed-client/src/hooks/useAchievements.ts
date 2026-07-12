/**
 * Hook to fetch a user's earned recognition badges (SPEC_09 §5.3).
 *
 * Achievements are permanent, non-transferable recognition — they grant NO
 * protocol privileges. This hook is read-only: it calls the node's public
 * `get_achievements` RPC and returns the badge list for display.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';

/** A single earned achievement, as returned by the node's get_achievements RPC. */
export interface Achievement {
  /** Stable wire id (0-11). */
  id: number;
  /** Enum key, e.g. "FirstStroke". */
  key: string;
  /** Badge emoji. */
  badge: string;
  /** Human-readable name. */
  name: string;
  /** What the badge recognizes. */
  description: string;
  /** Unix seconds when unlocked. */
  unlocked_at: number;
}

interface GetAchievementsResult {
  user_id: string;
  achievements: Achievement[];
}

/** Short cache so a badge row doesn't refetch on every render. */
const cache = new Map<string, { achievements: Achievement[]; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Fetch the recognition badges earned by a user.
 *
 * @param userPk - User's public key (hex) or cs1 address
 */
export function useAchievements(userPk: string | undefined) {
  const { rpc, connected } = useRpc();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const fetchAchievements = useCallback(
    async (pk: string, force = false) => {
      if (!rpc || !connected) return;
      if (fetchingRef.current) return;

      const cached = cache.get(pk);
      if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setAchievements(cached.achievements);
        return;
      }

      fetchingRef.current = true;
      setLoading(true);
      try {
        const res = (await rpc.call('get_achievements', {
          user_id: pk,
        })) as GetAchievementsResult | null;
        const list = res?.achievements ?? [];
        cache.set(pk, { achievements: list, timestamp: Date.now() });
        setAchievements(list);
      } catch (err) {
        // Achievements are optional/decorative — never surface as an error.
        console.warn('[useAchievements] Failed to fetch:', err);
        setAchievements([]);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [rpc, connected]
  );

  useEffect(() => {
    if (userPk && connected) {
      fetchAchievements(userPk);
    } else if (!userPk) {
      setAchievements([]);
    }
  }, [userPk, connected, fetchAchievements]);

  return {
    achievements,
    loading,
    refetch: () => (userPk ? fetchAchievements(userPk, true) : Promise.resolve()),
  };
}
