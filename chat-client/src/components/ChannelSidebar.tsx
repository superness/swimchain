/**
 * ChannelSidebar - Discord-style channel list for a server
 *
 * Displays threads as channels within a space (server).
 * Maps: Channel = Thread in Swimchain terminology.
 */

import { useState, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useBlocklist } from '../hooks/useBlocklist';
import { DmPanel } from './DmPanel';
import { StartDmModal } from './StartDmModal';
import { PrivateChannelsSection } from './PrivateChannelsSection';
import { NodePrivateChannelActions } from './NodePrivateChannelActions';
import { useChatIdentity } from '../hooks/useChatIdentity';
import './ChannelSidebar.css';

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'announcement' | 'private';
  category?: string;
  isPinned: boolean;
  isEncrypted: boolean;
  unreadCount: number;
  lastMessageAt: number;
}

export interface ChannelCategory {
  name: string;
  channels: Channel[];
  collapsed: boolean;
}

interface Server {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

interface ChannelSidebarProps {
  server: Server;
  channels: Channel[];
  currentChannelId?: string;
  onChannelSelect?: (channelId: string) => void;
  /** Open the create-channel modal for the current server. */
  onCreateChannel?: () => void;
}

/**
 * Format thread title as channel name (Discord-style)
 * "General Discussion" -> "general-discussion"
 */
function formatChannelName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 32);
}

/**
 * Detect category from thread title
 * "[Dev] Frontend Discussion" -> "Dev"
 * "Support / General" -> "Support"
 */
function detectCategory(title: string): string | null {
  const prefixMatch = title.match(/^\[([^\]]+)\]/);
  if (prefixMatch) return prefixMatch[1]!;

  const slashMatch = title.match(/^([^\/]+)\s*\//);
  if (slashMatch) return slashMatch[1]!.trim();

  return null;
}

/**
 * Group channels by category
 */
function groupChannelsByCategory(channels: Channel[]): ChannelCategory[] {
  const categories = new Map<string, Channel[]>();

  // Default category for uncategorized channels
  const defaultCategory = 'TEXT CHANNELS';

  channels.forEach(channel => {
    const categoryName = channel.category || detectCategory(channel.name) || defaultCategory;
    const existing = categories.get(categoryName) || [];
    existing.push(channel);
    categories.set(categoryName, existing);
  });

  // Sort categories: pinned first, then alphabetically
  return Array.from(categories.entries())
    .sort(([a], [b]) => {
      if (a === 'INFORMATION') return -1;
      if (b === 'INFORMATION') return 1;
      return a.localeCompare(b);
    })
    .map(([name, chans]) => ({
      name,
      channels: chans.sort((a, b) => {
        // Pinned first
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // Then by last activity
        return b.lastMessageAt - a.lastMessageAt;
      }),
      collapsed: false,
    }));
}

function ChannelIcon({ type, isEncrypted }: { type: Channel['type']; isEncrypted: boolean }) {
  if (isEncrypted) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="channel-icon">
        <path d="M17 11V7C17 4.243 14.756 2 12 2C9.243 2 7 4.243 7 7V11C5.897 11 5 11.896 5 13V20C5 21.103 5.897 22 7 22H17C18.103 22 19 21.103 19 20V13C19 11.896 18.103 11 17 11ZM12 18C11.172 18 10.5 17.328 10.5 16.5C10.5 15.672 11.172 15 12 15C12.828 15 13.5 15.672 13.5 16.5C13.5 17.328 12.828 18 12 18ZM15 11H9V7C9 5.346 10.346 4 12 4C13.654 4 15 5.346 15 7V11Z"/>
      </svg>
    );
  }

  if (type === 'announcement') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="channel-icon">
        <path d="M12 3L14 9H22L16 13.5L18 21L12 17L6 21L8 13.5L2 9H10L12 3Z"/>
      </svg>
    );
  }

  // Default text channel icon (hash)
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="channel-icon">
      <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41045 9L8.35045 15H14.3505L15.4105 9H9.41045Z"/>
    </svg>
  );
}

