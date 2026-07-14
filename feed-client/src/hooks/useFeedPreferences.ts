/**
 * useFeedPreferences - Manage feed preferences and followed sources
 *
 * Stores preferences in localStorage (IndexedDB in future for larger data).
 * Handles following/unfollowing spaces and users, saving posts, and settings.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FeedSource, FeedPreferences, StoredFeedPreferences } from '../types/feed';
import { useStoredIdentity } from './useStoredIdentity';
import { useParentRpcConfig } from './useParentRpcConfig';
import { useRpc } from './useRpc';
import { useFeedIdentity } from './useFeedIdentity';

const STORAGE_KEY_PREFIX = 'feed_prefs_';
const CURRENT_VERSION = 1;

/**
 * Get storage key for current user
 */
function getStorageKey(userPkHex: string): string {
  return `${STORAGE_KEY_PREFIX}${userPkHex}`;
}

/** Same-document event fired whenever any hook instance saves preferences. */
const PREFS_CHANGED_EVENT = 'swimchain:feed-preferences-changed';

/**
 * Node-backed prefs sync (R2). The node's prefs store is the durable source of
 * truth for followed spaces and saved posts; localStorage is a write-through
 * cache of it (plus purely-local metadata: display names, mutes, UI settings,
 * followed users). Once per session per identity, pull the node's lists, push
 * any local-only entries up (one-time migration of pre-R2 localStorage state),
 * and write the merged result back to localStorage so every hook instance —
 * unchanged — sees it.
 */
const nodeSyncStarted = new Set<string>();

interface PrefsRpc {
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

async function syncPrefsWithNode(rpc: PrefsRpc, userPkHex: string, prefsKey: string): Promise<boolean> {
  const [followRes, savedRes] = await Promise.all([
    rpc.call<{ spaces: Array<{ space_id: string; space_id_hex: string; followed_at: number }> }>(
      'list_followed_spaces',
      { user: userPkHex }
    ),
    rpc.call<{ posts: Array<{ content_id: string; saved_at: number }> }>('list_saved_posts', {
      user: userPkHex,
    }),
  ]);

  const local = loadPreferences(prefsKey);
  // The node returns bech32 + hex forms; local entries may hold either.
  const nodeFollowIds = new Set(
    followRes.spaces.flatMap(s => [s.space_id, s.space_id_hex])
  );
  const nodeSavedIds = new Set(savedRes.posts.map(p => p.content_id));

  // Push local-only entries up (migration of pre-R2 localStorage state).
  for (const s of local.followedSpaces) {
    if (s.id && !nodeFollowIds.has(s.id)) {
      await rpc.call('follow_space', { user: userPkHex, space_id: s.id }).catch(() => undefined);
    }
  }
  for (const postId of local.savedPosts) {
    if (postId && !nodeSavedIds.has(postId)) {
      await rpc.call('save_post', { user: userPkHex, content_id: postId }).catch(() => undefined);
    }
  }

  // Merge node entries into the local cache, keeping local metadata
  // (displayName, muted) for spaces we already knew about.
  const byId = new Map(local.followedSpaces.map(s => [s.id, s]));
  const mergedSpaces: FeedSource[] = followRes.spaces.map(s => {
    const existing = byId.get(s.space_id) ?? byId.get(s.space_id_hex);
    return existing
      ? { ...existing, id: s.space_id }
      : {
          type: 'space' as const,
          id: s.space_id,
          addedAt: (s.followed_at || 0) * 1000,
          muted: false,
          notifications: true,
        };
  });
  // Local-only follows we just pushed stay in the list.
  for (const s of local.followedSpaces) {
    if (s.id && !nodeFollowIds.has(s.id) && !mergedSpaces.some(m => m.id === s.id)) {
      mergedSpaces.push(s);
    }
  }
  const mergedSaved = Array.from(new Set([...savedRes.posts.map(p => p.content_id), ...local.savedPosts]));

  savePreferences(prefsKey, {
    ...local,
    followedSpaces: mergedSpaces,
    savedPosts: mergedSaved,
  });
  return true;
}

/**
 * Default preferences for new users
 */
function getDefaultPreferences(): FeedPreferences {
  return {
    followedSpaces: [],
    followedUsers: [],
    savedPosts: [],
    showRepliesInFeed: false,
    showEngagementsInFeed: false,
    sortOrder: 'recent',
    compactMode: false,
  };
}

/**
 * Load preferences from localStorage
 */
function loadPreferences(userPkHex: string): FeedPreferences {
  try {
    const stored = localStorage.getItem(getStorageKey(userPkHex));
    if (!stored) {
      return getDefaultPreferences();
    }

    const parsed = JSON.parse(stored) as StoredFeedPreferences;

    // Migration: handle old versions if needed
    if (parsed.version !== CURRENT_VERSION) {
      // Currently only version 1, so no migration needed
    }

    return {
      followedSpaces: parsed.followedSpaces ?? [],
      followedUsers: parsed.followedUsers ?? [],
      savedPosts: parsed.savedPosts ?? [],
      showRepliesInFeed: parsed.settings?.showRepliesInFeed ?? false,
      showEngagementsInFeed: parsed.settings?.showEngagementsInFeed ?? false,
      sortOrder: parsed.settings?.sortOrder ?? 'recent',
      compactMode: parsed.settings?.compactMode ?? false,
    };
  } catch (error) {
    console.error('[FeedPrefs] Failed to load preferences:', error);
    return getDefaultPreferences();
  }
}

/**
 * Save preferences to localStorage
 */
function savePreferences(userPkHex: string, prefs: FeedPreferences): void {
  try {
    const stored: StoredFeedPreferences = {
      version: CURRENT_VERSION,
      followedSpaces: prefs.followedSpaces,
      followedUsers: prefs.followedUsers,
      savedPosts: prefs.savedPosts,
      settings: {
        showRepliesInFeed: prefs.showRepliesInFeed,
        showEngagementsInFeed: prefs.showEngagementsInFeed,
        sortOrder: prefs.sortOrder,
        compactMode: prefs.compactMode,
      },
      lastUpdated: Date.now(),
    };
    localStorage.setItem(getStorageKey(userPkHex), JSON.stringify(stored));
  } catch (error) {
    console.error('[FeedPrefs] Failed to save preferences:', error);
  }
}

/**
 * Hook result type
 */
export interface UseFeedPreferencesResult {
  /** Current preferences */
  preferences: FeedPreferences;
  /** Loading state */
  loading: boolean;

