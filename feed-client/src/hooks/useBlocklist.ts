/**
 * Hook for managing user's personal blocklist
 *
 * This is a client-side feature - blocked content still exists on the network,
 * but is hidden from the user's view in this client.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'swimchain-blocklist';

export type BlockType = 'user' | 'post' | 'space' | 'reply';

interface BlockedItem {
  id: string;           // The ID of the blocked item
  type: BlockType;      // Type of item
  blockedAt: number;    // Timestamp when blocked
  reason?: string;      // Optional reason
}

interface Blocklist {
  users: BlockedItem[];
  posts: BlockedItem[];
  spaces: BlockedItem[];
  replies: BlockedItem[];
}

export interface UseBlocklistResult {
  /** Check if a user is blocked */
  isUserBlocked: (userId: string) => boolean;
  /** Check if a post is blocked */
  isPostBlocked: (postId: string) => boolean;
  /** Check if a space is blocked */
  isSpaceBlocked: (spaceId: string) => boolean;
  /** Check if a reply is blocked */
  isReplyBlocked: (replyId: string) => boolean;
  /** Check if any item is blocked (generic) */
  isBlocked: (id: string, type: BlockType) => boolean;
  /** Block an item */
  block: (id: string, type: BlockType, reason?: string) => void;
  /** Unblock an item */
  unblock: (id: string, type: BlockType) => void;
  /** Get all blocked items of a type */
  getBlocked: (type: BlockType) => BlockedItem[];
  /** Get all blocked items */
  blocklist: Blocklist;
  /** Clear all blocks */
  clearAll: () => void;
  /** Filter an array of items, removing blocked ones */
  filterBlocked: <T extends { id: string; author?: string; authorId?: string }>(
    items: T[],
    type: BlockType,
    options?: { alsoFilterByAuthor?: boolean }
  ) => T[];
}

function createEmptyBlocklist(): Blocklist {
  return {
    users: [],
    posts: [],
    spaces: [],
    replies: [],
  };
}

function getListKey(type: BlockType): keyof Blocklist {
  switch (type) {
    case 'user': return 'users';
    case 'post': return 'posts';
    case 'space': return 'spaces';
    case 'reply': return 'replies';
  }
}

export function useBlocklist(): UseBlocklistResult {
  const [blocklist, setBlocklist] = useState<Blocklist>(createEmptyBlocklist);

  // Load blocklist from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Blocklist;
        // Ensure all arrays exist (migration safety)
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

  // Save blocklist to localStorage whenever it changes
  const saveBlocklist = useCallback((newBlocklist: Blocklist) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBlocklist));
      setBlocklist(newBlocklist);
    } catch (error) {
      console.error('[Blocklist] Failed to save:', error);
    }
  }, []);

  // Create lookup sets for O(1) checking
  const blockedSets = useMemo(() => ({
    users: new Set(blocklist.users.map(b => b.id)),
    posts: new Set(blocklist.posts.map(b => b.id)),
    spaces: new Set(blocklist.spaces.map(b => b.id)),
    replies: new Set(blocklist.replies.map(b => b.id)),
  }), [blocklist]);

  const isBlocked = useCallback((id: string, type: BlockType): boolean => {
    const key = getListKey(type);
    return blockedSets[key].has(id);
  }, [blockedSets]);

  const isUserBlocked = useCallback((userId: string): boolean => {
    return blockedSets.users.has(userId);
  }, [blockedSets]);

  const isPostBlocked = useCallback((postId: string): boolean => {
    return blockedSets.posts.has(postId);
  }, [blockedSets]);

  const isSpaceBlocked = useCallback((spaceId: string): boolean => {
    return blockedSets.spaces.has(spaceId);
  }, [blockedSets]);

  const isReplyBlocked = useCallback((replyId: string): boolean => {
    return blockedSets.replies.has(replyId);
  }, [blockedSets]);

  const block = useCallback((id: string, type: BlockType, reason?: string) => {
    const key = getListKey(type);

    // Check if already blocked
    if (blocklist[key].some(b => b.id === id)) {
      return;
    }

    const newItem: BlockedItem = {
      id,
      type,
      blockedAt: Date.now(),
      reason,
    };

    const newBlocklist = {
      ...blocklist,
      [key]: [...blocklist[key], newItem],
    };

    saveBlocklist(newBlocklist);
    console.log(`[Blocklist] Blocked ${type}: ${id}`);
  }, [blocklist, saveBlocklist]);

  const unblock = useCallback((id: string, type: BlockType) => {
    const key = getListKey(type);

    const newBlocklist = {
      ...blocklist,
      [key]: blocklist[key].filter(b => b.id !== id),
    };

    saveBlocklist(newBlocklist);
    console.log(`[Blocklist] Unblocked ${type}: ${id}`);
  }, [blocklist, saveBlocklist]);

  const getBlocked = useCallback((type: BlockType): BlockedItem[] => {
    return blocklist[getListKey(type)];
  }, [blocklist]);

  const clearAll = useCallback(() => {
    saveBlocklist(createEmptyBlocklist());
    console.log('[Blocklist] Cleared all blocks');
  }, [saveBlocklist]);

  // Extended to support feed-client's authorId property
  const filterBlocked = useCallback(<T extends { id: string; author?: string; authorId?: string }>(
    items: T[],
    type: BlockType,
    options?: { alsoFilterByAuthor?: boolean }
  ): T[] => {
    return items.filter(item => {
      // Check if the item itself is blocked
      if (isBlocked(item.id, type)) {
        return false;
      }
      // Optionally also check if the author is blocked
      if (options?.alsoFilterByAuthor) {
        const authorId = item.author || item.authorId;
        if (authorId && isUserBlocked(authorId)) {
          return false;
        }
      }
      return true;
    });
  }, [isBlocked, isUserBlocked]);

  return {
    isUserBlocked,
    isPostBlocked,
    isSpaceBlocked,
    isReplyBlocked,
    isBlocked,
    block,
    unblock,
    getBlocked,
    blocklist,
    clearAll,
    filterBlocked,
  };
}
