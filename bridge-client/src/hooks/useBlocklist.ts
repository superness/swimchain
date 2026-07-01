/**
 * Hook for managing user's personal blocklist - Bridge Client
 *
 * Client-side feature - blocked users' content is excluded from
 * bridging to prevent propagating unwanted content to external platforms.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'swimchain-bridge-blocklist';

export type BlockType = 'user' | 'post' | 'space' | 'reply';

interface BlockedItem {
  id: string;
  type: BlockType;
  blockedAt: number;
  reason?: string;
}

interface Blocklist {
  users: BlockedItem[];
  posts: BlockedItem[];
  spaces: BlockedItem[];
  replies: BlockedItem[];
}

function createEmptyBlocklist(): Blocklist {
  return { users: [], posts: [], spaces: [], replies: [] };
}

function getListKey(type: BlockType): keyof Blocklist {
  switch (type) {
    case 'user': return 'users';
    case 'post': return 'posts';
    case 'space': return 'spaces';
    case 'reply': return 'replies';
  }
}

/**
 * Get blocked user IDs from localStorage (for use outside React components).
 * Used by BridgeEngine to filter content before bridging.
 */
export function getBlockedUserIds(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Blocklist;
      return new Set((parsed.users || []).map(b => b.id));
    }
  } catch {
    // ignore
  }
  return new Set();
}

export function useBlocklist() {
  const [blocklist, setBlocklist] = useState<Blocklist>(createEmptyBlocklist);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Blocklist;
        setBlocklist({
          users: parsed.users || [],
          posts: parsed.posts || [],
          spaces: parsed.spaces || [],
          replies: parsed.replies || [],
        });
      }
    } catch (error) {
      console.error('[Blocklist] Failed to load:', error);
    }
  }, []);

  const saveBlocklist = useCallback((newBlocklist: Blocklist) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBlocklist));
      setBlocklist(newBlocklist);
    } catch (error) {
      console.error('[Blocklist] Failed to save:', error);
    }
  }, []);

  const blockedSets = useMemo(() => ({
    users: new Set(blocklist.users.map(b => b.id)),
    posts: new Set(blocklist.posts.map(b => b.id)),
    spaces: new Set(blocklist.spaces.map(b => b.id)),
    replies: new Set(blocklist.replies.map(b => b.id)),
  }), [blocklist]);

  const isBlocked = useCallback((id: string, type: BlockType): boolean => {
    return blockedSets[getListKey(type)].has(id);
  }, [blockedSets]);

  const isUserBlocked = useCallback((userId: string): boolean => {
    return blockedSets.users.has(userId);
  }, [blockedSets]);

  const block = useCallback((id: string, type: BlockType, reason?: string) => {
    const key = getListKey(type);
    if (blocklist[key].some(b => b.id === id)) return;

    const newBlocklist = {
      ...blocklist,
      [key]: [...blocklist[key], { id, type, blockedAt: Date.now(), reason }],
    };
    saveBlocklist(newBlocklist);
  }, [blocklist, saveBlocklist]);

  const unblock = useCallback((id: string, type: BlockType) => {
    const key = getListKey(type);
    const newBlocklist = {
      ...blocklist,
      [key]: blocklist[key].filter(b => b.id !== id),
    };
    saveBlocklist(newBlocklist);
  }, [blocklist, saveBlocklist]);

  const getBlocked = useCallback((type: BlockType): BlockedItem[] => {
    return blocklist[getListKey(type)];
  }, [blocklist]);

  const clearAll = useCallback(() => {
    saveBlocklist(createEmptyBlocklist());
  }, [saveBlocklist]);

  return {
    isUserBlocked,
    isBlocked,
    block,
    unblock,
    getBlocked,
    blocklist,
    clearAll,
  };
}
