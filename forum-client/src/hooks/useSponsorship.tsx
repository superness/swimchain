/**
 * Sponsorship status hook and provider
 * Checks if the current identity is sponsored and can perform actions
 */

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useRpc } from './useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { logger } from '../lib/logger';

interface PendingClaimInfo {
  offerId: string;
  claimedAt: number;
  offerExpiresAt: number;
  sponsorPubkey: string;
}

interface SponsorshipDetail {
  depth: number;
  probationary: boolean;
  isUnderPenalty: boolean;
  createdAt: number | null;
  isGenesis: boolean;
}

interface SponsorshipContextValue {
  isSponsored: boolean | null;
  isChecking: boolean;
  error: string | null;
  sponsorPubkey: string | null;
  detail: SponsorshipDetail | null;
  pendingClaim: PendingClaimInfo | null;
  refresh: () => Promise<void>;
}

const SponsorshipContext = createContext<SponsorshipContextValue | null>(null);

export function SponsorshipProvider({ children }: { children: ReactNode }) {
  const { rpc, connected, authReady } = useRpc();
  const { identity, hasValidIdentity } = useIdentityContext();

  const [isSponsored, setIsSponsored] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sponsorPubkey, setSponsorPubkey] = useState<string | null>(null);
  const [detail, setDetail] = useState<SponsorshipDetail | null>(null);
  const [pendingClaim, setPendingClaim] = useState<PendingClaimInfo | null>(null);

  const checkSponsorship = async () => {
    if (!identity?.publicKey || !rpc || !connected || !authReady) {
      logger.info('[Sponsorship] Cannot check - missing requirements:', {
        hasIdentity: !!identity?.publicKey,
        hasRpc: !!rpc,
        connected,
        authReady,
      });
      setIsSponsored(null);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      logger.info('[Sponsorship] Checking sponsorship for:', identity.publicKey.substring(0, 20));
      const info = await rpc.getSponsorshipInfo(identity.publicKey);
      logger.info('[Sponsorship] Result:', info);

      const sponsored = info.is_sponsored === true;
      setIsSponsored(sponsored);
      setSponsorPubkey(info.sponsor_pubkey);
      setDetail({
        depth: info.depth,
        probationary: info.probationary,
        isUnderPenalty: info.is_under_penalty,
        createdAt: info.created_at,
        isGenesis: info.is_genesis,
      });

      if (!sponsored) {
        logger.warn('[Sponsorship] Identity is NOT sponsored - actions will be restricted');
        // Check for pending claim
        try {
          const claimStatus = await rpc.getMyClaimStatus(identity.publicKey);
          if (claimStatus.has_pending_claim && claimStatus.offer_id) {
            setPendingClaim({
              offerId: claimStatus.offer_id,
              claimedAt: claimStatus.claimed_at ?? 0,
              offerExpiresAt: claimStatus.offer_expires_at ?? 0,
              sponsorPubkey: claimStatus.sponsor_pubkey ?? '',
            });
            logger.info('[Sponsorship] Pending claim found:', claimStatus);
          } else {
            setPendingClaim(null);
          }
        } catch (claimErr) {
          logger.warn('[Sponsorship] Failed to check claim status:', claimErr);
          setPendingClaim(null);
        }
      } else {
        setPendingClaim(null);
      }
    } catch (err) {
      logger.error('[Sponsorship] Failed to check:', err);
      setError(err instanceof Error ? err.message : 'Failed to check sponsorship');
      setIsSponsored(false);
    } finally {
      setIsChecking(false);
    }
  };

  // Check sponsorship when identity or connection changes
  useEffect(() => {
    if (hasValidIdentity && connected && authReady) {
      checkSponsorship();
    } else {
      setIsSponsored(null);
      setSponsorPubkey(null);
      setDetail(null);
    }
  }, [identity?.publicKey, connected, authReady, hasValidIdentity]);

  // Poll every 30s when unsponsored (waiting for claim approval)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (isSponsored === false && hasValidIdentity && connected && authReady) {
      pollRef.current = setInterval(() => {
        checkSponsorship();
      }, 30_000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isSponsored, hasValidIdentity, connected, authReady]);

  const value: SponsorshipContextValue = {
    isSponsored,
    isChecking,
    error,
    sponsorPubkey,
    detail,
    pendingClaim,
    refresh: checkSponsorship,
  };

  return (
    <SponsorshipContext.Provider value={value}>
      {children}
    </SponsorshipContext.Provider>
  );
}

export function useSponsorship(): SponsorshipContextValue {
  const context = useContext(SponsorshipContext);
  if (!context) {
    throw new Error('useSponsorship must be used within a SponsorshipProvider');
  }
  return context;
}
