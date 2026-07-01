/**
 * Hook for managing typing indicator
 */

import { useCallback, useRef, useEffect } from 'react';
import { useTypingContext } from '../contexts/TypingContext';
import { TYPING_BROADCAST_INTERVAL_MS } from '../types';

interface UseTypingIndicatorReturn {
  startTyping: () => void;
  stopTyping: () => void;
  typingUsers: string[];
}

export function useTypingIndicator(spaceId: string): UseTypingIndicatorReturn {
  const { startTyping: ctxStartTyping, stopTyping: ctxStopTyping, getTypingUsers } =
    useTypingContext();
  const lastBroadcastRef = useRef<number>(0);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      ctxStopTyping(spaceId);
    };
  }, [spaceId, ctxStopTyping]);

  const startTyping = useCallback(() => {
    const now = Date.now();

    // Debounce broadcasts
    if (now - lastBroadcastRef.current > TYPING_BROADCAST_INTERVAL_MS) {
      lastBroadcastRef.current = now;
      ctxStartTyping(spaceId);
    }

    // Reset inactivity timeout
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }

    // Auto-stop after 10s of no typing
    inactivityTimeoutRef.current = setTimeout(() => {
      ctxStopTyping(spaceId);
    }, 10000);
  }, [spaceId, ctxStartTyping, ctxStopTyping]);

  const stopTyping = useCallback(() => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    ctxStopTyping(spaceId);
  }, [spaceId, ctxStopTyping]);

  return {
    startTyping,
    stopTyping,
    typingUsers: getTypingUsers(spaceId),
  };
}
