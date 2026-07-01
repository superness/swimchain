/**
 * ContentStatus - Inline decay indicator for archiver views
 * Shows survival probability based on 7-day half-life (SPEC_02)
 */

import './ContentStatus.css';

interface ContentStatusProps {
  /** Content creation timestamp (Date object) */
  createdAt: Date;
  /** Whether this content has been archived (preserved) */
  archived?: boolean;
}

function getDecayInfo(createdAt: Date): { survivalPct: number; label: string; className: string } {
  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const survivalPct = Math.max(0, Math.min(100, Math.pow(0.5, ageDays / 7) * 100));

  if (survivalPct >= 75) return { survivalPct, label: 'alive', className: 'cs-healthy' };
  if (survivalPct >= 25) return { survivalPct, label: 'fading', className: 'cs-active' };
  if (survivalPct >= 10) return { survivalPct, label: 'at risk', className: 'cs-stale' };
  return { survivalPct, label: 'decaying', className: 'cs-decaying' };
}

export function ContentStatus({ createdAt, archived }: ContentStatusProps): JSX.Element {
  if (archived) {
    return (
      <span className="content-status-inline cs-archived" title="Preserved in archive">
        <span className="cs-label">Preserved</span>
      </span>
    );
  }

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
