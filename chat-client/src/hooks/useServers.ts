/**
 * useServers - Hook for managing server (space) list
 *
 * Maps: Server = Space in Swimchain terminology
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { useChatIdentity } from './useChatIdentity';

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
  const { identity } = useChatIdentity();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const myPubKey = identity?.publicKey ?? null;

  const fetchServers = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Public spaces (browsable) — list_spaces now returns only public spaces.
      // Spaces with no resolved name (name: null on the wire) are hidden — a
      // bare hex id is meaningless to browse; they appear once the name resolves.
      const result = await rpc.listSpaces();
      const publicServers: Server[] = result.spaces
        .filter(space => space.name)
        .map(space => ({
          id: space.space_id,
          name: space.name ?? space.space_id.substring(0, 12) + '...',
          icon: getServerIcon(space.name ?? ''),
          unreadCount: 0, // TODO: Track unread counts per server
          hasNotification: false,
          memberCount: space.post_count,
          description: `${space.post_count} posts`,
        }));

      // Merge the user's own private channels so they still appear as servers even
      // though public browse omits them. get_my_private_spaces already hides DM and
      // profile spaces, so this adds only real private channels.
      let privateServers: Server[] = [];
      if (myPubKey) {
        try {
          const priv = (await rpc.call('get_my_private_spaces', { user: myPubKey })) as {
            spaces: Array<{ space_id: string; space_id_bech32?: string; name?: string | null }>;
          };
          privateServers = (priv.spaces ?? []).map(s => ({
            id: s.space_id_bech32 || s.space_id,
            name: s.name || 'Private channel',
            unreadCount: 0,
            hasNotification: false,
          }));
        } catch {
          /* private spaces are best-effort; ignore */
        }
      }

      const seen = new Set(publicServers.map(s => s.id));
      const merged = [...publicServers, ...privateServers.filter(s => !seen.has(s.id))];
      setServers(merged);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch servers');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, myPubKey]);

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
