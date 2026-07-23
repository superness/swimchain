/**
 * Hook to fetch and manage user profiles
 *
 * Simplified version for chat-client. Profiles are fetched from the RPC
 * and cached locally for performance.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';

/**
 * Profile information structure
 */
export interface ProfileInfo {
  /** Display name (optional, falls back to truncated address) */
  displayName?: string;
  /** Short bio/description */
  bio?: string;
  /** Website or other link */
  website?: string;
  /** Avatar URL or content ID */
  avatarUrl?: string;
  /** When the profile was last updated */
  updatedAt?: number;
}

/**
 * Full user profile
 */
export interface UserProfile {
  /** User's public key/ID */
  userId: string;
  /** Profile information */
  info: ProfileInfo | null;
  /** Whether this profile exists */
  exists: boolean;
}

/** RPC response type for get_user_profile */
interface ProfileRpcResponse {
  display_name?: string;
  bio?: string;
  website?: string;
  avatar_url?: string;
  /** The node returns the avatar as a content id here (feed reads this first). */
  avatar_content_id?: string;
  updated_at?: number;
}

/** Cache profiles to avoid repeated fetches */
const profileCache = new Map<string, { profile: UserProfile; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Create an empty profile for a user
 */
export function createEmptyProfile(userId: string): UserProfile {
  return {
    userId,
    info: null,
    exists: false,
  };
}

/**
 * Hook to fetch a user's profile
 *
 * @param userId - User's public key or ID
 * @returns Profile data and loading state
 */
export function useUserProfile(userId: string | undefined) {
  const { rpc, connected, authReady } = useRpc();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchProfile = useCallback(async (id: string, force = false) => {
    if (!rpc || !connected || !authReady) return;
    if (fetchingRef.current) return;

    // Check cache first
    const cached = profileCache.get(id);
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProfile(cached.profile);
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Try to fetch profile from RPC
      // Note: get_user_profile RPC method may not exist yet - gracefully handle
      let result: ProfileRpcResponse | null = null;

      try {
        result = await rpc.call('get_user_profile', {
          user_id: id,
        }) as ProfileRpcResponse | null;
      } catch (rpcErr) {
        // RPC method may not exist yet - this is expected
        console.debug('[useUserProfile] RPC not available (expected):', rpcErr);
      }

      const userProfile: UserProfile = {
        userId: id,
        info: result ? {
          displayName: result.display_name,
          bio: result.bio,
          website: result.website,
          // Match feed: the node returns the avatar as avatar_content_id.
          avatarUrl: result.avatar_content_id ?? result.avatar_url,
          updatedAt: result.updated_at,
        } : null,
        exists: result !== null,
      };

      // Update cache
      profileCache.set(id, { profile: userProfile, timestamp: Date.now() });
      setProfile(userProfile);
    } catch (err) {
      console.error('[useUserProfile] Failed to fetch:', err);
      // On error, return empty profile (profile is optional)
      const emptyProfile = createEmptyProfile(id);
      setProfile(emptyProfile);
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [rpc, connected, authReady]);

  // Fetch when userId changes
  useEffect(() => {
    if (userId && connected && authReady) {
      fetchProfile(userId);
    } else if (!userId) {
      setProfile(null);
    }
  }, [userId, connected, authReady, fetchProfile]);

  return {
    profile,
    loading,
    error,
    refetch: () => userId ? fetchProfile(userId, true) : Promise.resolve(),
  };
}

/**
 * Hook to fetch multiple profiles at once (batched)
 * Useful for displaying avatars in a list of messages
 */
export function useUserProfiles(userIds: string[]) {
  const { rpc, connected, authReady } = useRpc();
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    if (!rpc || !connected || !authReady || userIds.length === 0) return;

    setLoading(true);

    const results = new Map<string, UserProfile>();
    const uncached: string[] = [];

    // Check cache first
    for (const id of userIds) {
      const cached = profileCache.get(id);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        results.set(id, cached.profile);
      } else {
        uncached.push(id);
      }
    }

    // Fetch uncached profiles (limit concurrent requests)
    const batchSize = 5;
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      await Promise.all(batch.map(async (id) => {
        try {
          // RPC method may not exist yet - gracefully handle
          let result: ProfileRpcResponse | null = null;

          try {
            result = await rpc.call('get_user_profile', {
              user_id: id,
            }) as ProfileRpcResponse | null;
          } catch {
            // RPC method may not exist - expected
          }

          const profile: UserProfile = {
            userId: id,
            info: result ? {
              displayName: result.display_name,
              bio: result.bio,
              website: result.website,
              avatarUrl: result.avatar_url,
            } : null,
            exists: result !== null,
          };

          profileCache.set(id, { profile, timestamp: Date.now() });
          results.set(id, profile);
        } catch {
          // On error, use empty profile
          const emptyProfile = createEmptyProfile(id);
          results.set(id, emptyProfile);
        }
      }));
    }

    setProfiles(results);
    setLoading(false);
  }, [rpc, connected, authReady, userIds]);

  useEffect(() => {
    if (userIds.length > 0) {
      fetchProfiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIds.join(','), fetchProfiles]);

  return { profiles, loading };
}

/**
 * Clear profile cache (useful after updating own profile)
 */
export function clearProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId);
  } else {
    profileCache.clear();
  }
}
