/**
 * HiddenSpacesManager — list the spaces this identity hid (right-click → Hide)
 * and unhide them. Hidden state is a node-side pref: the node drops hidden
 * spaces from list_spaces, so hiding/unhiding here affects every client.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
// Reuses the blocklist list styling; imported here so the styles load even
// when this manager mounts without the BlocklistManager (see the forum
// JoinPrivateSpace white-textarea bug for why every component owns its CSS).
import './BlocklistManager.css';

interface HiddenSpace {
  spaceId: string;
  name: string | null;
  hiddenAt: number;
}

export function HiddenSpacesManager(): JSX.Element {
  const { rpc, connected } = useRpc();
  const { publicKey } = useFeedIdentity();
  const [hidden, setHidden] = useState<HiddenSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!rpc || !connected || !publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const [hiddenRes, spacesRes] = await Promise.all([
        rpc.call<{ spaces: Array<{ space_id: string; hidden_at: number }> }>(
          'list_hidden_spaces',
          { user: publicKey }
        ),
        // include_hidden so we can resolve names for the hidden ones too.
        rpc.call<{ spaces: Array<{ space_id: string; name: string | null }> }>('list_spaces', {
          limit: 200,
          include_hidden: true,
        }),
      ]);
      const names = new Map(spacesRes.spaces.map(s => [s.space_id, s.name]));
      setHidden(
        hiddenRes.spaces.map(h => ({
          spaceId: h.space_id,
          name: names.get(h.space_id) ?? null,
          hiddenAt: h.hidden_at,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load hidden spaces');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unhide = useCallback(
    async (spaceId: string) => {
      if (!rpc || !publicKey) return;
      try {
        await rpc.call('unhide_space', { user: publicKey, space_id: spaceId });
        setHidden(prev => prev.filter(h => h.spaceId !== spaceId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to unhide');
      }
    },
    [rpc, publicKey]
  );

  return (
    <div className="blocklist-manager">
      <div className="blocklist-header">
        <h3>Hidden Spaces</h3>
        <p className="blocklist-description">
          Spaces you've hidden don't appear in Discover, your feed sources, or search.
          They still exist on the network.
        </p>
      </div>

      {error && <p className="blocklist-description" role="alert">{error}</p>}

      {loading ? (
        <div className="blocklist-empty"><p>Loading…</p></div>
      ) : hidden.length === 0 ? (
        <div className="blocklist-empty">
          <p>No hidden spaces.</p>
          <p className="blocklist-hint">Right-click a space in Discover to hide it.</p>
        </div>
      ) : (
        <ul className="blocklist-items">
          {hidden.map(h => (
            <li key={h.spaceId} className="blocklist-item">
              <span className="blocklist-item-id" title={h.spaceId}>
                {h.name ?? `${h.spaceId.slice(0, 12)}…${h.spaceId.slice(-6)}`}
              </span>
              <button
                type="button"
                className="blocklist-unblock-btn"
                onClick={() => unhide(h.spaceId)}
              >
                Unhide
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HiddenSpacesManager;
