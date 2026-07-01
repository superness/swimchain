/**
 * ServerList - Discord-style left sidebar with server icons
 *
 * Displays joined spaces as server icons in a vertical list.
 * Maps: Server = Space in Swimchain terminology.
 */

import { NavLink, useNavigate } from 'react-router-dom';
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

function ServerIcon({ server, isActive }: { server: Server; isActive: boolean }) {
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

export function ServerList({ servers, currentServerId, onServerSelect: _onServerSelect }: ServerListProps) {
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
          />
        ))}
      </div>

    </nav>
  );
}
