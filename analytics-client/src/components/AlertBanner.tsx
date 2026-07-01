/**
 * Alert Banner Component
 */

import type { Alert } from '../types';
import './AlertBanner.css';

interface AlertBannerProps {
  alert: Alert;
  onDismiss?: () => void;
}

export function AlertBanner({ alert, onDismiss }: AlertBannerProps): JSX.Element {
  const getSeverityIcon = (): string => {
    switch (alert.severity) {
      case 'critical':
        return '🚨';
      case 'warning':
        return '⚠️';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className={`alert-banner severity-${alert.severity}`}>
      <span className="alert-icon">{getSeverityIcon()}</span>
      <div className="alert-content">
        <span className="alert-message">{alert.message}</span>
        {alert.details && (
          <span className="alert-details">{alert.details}</span>
        )}
      </div>
      <span className="alert-time">
        {alert.timestamp.toLocaleTimeString()}
      </span>
      {onDismiss && (
        <button className="alert-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
