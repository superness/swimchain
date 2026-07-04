/**
 * Hook for managing user's personal blocklist - Search Client
 *
 * Client-side feature - blocked content still exists on the network,
 * but is hidden from the user's view in search results.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchIdentity, storageKeyFor } from './useSearchIdentity';

const STORAGE_KEY_BASE = 'swimchain-search-blocklist';

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

export function useBlocklist() {
  const [blocklist, setBlocklist] = useState<Blocklist>(createEmptyBlocklist);
  // In the desktop app the node owns the identity; key the blocklist on the
  // node address so it is stable per identity and consistent with the other
  // embedded clients. Standalone browser tabs keep the base key unchanged.
  const { nodeAddress } = useSearchIdentity();
  const storageKey = storageKeyFor(STORAGE_KEY_BASE, nodeAddress);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Blocklist;
        setBlocklist({
          users: parsed.users || [],
          posts: parsed.posts || [],
          spaces: parsed.spaces || [],
          replies: parsed.replies || [],
        });
      } else {
        setBlocklist(createEmptyBlocklist());
      }
    } catch (error) {
      console.error('[Blocklist] Failed to load:', error);
    }
  }, [storageKey]);

  const saveBlocklist = useCallback((newBlocklist: Blocklist) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newBlocklist));
      setBlocklist(newBlocklist);
    } catch (error) {
      console.error('[Blocklist] Failed to save:', error);
    }
  }, [storageKey]);

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

  const filterBlocked = useCallback(<T extends { id: string; author?: string; authorId?: string }>(
    items: T[],
    type: BlockType,
    options?: { alsoFilterByAuthor?: boolean }
  ): T[] => {
    return items.filter(item => {
      if (isBlocked(item.id, type)) return false;
      if (options?.alsoFilterByAuthor) {
        const authorField = item.author || item.authorId;
        if (authorField && isUserBlocked(authorField)) return false;
      }
      return true;
    });
  }, [isBlocked, isUserBlocked]);

  return {
    isUserBlocked,
    isBlocked,
    block,
    unblock,
    getBlocked,
    blocklist,
    clearAll,
    filterBlocked,
  };
}
