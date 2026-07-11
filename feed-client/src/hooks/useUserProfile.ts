/**
 * Hook to fetch and manage user profiles
 *
 * Profiles are optional - users without a profile will show
 * generated avatars based on their public key.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';
import {
  UserProfile,
  ProfileInfo,
  AvatarInfo,
  getProfileSpaceId,
  createEmptyProfile,
} from '../lib/profile';

/** Cache profiles to avoid repeated fetches */
const profileCache = new Map<string, { profile: UserProfile; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Hook to fetch a user's profile
 *
 * @param userPk - User's public key (hex)
 * @returns Profile data and loading state
 */
export function useUserProfile(userPk: string | undefined) {
  const { rpc, connected } = useRpc();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchProfile = useCallback(async (pk: string, force = false) => {
    if (!rpc || !connected) return;
    if (fetchingRef.current) return;

    // Check cache first
    const cached = profileCache.get(pk);
    if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProfile(cached.profile);
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Use the node's get_user_profile RPC: it accepts a hex pubkey OR a cs1 address
      // (profile URLs are addresses), derives the profile space from the hex pubkey, and
      // decodes the [PROFILE_INFO]/[PROFILE_AVATAR] segments correctly.
      const res = (await rpc.call('get_user_profile', { user_id: pk })) as {
        display_name?: string;
        bio?: string;
        website?: string;
        avatar_url?: string;
        avatar_content_id?: string;
        updated_at?: number;
      } | null;

      const info: ProfileInfo | null = res
        ? {
            displayName: res.display_name,
            bio: res.bio,
            website: res.website,
            updatedAt: res.updated_at ?? 0,
          }
        : null;
      const avatarId = res?.avatar_content_id || res?.avatar_url;
      const avatar: AvatarInfo | null = avatarId
        ? { contentId: avatarId, format: 'png', updatedAt: res?.updated_at ?? 0 }
        : null;

      const userProfile: UserProfile = {
        userPk: pk,
        profileSpaceId: getProfileSpaceId(pk),
        info,
        avatar,
        exists: !!res && (!!info?.displayName || !!info?.bio || !!info?.website || !!avatar),
      };

      // Update cache
      profileCache.set(pk, { profile: userProfile, timestamp: Date.now() });
      setProfile(userProfile);
    } catch (err) {
      console.error('[useUserProfile] Failed to fetch:', err);
      // On error, return empty profile (profile is optional)
      const emptyProfile = createEmptyProfile(pk);
      setProfile(emptyProfile);
      setError(err instanceof Error ? err.message : 'Failed to fetch profile');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [rpc, connected]);

  // Fetch when userPk changes
  useEffect(() => {
    if (userPk && connected) {
      fetchProfile(userPk);
    } else if (!userPk) {
      setProfile(null);
    }
  }, [userPk, connected, fetchProfile]);

  return {
    profile,
    loading,
    error,
    refetch: () => userPk ? fetchProfile(userPk, true) : Promise.resolve(),
  };
}

/**
 * Hook to fetch multiple profiles at once (batched)
 * Useful for displaying avatars in a list of posts
 */
export function useUserProfiles(userPks: string[]) {
  const { rpc, connected } = useRpc();
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    if (!rpc || !connected || userPks.length === 0) return;

    setLoading(true);

    const results = new Map<string, UserProfile>();
    const uncached: string[] = [];

    // Check cache first
    for (const pk of userPks) {
      const cached = profileCache.get(pk);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        results.set(pk, cached.profile);
      } else {
        uncached.push(pk);
      }
    }

    // Fetch uncached profiles (limit concurrent requests)
    const batchSize = 5;
    for (let i = 0; i < uncached.length; i += batchSize) {
      const batch = uncached.slice(i, i + batchSize);
      await Promise.all(batch.map(async (pk) => {
        try {
          const res = (await rpc.call('get_user_profile', { user_id: pk })) as {
            display_name?: string;
            bio?: string;
            website?: string;
            avatar_url?: string;
            avatar_content_id?: string;
            updated_at?: number;
          } | null;

          const info: ProfileInfo | null = res
            ? {
                displayName: res.display_name,
                bio: res.bio,
                website: res.website,
                updatedAt: res.updated_at ?? 0,
              }
            : null;
          const avatarId = res?.avatar_content_id || res?.avatar_url;
          const avatar: AvatarInfo | null = avatarId
            ? { contentId: avatarId, format: 'png', updatedAt: res?.updated_at ?? 0 }
            : null;

          const profile: UserProfile = {
            userPk: pk,
            profileSpaceId: getProfileSpaceId(pk),
            info,
            avatar,
            exists: !!res && (!!info?.displayName || !!info?.bio || !!info?.website || !!avatar),
          };

          profileCache.set(pk, { profile, timestamp: Date.now() });
          results.set(pk, profile);
        } catch {
          // On error, use empty profile
          const emptyProfile = createEmptyProfile(pk);
          results.set(pk, emptyProfile);
        }
      }));
    }

    setProfiles(results);
    setLoading(false);
  }, [rpc, connected, userPks]);

  useEffect(() => {
    if (userPks.length > 0) {
      fetchProfiles();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPks.join(','), fetchProfiles]);

  return { profiles, loading };
}

/**
 * Clear profile cache (useful after updating own profile)
 */
export function clearProfileCache(userPk?: string) {
  if (userPk) {
    profileCache.delete(userPk);
  } else {
    profileCache.clear();
  }
}
