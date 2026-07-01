/**
 * Metric Card Component
 */

import './MetricCard.css';

interface MetricCardProps {
  title: string;
  value: string;
  icon?: string;
  trend?: number;
  invertTrend?: boolean;
}

export function MetricCard({
  title,
  value,
  icon,
  trend,
  invertTrend = false,
}: MetricCardProps): JSX.Element {
  const getTrendClass = (): string => {
    if (trend === undefined || trend === 0) return '';
    const isPositive = invertTrend ? trend < 0 : trend > 0;
    return isPositive ? 'positive' : 'negative';
  };

  const formatTrend = (t: number): string => {
    const sign = t > 0 ? '+' : '';
    return `${sign}${t.toFixed(1)}`;
  };

  return (
    <div className="metric-card">
      <div className="metric-header">
        {icon && <span className="metric-icon">{icon}</span>}
        <span className="metric-title">{title}</span>
      </div>
      <div className="metric-body">
        <span className="metric-value">{value}</span>
        {trend !== undefined && trend !== 0 && (
          <span className={`metric-trend ${getTrendClass()}`}>
            {formatTrend(trend)}
          </span>
        )}
      </div>
    </div>
  );
}
