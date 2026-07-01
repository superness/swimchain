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
  decodeProfileInfo,
  decodeAvatarInfo,
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
      const profileSpaceId = getProfileSpaceId(pk);

      // Try to fetch posts from the profile space
      // This will return empty if the space doesn't exist (user hasn't set up profile)
      const result = await rpc.call('list_posts_for_space', {
        space_id: profileSpaceId,
        offset: 0,
        limit: 10, // Profile shouldn't have many posts
        include_replies: false,
      }) as {
        items: Array<{
          content_id: string;
          author: string;
          body?: string;
          created_at: number;
        }>;
        total: number;
      };

      // Parse profile data from posts
      let info: ProfileInfo | null = null;
      let avatar: AvatarInfo | null = null;

      for (const post of result.items) {
        if (!post.body) continue;

        // Check for profile info
        const profileInfo = decodeProfileInfo(post.body);
        if (profileInfo && (!info || profileInfo.updatedAt > info.updatedAt)) {
          info = profileInfo;
        }

        // Check for avatar
        const avatarInfo = decodeAvatarInfo(post.body);
        if (avatarInfo && (!avatar || avatarInfo.updatedAt > avatar.updatedAt)) {
          avatar = avatarInfo;
        }
      }

      const userProfile: UserProfile = {
        userPk: pk,
        profileSpaceId,
        info,
        avatar,
        exists: result.total > 0,
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
          const profileSpaceId = getProfileSpaceId(pk);
          const result = await rpc.call('list_posts_for_space', {
            space_id: profileSpaceId,
            offset: 0,
            limit: 10,
            include_replies: false,
          }) as {
            items: Array<{ body?: string }>;
            total: number;
          };

          let info: ProfileInfo | null = null;
          let avatar: AvatarInfo | null = null;

          for (const post of result.items) {
            if (!post.body) continue;
            const profileInfo = decodeProfileInfo(post.body);
            if (profileInfo) info = profileInfo;
            const avatarInfo = decodeAvatarInfo(post.body);
            if (avatarInfo) avatar = avatarInfo;
          }

          const profile: UserProfile = {
            userPk: pk,
            profileSpaceId,
            info,
            avatar,
            exists: result.total > 0,
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
