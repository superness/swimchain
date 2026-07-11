/**
 * PostReactions - self-contained emoji reactions for any content item.
 *
 * `contribute` (usePoolContribution) already mines the engagement PoW AND
 * submits it, so this component just gates on sponsorship and calls it once
 * per tap. An earlier version layered a separate useEngagementPow + a
 * PoW-completion effect on top; unstable effect deps re-fired submission in a
 * loop that flooded the node with hundreds of engagements per reaction.
 */

import { useCallback, useRef, useState } from 'react';
import { ReactionPicker, ReactionDisplay } from './ReactionPicker';
import type { ReactionType, ReactionCounts } from '../types/feed';
import { usePoolContribution, useReactions } from '../hooks/useRpc';
import { useSponsorship } from '../hooks/useSponsorship';
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
  const { info } = useToast();

  // Fetch reactions by id when the caller didn't pass them (detail page /
  // replies). Feed cards pass their own counts, so this stays idle there.
  const { reactions: fetched, refetch } = useReactions(reactionsProp ? '' : contentId);
  const reactions = reactionsProp ?? fetched;

  const [busy, setBusy] = useState(false);
  // Re-entrancy guard: one in-flight reaction at a time, independent of render.
  const inFlightRef = useRef(false);

  const handleReact = useCallback(async (_emoji: string, type: ReactionType) => {
    if (!identity || !sign || inFlightRef.current) return;
    if (isSponsored === false) {
      info('You need a sponsor before you can react. Redeem an invite or request sponsorship first — no proof-of-work is spent until then.');
      return;
    }
    // Already have a live reaction of this emoji — the node would reject a
    // stack (one live reaction per emoji, 5-day decay), so don't waste PoW.
    if (reactions?.userReactions?.includes(REACTION_CODE_MAP[type])) {
      info('You already reacted with this emoji — it stays live for 5 days.');
      return;
    }
    inFlightRef.current = true;
    setBusy(true);
    try {
      // contribute() mines the engagement PoW and submits it in one call.
      await contribute(contentId, 0, identity.publicKey, sign, REACTION_CODE_MAP[type]);
      if (!reactionsProp) refetch();
    } catch (err) {
      console.error('[PostReactions] Reaction failed:', err);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [identity, sign, isSponsored, info, contribute, contentId, reactionsProp, refetch]);

  if (compact) {
    return <ReactionDisplay reactions={reactions} compact />;
  }
  if (identity) {
    return (
      <ReactionPicker
        reactions={reactions}
        onReact={handleReact}
        isReacting={busy || contributing}
      />
    );
  }
  return <ReactionDisplay reactions={reactions} />;
}
