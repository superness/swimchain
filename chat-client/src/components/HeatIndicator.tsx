/**
 * Compact heat indicator for messages
 */

import { getHeatState, type HeatState } from '../types';
import './HeatIndicator.css';

interface HeatIndicatorProps {
  heatPercent: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function HeatIndicator({
  heatPercent,
  showLabel = true,
  size = 'sm',
}: HeatIndicatorProps): JSX.Element {
  const state = getHeatState(heatPercent);

  return (
    <span
      className={`heat-indicator heat-indicator--${state} heat-indicator--${size}`}
      title={`${heatPercent}% heat`}
    >
      <span className="heat-indicator__icon" aria-hidden="true">
        {getHeatIcon(state)}
      </span>
      {showLabel && (
        <span className="heat-indicator__value">{heatPercent}%</span>
      )}
    </span>
  );
}

function getHeatIcon(state: HeatState): string {
  switch (state) {
    case 'full':
    case 'warm':
      return '🔥';
    case 'cooling':
      return '⚡';
    case 'fading':
    case 'decayed':
      return '💤';
  }
}
