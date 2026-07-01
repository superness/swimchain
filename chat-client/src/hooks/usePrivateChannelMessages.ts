/**
 * Hook to fetch and decrypt messages in a private channel
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';
import { decryptWithSpaceKey, isPrivateEncrypted } from '@swimchain/frontend';
import type { Message } from '../components/MessageItem';

export interface PrivateMessage extends Message {
  encryptedContent?: string;
  isDecrypted: boolean;
  decryptionError?: string;
}

interface RawReply {
  content_id: string;
  author_id: string;
  body: string;
  parent_id: string;
  created_at: number;
  last_engagement: number;
}

export function usePrivateChannelMessages(
  channelId: string | undefined,
  channelKey: Uint8Array | null,
  options?: {
    pollInterval?: number;
  }
) {
  const { rpc, connected, authReady } = useRpc();
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollInterval = options?.pollInterval ?? 5000; // Default 5 seconds

  // Decrypt a single message
  const decryptMessage = useCallback(async (
    encryptedContent: string,
    key: Uint8Array
  ): Promise<{ content: string; error?: string }> => {
    // If content is not encrypted, return as-is
    if (!isPrivateEncrypted(encryptedContent)) {
      return { content: encryptedContent };
    }

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
      console.warn('[PrivateChannelMessages] Decryption failed:', err);
      return {
        content: '[Unable to decrypt]',
        error: err instanceof Error ? err.message : 'Decryption failed',
      };
    }
  }, []);

  // Fetch and process messages
  const fetchMessages = useCallback(async (silent = false) => {
    if (!rpc || !connected || !authReady || !channelId) return;

    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch replies (messages) for the channel
      const result = await rpc.getReplies(channelId);

      // Process messages
      const processedMessages: PrivateMessage[] = [];

      for (const reply of result.replies as RawReply[]) {
        // If we have a channel key, try to decrypt
        if (channelKey) {
          const { content, error: decryptError } = await decryptMessage(reply.body, channelKey);
          processedMessages.push({
            id: reply.content_id,
            authorId: reply.author_id,
            content,
            encryptedContent: reply.body,
            createdAt: Math.floor(reply.created_at / 1000),
            status: 'sent',
            isDecrypted: !decryptError,
            decryptionError: decryptError,
          });
        } else if (isPrivateEncrypted(reply.body)) {
          // No channel key but content is encrypted
          processedMessages.push({
            id: reply.content_id,
            authorId: reply.author_id,
            content: '[Encrypted - no key]',
            encryptedContent: reply.body,
            createdAt: Math.floor(reply.created_at / 1000),
            status: 'sent',
            isDecrypted: false,
          });
        } else {
          // Plain text content
          processedMessages.push({
            id: reply.content_id,
            authorId: reply.author_id,
            content: reply.body,
            createdAt: Math.floor(reply.created_at / 1000),
            status: 'sent',
            isDecrypted: true,
          });
        }
      }

      // Sort by timestamp ascending (oldest first for chat view)
      processedMessages.sort((a, b) => a.createdAt - b.createdAt);

      setMessages(processedMessages);
    } catch (err) {
      console.error('[PrivateChannelMessages] Failed to fetch:', err);
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [rpc, connected, authReady, channelId, channelKey, decryptMessage]);

  // Initial fetch
  useEffect(() => {
    if (connected && authReady && channelId) {
      fetchMessages();
    }
  }, [connected, authReady, channelId, fetchMessages]);

  // Polling for new messages
  useEffect(() => {
    if (!connected || !authReady || !channelId || pollInterval <= 0) return;

    pollRef.current = setInterval(() => {
      fetchMessages(true); // Silent poll
    }, pollInterval);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [connected, authReady, channelId, pollInterval, fetchMessages]);

  // Re-decrypt when channel key becomes available
  useEffect(() => {
    if (channelKey && messages.length > 0 && messages.some(m => !m.isDecrypted)) {
      // Re-fetch to decrypt with new key
      fetchMessages(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey]);

  return {
    messages,
    loading,
    error,
    refetch: () => fetchMessages(false),
  };
}
