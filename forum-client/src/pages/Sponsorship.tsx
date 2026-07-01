/**
 * Sponsorship page with three tabs:
 * - Find a Sponsor (browse and claim public offers)
 * - My Offers (manage offers for sponsors)
 * - My Status (view current sponsorship status)
 */

import { useState, useCallback, useMemo } from 'react';
import { useSponsorship } from '../hooks/useSponsorship';
import { useSponsorshipOffers } from '../hooks/useSponsorshipOffers';
import { useMySponsorshipOffers } from '../hooks/useMySponsorshipOffers';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useRpc } from '../hooks/useRpc';
import { useSign } from '../hooks/useSign';
import { useDisplayName, useDisplayNames } from '../hooks/useDisplayName';
import { SponsorshipOfferCard } from '../components/SponsorshipOfferCard';
import { SponsorshipStatus } from '../components/SponsorshipStatus';
import { ClaimOfferModal } from '../components/ClaimOfferModal';
import { CreateOfferModal } from '../components/CreateOfferModal';
import { logger } from '../lib/logger';
import type { SponsorshipOfferSummary, SponsorshipOfferDetail } from '../lib/rpc';
import './Sponsorship.css';

/** Convert Uint8Array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Build the cancel-offer signature message: offer_id(16) || timestamp(8 BE) */
function buildCancelSignatureMessage(offerIdHex: string, timestamp: number): Uint8Array {
  const offerIdBytes = hexToBytes(offerIdHex);
  const msg = new Uint8Array(offerIdBytes.length + 8);
  msg.set(offerIdBytes, 0);
  const view = new DataView(msg.buffer);
  view.setBigUint64(offerIdBytes.length, BigInt(timestamp), false);
  return msg;
}

/** Build the approve/reject signature message: claimant(32) || timestamp(8 BE) */
function buildApprovalSignatureMessage(claimantPubkeyHex: string, timestamp: number): Uint8Array {
  const claimantBytes = hexToBytes(claimantPubkeyHex);
  const msg = new Uint8Array(32 + 8);
  msg.set(claimantBytes, 0);
  const view = new DataView(msg.buffer);
  view.setBigUint64(32, BigInt(timestamp), false);
  return msg;
}

type Tab = 'find' | 'my-offers' | 'status';

