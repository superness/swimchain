/**
 * Hook for fetching and paginating public sponsorship offers
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { logger } from '../lib/logger';
import type { SponsorshipOfferSummary } from '../lib/rpc';

// App-onboarding sponsors whose offers exist for in-app onboarding (e.g. the
// reef/chess game bot) and should NOT surface in the general offer list.
// Client display choice, not a protocol rule.
const HIDDEN_ONBOARDING_SPONSORS = new Set<string>([
  '0530df507ad26a2ee6d0c61ef1e37e4e08abae087c1755467d98e3435ecd2984', // reef/chess game bot (mainnet)
]);

interface UseSponsorshipOffersResult {
  offers: SponsorshipOfferSummary[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

export function useSponsorshipOffers(
  offerType?: 'open' | 'probationary'
): UseSponsorshipOffersResult {
  const { rpc, connected } = useRpc();
  const [offers, setOffers] = useState<SponsorshipOfferSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const fetchOffers = useCallback(async (resetOffset = true) => {
    if (!rpc || !connected) return;
    setIsLoading(true);
    setError(null);

    try {
      const currentOffset = resetOffset ? 0 : offset;
      const result = await rpc.listSponsorshipOffers({
        offset: currentOffset,
        limit: 20,
        offerType,
      });

      // Hide app-onboarding offers (e.g. the reef/chess game bot) from the general
      // offer list — those exist for in-app onboarding, not general sponsorship.
      // Client display choice, not a protocol rule.
      const visible = result.offers.filter(
        o => !HIDDEN_ONBOARDING_SPONSORS.has(o.sponsor_pubkey.toLowerCase())
      );

      if (resetOffset) {
        setOffers(visible);
        setOffset(visible.length);
      } else {
        setOffers(prev => [...prev, ...visible]);
        setOffset(currentOffset + visible.length);
      }
      setTotal(result.total);
      setHasMore(result.has_more);

      logger.info('[SponsorshipOffers] Fetched offers:', {
        count: result.offers.length,
        total: result.total,
        hasMore: result.has_more,
      });
    } catch (err) {
      logger.error('[SponsorshipOffers] Failed to fetch:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch offers');
    } finally {
      setIsLoading(false);
    }
  }, [rpc, connected, offset, offerType]);

  const refresh = useCallback(async () => {
    await fetchOffers(true);
  }, [fetchOffers]);

  const loadMore = useCallback(async () => {
    if (hasMore && !isLoading) {
      await fetchOffers(false);
    }
  }, [fetchOffers, hasMore, isLoading]);

  useEffect(() => {
    if (connected) {
      fetchOffers(true);
    }
  }, [connected, offerType]);

  return { offers, total, hasMore, isLoading, error, refresh, loadMore };
}
