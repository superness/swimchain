/**
 * React hook for managing archived content storage
 */

import { useState, useEffect, useCallback } from 'react';
import type { ArchiveEntry, SpaceId } from '../types';
import {
  ArchiveStorage,
  getArchiveStorage,
  type StorageStats,
} from '../services/ArchiveStorage';

interface UseArchiveStorageResult {
  /** Whether storage is initialized and ready */
  isReady: boolean;
  /** Current storage statistics */
  stats: StorageStats | null;
  /** All archived entries */
  entries: ArchiveEntry[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error if operation failed */
  error: Error | null;
  /** Archive new content */
  archive: (content: ArchiveEntry) => Promise<boolean>;
  /** Delete an archived entry */
  deleteEntry: (postHash: string) => Promise<boolean>;
  /** Search archived content */
  search: (query: string) => Promise<ArchiveEntry[]>;
  /** Refresh entries and stats */
  refresh: () => Promise<void>;
  /** Clear all archived content */
  clearAll: () => Promise<boolean>;
  /** Format bytes to human-readable */
  formatBytes: (bytes: number) => string;
}

/**
 * Hook for managing archived content.
 *
 * @param spaceId - Optional space ID to filter entries
 * @returns Archive storage state and controls
 */
export function useArchiveStorage(spaceId?: SpaceId): UseArchiveStorageResult {
  const [isReady, setIsReady] = useState(false);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [storage, setStorage] = useState<ArchiveStorage | null>(null);

  // Initialize storage
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const s = await getArchiveStorage();
        if (mounted) {
          setStorage(s);
          setIsReady(true);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to init storage'));
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Refresh data function
  const refresh = useCallback(async () => {
    if (!storage) return;

    setIsLoading(true);
    setError(null);

    try {
      const [newStats, newEntries] = await Promise.all([
        storage.getStats(),
        storage.getArchivedContent(spaceId),
      ]);

      setStats(newStats);
      setEntries(newEntries);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh'));
    } finally {
      setIsLoading(false);
    }
  }, [storage, spaceId]);

  // Load data when storage is ready
  useEffect(() => {
    if (isReady && storage) {
      refresh();
    }
  }, [isReady, storage, refresh]);

  // Archive content
  const archive = useCallback(
    async (content: ArchiveEntry): Promise<boolean> => {
      if (!storage) return false;

      try {
        await storage.archiveContent(content);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to archive'));
        return false;
      }
    },
    [storage, refresh]
  );

  // Delete entry
  const deleteEntry = useCallback(
    async (postHash: string): Promise<boolean> => {
      if (!storage) return false;

      try {
        await storage.deleteEntry(postHash);
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete'));
        return false;
      }
    },
    [storage, refresh]
  );

  // Search
  const search = useCallback(
    async (query: string): Promise<ArchiveEntry[]> => {
      if (!storage) return [];

      try {
        return await storage.searchArchive(query);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to search'));
        return [];
      }
    },
    [storage]
  );

  // Clear all
  const clearAll = useCallback(async (): Promise<boolean> => {
    if (!storage) return false;

    try {
      await storage.clearAll();
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to clear'));
      return false;
    }
  }, [storage, refresh]);

  // Format bytes helper
  const formatBytes = useCallback(
    (bytes: number): string => {
      return storage?.formatBytes(bytes) ?? `${bytes} B`;
    },
    [storage]
  );

  return {
    isReady,
    stats,
    entries,
    isLoading,
    error,
    archive,
    deleteEntry,
    search,
    refresh,
    clearAll,
    formatBytes,
  };
}
