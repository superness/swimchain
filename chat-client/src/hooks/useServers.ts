/**
 * useServers - Hook for managing server (space) list
 *
 * Maps: Server = Space in Swimchain terminology
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';

export interface Server {
  id: string;
  name: string;
  icon?: string;
  unreadCount: number;
  hasNotification: boolean;
  memberCount?: number;
  description?: string;
}

/**
 * Get an icon/color for a server based on its name
 */
function getServerIcon(name: string): string | undefined {
  const lowerName = name.toLowerCase();
  // Return emoji for known categories, undefined for default (initials)
  if (lowerName.includes('rust')) return undefined; // Will show initials
  if (lowerName.includes('general')) return undefined;
  if (lowerName.includes('test')) return undefined;
  return undefined;
}

/**
 * Hook to fetch and manage server (space) list
 *
 * Returns servers formatted for Discord-style ServerList component
 */
export function useServers() {
  const { rpc, connected } = useRpc();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await rpc.listSpaces();

      // Transform RPC spaces to Server format
      const transformedServers: Server[] = result.spaces.map(space => ({
        id: space.space_id,
        name: space.name ?? space.space_id.substring(0, 12) + '...',
        icon: getServerIcon(space.name ?? ''),
        unreadCount: 0, // TODO: Track unread counts per server
        hasNotification: false,
        memberCount: space.post_count,
        description: `${space.post_count} posts`,
      }));

      setServers(transformedServers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch servers');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Refresh servers periodically (every 30 seconds)
  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(fetchServers, 30000);
    return () => clearInterval(interval);
  }, [connected, fetchServers]);

  return {
    servers,
    loading,
    error,
    refetch: fetchServers,
  };
}
