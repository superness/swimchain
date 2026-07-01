/**
 * Heat Histogram Component
 *
 * Displays a bar chart of heat distribution across buckets.
 */

import { CHART_COLORS } from '../types';
import './HeatHistogram.css';

interface HeatHistogramProps {
  buckets: number[];
}

export function HeatHistogram({ buckets }: HeatHistogramProps): JSX.Element {
  const maxCount = Math.max(...buckets, 1);

  return (
    <div className="heat-histogram">
      <div className="histogram-bars">
        {buckets.map((count, i) => {
          const height = (count / maxCount) * 100;
          const color = CHART_COLORS.heatGradient[i] || CHART_COLORS.muted;

          return (
            <div key={i} className="histogram-bar-container">
              <div
                className="histogram-bar"
                style={{
                  height: `${height}%`,
                  backgroundColor: color,
                }}
                title={`${i * 10}-${(i + 1) * 10}: ${count} posts`}
              />
              <span className="histogram-count">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="histogram-labels">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      <div className="histogram-legend">
        <span className="legend-item danger">At Risk</span>
        <span className="legend-item warning">Low</span>
        <span className="legend-item healthy">Healthy</span>
      </div>
    </div>
  );
}
