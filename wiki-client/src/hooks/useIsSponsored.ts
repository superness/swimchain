/**
 * useIsSponsored — lightweight check of whether the current identity (the node's
 * identity when embedded in desktop) is sponsored on-chain, so page editing can be
 * gated BEFORE spending PoW. The node rejects unsponsored posts (SPEC_11).
 *
 * Returns null (unknown), true (sponsored/genesis), or false (not sponsored).
 */
import { useState, useEffect } from 'react';
import { useRpc } from './useRpc';
import { useWikiIdentity } from './useWikiIdentity';

export function useIsSponsored(): boolean | null {
  const { rpc, connected } = useRpc();
  const identity = useWikiIdentity();
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
        // Unknown on error — the node stays the authoritative gate.
        if (!cancelled) setIsSponsored(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpc, connected, identity?.publicKey]);

  return isSponsored;
}