  // Space management
  followSpace: (spaceId: string, name?: string) => void;
  unfollowSpace: (spaceId: string) => void;
  muteSpace: (spaceId: string, muted: boolean) => void;
  isFollowingSpace: (spaceId: string) => boolean;
  isSpaceMuted: (spaceId: string) => boolean;

  // User management
  followUser: (userPk: string, name?: string) => void;
  unfollowUser: (userPk: string) => void;
  muteUser: (userPk: string, muted: boolean) => void;
  isFollowingUser: (userPk: string) => boolean;
  isUserMuted: (userPk: string) => boolean;

  // Saved posts
  savePost: (postId: string) => void;
  unsavePost: (postId: string) => void;
  isPostSaved: (postId: string) => boolean;

  // Settings
  updateSettings: (settings: Partial<Pick<FeedPreferences, 'showRepliesInFeed' | 'showEngagementsInFeed' | 'sortOrder' | 'compactMode'>>) => void;

  // Computed values
  followedSpaceIds: Set<string>;
  followedUserIds: Set<string>;
  savedPostIds: Set<string>;
  activeSpaceCount: number;
  activeUserCount: number;
}

/**
 * Hook to manage feed preferences
 */
export function useFeedPreferences(): UseFeedPreferencesResult {
  const { identity, isLoading: identityLoading } = useStoredIdentity();
  // Subscribing hook (not getParentConfig()) so prefsKey recomputes when the
  // desktop shell's config arrives async via postMessage after first render.
  const parentConfig = useParentRpcConfig();
  const { rpc, connected } = useRpc();
  const { publicKey: identityPubKey } = useFeedIdentity();
  const [preferences, setPreferences] = useState<FeedPreferences>(getDefaultPreferences);
  const [loading, setLoading] = useState(true);

  // The stable per-user key for preferences. In a plain browser this is the
  // browser identity's publicKey. In the desktop app the NODE holds the
  // identity (no browser keypair), so fall back to the node address the shell
  // injects — otherwise follow/save silently no-ops and nothing persists.
  const prefsKey = identity?.publicKey ?? parentConfig?.nodeAddress ?? null;

  // Load preferences once we know which key to use
  useEffect(() => {
    if (identityLoading) return;

    if (prefsKey) {
      const prefs = loadPreferences(prefsKey);
      setPreferences(prefs);
    } else {
      setPreferences(getDefaultPreferences());
    }
    setLoading(false);
  }, [prefsKey, identityLoading]);

  // Cross-instance sync: each useFeedPreferences() call holds its own state,
  // so Settings toggling "Compact Mode" never reached the Feed page's copy
  // until an app restart. localStorage 'storage' events don't fire in the
  // same document, so saves broadcast a custom event and every instance
  // reloads.
  useEffect(() => {
    if (!prefsKey) return;
    const onChanged = () => setPreferences(loadPreferences(prefsKey));
    window.addEventListener(PREFS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, onChanged);
  }, [prefsKey]);

  // Pull the node's follows/saves once per session per identity (R2): the node
  // is durable, localStorage is the cache — so a fresh browser profile
  // rehydrates instead of showing an empty feed and losing saved posts.
  useEffect(() => {
    if (!rpc || !connected || !identityPubKey || !prefsKey) return;
    if (nodeSyncStarted.has(identityPubKey)) return;
    nodeSyncStarted.add(identityPubKey);
    syncPrefsWithNode(rpc, identityPubKey, prefsKey)
      .then(() => window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT)))
      .catch(() => {
        // Node unreachable this attempt — allow a retry on next mount.
        nodeSyncStarted.delete(identityPubKey);
      });
  }, [rpc, connected, identityPubKey, prefsKey]);

  // Mirror a prefs mutation to the node (fire-and-forget: the local update is
  // already applied; the node is eventually consistent for durability).
  const mirrorToNode = useCallback(
    (method: string, params: Record<string, unknown>) => {
      if (!rpc || !identityPubKey) return;
      rpc.call(method, { user: identityPubKey, ...params }).catch((e: unknown) => {
        console.warn(`[FeedPrefs] ${method} did not reach the node:`, e);
      });
    },
    [rpc, identityPubKey]
  );

  // Helper to save preferences
  const persist = useCallback((newPrefs: FeedPreferences) => {
    if (prefsKey) {
      savePreferences(prefsKey, newPrefs);
      // Notify sibling hook instances (Feed page, nav, etc.) in this document.
      window.dispatchEvent(new CustomEvent(PREFS_CHANGED_EVENT));
    } else {
      console.warn('[FeedPrefs] No identity or node address - cannot persist preferences');
    }
  }, [prefsKey]);

  // Space management
  const followSpace = useCallback((spaceId: string, name?: string) => {
    if (!spaceId) {
      console.error('[FeedPrefs] Cannot follow space with empty ID');
      return;
    }
    setPreferences(prev => {
      if (prev.followedSpaces.some(s => s.id === spaceId)) {
        return prev; // Already following
      }
      const newSource: FeedSource = {
        type: 'space',
        id: spaceId,
        displayName: name,
        addedAt: Date.now(),
        muted: false,
        notifications: true,
      };
      const newPrefs = {
        ...prev,
        followedSpaces: [...prev.followedSpaces, newSource],
      };
      persist(newPrefs);
      return newPrefs;
    });
    mirrorToNode('follow_space', { space_id: spaceId });
  }, [persist, mirrorToNode]);

  const unfollowSpace = useCallback((spaceId: string) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        followedSpaces: prev.followedSpaces.filter(s => s.id !== spaceId),
      };
      persist(newPrefs);
      return newPrefs;
    });
    mirrorToNode('unfollow_space', { space_id: spaceId });
  }, [persist, mirrorToNode]);

  const muteSpace = useCallback((spaceId: string, muted: boolean) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        followedSpaces: prev.followedSpaces.map(s =>
          s.id === spaceId ? { ...s, muted } : s
        ),
      };
      persist(newPrefs);
      return newPrefs;
    });
  }, [persist]);

  const isFollowingSpace = useCallback((spaceId: string) => {
    return preferences.followedSpaces.some(s => s.id === spaceId);
  }, [preferences.followedSpaces]);

  const isSpaceMuted = useCallback((spaceId: string) => {
    return preferences.followedSpaces.find(s => s.id === spaceId)?.muted ?? false;
  }, [preferences.followedSpaces]);

  // User management
  const followUser = useCallback((userPk: string, name?: string) => {
    setPreferences(prev => {
      if (prev.followedUsers.some(u => u.id === userPk)) {
        return prev; // Already following
      }
      const newSource: FeedSource = {
        type: 'user',
        id: userPk,
        displayName: name,
        addedAt: Date.now(),
        muted: false,
        notifications: true,
      };
      const newPrefs = {
        ...prev,
        followedUsers: [...prev.followedUsers, newSource],
      };
      persist(newPrefs);
      return newPrefs;
    });
  }, [persist]);

  const unfollowUser = useCallback((userPk: string) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        followedUsers: prev.followedUsers.filter(u => u.id !== userPk),
      };
      persist(newPrefs);
      return newPrefs;
    });
  }, [persist]);

  const muteUser = useCallback((userPk: string, muted: boolean) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        followedUsers: prev.followedUsers.map(u =>
          u.id === userPk ? { ...u, muted } : u
        ),
      };
      persist(newPrefs);
      return newPrefs;
    });
  }, [persist]);

  const isFollowingUser = useCallback((userPk: string) => {
    return preferences.followedUsers.some(u => u.id === userPk);
  }, [preferences.followedUsers]);

  const isUserMuted = useCallback((userPk: string) => {
    return preferences.followedUsers.find(u => u.id === userPk)?.muted ?? false;
  }, [preferences.followedUsers]);

  // Saved posts
  const savePost = useCallback((postId: string) => {
    setPreferences(prev => {
      if (prev.savedPosts.includes(postId)) {
        return prev; // Already saved
      }
      const newPrefs = {
        ...prev,
        savedPosts: [...prev.savedPosts, postId],
      };
      persist(newPrefs);
      return newPrefs;
    });
    mirrorToNode('save_post', { content_id: postId });
  }, [persist, mirrorToNode]);

  const unsavePost = useCallback((postId: string) => {
    setPreferences(prev => {
      const newPrefs = {
        ...prev,
        savedPosts: prev.savedPosts.filter(id => id !== postId),
      };
      persist(newPrefs);
      return newPrefs;
    });
    mirrorToNode('unsave_post', { content_id: postId });
  }, [persist, mirrorToNode]);

  const isPostSaved = useCallback((postId: string) => {
    return preferences.savedPosts.includes(postId);
  }, [preferences.savedPosts]);

  // Settings
  const updateSettings = useCallback((settings: Partial<Pick<FeedPreferences, 'showRepliesInFeed' | 'showEngagementsInFeed' | 'sortOrder' | 'compactMode'>>) => {
    setPreferences(prev => {
      const newPrefs = { ...prev, ...settings };
      persist(newPrefs);
      return newPrefs;
    });
  }, [persist]);

  // Computed sets for quick lookup
  const followedSpaceIds = useMemo(
    () => new Set(preferences.followedSpaces.map(s => s.id)),
    [preferences.followedSpaces]
  );

  const followedUserIds = useMemo(
    () => new Set(preferences.followedUsers.map(u => u.id)),
    [preferences.followedUsers]
  );

  const savedPostIds = useMemo(
    () => new Set(preferences.savedPosts),
    [preferences.savedPosts]
  );

  // Count non-muted sources
  const activeSpaceCount = useMemo(
    () => preferences.followedSpaces.filter(s => !s.muted).length,
    [preferences.followedSpaces]
  );

  const activeUserCount = useMemo(
    () => preferences.followedUsers.filter(u => !u.muted).length,
    [preferences.followedUsers]
  );

  return {
    preferences,
    loading,
    followSpace,
    unfollowSpace,
    muteSpace,
    isFollowingSpace,
    isSpaceMuted,
    followUser,
    unfollowUser,
    muteUser,
    isFollowingUser,
    isUserMuted,
    savePost,
    unsavePost,
    isPostSaved,
    updateSettings,
    followedSpaceIds,
    followedUserIds,
    savedPostIds,
    activeSpaceCount,
    activeUserCount,
  };
}

