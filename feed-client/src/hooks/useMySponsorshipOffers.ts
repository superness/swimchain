/**
 * Hook for fetching sponsor's own offers with claim counts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRpc } from './useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useStoredKeypair } from './useStoredKeypair';
import { logger } from '../lib/logger';
import type { MySponsorshipOfferSummary, SponsorshipOfferDetail } from '../lib/rpc';

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

/** Build signature message: "swimchain-list-offers:" || sponsor(32) || timestamp(8 BE) */
function buildListOffersSignatureMessage(sponsorPubkeyHex: string, timestamp: number): Uint8Array {
  const prefix = new TextEncoder().encode('swimchain-list-offers:');
  const sponsorBytes = hexToBytes(sponsorPubkeyHex);
  const msg = new Uint8Array(prefix.length + 32 + 8);
  msg.set(prefix, 0);
  msg.set(sponsorBytes, prefix.length);
  const view = new DataView(msg.buffer);
  view.setBigUint64(prefix.length + 32, BigInt(timestamp), false);
  return msg;
}

interface UseMySponsorshipOffersResult {
  offers: MySponsorshipOfferSummary[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  totalPendingClaims: number;
  getOfferDetail: (offerId: string) => Promise<SponsorshipOfferDetail | null>;
}

export function useMySponsorshipOffers(): UseMySponsorshipOffersResult {
  const { rpc, connected } = useRpc();
  const { identity } = useIdentityContext();
  const { sign } = useStoredKeypair();
  const [offers, setOffers] = useState<MySponsorshipOfferSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    if (!rpc || !connected || !identity?.publicKey || !sign) return;
    setIsLoading(true);
    setError(null);

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const sigMsg = buildListOffersSignatureMessage(identity.publicKey, timestamp);
      const sigBytes = sign(sigMsg);
      if (!sigBytes) {
        setError('Failed to sign request');
        return;
      }
      const result = await rpc.listMySponsorshipOffers({
        sponsorPubkey: identity.publicKey,
        signature: bytesToHex(sigBytes),
        timestamp,
      });
      setOffers(result.offers);
      logger.info('[MySponsorshipOffers] Fetched:', { count: result.offers.length });
    } catch (err) {
      logger.error('[MySponsorshipOffers] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offers');
    } finally {
      setIsLoading(false);
    }
  }, [rpc, connected, identity?.publicKey, sign]);

  const getOfferDetail = useCallback(async (offerId: string): Promise<SponsorshipOfferDetail | null> => {
    if (!rpc || !connected || !identity?.publicKey) return null;
    try {
      return await rpc.getSponsorshipOffer(offerId, identity.publicKey);
    } catch (err) {
      logger.error('[MySponsorshipOffers] Failed to get detail:', err);
      return null;
    }
  }, [rpc, connected, identity?.publicKey]);

  useEffect(() => {
    if (connected && identity?.publicKey) {
      fetchOffers();
    }
  }, [connected, identity?.publicKey]);

  // Poll every 30s so the sidebar badge updates when new claims arrive
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    const hasActiveOffers = offers.some(o => !o.is_expired);
    if (connected && identity?.publicKey && hasActiveOffers) {
      pollIntervalRef.current = setInterval(() => {
        fetchOffers();
      }, 30_000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connected, identity?.publicKey, sign, offers.length]);

  const totalPendingClaims = offers.reduce((sum, o) => sum + o.slots_pending, 0);

  return { offers, isLoading, error, refresh: fetchOffers, totalPendingClaims, getOfferDetail };
}
