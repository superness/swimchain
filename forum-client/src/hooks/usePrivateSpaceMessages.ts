/**
 * Hook to fetch and decrypt messages in a private space
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';
import { decryptWithSpaceKey } from '../lib/encryption';

export interface PrivateMessage {
  id: string;
  sender: string;
  content: string;
  encryptedContent?: string;
  timestamp: number;
  isDecrypted: boolean;
  decryptionError?: string;
  replyTo?: string;
}

interface RawPost {
  content_id: string;
  author: string;
  body?: string;
  created_at: number;
  parent_id?: string;
}

export function usePrivateSpaceMessages(
  spaceId: string | undefined,
  spaceKey: Uint8Array | null,
  options?: {
    pollInterval?: number;
    limit?: number;
  }
) {
  const { rpc, connected, authReady } = useRpc();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchRef = useRef<number>(0);

  const pollInterval = options?.pollInterval ?? 5000; // Default 5 seconds
  const limit = options?.limit ?? 100;

  // Decrypt a single message
  const decryptMessage = useCallback(async (
    encryptedContent: string,
    key: Uint8Array
  ): Promise<{ content: string; error?: string }> => {
    try {
      const decrypted = await decryptWithSpaceKey(encryptedContent, key);
      if (decrypted === null) {
        return {
          content: '[Unable to decrypt]',
          error: 'Invalid encrypted format',
        };
      }
      return { content: decrypted };
    } catch (err) {
      console.warn('[PrivateSpaceMessages] Decryption failed:', err);
      return {
        content: '[Unable to decrypt]',
        error: err instanceof Error ? err.message : 'Decryption failed',
      };
    }
  }, []);

  // Fetch and process messages
  const fetchMessages = useCallback(async (silent = false) => {
    if (!rpc || !connected || !authReady || !spaceId) return;

    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch posts from the space
      // Using list_posts_for_space RPC with pagination
      const result = await rpc.call('list_posts_for_space', {
        space_id: spaceId,
        offset: 0,
        limit,
        include_replies: true,
      }) as {
        items: RawPost[];
        total: number;
      };

      // Process messages
      const processedMessages: PrivateMessage[] = [];

      for (const post of result.items) {
        // Skip posts without body content
        if (!post.body) {
          processedMessages.push({
            id: post.content_id,
            sender: post.author,
            content: '[Content not available]',
            timestamp: post.created_at,
            isDecrypted: false,
            replyTo: post.parent_id,
          });
          continue;
        }

        // If we have a space key, try to decrypt
        if (spaceKey) {
          const { content, error: decryptError } = await decryptMessage(post.body, spaceKey);
          processedMessages.push({
            id: post.content_id,
            sender: post.author,
            content,
            encryptedContent: post.body,
            timestamp: post.created_at,
            isDecrypted: !decryptError,
            decryptionError: decryptError,
            replyTo: post.parent_id,
          });
        } else {
          // No space key, show encrypted content
          processedMessages.push({
            id: post.content_id,
            sender: post.author,
            content: '[Encrypted - no key]',
            encryptedContent: post.body,
            timestamp: post.created_at,
            isDecrypted: false,
            replyTo: post.parent_id,
          });
        }
      }

      // Sort by timestamp ascending (oldest first for chat view)
      processedMessages.sort((a, b) => a.timestamp - b.timestamp);

      setMessages(processedMessages);
      lastFetchRef.current = Date.now();
    } catch (err) {
      console.error('[PrivateSpaceMessages] Failed to fetch:', err);
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [rpc, connected, authReady, spaceId, spaceKey, limit, decryptMessage]);

  // Initial fetch
  useEffect(() => {
    if (connected && authReady && spaceId) {
      fetchMessages();
    }
  }, [connected, authReady, spaceId, fetchMessages]);

  // Polling for new messages
  useEffect(() => {
    if (!connected || !authReady || !spaceId || pollInterval <= 0) return;

    pollRef.current = setInterval(() => {
      fetchMessages(true); // Silent poll
    }, pollInterval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [connected, authReady, spaceId, pollInterval, fetchMessages]);

  // Re-decrypt when space key becomes available
  useEffect(() => {
    if (spaceKey && messages.length > 0 && messages.some(m => !m.isDecrypted)) {
      // Re-fetch to decrypt with new key
      fetchMessages(true);
    }
  }, [spaceKey, messages.length, fetchMessages]);

  return {
    messages,
    loading,
    error,
    refetch: () => fetchMessages(false),
  };
}