/**
 * Simple hook for following a specific space
 */
export function useFollowSpace(spaceId: string): {
  isFollowing: boolean;
  isMuted: boolean;
  toggle: () => void;
  toggleMute: () => void;
  loading: boolean;
} {
  const {
    isFollowingSpace,
    isSpaceMuted,
    followSpace,
    unfollowSpace,
    muteSpace,
    loading,
  } = useFeedPreferences();

  const isFollowing = isFollowingSpace(spaceId);
  const isMuted = isSpaceMuted(spaceId);

  const toggle = useCallback(() => {
    if (isFollowing) {
      unfollowSpace(spaceId);
    } else {
      followSpace(spaceId);
    }
  }, [isFollowing, spaceId, followSpace, unfollowSpace]);

  const toggleMute = useCallback(() => {
    muteSpace(spaceId, !isMuted);
  }, [spaceId, isMuted, muteSpace]);

  return { isFollowing, isMuted, toggle, toggleMute, loading };
}

/**
 * Simple hook for following a specific user
 */
export function useFollowUser(userPk: string): {
  isFollowing: boolean;
  isMuted: boolean;
  toggle: () => void;
  toggleMute: () => void;
  loading: boolean;
} {
  const {
    isFollowingUser,
    isUserMuted,
    followUser,
    unfollowUser,
    muteUser,
    loading,
  } = useFeedPreferences();

  const isFollowing = isFollowingUser(userPk);
  const isMuted = isUserMuted(userPk);

  const toggle = useCallback(() => {
    if (isFollowing) {
      unfollowUser(userPk);
    } else {
      followUser(userPk);
    }
  }, [isFollowing, userPk, followUser, unfollowUser]);

  const toggleMute = useCallback(() => {
    muteUser(userPk, !isMuted);
  }, [userPk, isMuted, muteUser]);

  return { isFollowing, isMuted, toggle, toggleMute, loading };
}
