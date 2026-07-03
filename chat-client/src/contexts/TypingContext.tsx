/**
 * Context for ephemeral typing indicators
 * Per CLIENT_DESIGN.md §5.7: No chain record, in-memory only
 */

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { TYPING_TIMEOUT_MS } from '../types';
import { useChatIdentity } from '../hooks/useChatIdentity';

interface TypingContextValue {
  /** Map of spaceId -> Set of userIds currently typing */
  typingUsers: Map<string, Set<string>>;
  /** Start typing indicator for current user in a space */
  startTyping: (spaceId: string) => void;
  /** Stop typing indicator for current user in a space */
  stopTyping: (spaceId: string) => void;
  /** Get list of users typing in a space (excluding current user) */
  getTypingUsers: (spaceId: string) => string[];
}

const TypingContext = createContext<TypingContextValue | null>(null);

interface TypingProviderProps {
  children: ReactNode;
}

export function TypingProvider({ children }: TypingProviderProps): JSX.Element {
  const { identity } = useChatIdentity();
  const currentUserId = identity?.publicKey ?? '';

  // In-memory only - never persisted
  const [typingUsers, setTypingUsers] = useState<Map<string, Set<string>>>(
    new Map()
  );
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    const timeoutsMap = timeoutsRef.current;
    return () => {
      timeoutsMap.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  const startTyping = useCallback((spaceId: string) => {
    if (!currentUserId) return;
    const key = `${spaceId}:${currentUserId}`;

    // Clear existing timeout
    const existingTimeout = timeoutsRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Add to typing users
    setTypingUsers((prev) => {
      const next = new Map(prev);
      const spaceTypers = new Set(next.get(spaceId) ?? []);
      spaceTypers.add(currentUserId);
      next.set(spaceId, spaceTypers);
      return next;
    });

    // Auto-expire after timeout
    const timeout = setTimeout(() => {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        const spaceTypers = new Set(next.get(spaceId) ?? []);
        spaceTypers.delete(currentUserId);
        if (spaceTypers.size === 0) {
          next.delete(spaceId);
        } else {
          next.set(spaceId, spaceTypers);
        }
        return next;
      });
      timeoutsRef.current.delete(key);
    }, TYPING_TIMEOUT_MS);

    timeoutsRef.current.set(key, timeout);
  }, [currentUserId]);

  const stopTyping = useCallback((spaceId: string) => {
    if (!currentUserId) return;
    const key = `${spaceId}:${currentUserId}`;

    // Clear timeout
    const existingTimeout = timeoutsRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      timeoutsRef.current.delete(key);
    }

    // Remove from typing users
    setTypingUsers((prev) => {
      const next = new Map(prev);
      const spaceTypers = new Set(next.get(spaceId) ?? []);
      spaceTypers.delete(currentUserId);
      if (spaceTypers.size === 0) {
        next.delete(spaceId);
      } else {
        next.set(spaceId, spaceTypers);
      }
      return next;
    });
  }, [currentUserId]);

  const getTypingUsers = useCallback(
    (spaceId: string): string[] => {
      const spaceTypers = typingUsers.get(spaceId);
      if (!spaceTypers) return [];
      // Exclude current user
      return [...spaceTypers].filter((id) => id !== currentUserId);
    },
    [typingUsers, currentUserId]
  );

  return (
    <TypingContext.Provider
      value={{ typingUsers, startTyping, stopTyping, getTypingUsers }}
    >
      {children}
    </TypingContext.Provider>
  );
}

export function useTypingContext(): TypingContextValue {
  const context = useContext(TypingContext);
  if (!context) {
    throw new Error('useTypingContext must be used within TypingProvider');
  }
  return context;
}
