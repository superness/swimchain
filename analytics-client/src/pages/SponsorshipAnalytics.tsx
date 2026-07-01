/**
 * Sponsorship Analytics Page
 *
 * Dashboard showing sponsorship metrics across the network:
 * - Total active offers
 * - Claims breakdown (pending/approved/rejected)
 * - Slots utilization
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import type { SponsorshipOfferSummary } from '../lib/rpc';
import './SponsorshipAnalytics.css';

interface SponsorshipMetrics {
  totalOffers: number;
  activeOffers: number;
  expiredOffers: number;
  totalSlots: number;
  slotsRemaining: number;
  slotsClaimed: number;
  offersByType: Record<string, number>;
  avgSlotsPerOffer: number;
  requiresApplication: number;
  requiresPow: number;
}

function computeMetrics(offers: SponsorshipOfferSummary[]): SponsorshipMetrics {
  const now = Math.floor(Date.now() / 1000);
  let activeOffers = 0;
  let expiredOffers = 0;
  let totalSlots = 0;
  let slotsRemaining = 0;
  let requiresApplication = 0;
  let requiresPow = 0;
  const offersByType: Record<string, number> = {};

  for (const offer of offers) {
    if (offer.expires_at > now) {
      activeOffers++;
    } else {
      expiredOffers++;
    }
    totalSlots += offer.slots_total;
    slotsRemaining += offer.slots_remaining;
    offersByType[offer.offer_type] = (offersByType[offer.offer_type] ?? 0) + 1;
    if (offer.requirements.application_required) requiresApplication++;
    if (offer.requirements.min_pow_difficulty > 0) requiresPow++;
  }

  return {
    totalOffers: offers.length,
    activeOffers,
    expiredOffers,
    totalSlots,
    slotsRemaining,
    slotsClaimed: totalSlots - slotsRemaining,
    offersByType,
    avgSlotsPerOffer: offers.length > 0 ? totalSlots / offers.length : 0,
    requiresApplication,
    requiresPow,
  };
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function formatTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return 'Expired';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function SponsorshipAnalytics(): JSX.Element {
  const { rpc, connected } = useRpc();
  const [offers, setOffers] = useState<SponsorshipOfferSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOffers = useCallback(async () => {
    if (!rpc || !connected) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await rpc.listSponsorshipOffers(200, 0);
      setOffers(result.offers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sponsorship data');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const metrics = computeMetrics(offers);
  const now = Math.floor(Date.now() / 1000);
  const activeOffers = offers.filter(o => o.expires_at > now);
  const slotsUsedPercent = metrics.totalSlots > 0
    ? ((metrics.slotsClaimed / metrics.totalSlots) * 100)
    : 0;

  return (
    <div className="sponsorship-analytics">
      <header className="sa-header">
        <div className="sa-header-left">
          <Link to="/" className="btn btn-ghost sa-back">&larr; Dashboard</Link>
          <h1>Sponsorship Analytics</h1>
        </div>
        <button
          className="btn btn-ghost"
          onClick={fetchOffers}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div className="sa-error" role="alert">
          <span className="error-icon">!</span>
          <span>{error}</span>
        </div>
      )}

      {!connected && !error && (
        <div className="sa-warning">
          Not connected to node. Waiting for connection...
        </div>
      )}

      {/* Metric Cards */}
      <section className="sa-metrics-grid">
        <div className="sa-metric-card">
          <span className="sa-metric-value">{metrics.activeOffers}</span>
          <span className="sa-metric-label">Active Offers</span>
        </div>
        <div className="sa-metric-card">
          <span className="sa-metric-value">{metrics.totalSlots}</span>
          <span className="sa-metric-label">Total Slots</span>
        </div>
        <div className="sa-metric-card">
          <span className="sa-metric-value">{metrics.slotsClaimed}</span>
          <span className="sa-metric-label">Slots Claimed</span>
        </div>
        <div className="sa-metric-card">
          <span className="sa-metric-value">{metrics.slotsRemaining}</span>
          <span className="sa-metric-label">Slots Available</span>
        </div>
      </section>

      {/* Slots Utilization Bar */}
      <section className="sa-section">
        <h2>Slot Utilization</h2>
        <div className="sa-utilization">
          <div className="sa-utilization-bar">
            <div
              className="sa-utilization-fill"
              style={{ width: `${slotsUsedPercent}%` }}
            />
          </div>
          <span className="sa-utilization-label">
            {metrics.slotsClaimed} / {metrics.totalSlots} slots used ({slotsUsedPercent.toFixed(1)}%)
          </span>
        </div>
      </section>

      {/* Offer Type Breakdown */}
      <section className="sa-section">
        <h2>Offers by Type</h2>
        {Object.keys(metrics.offersByType).length > 0 ? (
          <div className="sa-type-grid">
            {Object.entries(metrics.offersByType).map(([type, count]) => (
              <div key={type} className="sa-type-card">
                <span className={`sa-type-badge ${type}`}>{type}</span>
                <span className="sa-type-count">{count} offer{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="sa-empty">No offers found</p>
        )}
      </section>

      {/* Requirements Summary */}
      <section className="sa-section">
        <h2>Requirements</h2>
        <div className="sa-req-grid">
          <div className="sa-req-card">
            <span className="sa-req-value">{metrics.requiresApplication}</span>
            <span className="sa-req-label">Require Application</span>
          </div>
          <div className="sa-req-card">
            <span className="sa-req-value">{metrics.requiresPow}</span>
            <span className="sa-req-label">Require PoW</span>
          </div>
          <div className="sa-req-card">
            <span className="sa-req-value">{metrics.avgSlotsPerOffer.toFixed(1)}</span>
            <span className="sa-req-label">Avg Slots/Offer</span>
          </div>
        </div>
      </section>

      {/* Active Offers Table */}
      <section className="sa-section">
        <h2>Active Offers ({activeOffers.length})</h2>
        {loading && offers.length === 0 ? (
          <p className="sa-loading">Loading sponsorship data...</p>
        ) : activeOffers.length > 0 ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Sponsor</th>
                  <th>Type</th>
                  <th>Slots</th>
                  <th>Remaining</th>
                  <th>Expires</th>
                  <th>PoW</th>
                  <th>App Required</th>
                </tr>
              </thead>
              <tbody>
                {activeOffers.map(offer => (
                  <tr key={offer.offer_id}>
                    <td>
                      <code className="sa-address" title={offer.sponsor_pubkey}>
                        {truncateAddress(offer.sponsor_pubkey)}
                      </code>
                    </td>
                    <td>
                      <span className={`sa-type-badge ${offer.offer_type}`}>
                        {offer.offer_type}
                      </span>
                    </td>
                    <td>{offer.slots_total}</td>
                    <td>
                      <span className={offer.slots_remaining === 0 ? 'sa-text-warning' : ''}>
                        {offer.slots_remaining}
                      </span>
                    </td>
                    <td>{formatTimeRemaining(offer.expires_at)}</td>
                    <td>{offer.requirements.min_pow_difficulty > 0 ? `Diff ${offer.requirements.min_pow_difficulty}` : 'None'}</td>
                    <td>{offer.requirements.application_required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sa-empty">No active sponsorship offers on the network.</p>
        )}
      </section>
    </div>
  );
}
