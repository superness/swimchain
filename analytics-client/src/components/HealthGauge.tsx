/**
 * Health Gauge Component
 *
 * Displays a circular gauge for network health score.
 */

import type { NetworkHealth } from '../types';
import './HealthGauge.css';

interface HealthGaugeProps {
  health: NetworkHealth | null;
  size?: number;
}

export function HealthGauge({ health, size = 200 }: HealthGaugeProps): JSX.Element {
  const score = health?.score ?? 0;
  const status = health?.status ?? 'unknown';

  // Calculate arc for gauge
  const radius = (size - 20) / 2;
  const circumference = radius * Math.PI; // Half circle
  const offset = circumference - (score / 100) * circumference;

  const getStatusColor = (): string => {
    switch (status) {
      case 'healthy':
        return 'var(--color-success)';
      case 'degraded':
        return 'var(--color-warning)';
      case 'unhealthy':
        return 'var(--color-error)';
      default:
        return 'var(--color-text-tertiary)';
    }
  };

  const getStatusLabel = (): string => {
    switch (status) {
      case 'healthy':
        return 'Healthy';
      case 'degraded':
        return 'Degraded';
      case 'unhealthy':
        return 'Unhealthy';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="health-gauge" style={{ width: size, height: size / 2 + 40 }}>
      <svg
        width={size}
        height={size / 2 + 10}
        viewBox={`0 0 ${size} ${size / 2 + 10}`}
        role="img"
        aria-label={`Network health gauge showing ${Math.round(score)} out of 100, status: ${getStatusLabel()}`}
      >
        {/* Background arc */}
        <path
          className="gauge-bg"
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          fill="none"
          strokeWidth="10"
        />
        {/* Value arc */}
        <path
          className="gauge-value"
          d={`M 10 ${size / 2} A ${radius} ${radius} 0 0 1 ${size - 10} ${size / 2}`}
          fill="none"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ stroke: getStatusColor() }}
        />
      </svg>

      <div className="gauge-content">
        <span className="gauge-score">{Math.round(score)}</span>
        <span className="gauge-label" style={{ color: getStatusColor() }}>
          {getStatusLabel()}
        </span>
      </div>

      {health && (
        <div className="gauge-timestamp">
          Last updated: {health.timestamp.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
