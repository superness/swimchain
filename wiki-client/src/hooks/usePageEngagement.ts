/**
 * usePageEngagement — "keep this page alive" engagement.
 *
 * Content decays without engagement (SPEC_02). The wiki had a decay indicator but no
 * way to act on it. This mines an Engage PoW over the page's content id and submits it
 * (submit_engagement), which resets the page's decay — mirroring the reaction/engage
 * flow the forum and feed clients use.
 */

import { useState, useCallback } from 'react';
import { useRpc } from './useRpc';

export function usePageEngagement() {
  const { rpc, connected } = useRpc();
  const [engaging, setEngaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engage = useCallback(
    async (
      contentId: string,
      identityPublicKey: string,
      signFn: (message: Uint8Array) => Promise<Uint8Array | null>,
      emoji = 1,
    ): Promise<boolean> => {
      if (!rpc || !connected) {
        setError('Not connected to a node.');
        return false;
      }
      setEngaging(true);
      setError(null);
      try {
        const { computePow, ActionType, getDifficulty, getConfig, hexToBytes, bytesToHex } =
          await import('@swimchain/frontend');

        const contentHashHex = contentId.startsWith('sha256:') ? contentId.slice(7) : contentId;
        const contentHashBytes = hexToBytes(contentHashHex);
        const authorBytes = hexToBytes(identityPublicKey);
        const nonceSpace = new Uint8Array(8);
        crypto.getRandomValues(nonceSpace);
        const timestamp = Math.floor(Date.now() / 1000);
        const difficulty = getDifficulty(ActionType.Engage, true);

        const solution = await computePow(
          {
            actionType: ActionType.Engage,
            contentHash: contentHashBytes,
            authorId: authorBytes,
            timestamp,
            difficulty,
            nonceSpace,
          },
          getConfig(true),
        );

        const sig = await signFn(
          new TextEncoder().encode(`engage:${contentId}:${solution.nonce}:${timestamp}:${emoji}`),
        );
        if (!sig) throw new Error('Failed to sign');

        const res = (await rpc.call('submit_engagement', {
          content_id: contentId,
          author_id: identityPublicKey,
          pow_nonce: Number(solution.nonce),
          pow_difficulty: difficulty,
          pow_nonce_space: bytesToHex(nonceSpace),
          pow_hash: solution.hash ? bytesToHex(solution.hash) : '',
          signature: bytesToHex(sig),
          timestamp,
          emoji,
        })) as { engaged?: boolean; reaction_stored?: boolean };

        return !!(res.engaged || res.reaction_stored);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to engage');
        return false;
      } finally {
        setEngaging(false);
      }
    },
    [rpc, connected],
  );

  return { engage, engaging, error };
}