export function SponsorshipPage(): JSX.Element {
  const { isSponsored, pendingClaim } = useSponsorship();
  const { identity } = useIdentityContext();
  const { rpc } = useRpc();
  const { sign, canSign } = useSign();

  // Resolve sponsor display name for pending claim
  const { displayName: pendingSponsorName } = useDisplayName(pendingClaim?.sponsorPubkey);

  // Tab state - default to "find" for unsponsored, "my-offers" for sponsored
  const [activeTab, setActiveTab] = useState<Tab>(
    isSponsored ? 'my-offers' : 'find'
  );

  // Find tab state
  const {
    offers: publicOffers,
    hasMore,
    isLoading: offersLoading,
    error: offersError,
    refresh: refreshOffers,
    loadMore,
  } = useSponsorshipOffers();

  // My Offers tab state
  const {
    offers: myOffers,
    isLoading: myOffersLoading,
    error: myOffersError,
    detailError,
    clearDetailError,
    refresh: refreshMyOffers,
    totalPendingClaims,
    getOfferDetail,
  } = useMySponsorshipOffers();

  // Filter out the current user's own offers from the public list
  const visibleOffers = useMemo(
    () => publicOffers.filter(offer => offer.sponsor_pubkey !== identity?.publicKey),
    [publicOffers, identity?.publicKey]
  );

  // Copy pubkey state
  const [pubkeyCopied, setPubkeyCopied] = useState(false);

  // Claim modal state
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<SponsorshipOfferSummary | null>(null);

  // Create offer modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Offer detail / claims view state
  const [viewingDetail, setViewingDetail] = useState<SponsorshipOfferDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Resolve display names for all pending claimants in the current detail view
  const claimantPubkeys = useMemo(
    () => viewingDetail?.pending_claims.map(c => c.claimant_pubkey) ?? [],
    [viewingDetail]
  );
  const claimantNames = useDisplayNames(claimantPubkeys);

  const handleClaim = useCallback((offerId: string) => {
    const offer = publicOffers.find(o => o.offer_id === offerId);
    if (offer) {
      setSelectedOffer(offer);
      setClaimModalOpen(true);
    }
  }, [publicOffers]);

  const handleClaimSuccess = useCallback(() => {
    refreshOffers();
  }, [refreshOffers]);

  const handleCreateSuccess = useCallback(() => {
    refreshMyOffers();
  }, [refreshMyOffers]);

  const handleViewClaims = useCallback(async (offerId: string) => {
    clearDetailError();
    setDetailLoading(true);
    const detail = await getOfferDetail(offerId);
    setViewingDetail(detail);
    setDetailLoading(false);
  }, [getOfferDetail, clearDetailError]);

  const handleCancelOffer = useCallback(async (offerId: string) => {
    if (!rpc || !identity?.publicKey || !canSign) return;
    if (!window.confirm('Cancel this sponsorship offer? All pending claims will be removed.')) return;

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const sigMsg = buildCancelSignatureMessage(offerId, timestamp);
      const sigBytes = await sign(sigMsg);
      if (!sigBytes) { logger.error('[Sponsorship] Failed to sign cancel'); return; }
      const signature = bytesToHex(sigBytes);
      await rpc.cancelSponsorshipOffer({
        offerId,
        sponsorPubkey: identity.publicKey,
        signature,
        timestamp,
      });
      logger.info('[Sponsorship] Offer cancelled:', offerId);
      refreshMyOffers();
      setViewingDetail(null);
    } catch (err) {
      logger.error('[Sponsorship] Cancel failed:', err);
    }
  }, [rpc, identity?.publicKey, canSign, sign, refreshMyOffers]);

  const handleApproveClaim = useCallback(async (offerId: string, claimantPubkey: string) => {
    logger.info('[Sponsorship] handleApproveClaim called:', { offerId, claimantPubkey, hasRpc: !!rpc, hasPubkey: !!identity?.publicKey, canSign });
    if (!rpc || !identity?.publicKey || !canSign) {
      logger.error('[Sponsorship] Approve precondition failed:', { hasRpc: !!rpc, hasPubkey: !!identity?.publicKey, canSign });
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const sigMsg = buildApprovalSignatureMessage(claimantPubkey, timestamp);
      logger.info('[Sponsorship] Signing approval message...');
      const sigBytes = await sign(sigMsg);
      if (!sigBytes) { logger.error('[Sponsorship] Failed to sign approve - sign returned null'); return; }
      const signature = bytesToHex(sigBytes);
      logger.info('[Sponsorship] Signature obtained, calling approveSponsorshipClaim RPC...');
      await rpc.approveSponsorshipClaim({
        offerId,
        claimantPubkey,
        sponsorPubkey: identity.publicKey,
        signature,
        timestamp,
      });
      logger.info('[Sponsorship] Claim approved:', { offerId, claimantPubkey });
      // Refresh the detail view
      const detail = await getOfferDetail(offerId);
      setViewingDetail(detail);
      refreshMyOffers();
    } catch (err) {
      logger.error('[Sponsorship] Approve failed:', err);
      // Log more details
      if (err instanceof Error) {
        logger.error('[Sponsorship] Error details:', err.message, err.stack);
      }
    }
  }, [rpc, identity?.publicKey, canSign, sign, getOfferDetail, refreshMyOffers]);

  const handleRejectClaim = useCallback(async (offerId: string, claimantPubkey: string) => {
    if (!rpc || !identity?.publicKey || !canSign) return;
    if (!window.confirm('Reject this claim? The claimant will need to apply again.')) return;

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const sigMsg = buildApprovalSignatureMessage(claimantPubkey, timestamp);
      const sigBytes = await sign(sigMsg);
      if (!sigBytes) { logger.error('[Sponsorship] Failed to sign reject'); return; }
      const signature = bytesToHex(sigBytes);
      await rpc.rejectSponsorshipClaim({
        offerId,
        claimantPubkey,
        sponsorPubkey: identity.publicKey,
        signature,
        timestamp,
      });
      logger.info('[Sponsorship] Claim rejected:', { offerId, claimantPubkey });
      const detail = await getOfferDetail(offerId);
      setViewingDetail(detail);
      refreshMyOffers();
    } catch (err) {
      logger.error('[Sponsorship] Reject failed:', err);
    }
  }, [rpc, identity?.publicKey, canSign, sign, getOfferDetail, refreshMyOffers]);

  return (
    <div className="sponsorship-page">
      <h1>Sponsorship</h1>

      <div className="sponsorship-tabs">
        <button
          type="button"
          className={`sponsorship-tab ${activeTab === 'find' ? 'active' : ''}`}
          onClick={() => { setActiveTab('find'); setViewingDetail(null); }}
          title="Browse and claim sponsorship offers from other users"
        >
          Get Sponsored
        </button>
        <button
          type="button"
          className={`sponsorship-tab ${activeTab === 'my-offers' ? 'active' : ''}`}
          onClick={() => { setActiveTab('my-offers'); setViewingDetail(null); }}
          title="Manage offers you created and review pending applications"
        >
          Sponsor Others
          {totalPendingClaims > 0 && (
            <span className="sponsorship-tab-badge" title={`${totalPendingClaims} pending application${totalPendingClaims === 1 ? '' : 's'} to review`}>
              {totalPendingClaims}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`sponsorship-tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => { setActiveTab('status'); setViewingDetail(null); }}
          title="View your current sponsorship status"
        >
          My Status
        </button>
      </div>

      <div className="sponsorship-tab-content">
        {/* === Find a Sponsor tab === */}
        {activeTab === 'find' && (
          <div className="sponsorship-find">
            {pendingClaim && (
              <div className="sponsorship-pending-notice">
                <strong>You have a pending claim.</strong>{' '}
                Your application to <span title={pendingClaim.sponsorPubkey}>{pendingSponsorName}</span>{' '}
                is awaiting review. You can still browse other offers.
              </div>
            )}

            <div className="sponsorship-find-header">
              <p className="sponsorship-find-desc">
                Browse open sponsorship offers from existing members and apply to get sponsored.
                Once sponsored, you can create content on the network.
              </p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => refreshOffers()}
                disabled={offersLoading}
              >
                Refresh
              </button>
            </div>

            <div className="sponsorship-how-it-works">
              <h3>How Sponsorship Works</h3>
              <ol className="sponsorship-steps">
                <li>Browse open offers below and claim one that fits</li>
                <li>Your claim is sent to the sponsor for review</li>
                <li>The sponsor approves or rejects your request</li>
                <li>Once approved, your identity is recorded on-chain and you can post</li>
              </ol>
              {identity?.publicKey && (
                <div className="sponsorship-pubkey-share">
                  <span className="sponsorship-pubkey-label">Your public key:</span>
                  <code className="sponsorship-pubkey-code">{identity.publicKey}</code>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(identity.publicKey);
                      setPubkeyCopied(true);
                      setTimeout(() => setPubkeyCopied(false), 2000);
                    }}
                  >
                    {pubkeyCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>

            {offersError && (
              <div className="sponsorship-error">{offersError}</div>
            )}

            {offersLoading && publicOffers.length === 0 && (
              <div className="sponsorship-loading">Loading offers...</div>
            )}

            {!offersLoading && visibleOffers.length === 0 && !offersError && (
              <div className="sponsorship-empty">
                <strong>No open offers to claim</strong>
                <p>There are no sponsorship offers available right now. Check back later, or share your public key with an existing member who can sponsor you directly.</p>
              </div>
            )}

            <div className="sponsorship-offer-list">
              {visibleOffers.map(offer => (
                <SponsorshipOfferCard
                  key={offer.offer_id}
                  offer={offer}
                  onClaim={handleClaim}
                  claimDisabled={!!pendingClaim}
                />
              ))}
            </div>

            {hasMore && (
              <button
                type="button"
                className="btn btn-ghost sponsorship-load-more"
                onClick={loadMore}
                disabled={offersLoading}
              >
                {offersLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}

        {/* === My Offers tab === */}
        {activeTab === 'my-offers' && (
          <div className="sponsorship-my-offers">
            {!viewingDetail ? (
              <>
                {detailError && (
                  <div className="sponsorship-error">
                    Failed to load offer details. The node may be unreachable.
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearDetailError} style={{ marginLeft: '0.5rem' }}>Dismiss</button>
                  </div>
                )}
                <div className="sponsorship-my-offers-header">
                  <p className="sponsorship-my-offers-desc">
                    Create offers to sponsor new users. Review and approve applications from people who want to join the network.
                  </p>
                  <div className="sponsorship-my-offers-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => refreshMyOffers()}
                      disabled={myOffersLoading}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setCreateModalOpen(true)}
                    >
                      Create Offer
                    </button>
                  </div>
                </div>

                {myOffersError && (
                  <div className="sponsorship-error">{myOffersError}</div>
                )}

                {myOffersLoading && myOffers.length === 0 && (
                  <div className="sponsorship-loading">Loading your offers...</div>
                )}

                {!myOffersLoading && myOffers.length === 0 && !myOffersError && (
                  <div className="sponsorship-empty">
                    <strong>No offers created yet</strong>
                    <p>You haven't created any sponsorship offers. Create one to help new users join the network.</p>
                  </div>
                )}

                <div className="sponsorship-offer-list">
                  {myOffers.map(offer => (
                    <SponsorshipOfferCard
                      key={offer.offer_id}
                      offer={{
                        offer_id: offer.offer_id,
                        sponsor_pubkey: identity?.publicKey ?? '',
                        offer_type: offer.offer_type,
                        slots_total: offer.slots_total,
                        slots_remaining: offer.slots_total - offer.slots_claimed,
                        expires_at: offer.expires_at,
                        created_at: offer.created_at,
                        requirements: { min_pow_difficulty: 0, application_required: false },
                      }}
                      isOwner
                      pendingClaimsCount={offer.slots_pending}
                      onViewClaims={handleViewClaims}
                      onCancel={handleCancelOffer}
                    />
                  ))}
                </div>
              </>
            ) : (
              /* Offer detail / claims view */
              <div className="sponsorship-detail">
                <button
                  type="button"
                  className="btn btn-ghost sponsorship-back"
                  onClick={() => { setViewingDetail(null); clearDetailError(); }}
                >
                  &larr; Back to My Offers
                </button>

                <h2>Offer Claims</h2>
                <div className="sponsorship-detail-info">
                  <div className="sponsorship-detail-row">
                    <span className="sponsorship-detail-label">Offer ID:</span>
                    <code>{viewingDetail.offer_id}</code>
                  </div>
                  <div className="sponsorship-detail-row">
                    <span className="sponsorship-detail-label">Type:</span>
                    <span>{viewingDetail.offer_type}</span>
                  </div>
                  <div className="sponsorship-detail-row">
                    <span className="sponsorship-detail-label">Slots:</span>
                    <span>{viewingDetail.slots_remaining} of {viewingDetail.slots_total} remaining</span>
                  </div>
                </div>

                {viewingDetail.pending_claims.length === 0 ? (
                  <div className="sponsorship-empty">No pending claims for this offer.</div>
                ) : (
                  <div className="sponsorship-claims-list">
                    {viewingDetail.pending_claims.map(claim => (
                      <div key={claim.claimant_pubkey} className="sponsorship-claim-card">
                        <div className="sponsorship-claim-info">
                          <div className="sponsorship-claim-row">
                            <span className="sponsorship-claim-label">Claimant:</span>
                            <span className="sponsorship-claim-pubkey" title={claim.claimant_pubkey}>
                              {claimantNames.get(claim.claimant_pubkey)?.displayName ?? claim.claimant_pubkey.substring(0, 16) + '...'}
                            </span>
                          </div>
                          <div className="sponsorship-claim-row">
                            <span className="sponsorship-claim-label">Claimed:</span>
                            <span>{new Date(claim.claimed_at * 1000).toLocaleString()}</span>
                          </div>
                          {claim.application_text && (
                            <div className="sponsorship-claim-application">
                              <span className="sponsorship-claim-label">Application:</span>
                              <p className="sponsorship-claim-text">{claim.application_text}</p>
                            </div>
                          )}
                        </div>
                        <div className="sponsorship-claim-actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleApproveClaim(viewingDetail.offer_id, claim.claimant_pubkey)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-danger"
                            onClick={() => handleRejectClaim(viewingDetail.offer_id, claim.claimant_pubkey)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {detailLoading && (
                  <div className="sponsorship-loading">Updating...</div>
                )}

                {detailError && (
                  <div className="sponsorship-error">
                    Failed to load offer details. The node may be unreachable.
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearDetailError} style={{ marginLeft: '0.5rem' }}>Dismiss</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* === My Status tab === */}
        {activeTab === 'status' && (
          <SponsorshipStatus />
        )}
      </div>

      {/* Modals */}
      <ClaimOfferModal
        isOpen={claimModalOpen}
        onClose={() => setClaimModalOpen(false)}
        onSuccess={handleClaimSuccess}
        offer={selectedOffer}
      />
      <CreateOfferModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
