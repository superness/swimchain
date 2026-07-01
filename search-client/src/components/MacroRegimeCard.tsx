/**
 * MacroRegimeCard Component
 *
 * Displays current macro regime context including volatility risk premium stance,
 * stock-bond correlation, and a countdown to the next macro event.
 * Visually distinct from signal cards — uses purple/coral border and muted background.
 * Header says 'CONTEXT - not a trade signal.'
 */

import { memo, useEffect, useState } from 'react';
import './MacroRegimeCard.css';

export interface MacroRegimeCardProps {
  /** Human-readable regime label (e.g. 'Risk-On', 'Risk-Off', 'Transition') */
  regime_label: string;
  /** Stock-bond correlation as a number; will show +/- sign */
  stockBondCorrelation: number;
  /** Volatility risk premium stance */
  vrpStance: 'bullish' | 'bearish' | 'neutral';
  /** Short description of the next macro event (e.g. 'FOMC Rate Decision') */
  nextEventRisk: string;
  /** ISO date string or Date for the next event — a countdown timer will show remaining time */
  nextEventDate: string | Date;
  /** Unix timestamp (seconds) of when this data was last updated */
  lastUpdated: number;
}

/**
 * Format remaining time until a target date.
 * Returns "XXh XXm" or "XXd XXh" or "XXm XXs" depending on magnitude.
 */
function formatCountdown(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'Past due';
  const totalSec = Math.floor(diffMs / 1000);
  const totalMin = Math.floor(totalSec / 60);
  const totalHr = Math.floor(totalMin / 60);
  const days = Math.floor(totalHr / 24);
  const hours = totalHr % 24;
  const minutes = totalMin % 60;
  const seconds = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Determine if data is stale (older than 5 minutes from now).
 */
function isStale(lastUpdated: number): boolean {
  const ageSeconds = Math.floor(Date.now() / 1000) - lastUpdated;
  return ageSeconds > 300; // 5 minutes
}

/**
 * Badge variant based on VRM stance
 */
function vrpBadgeClass(stance: 'bullish' | 'bearish' | 'neutral'): string {
  switch (stance) {
    case 'bullish': return 'vrp-bullish';
    case 'bearish': return 'vrp-bearish';
    case 'neutral': return 'vrp-neutral';
  }
}

function vrpLabel(stance: 'bullish' | 'bearish' | 'neutral'): string {
  switch (stance) {
    case 'bullish': return 'Bullish';
    case 'bearish': return 'Bearish';
    case 'neutral': return 'Neutral';
  }
}

export const MacroRegimeCard = memo(function MacroRegimeCard({
  regime_label,
  stockBondCorrelation,
  vrpStance,
  nextEventRisk,
  nextEventDate,
  lastUpdated,
}: MacroRegimeCardProps): JSX.Element {
  // Countdown timer state — ticks every second to force re-render
  const [, setTick] = useState(0);
  const stale = isStale(lastUpdated);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const targetDate = typeof nextEventDate === 'string' ? new Date(nextEventDate) : nextEventDate;
  const countdownText = formatCountdown(targetDate);
  const corrSign = stockBondCorrelation >= 0 ? '+' : '';
  const corrLabel = stockBondCorrelation > 0.3 ? 'Positive' : stockBondCorrelation < -0.3 ? 'Negative' : 'Near Zero';

  return (
    <article className="macro-regime-card" role="region" aria-label="Macro Regime Context">
      {/* Header disclaimer */}
      <div className="macro-regime-card__header">
        <span className="macro-regime-card__disclaimer">CONTEXT — not a trade signal.</span>
        {stale && <span className="macro-regime-card__stale-badge">⚠ Stale</span>}
      </div>

      {/* Regime label */}
      <div className="macro-regime-card__regime">
        {regime_label}
      </div>

      {/* Stats grid */}
      <div className="macro-regime-card__stats">
        {/* Stock-Bond Correlation */}
        <div className="macro-regime-card__stat">
          <span className="macro-regime-card__stat-label">
            Stock-Bond Correlation
          </span>
          <span
            className={`macro-regime-card__stat-value ${
              stockBondCorrelation >= 0 ? 'stat-positive' : 'stat-negative'
            }`}
          >
            {corrSign}{stockBondCorrelation.toFixed(2)}
            <span className="macro-regime-card__stat-sub">{corrLabel}</span>
          </span>
        </div>

        {/* VRP Stance */}
        <div className="macro-regime-card__stat">
          <span className="macro-regime-card__stat-label">VRP Stance</span>
          <span className={`macro-regime-card__vrp-badge ${vrpBadgeClass(vrpStance)}`}>
            {vrpLabel(vrpStance)}
          </span>
        </div>
      </div>

      {/* Next event section */}
      <div className="macro-regime-card__event">
        <span className="macro-regime-card__event-label">Next Event</span>
        <span className="macro-regime-card__event-name">{nextEventRisk}</span>
        <span className={`macro-regime-card__countdown ${
          countdownText === 'Past due' ? 'countdown-past' : ''
        }`}>
          {countdownText}
        </span>
      </div>
    </article>
  );
});
