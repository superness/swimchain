/**
 * Hook for accessing presence state
 */

import { useCallback } from 'react';
import { usePresenceContext } from '../contexts/PresenceContext';
import type { PresenceState, PresenceStatus } from '../types';

interface UsePresenceReturn {
  setOwnPresence: (status: PresenceStatus) => void;
  getPresence: (userId: string) => PresenceState | undefined;
  onlineUsers: PresenceState[];
  onlineCount: number;
  totalCount: number;
}

export function usePresence(): UsePresenceReturn {
  const {
    setOwnPresence,
    getPresence: ctxGetPresence,
    onlineUsers,
    onlineCount,
    totalCount,
  } = usePresenceContext();

  const getPresence = useCallback(
    (userId: string): PresenceState | undefined => {
      return ctxGetPresence(userId);
    },
    [ctxGetPresence]
  );

  return {
    setOwnPresence,
    getPresence,
    onlineUsers,
    onlineCount,
    totalCount,
  };
}
