/**
 * Context for presence indicators
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PresenceState, PresenceStatus } from '../types';
import { PRESENCE_HEARTBEAT_MS, PRESENCE_AWAY_THRESHOLD_MS } from '../types';
import { currentUser, mockPresenceStates } from '../mocks/data';

interface PresenceContextValue {
  presenceMap: Map<string, PresenceState>;
  setOwnPresence: (status: PresenceStatus) => void;
  getPresence: (userId: string) => PresenceState | undefined;
  onlineUsers: PresenceState[];
  onlineCount: number;
  totalCount: number;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

interface PresenceProviderProps {
  children: ReactNode;
}

export function PresenceProvider({ children }: PresenceProviderProps): JSX.Element {
  // Initialize with mock data
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceState>>(() => {
    const map = new Map<string, PresenceState>();
    for (const state of mockPresenceStates) {
      map.set(state.userId, state);
    }
    return map;
  });

  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track user activity
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();

    // Update own presence to online
    setPresenceMap((prev) => {
      const next = new Map(prev);
      const currentState = next.get(currentUser.address);
      if (currentState?.status !== 'online') {
        next.set(currentUser.address, {
          userId: currentUser.address,
          status: 'online',
          lastSeen: Math.floor(Date.now() / 1000),
        });
      }
      return next;
    });
  }, []);

  // Set up activity listeners
  useEffect(() => {
    const events = ['keydown', 'mousemove', 'click', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [handleActivity]);

  // Heartbeat to maintain presence and check for away
  useEffect(() => {
    const checkPresence = () => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;

      setPresenceMap((prev) => {
        const next = new Map(prev);
        const newStatus: PresenceStatus =
          timeSinceActivity > PRESENCE_AWAY_THRESHOLD_MS ? 'away' : 'online';

        next.set(currentUser.address, {
          userId: currentUser.address,
          status: newStatus,
          lastSeen: Math.floor(now / 1000),
        });

        return next;
      });
    };

    // Initial presence
    handleActivity();

    heartbeatIntervalRef.current = setInterval(checkPresence, PRESENCE_HEARTBEAT_MS);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [handleActivity]);

  const setOwnPresence = useCallback((status: PresenceStatus) => {
    setPresenceMap((prev) => {
      const next = new Map(prev);
      next.set(currentUser.address, {
        userId: currentUser.address,
        status,
        lastSeen: Math.floor(Date.now() / 1000),
      });
      return next;
    });
  }, []);

  const getPresence = useCallback(
    (userId: string): PresenceState | undefined => {
      return presenceMap.get(userId);
    },
    [presenceMap]
  );

  // Sorted users: online first, then away, then offline
  const onlineUsers = [...presenceMap.values()].sort((a, b) => {
    const order = { online: 0, away: 1, offline: 2 };
    return order[a.status] - order[b.status];
  });

  const onlineCount = onlineUsers.filter(
    (u) => u.status === 'online' || u.status === 'away'
  ).length;

  const totalCount = onlineUsers.length;

  return (
    <PresenceContext.Provider
      value={{
        presenceMap,
        setOwnPresence,
        getPresence,
        onlineUsers,
        onlineCount,
        totalCount,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceContext(): PresenceContextValue {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresenceContext must be used within PresenceProvider');
  }
  return context;
}
