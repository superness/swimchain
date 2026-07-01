/**
 * Hook for managing message input state machine with real PoW
 * Per CLIENT_DESIGN.md §5.3
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { MessageInputState, MiningProgress, Message } from '../types';
import { usePostPow } from './useActionPow';
import { usePostSubmit } from './useRpc';
import { useStoredKeypair, useIdentityContext } from '@swimchain/frontend';

interface UseMessageInputOptions {
  spaceId: string;
  parentId?: string | null;
  onMessageSent?: (message: Message) => void;
}

interface UseMessageInputReturn {
  state: MessageInputState;
  content: string;
  setContent: (value: string) => void;
  submit: () => Promise<void>;
  cancel: () => void;
  progress: MiningProgress | null;
}

export function useMessageInput({
  spaceId,
  parentId = null,
  onMessageSent,
}: UseMessageInputOptions): UseMessageInputReturn {
  const [state, setState] = useState<MessageInputState>('ready');
  const [content, setContentRaw] = useState('');
  const [progress, setProgress] = useState<MiningProgress | null>(null);
  const cancelRef = useRef(false);

  const { identity } = useIdentityContext();
  const { keypair, sign } = useStoredKeypair();
  const { submitPost, submitting } = usePostSubmit();
  const {
    state: powState,
    progress: powProgress,
    getRpcParams,
    minePost,
    cancel: cancelMining,
    reset: resetMining,
  } = usePostPow();

  // Handle PoW completion - submit the message
  useEffect(() => {
    if (powState === 'complete' && keypair && identity) {
      const doSubmit = async () => {
        const powParams = getRpcParams();
        if (!powParams) {
          console.error('[MessageInput] Failed to get PoW params');
          setState('typing');
          resetMining();
          return;
        }

        // Create sign function that handles null
        const signFn = (message: Uint8Array): Uint8Array => {
          const result = sign(message);
          if (!result) {
            throw new Error('Failed to sign message');
          }
          return result;
        };

        try {
          // For messages, we submit as a post to the space
          const result = await submitPost(
            spaceId,
            content.trim(), // Use content as title for chat messages
            content.trim(),
            identity.publicKey,
            signFn,
            powParams
          );

          if (result.success && result.contentId) {
            // Create message object for callback
            const now = Math.floor(Date.now() / 1000);
            const message: Message = {
              id: result.contentId,
              authorAddress: identity.address,
              content: content.trim(),
              createdAt: now,
              lastEngagement: now,
              heatPercent: 100,
              poolCurrent: 0,
              poolTarget: 60,
              replyCount: 0,
              parentId,
              spaceId,
              reactions: { quickCount: 0, standardCount: 0 },
            };

            setState('sent');
            onMessageSent?.(message);

            // Reset after showing "sent" state briefly
            setTimeout(() => {
              setContentRaw('');
              setState('ready');
              resetMining();
            }, 1500);
          } else {
            console.error('[MessageInput] Failed to submit message');
            setState('typing');
            resetMining();
          }
        } catch (err) {
          console.error('[MessageInput] Submit error:', err);
          setState('typing');
          resetMining();
        }
      };

      doSubmit();
    }
  }, [powState, keypair, identity, spaceId, content, parentId, submitPost, sign, getRpcParams, resetMining, onMessageSent]);

  // Update progress from PoW mining
  useEffect(() => {
    if (powState === 'mining') {
      setProgress({
        attempts: powProgress.attempts,
        elapsedMs: powProgress.elapsedMs,
        estimatedRemainingMs: Math.max(0, 15000 - powProgress.elapsedMs), // Estimate based on ~15s target
      });
    }
  }, [powState, powProgress]);

  const handleSetContent = useCallback((value: string) => {
    setContentRaw(value);
    if (state === 'ready' && value.length > 0) {
      setState('typing');
    } else if (state === 'typing' && value.length === 0) {
      setState('ready');
    }
  }, [state]);

  const submit = useCallback(async () => {
    if (content.trim().length === 0 || state === 'mining' || submitting) return;
    if (!keypair || !identity) {
      console.error('[MessageInput] No identity available');
      return;
    }

    setState('mining');
    cancelRef.current = false;
    setProgress({ attempts: 0, elapsedMs: 0, estimatedRemainingMs: 15000 });

    // Start mining PoW for the message
    const publicKey = keypair.publicKey();
    minePost(content.trim(), publicKey).catch((err) => {
      console.error('[MessageInput] Mining failed:', err);
      if (!cancelRef.current) {
        setState('typing');
        setProgress(null);
        resetMining();
      }
    });
  }, [content, state, submitting, keypair, identity, minePost, resetMining]);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    cancelMining();
    setProgress(null);
    setState(content.length > 0 ? 'typing' : 'ready');
  }, [content, cancelMining]);

  return {
    state,
    content,
    setContent: handleSetContent,
    submit,
    cancel,
    progress,
  };
}
