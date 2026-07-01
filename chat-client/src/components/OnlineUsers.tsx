/**
 * Online users panel showing presence status
 */

import type { PresenceState } from '../types';
import { formatLastSeen } from '../utils/time';
import { truncateAddress } from '../lib/utils';
import './OnlineUsers.css';

interface OnlineUsersProps {
  presenceStates: PresenceState[];
}

export function OnlineUsers({ presenceStates }: OnlineUsersProps): JSX.Element {
  // Sort users: online first, then away, then offline
  const sortedUsers = [...presenceStates].sort((a, b) => {
    const order = { online: 0, away: 1, offline: 2 };
    return order[a.status] - order[b.status];
  });

  const onlineUsers = sortedUsers.filter((u) => u.status === 'online');
  const awayUsers = sortedUsers.filter((u) => u.status === 'away');
  const offlineUsers = sortedUsers.filter((u) => u.status === 'offline');

  const onlineCount = onlineUsers.length + awayUsers.length;
  const totalCount = presenceStates.length;

  return (
    <aside className="online-users" aria-label="Online users">
      <div className="online-users__header">
        <h3 className="online-users__title">
          ONLINE — {onlineUsers.length}
        </h3>
      </div>

      <div className="online-users__content">
        {onlineUsers.length > 0 && (
          <div className="online-users__group">
            {onlineUsers.map((user) => (
              <UserRow key={user.userId} user={user} />
            ))}
          </div>
        )}

        {awayUsers.length > 0 && (
          <div className="online-users__group">
            <div className="online-users__group-header">AWAY — {awayUsers.length}</div>
            {awayUsers.map((user) => (
              <UserRow key={user.userId} user={user} />
            ))}
          </div>
        )}

        {offlineUsers.length > 0 && (
          <div className="online-users__group">
            <div className="online-users__group-header">OFFLINE — {offlineUsers.length}</div>
            {offlineUsers.map((user) => (
              <UserRow key={user.userId} user={user} showLastSeen />
            ))}
          </div>
        )}
      </div>

      <div className="online-users__footer">
        <span>{onlineCount} online</span>
        <span className="online-users__separator">•</span>
        <span>{totalCount} members</span>
      </div>
    </aside>
  );
}

interface UserRowProps {
  user: PresenceState;
  showLastSeen?: boolean;
}

function UserRow({ user, showLastSeen = false }: UserRowProps): JSX.Element {
  return (
    <div className="online-users__user">
      <span
        className={`presence-dot presence-dot--${user.status}`}
        aria-label={user.status}
      />
      <div className="online-users__user-info">
        <span className="online-users__user-address">
          {truncateAddress(user.userId, 8)}
        </span>
        {showLastSeen && (
          <span className="online-users__last-seen">
            {formatLastSeen(user.lastSeen)}
          </span>
        )}
      </div>
    </div>
  );
}
