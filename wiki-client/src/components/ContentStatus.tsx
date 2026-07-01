/**
 * ContentStatus - Inline decay indicator for search results
 * Shows survival probability based on 7-day half-life (SPEC_02)
 */

import './ContentStatus.css';

interface ContentStatusProps {
  /** Unix timestamp in seconds */
  createdAt: number;
}

function getDecayInfo(createdAt: number): { survivalPct: number; label: string; className: string } {
  const ageMs = Date.now() - createdAt * 1000;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const survivalPct = Math.max(0, Math.min(100, Math.pow(0.5, ageDays / 7) * 100));

  if (survivalPct >= 75) return { survivalPct, label: 'alive', className: 'cs-healthy' };
  if (survivalPct >= 25) return { survivalPct, label: 'fading', className: 'cs-active' };
  if (survivalPct >= 10) return { survivalPct, label: 'stale', className: 'cs-stale' };
  return { survivalPct, label: 'decaying', className: 'cs-decaying' };
}

export function ContentStatus({ createdAt }: ContentStatusProps): JSX.Element {
  const decay = getDecayInfo(createdAt);

  return (
    <span className={`content-status-inline ${decay.className}`} title={`${decay.survivalPct.toFixed(0)}% survival`}>
      <span className="cs-bar">
        <span className="cs-bar-fill" style={{ width: `${decay.survivalPct}%` }} />
      </span>
      <span className="cs-label">{decay.survivalPct.toFixed(0)}% {decay.label}</span>
    </span>
  );
}
