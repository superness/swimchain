/**
 * Status Card Component
 *
 * Displays a single metric with label, value, and optional icon.
 */

import './StatusCard.css';

type StatusVariant = 'default' | 'critical' | 'warning' | 'success';

interface StatusCardProps {
  label: string;
  value: string | number;
  icon?: 'eye' | 'alert' | 'warning' | 'archive' | 'database' | 'clock';
  variant?: StatusVariant;
}

const ICONS: Record<string, string> = {
  eye: '\u{1F441}', // Eye
  alert: '\u{1F6A8}', // Police light
  warning: '\u{26A0}', // Warning
  archive: '\u{1F4E6}', // Package
  database: '\u{1F4BE}', // Floppy disk
  clock: '\u{23F0}', // Alarm clock
};

export function StatusCard({
  label,
  value,
  icon,
  variant = 'default',
}: StatusCardProps): JSX.Element {
  return (
    <div
      className={`status-card status-card--${variant}`}
      role="status"
      aria-label={`${label}: ${value}`}
    >
      {icon && (
        <span className="status-card__icon" aria-hidden="true">
          {ICONS[icon] ?? ''}
        </span>
      )}
      <div className="status-card__content">
        <span className="status-card__value">{value}</span>
        <span className="status-card__label">{label}</span>
      </div>
    </div>
  );
}
