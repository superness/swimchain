'use client';

import { DECAY_THRESHOLD } from '@/types/search';

type HeatState = 'full' | 'warm' | 'cooling' | 'fading' | 'decayed';
type DisplayMode = 'bar' | 'numeric' | 'icon' | 'time';

interface HeatIndicatorProps {
  survivalProbability: number;  // 0.0-1.0
  isDecayed: boolean;
  isProtected: boolean;
  hoursUntilDecay: number | null;
  displayMode?: DisplayMode;
}

/**
 * Get heat state from survival probability
 * Based on CLIENT_DESIGN.md Section 2.1
 */
function getHeatState(probability: number): HeatState {
  if (probability >= 0.80) return 'full';
  if (probability >= 0.50) return 'warm';
  if (probability >= 0.20) return 'cooling';
  if (probability >= DECAY_THRESHOLD) return 'fading';  // 6.25% from SPEC_02
  return 'decayed';
}

/**
 * Get state label
 */
function getStateLabel(state: HeatState): string {
  switch (state) {
    case 'full': return 'Hot';
    case 'warm': return 'Stable';
    case 'cooling': return 'Needs engagement';
    case 'fading': return 'Fading';
    case 'decayed': return 'Decayed';
  }
}

/**
 * Get state icon
 */
function getStateIcon(state: HeatState): string {
  switch (state) {
    case 'full': return '\u{1F525}';     // Fire
    case 'warm': return '\u{2728}';      // Sparkles
    case 'cooling': return '\u{1F4A8}';  // Wind
    case 'fading': return '\u{2744}';    // Snowflake
    case 'decayed': return '\u{1F480}';  // Skull
  }
}

/**
 * Visualize content heat/decay state
 *
 * Visual states from CLIENT_DESIGN.md Section 2.1:
 * - FULL HEAT (100%): Bright, vibrant colors
 * - WARM (60%): Slightly muted, "Stable" label
 * - COOLING (20%): Muted/grayed, "Needs engagement" warning
 * - FADING (5%): Heavy degradation, "Fading" label
 * - DECAYED: Placeholder only
 */
export function HeatIndicator({
  survivalProbability,
  isDecayed,
  isProtected,
  hoursUntilDecay,
  displayMode = 'bar',
}: HeatIndicatorProps) {
  const state = isDecayed ? 'decayed' : getHeatState(survivalProbability);
  const percentage = Math.round(survivalProbability * 100);
  const label = getStateLabel(state);
  const icon = getStateIcon(state);

  if (isDecayed) {
    return (
      <span className="heat-indicator decayed">
        [Content has decayed]
      </span>
    );
  }

  if (displayMode === 'icon') {
    return (
      <span className={`heat-indicator icon heat-${state}`} title={`${percentage}% - ${label}`}>
        {icon}
      </span>
    );
  }

  if (displayMode === 'numeric') {
    return (
      <span className={`heat-indicator numeric heat-${state}`}>
        {icon} {percentage}%
        {isProtected && <span className="protected" title="Protected"> {'\u{1F512}'}</span>}
      </span>
    );
  }

  if (displayMode === 'time' && hoursUntilDecay !== null) {
    return (
      <span className={`heat-indicator time heat-${state}`}>
        {icon} ~{formatHoursRemaining(hoursUntilDecay)}
        {isProtected && <span className="protected" title="Protected"> {'\u{1F512}'}</span>}
      </span>
    );
  }

  // Bar display (default)
  return (
    <div className={`heat-indicator bar heat-${state}`}>
      <div className="bar-container">
        <div className="bar-fill" style={{ width: `${percentage}%` }} />
      </div>
      <span className="bar-label">
        {icon} {percentage}% {label}
        {isProtected && <span className="protected"> (Protected)</span>}
      </span>

      <style jsx>{`
        .heat-indicator.bar {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .bar-container {
          width: 100px;
          height: 6px;
          background: var(--color-bg);
          border-radius: 3px;
          overflow: hidden;
        }

        .bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }

        .heat-full .bar-fill { background: var(--color-heat-full); }
        .heat-warm .bar-fill { background: var(--color-heat-warm); }
        .heat-cooling .bar-fill { background: var(--color-heat-cooling); }
        .heat-fading .bar-fill { background: var(--color-heat-fading); }
        .heat-decayed .bar-fill { background: var(--color-heat-decayed); }

        .bar-label {
          font-size: 0.7rem;
          color: var(--color-text-muted);
        }

        .heat-fading .bar-label {
          color: var(--color-warning);
        }

        .protected {
          color: var(--color-success);
        }
      `}</style>
    </div>
  );
}

function formatHoursRemaining(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }
  const days = Math.round(hours / 24);
  return `${days}d`;
}
