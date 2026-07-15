/**
 * SpaceContextMenu — right-click menu for a space with a single "Hide" action.
 *
 * Hiding is a node-side pref (hide_space RPC): the node drops hidden spaces
 * from list_spaces for this identity, so every client's browse surface cleans
 * up at once. Unhide lives in Settings → Hidden Spaces.
 */

import { useEffect, useCallback } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import './SpaceContextMenu.css';

export interface SpaceMenuTarget {
  x: number;
  y: number;
  spaceId: string;
  name: string | null;
}

interface SpaceContextMenuProps {
  target: SpaceMenuTarget;
  onClose: () => void;
  /** Called after the node confirms the hide (refetch your space list here). */
  onHidden: (spaceId: string) => void;
}

export function SpaceContextMenu({ target, onClose, onHidden }: SpaceContextMenuProps): JSX.Element {
  const { rpc } = useRpc();
  const { publicKey } = useFeedIdentity();

  // Any click elsewhere or Escape dismisses the menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('click', onClose);
    window.addEventListener('contextmenu', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onClose);
      window.removeEventListener('contextmenu', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const hide = useCallback(async () => {
    onClose();
    if (!rpc || !publicKey) return;
    try {
      await rpc.call('hide_space', { user: publicKey, space_id: target.spaceId });
      onHidden(target.spaceId);
    } catch (e) {
      console.warn('[HideSpace] hide_space failed:', e);
    }
  }, [rpc, publicKey, target.spaceId, onClose, onHidden]);

  const label = target.name ?? `${target.spaceId.slice(0, 12)}…`;

  return (
    <div
      className="space-context-menu"
      style={{ left: target.x, top: target.y }}
      role="menu"
      // Keep clicks inside the menu from triggering the window close handler
      // before the menu item's own onClick runs.
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className="space-context-menu__item" role="menuitem" onClick={hide}>
        🚫 Hide “{label}”
      </button>
      <div className="space-context-menu__hint">Unhide anytime in Settings</div>
    </div>
  );
}

export default SpaceContextMenu;
