/**
 * Hook for managing user's personal blocklist
 *
 * This is a client-side feature - blocked content still exists on the network,
 * but is hidden from the user's view in this client.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

const STORAGE_KEY = 'swimchain-blocklist';

export type BlockType = 'user' | 'message' | 'channel' | 'server';

interface BlockedItem {
  id: string;           // The ID of the blocked item
  type: BlockType;      // Type of item
  blockedAt: number;    // Timestamp when blocked
  reason?: string;      // Optional reason
}

interface Blocklist {
  users: BlockedItem[];
  messages: BlockedItem[];
  channels: BlockedItem[];
  servers: BlockedItem[];
}

interface UseBlocklistResult {
  /** Check if a user is blocked */
  isUserBlocked: (userId: string) => boolean;
  /** Check if a message is blocked */
  isMessageBlocked: (messageId: string) => boolean;
  /** Check if a channel is blocked */
  isChannelBlocked: (channelId: string) => boolean;
  /** Check if a server is blocked */
  isServerBlocked: (serverId: string) => boolean;
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
  filterBlocked: <T extends { id: string; authorId?: string }>(
    items: T[],
    type: BlockType,
    options?: { alsoFilterByAuthor?: boolean }
  ) => T[];
}

function createEmptyBlocklist(): Blocklist {
  return {
    users: [],
    messages: [],
    channels: [],
    servers: [],
  };
}

function getListKey(type: BlockType): keyof Blocklist {
  switch (type) {
    case 'user': return 'users';
    case 'message': return 'messages';
    case 'channel': return 'channels';
    case 'server': return 'servers';
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
          messages: parsed.messages || [],
          channels: parsed.channels || [],
          servers: parsed.servers || [],
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
    messages: new Set(blocklist.messages.map(b => b.id)),
    channels: new Set(blocklist.channels.map(b => b.id)),
    servers: new Set(blocklist.servers.map(b => b.id)),
  }), [blocklist]);

  const isBlocked = useCallback((id: string, type: BlockType): boolean => {
    const key = getListKey(type);
    return blockedSets[key].has(id);
  }, [blockedSets]);

  const isUserBlocked = useCallback((userId: string): boolean => {
    return blockedSets.users.has(userId);
  }, [blockedSets]);

  const isMessageBlocked = useCallback((messageId: string): boolean => {
    return blockedSets.messages.has(messageId);
  }, [blockedSets]);

  const isChannelBlocked = useCallback((channelId: string): boolean => {
    return blockedSets.channels.has(channelId);
  }, [blockedSets]);

  const isServerBlocked = useCallback((serverId: string): boolean => {
    return blockedSets.servers.has(serverId);
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

  const filterBlocked = useCallback(<T extends { id: string; authorId?: string }>(
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
      if (options?.alsoFilterByAuthor && item.authorId && isUserBlocked(item.authorId)) {
        return false;
      }
      return true;
    });
  }, [isBlocked, isUserBlocked]);

  return {
    isUserBlocked,
    isMessageBlocked,
    isChannelBlocked,
    isServerBlocked,
    isBlocked,
    block,
    unblock,
    getBlocked,
    blocklist,
    clearAll,
    filterBlocked,
  };
}
