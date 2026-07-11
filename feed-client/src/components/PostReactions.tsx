/**
 * PostReactions - self-contained emoji reactions for any content item.
 *
 * Encapsulates the full engagement flow (sponsorship gate → engagement PoW →
 * contribute) so it can be dropped onto feed cards, the post detail page, and
 * replies without duplicating the machinery. Previously this logic lived only
 * inside FeedCard, so the detail page and replies had no way to react.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactionPicker, ReactionDisplay } from './ReactionPicker';
import type { ReactionType, ReactionCounts } from '../types/feed';
import { usePoolContribution, useReactions } from '../hooks/useRpc';
import { useSponsorship } from '../hooks/useSponsorship';
import { useEngagementPow } from '../hooks/useActionPow';
import { useStoredIdentity } from '../hooks/useStoredIdentity';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { useToast } from './Toast';

/** Map reaction type to the node's emoji code. */
const REACTION_CODE_MAP: Record<ReactionType, number> = {
  heart: 1,
  thumbs_up: 2,
  thumbs_down: 3,
  laugh: 4,
  thinking: 5,
  mind_blown: 6,
  fire: 7,
  swimming: 8,
};

interface PostReactionsProps {
  contentId: string;
  /** Optional pre-loaded counts; when absent they are fetched by contentId. */
  reactions?: ReactionCounts;
  compact?: boolean;
}

export function PostReactions({ contentId, reactions: reactionsProp, compact = false }: PostReactionsProps): JSX.Element {
  const { identity } = useStoredIdentity();
  const { sign } = useFeedIdentity();
  const { contribute, contributing } = usePoolContribution();
  const { isSponsored } = useSponsorship();
  const { state: powState, mineEngagement, solution, reset: resetPow } = useEngagementPow();
  const { info } = useToast();

  // Fetch reactions by id when the caller didn't pass them (detail page /
  // replies). Feed cards pass their own counts, so this stays idle there.
  const { reactions: fetched, refetch } = useReactions(reactionsProp ? '' : contentId);
  const reactions = reactionsProp ?? fetched;

  const [isReacting, setIsReacting] = useState(false);
  const pendingReactionRef = useRef<ReactionType | null>(null);

  const handleReact = useCallback(async (_emoji: string, type: ReactionType) => {
    if (!identity || isReacting) return;
    if (isSponsored === false) {
      info('You need a sponsor before you can react. Redeem an invite or request sponsorship first — no proof-of-work is spent until then.');
      return;
    }
    pendingReactionRef.current = type;
    setIsReacting(true);
    try {
      const publicKeyBytes = new Uint8Array(
        identity.publicKey.match(/.{1,2}/g)!.map(b => parseInt(b, 16))
      );
      await mineEngagement(contentId, publicKeyBytes, true);
    } catch (err) {
      console.error('[PostReactions] Reaction error:', err);
      setIsReacting(false);
      resetPow();
    }
  }, [identity, isReacting, isSponsored, info, contentId, mineEngagement, resetPow]);

  // Submit once the engagement PoW completes. Effect (not memo) — it setState.
  useEffect(() => {
    if (powState === 'complete' && solution && identity && sign) {
      const submit = async () => {
        try {
          const emojiCode = pendingReactionRef.current
            ? REACTION_CODE_MAP[pendingReactionRef.current]
            : 1;
          await contribute(contentId, 0, identity.publicKey, sign, emojiCode);
          if (!reactionsProp) refetch();
        } catch (err) {
          console.error('[PostReactions] Failed to submit reaction:', err);
        } finally {
          setIsReacting(false);
          resetPow();
          pendingReactionRef.current = null;
        }
      };
      submit();
    } else if (powState === 'error' || powState === 'cancelled') {
      setIsReacting(false);
      resetPow();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [powState, solution, identity, sign, contribute, contentId, refetch, resetPow]);

  if (compact) {
    return <ReactionDisplay reactions={reactions} compact />;
  }
  if (identity) {
    return (
      <ReactionPicker
        reactions={reactions}
        onReact={handleReact}
        isReacting={isReacting || contributing || powState === 'mining'}
      />
    );
  }
  return <ReactionDisplay reactions={reactions} />;
}
