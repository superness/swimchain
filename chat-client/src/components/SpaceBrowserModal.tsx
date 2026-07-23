/**
 * SpaceBrowserModal — the rail's "+" button: one surface for curating the
 * sidebar, Discord's "join a server" equivalent.
 *
 *  - Browse public (named) spaces and Join/Leave them. Joining follows the
 *    space node-side (follow_space pref), so the choice roams across clients.
 *  - Node mode: paste a `swiminv1:` invite code to join a private channel
 *    (moved here from the per-server channel sidebar).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRpc, useSpaceInvites } from '../hooks/useRpc';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { useToast } from './Toast';
import './SpaceBrowserModal.css';

interface BrowseSpace {
  id: string;
  name: string;
  postCount: number;
  followed: boolean;
}

interface SpaceBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a join/leave so the rail can refetch. */
  onChanged?: () => void;
}

/** Consistent avatar color per space id (matches ServerList's palette). */
function spaceColor(id: string): string {
  const colors = ['#4a90d9', '#5cb85c', '#f0ad4e', '#d9534f', '#9b59b6', '#17a2b8', '#6c757d', '#e83e8c'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
}

function spaceInitials(name: string): string {
  const words = name.split(/[\s-_]+/).filter(Boolean);
  if (words.length >= 2) return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function SpaceBrowserModal({ isOpen, onClose, onChanged }: SpaceBrowserModalProps): JSX.Element | null {
  const { rpc, connected } = useRpc();
  const { identity, mode } = useChatIdentity();
  const { redeem } = useSpaceInvites();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [spaces, setSpaces] = useState<BrowseSpace[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Private-channel invite redemption (node mode).
  const [inviteCode, setInviteCode] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);

  const myPubKey = identity?.publicKey ?? null;

  const fetchSpaces = useCallback(async () => {
    if (!rpc || !connected || !myPubKey) return;
    setLoading(true);
    try {
      const [listed, followed] = await Promise.all([
        rpc.listSpaces(),
        rpc.call('list_followed_spaces', { user: myPubKey }) as Promise<{
          spaces: Array<{ space_id: string }>;
        }>,
      ]);
      const followedIds = new Set(followed.spaces.map(s => s.space_id));
      setSpaces(
        listed.spaces
          .filter(s => s.name)
          .map(s => ({
            id: s.space_id,
            name: s.name!,
            postCount: s.post_count,
            followed: followedIds.has(s.space_id),
          }))
          .sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name)),
      );
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Failed to load spaces');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, myPubKey, showError]);

  useEffect(() => {
    if (isOpen) fetchSpaces();
  }, [isOpen, fetchSpaces]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const toggleFollow = async (space: BrowseSpace) => {
    if (!rpc || !myPubKey || busyId) return;
    setBusyId(space.id);
    try {
      await rpc.call(space.followed ? 'unfollow_space' : 'follow_space', {
        user: myPubKey,
        space_id: space.id,
      });
      setSpaces(prev => prev.map(s => (s.id === space.id ? { ...s, followed: !s.followed } : s)));
      onChanged?.();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not update follow');
    } finally {
      setBusyId(null);
    }
  };

  const openSpace = (space: BrowseSpace) => {
    if (!space.followed) return;
    onClose();
    navigate(`/channels/${space.id}`);
  };

  const handleRedeemInvite = async () => {
    const code = inviteCode.trim();
    if (!code) return;
    setJoiningInvite(true);
    try {
      const { spaceId, name } = await redeem(code);
      success(`Joined ${name || 'private channel'}`);
      setInviteCode('');
      onChanged?.();
      onClose();
      // Chat routes to a server by its hex space id (matches how servers are keyed).
      navigate(`/channels/${spaceId}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not redeem this invite');
    } finally {
      setJoiningInvite(false);
    }
  };

  if (!isOpen) return null;

  const shown = filter.trim()
    ? spaces.filter(s => s.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : spaces;

  return (
    <div className="space-browser__overlay" onClick={onClose} role="presentation">
      <div
        className="space-browser"
        role="dialog"
        aria-modal="true"
        aria-label="Browse spaces"
        onClick={e => e.stopPropagation()}
      >
        <div className="space-browser__header">
          <h2>Browse spaces</h2>
          <button type="button" className="space-browser__close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="space-browser__body">
          <input
            type="search"
            className="space-browser__filter"
            placeholder="Filter spaces…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter spaces"
          />

          {loading ? (
            <p className="space-browser__hint">Loading spaces…</p>
          ) : shown.length === 0 ? (
            <p className="space-browser__hint">
              {spaces.length === 0
                ? 'No public spaces are visible yet. As your node syncs, spaces appear here.'
                : 'No spaces match that filter.'}
            </p>
          ) : (
            <ul className="space-browser__list">
              {shown.map(space => (
                <li key={space.id} className="space-browser__row">
                  <button
                    type="button"
                    className={`space-browser__space ${space.followed ? 'joined' : ''}`}
                    onClick={() => openSpace(space)}
                    title={space.followed ? `Open ${space.name}` : space.name}
                  >
                    <span className="space-browser__avatar" style={{ backgroundColor: spaceColor(space.id) }}>
                      {spaceInitials(space.name)}
                    </span>
                    <span className="space-browser__meta">
                      <span className="space-browser__name">{space.name}</span>
                      <span className="space-browser__count">{space.postCount} posts</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`space-browser__join ${space.followed ? 'leave' : ''}`}
                    disabled={busyId === space.id}
                    onClick={() => toggleFollow(space)}
                  >
                    {busyId === space.id ? '…' : space.followed ? 'Leave' : 'Join'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === 'node' && (
            <div className="space-browser__invite">
              <h3>Join a private channel</h3>
              <p className="space-browser__hint">
                Paste an invite code (starts with <code>swiminv1:</code>) someone shared with you.
              </p>
              <textarea
                className="space-browser__invite-input"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="swiminv1:…"
                rows={2}
                disabled={joiningInvite}
              />
              <button
                type="button"
                className="space-browser__join"
                onClick={handleRedeemInvite}
                disabled={joiningInvite || !inviteCode.trim()}
              >
                {joiningInvite ? 'Joining…' : 'Join private channel'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SpaceBrowserModal;