function CategorySection({
  category,
  serverId,
  currentChannelId,
  onToggle,
}: {
  category: ChannelCategory;
  serverId: string;
  currentChannelId?: string;
  onToggle: () => void;
}) {
  return (
    <div className="channel-category">
      <button
        className="category-header"
        onClick={onToggle}
        aria-expanded={!category.collapsed}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`category-arrow ${category.collapsed ? 'collapsed' : ''}`}
        >
          <path d="M7 10L12 15L17 10H7Z"/>
        </svg>
        <span className="category-name">{category.name}</span>
      </button>

      {!category.collapsed && (
        <div className="category-channels">
          {category.channels.map(channel => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              serverId={serverId}
              isActive={channel.id === currentChannelId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelItem({
  channel,
  serverId,
  isActive,
}: {
  channel: Channel;
  serverId: string;
  isActive: boolean;
}) {
  const { isChannelBlocked } = useBlocklist();
  const displayName = formatChannelName(channel.name);
  const blocked = isChannelBlocked(channel.id);

  return (
    <NavLink
      to={`/channels/${serverId}/${channel.id}`}
      className={`channel-item ${isActive ? 'active' : ''} ${channel.unreadCount > 0 ? 'unread' : ''} ${blocked ? 'channel-item--blocked' : ''}`}
      style={blocked ? { opacity: 0.4 } : undefined}
    >
      <ChannelIcon type={channel.type} isEncrypted={channel.isEncrypted} />
      <span className="channel-name">{displayName}</span>

      {channel.unreadCount > 0 && (
        <span className="channel-unread">{channel.unreadCount}</span>
      )}
    </NavLink>
  );
}

export function ChannelSidebar({
  server,
  channels,
  currentChannelId,
  onChannelSelect: _onChannelSelect,
  onCreateChannel,
}: ChannelSidebarProps) {
  const navigate = useNavigate();
  const { mode } = useChatIdentity();
  const [showDmModal, setShowDmModal] = useState(false);
  const handleSelectDm = useCallback((spaceId: string) => {
    navigate('/channels/@me/' + spaceId);
  }, [navigate]);
  const [categories, setCategories] = useState<ChannelCategory[]>(() =>
    groupChannelsByCategory(channels)
  );

  // Update categories when channels change
  if (channels.length > 0 && categories.length === 0) {
    setCategories(groupChannelsByCategory(channels));
  }

  const toggleCategory = (categoryName: string) => {
    setCategories(prev =>
      prev.map(cat =>
        cat.name === categoryName ? { ...cat, collapsed: !cat.collapsed } : cat
      )
    );
  };

  return (
    <div className="channel-sidebar">
      {/* Server header */}
      <div className="server-header">
        <button
          className="server-header-button"
          aria-label="Server options"
        >
          <h2 className="server-name">{server.name}</h2>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 10L12 15L17 10H7Z"/>
          </svg>
        </button>
      </div>

      {/* Channel list */}
      <div className="channel-list">
        {categories.map(category => (
          <CategorySection
            key={category.name}
            category={category}
            serverId={server.id}
            currentChannelId={currentChannelId}
            onToggle={() => toggleCategory(category.name)}
          />
        ))}

        {channels.length === 0 && (
          <div className="no-channels">
            <p>No channels yet.</p>
            <button
              className="create-channel-btn"
              onClick={() => onCreateChannel?.()}
            >
              Create a channel
            </button>
          </div>
        )}

        {/* Direct Messages panel (browser mode only — DMs need the X25519 seed the
            node doesn't expose, so hide the UI entirely when the node owns identity). */}
        {mode !== 'node' && (
          <>
            <DmPanel onSelectDm={handleSelectDm} onStartDm={() => setShowDmModal(true)} />
            {showDmModal && <StartDmModal onClose={() => setShowDmModal(false)} />}
          </>
        )}

        {/* Private channels: invites inbox + my private channels (browser mode) */}
        <PrivateChannelsSection />

        {/* Node-mode shareable invites: create a swiminv1 code for this private channel,
            or redeem one to join. Renders only when the node owns the identity. */}
        <NodePrivateChannelActions serverId={server.id} />
      </div>

      {/* User area at bottom */}
      <div className="user-area">
        <div className="user-avatar">
          <div className="avatar-placeholder" />
        </div>
        <div className="user-info">
          <span className="username">You</span>
        </div>
        <div className="user-controls">
          <button
            className="user-control-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94C19.18 12.64 19.2 12.33 19.2 12C19.2 11.68 19.18 11.36 19.13 11.06L21.16 9.48C21.34 9.34 21.39 9.07 21.28 8.87L19.36 5.55C19.24 5.33 18.99 5.26 18.77 5.33L16.38 6.29C15.88 5.91 15.35 5.59 14.76 5.35L14.4 2.81C14.36 2.57 14.16 2.4 13.92 2.4H10.08C9.83999 2.4 9.64999 2.57 9.60999 2.81L9.24999 5.35C8.65999 5.59 8.11999 5.92 7.62999 6.29L5.23999 5.33C5.01999 5.25 4.76999 5.33 4.64999 5.55L2.73999 8.87C2.61999 9.08 2.65999 9.34 2.85999 9.48L4.88999 11.06C4.83999 11.36 4.79999 11.69 4.79999 12C4.79999 12.31 4.81999 12.64 4.86999 12.94L2.83999 14.52C2.65999 14.66 2.60999 14.93 2.71999 15.13L4.63999 18.45C4.75999 18.67 5.00999 18.74 5.22999 18.67L7.61999 17.71C8.11999 18.09 8.64999 18.41 9.23999 18.65L9.59999 21.19C9.64999 21.43 9.83999 21.6 10.08 21.6H13.92C14.16 21.6 14.36 21.43 14.4 21.19L14.76 18.65C15.35 18.41 15.89 18.09 16.38 17.71L18.77 18.67C18.99 18.75 19.24 18.67 19.36 18.45L21.28 15.13C21.39 14.91 21.34 14.66 21.16 14.52L19.14 12.94ZM12 15.6C10.02 15.6 8.39999 13.98 8.39999 12C8.39999 10.02 10.02 8.4 12 8.4C13.98 8.4 15.6 10.02 15.6 12C15.6 13.98 13.98 15.6 12 15.6Z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

