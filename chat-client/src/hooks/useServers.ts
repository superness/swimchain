/**
 * useServers - Hook for managing the server (space) rail
 *
 * Maps: Server = Space in Swimchain terminology.
 *
 * Discord-style curation: the rail shows only the spaces this identity
 * FOLLOWS (node-side pref, follow_space/unfollow_space RPCs — shared across
 * clients), plus the user's own private channels. Everything else is joinable
 * from the SpaceBrowserModal behind the rail's + button.
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

// Space ids we've already asked peers to resolve names for (once per session).
const spaceNamesAsked = new Set<string>();

/** localStorage flag: the one-time "seed follows from my posting activity" ran. */
function seedFlagKey(pubKey: string): string {
  return `chat.followSeeded.v1:${pubKey.toLowerCase()}`;
}

interface FollowedSpacesResult {
  spaces: Array<{ space_id: string; space_id_hex?: string; followed_at?: number }>;
}

interface UserPostsResult {
  items?: Array<{ space_id?: string }>;
}

/**
 * Hook to fetch and manage the followed-server (space) rail
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
    if (!rpc || !connected || !myPubKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Public spaces (browsable) — list_spaces now returns only public spaces.
      const result = await rpc.listSpaces();

      // Nudge the node to resolve unnamed spaces' names from peers (names are
      // not derivable from the chain for legacy spaces); refresh once after.
      // This keeps the browse modal (and other clients) improving over time.
      const unnamedIds = result.spaces
        .filter(space => !space.name)
        .map(space => space.space_id)
        .filter(id => !spaceNamesAsked.has(id));
      if (unnamedIds.length > 0) {
        unnamedIds.forEach(id => {
          spaceNamesAsked.add(id);
          rpc.call('resolve_space_name', { space_id: id }).catch(() => undefined);
        });
        setTimeout(() => {
          fetchServers().catch(() => undefined);
        }, 2000);
      }

      // The user's followed set (node-side pref, roams across clients).
      let followedIds = new Set<string>(
        ((await rpc.call('list_followed_spaces', { user: myPubKey })) as FollowedSpacesResult)
          .spaces.map(s => s.space_id),
      );

      // One-time seeding: with no follows yet, follow the NAMED public spaces
      // this identity has posted or replied in, so the rail starts useful
      // instead of empty. Guarded per-identity so an unfollow sticks.
      const seedKey = seedFlagKey(myPubKey);
      if (followedIds.size === 0 && !localStorage.getItem(seedKey)) {
        try {
          const posts = (await rpc.call('get_user_posts', {
            user_id: myPubKey,
            limit: 200,
            include_replies: true,
          })) as UserPostsResult;
          const namedListed = new Map(
            result.spaces.filter(s => s.name).map(s => [s.space_id, s] as const),
          );
          const activeIn = [
            ...new Set((posts.items ?? []).map(i => i.space_id).filter(Boolean) as string[]),
          ].filter(id => namedListed.has(id));
          await Promise.all(
            activeIn.map(id =>
              rpc.call('follow_space', { user: myPubKey, space_id: id }).catch(() => undefined),
            ),
          );
          activeIn.forEach(id => followedIds.add(id));
        } catch {
          /* seeding is best-effort; the + button always works */
        }
        localStorage.setItem(seedKey, '1');
      }

      // Rail = followed spaces only. A followed space with no resolved name
      // still shows (the user chose it) with a placeholder label.
      const publicServers: Server[] = result.spaces
        .filter(space => followedIds.has(space.space_id))
        .map(space => ({
          id: space.space_id,
          name: space.name ?? 'Unnamed space',
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
