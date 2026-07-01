/**
 * Hook for managing user's personal blocklist - Archiver Client
 *
 * Client-side feature - blocked authors' content is excluded from
 * at-risk lists and auto-engagement to avoid rescuing spam.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'swimchain-archiver-blocklist';

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
