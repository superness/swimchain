import { useState, useEffect, useCallback } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useIdentityContext } from '@swimchain/frontend';
import './SponsorshipPanel.css';

interface Props { contentId: string; authorId: string; }

export function SponsorshipPanel({ contentId, authorId }: Props): JSX.Element {
  const { rpc, connected } = useRpc();
  const { identity } = useIdentityContext();
  const [info, setInfo] = useState<{ sponsor_id: string | null; status: string; total_stake: number } | null>(null);
  const [offers, setOffers] = useState<Array<{ offer_id: string; title: string; description: string; remaining_stake: number; total_stake: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const isOwn = identity?.publicKey?.toLowerCase() === authorId?.toLowerCase();

  useEffect(() => {
    if (!rpc || !connected || !contentId) { setLoading(false); return; }
    (async () => {
      try {
        const [i, o] = await Promise.all([
          rpc.getSponsorshipInfo(contentId).catch(() => null),
          rpc.listSponsorshipOffers({ status: 'active', limit: 5 }).catch(() => null),
        ]);
        if (i) setInfo({ sponsor_id: i.sponsor_id, status: i.status, total_stake: i.total_stake });
        if (o) setOffers(o.offers);
      } catch {} finally { setLoading(false); }
    })();
  }, [rpc, connected, contentId]);

  const handleClaim = useCallback(async (offerId: string) => {
    if (!rpc || !connected || !identity?.seed || !identity?.publicKey) return;
    setClaiming(true);
    try {
      const { hexToBytes, bytesToHex, wasm } = await import('@swimchain/frontend');
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = wasm.WasmKeypair.fromSeed(hexToBytes(identity.seed)).sign(
        new TextEncoder().encode(`claim_sponsor:${offerId}:${contentId}:${timestamp}`));
      const result = await rpc.claimSponsorshipOffer({
        offerId, claimantPk: identity.publicKey, contentId,
        signature: bytesToHex(sig), powNonce: 0, powDifficulty: 1, powNonceSpace: '', powHash: '', timestamp,
      });
      if (result.status === 'claimed' || result.status === 'pending') {
        setInfo(prev => prev ? { ...prev, status: 'sponsored' } : { sponsor_id: identity.publicKey, status: 'sponsored', total_stake: 0 });
        setShowOffers(false);
      }
    } catch (err) { console.error('[Sponsorship] Claim failed:', err); }
    finally { setClaiming(false); }
  }, [rpc, connected, identity, contentId]);

  if (loading) return <div className="sponsorship-loading">...</div>;
  const isSponsored = info?.status === 'sponsored' || info?.status === 'active';

  return (
    <div className="sponsorship-panel" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
      {isSponsored ? (
        <span className="sponsorship-badge sponsored">⭐ Sponsored{info?.total_stake ? ` ${info.total_stake}` : ''}</span>
      ) : isOwn ? (
        <button className="sponsorship-claim-btn" onClick={() => setShowOffers(!showOffers)} type="button">
          {showOffers ? 'Hide' : 'Get sponsored'}
        </button>
      ) : null}
      {showOffers && offers.length > 0 && (
        <div className="sponsorship-offers-dropdown">
          {offers.map(o => (
            <div key={o.offer_id} className="sponsorship-offer-item">
              <span>{o.title} ({o.remaining_stake}/{o.total_stake})</span>
              <button onClick={() => handleClaim(o.offer_id)} disabled={claiming} type="button">Claim</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
