/**
 * Visual decay badge showing content survival probability.
 * Uses 7-day half-life formula from SPEC_02.
 */

import './DecayIndicator.css';

interface DecayIndicatorProps {
  createdAt: number;
  lastEngagement: number;
}

interface DecayLevel {
  className: string;
  label: string;
}

function getDecayLevel(probability: number): DecayLevel {
  if (probability > 0.7) return { className: 'decay-green', label: 'Healthy' };
  if (probability > 0.3) return { className: 'decay-yellow', label: 'Aging' };
  if (probability > 0.1) return { className: 'decay-orange', label: 'Stale' };
  return { className: 'decay-red', label: 'Decaying' };
}

export function DecayIndicator({ createdAt, lastEngagement }: DecayIndicatorProps): JSX.Element {
  const now = Date.now() / 1000; // current time in seconds
  const anchor = Math.max(createdAt, lastEngagement);
  const daysSinceEngagement = Math.max(0, (now - anchor) / (60 * 60 * 24));

  // 7-day half-life: probability = 0.5 ^ (days / 7)
  const probability = Math.pow(0.5, daysSinceEngagement / 7);
  const pct = Math.min(100, Math.max(0, probability * 100));
  const { className, label } = getDecayLevel(probability);

  return (
    <div
      className={`decay-indicator-badge ${className}`}
      title={`${pct.toFixed(1)}% survival — ${label} (${daysSinceEngagement.toFixed(1)} days since engagement)`}
    >
      <div className="decay-bar-track">
        <div className="decay-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="decay-pct">{pct.toFixed(0)}%</span>
    </div>
  );
}
