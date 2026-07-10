/**
 * useIsSponsored — lightweight check of whether the current node identity is
 * sponsored on-chain, so the compose UI can gate posting BEFORE spending PoW.
 *
 * Returns:
 *   null  — unknown (not connected / no identity / still checking)
 *   true  — sponsored (or genesis) — may post
 *   false — not sponsored — the node will reject posts (SPEC_11)
 *
 * chat had no useSponsorship hook (unlike forum/feed), and its existing
 * `getSponsorshipInfo` wrapper was wired to the wrong node param (content_id
 * instead of identity_pubkey). This calls the node correctly.
 */
import { useState, useEffect } from 'react';
import { useRpc } from './useRpc';
import { useChatIdentity } from './useChatIdentity';

export function useIsSponsored(): boolean | null {
  const { rpc, connected } = useRpc();
  const { identity } = useChatIdentity();
  const [isSponsored, setIsSponsored] = useState<boolean | null>(null);

  useEffect(() => {
    const pubkey = identity?.publicKey;
    if (!rpc || !connected || !pubkey) {
      setIsSponsored(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const info = await rpc.call<{ is_sponsored?: boolean; is_genesis?: boolean }>(
          'get_sponsorship_info',
          { identity_pubkey: pubkey }
        );
        if (!cancelled) {
          setIsSponsored(info?.is_sponsored === true || info?.is_genesis === true);
        }
      } catch {
        // On error, leave as unknown rather than blocking — the node remains the
        // authoritative gate.
        if (!cancelled) setIsSponsored(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc, connected, identity?.publicKey]);

  return isSponsored;
}
