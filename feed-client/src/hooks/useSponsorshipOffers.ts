/**
 * Hook for fetching and paginating public sponsorship offers
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import { logger } from '../lib/logger';
import type { SponsorshipOfferSummary } from '../lib/rpc';

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

      if (resetOffset) {
        setOffers(result.offers);
        setOffset(result.offers.length);
      } else {
        setOffers(prev => [...prev, ...result.offers]);
        setOffset(currentOffset + result.offers.length);
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
