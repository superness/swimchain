/**
 * ServerList - Discord-style left sidebar with server icons
 *
 * Displays joined spaces as server icons in a vertical list.
 * Maps: Server = Space in Swimchain terminology.
 */

import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { SpaceBrowserModal } from './SpaceBrowserModal';
import './ServerList.css';

interface Server {
  id: string;
  name: string;
  icon?: string;
  unreadCount: number;
  hasNotification: boolean;
}

interface ServerListProps {
  servers: Server[];
  currentServerId?: string;
  onServerSelect?: (serverId: string) => void;
  /** Called after the followed set changes (join/leave/hide) — refetch the list. */
  onServersChanged?: () => void;
}

/**
 * Get initials from server name for avatar fallback
 */
function getServerInitials(name: string): string {
  const words = name.split(/[\s-_]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
  }
  return name.slice(0, 2);
}

/**
 * Generate a consistent color from server ID
 */
function getServerColor(id: string): string {
  const colors = [
    '#4a90d9', // Blue
    '#5cb85c', // Green
    '#f0ad4e', // Amber
    '#d9534f', // Red
    '#9b59b6', // Purple
    '#17a2b8', // Cyan
    '#6c757d', // Gray
    '#e83e8c', // Pink
  ];

  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
}

function ServerIcon({
  server,
  isActive,
  onContextMenu,
}: {
  server: Server;
  isActive: boolean;
  onContextMenu: (e: React.MouseEvent, server: Server) => void;
}) {
  const navigate = useNavigate();
  const initials = getServerInitials(server.name);
  const bgColor = getServerColor(server.id);

  const handleClick = () => {
    navigate(`/channels/${server.id}`);
  };

  return (
    <div className="server-icon-wrapper">
      {/* Pill indicator for active/unread */}
      <div className={`server-pill ${isActive ? 'active' : server.unreadCount > 0 ? 'unread' : ''}`} />

      <button
        className={`server-icon ${isActive ? 'active' : ''}`}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, server)}
        title={server.name}
        aria-label={`${server.name}${server.unreadCount > 0 ? `, ${server.unreadCount} unread` : ''}`}
      >
        {server.icon ? (
          <img src={server.icon} alt="" className="server-icon-image" />
        ) : (
          <div
            className="server-icon-initials"
            style={{ backgroundColor: bgColor }}
          >
            {initials.toUpperCase()}
          </div>
        )}
      </button>
    </div>
  );
}

export function ServerList({ servers, currentServerId, onServerSelect: _onServerSelect, onServersChanged }: ServerListProps) {
  const { rpc } = useRpc();
  const { identity } = useChatIdentity();
  const navigate = useNavigate();
  // Right-click → leave (unfollow) or hide. Both are node-side prefs, so they
  // apply to every client's surfaces, not just chat's rail.
  const [menu, setMenu] = useState<{ x: number; y: number; server: Server } | null>(null);
  // "+" button → browse/join modal (Discord's "add a server").
  const [showBrowser, setShowBrowser] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const openMenu = (e: React.MouseEvent, server: Server) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, server });
  };

  const hideServer = async () => {
    const target = menu?.server;
    setMenu(null);
    if (!target || !rpc || !identity?.publicKey) return;
    try {
      await rpc.call('hide_space', { user: identity.publicKey, space_id: target.id });
      onServersChanged?.();
    } catch (e) {
      console.warn('[HideSpace] hide_space failed:', e);
    }
  };

  const leaveServer = async () => {
    const target = menu?.server;
    setMenu(null);
    if (!target || !rpc || !identity?.publicKey) return;
    try {
      await rpc.call('unfollow_space', { user: identity.publicKey, space_id: target.id });
      onServersChanged?.();
      // Don't strand the user inside a server they just left.
      if (target.id === currentServerId) navigate('/channels/@me');
    } catch (e) {
      console.warn('[LeaveSpace] unfollow_space failed:', e);
    }
  };

  return (
    <nav className="server-list" aria-label="Servers">
      {/* Home button - DMs and activity */}
      <div className="server-icon-wrapper">
        <div className={`server-pill ${!currentServerId ? 'active' : ''}`} />
        <NavLink
          to="/channels/@me"
          className={({ isActive }) => `server-icon home-button ${isActive ? 'active' : ''}`}
          title="Direct Messages"
          aria-label="Home - Direct Messages"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
        </NavLink>
      </div>

      <div className="server-separator" />

      {/* Server list */}
      <div className="server-list-items">
        {servers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            isActive={server.id === currentServerId}
            onContextMenu={openMenu}
          />
        ))}
      </div>

      {/* + : browse public spaces / join a private channel */}
      <div className="server-icon-wrapper">
        <div className="server-pill" />
        <button
          type="button"
          className="server-icon add-server"
          title="Join a space"
          aria-label="Join a space"
          onClick={() => setShowBrowser(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
          </svg>
        </button>
      </div>

      {menu && (
        <div
          className="server-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="server-context-menu__item" role="menuitem" onClick={leaveServer}>
            👋 Leave “{menu.server.name}”
          </button>
          <button type="button" className="server-context-menu__item" role="menuitem" onClick={hideServer}>
            🚫 Hide “{menu.server.name}”
          </button>
          <div className="server-context-menu__hint">
            Leave removes it from your sidebar · Hide hides it everywhere (undo in feed Settings)
          </div>
        </div>
      )}

      <SpaceBrowserModal
        isOpen={showBrowser}
        onClose={() => setShowBrowser(false)}
        onChanged={onServersChanged}
      />
    </nav>
  );
}
