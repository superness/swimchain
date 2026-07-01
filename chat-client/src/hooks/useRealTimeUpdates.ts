/**
 * Hook for simulating real-time updates (MVP: setInterval)
 * Future: WebSocket/P2P integration
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Message } from '../types';
import { POLL_INTERVAL_MS, HEAT_UPDATE_INTERVAL_MS } from '../types';

interface UseRealTimeUpdatesReturn {
  newMessages: Message[];
  heatUpdates: Map<string, number>;
  clearNewMessages: () => void;
}

export function useRealTimeUpdates(
  spaceId: string | null,
  existingMessages: Message[]
): UseRealTimeUpdatesReturn {
  const [newMessages, setNewMessages] = useState<Message[]>([]);
  const [heatUpdates, setHeatUpdates] = useState<Map<string, number>>(new Map());
  const messagesRef = useRef<Message[]>(existingMessages);

  // Update ref when messages change
  useEffect(() => {
    messagesRef.current = existingMessages;
  }, [existingMessages]);

  // Simulate heat decay
  useEffect(() => {
    if (!spaceId) return;

    const decayInterval = setInterval(() => {
      setHeatUpdates((prev) => {
        const next = new Map(prev);

        for (const message of messagesRef.current) {
          const currentHeat = next.get(message.id) ?? message.heatPercent;
          // Decay by 1-5% per minute
          const decay = Math.random() * 4 + 1;
          const newHeat = Math.max(0, currentHeat - decay);
          next.set(message.id, newHeat);
        }

        return next;
      });
    }, HEAT_UPDATE_INTERVAL_MS);

    return () => clearInterval(decayInterval);
  }, [spaceId]);

  // Simulate new message polling (for demo purposes)
  useEffect(() => {
    if (!spaceId) return;

    // In real app, this would poll the chain/peers
    // For now, we just simulate occasional new messages

    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;

      // Simulate new message every 30 seconds (6 polls)
      if (pollCount % 6 === 0 && Math.random() > 0.5) {
        // This would be replaced with actual message fetching
        // For now, we don't add fake messages to keep the demo clean
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(pollInterval);
  }, [spaceId]);

  const clearNewMessages = useCallback(() => {
    setNewMessages([]);
  }, []);

  return {
    newMessages,
    heatUpdates,
    clearNewMessages,
  };
}
