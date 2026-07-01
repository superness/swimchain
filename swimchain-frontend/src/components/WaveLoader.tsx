/**
 * WaveLoader - Animated water waves for loading states
 *
 * A calm, fluid animation inspired by ocean waves.
 */

import { CSSProperties } from 'react';
import './WaveLoader.css';

export interface WaveLoaderProps {
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Optional loading text */
  text?: string;
  /** Full screen overlay mode */
  fullScreen?: boolean;
  /** Custom color (CSS color value) */
  color?: string;
}

export function WaveLoader({
  size = 'medium',
  text,
  fullScreen = false,
  color,
}: WaveLoaderProps): JSX.Element {
  const style: CSSProperties = color ? { '--wave-color': color } as CSSProperties : {};

  const content = (
    <div
      className={`wave-loader wave-loader--${size}`}
      style={style}
      role="status"
      aria-busy="true"
      aria-label={text || "Loading"}
    >
      <div className="wave-loader__container" aria-hidden="true">
        <div className="wave-loader__waves">
          <div className="wave-loader__wave wave-loader__wave--1" />
          <div className="wave-loader__wave wave-loader__wave--2" />
          <div className="wave-loader__wave wave-loader__wave--3" />
        </div>
        <div className="wave-loader__drops">
          <div className="wave-loader__drop wave-loader__drop--1" />
          <div className="wave-loader__drop wave-loader__drop--2" />
          <div className="wave-loader__drop wave-loader__drop--3" />
        </div>
      </div>
      {text && <p className="wave-loader__text">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="wave-loader__overlay">{content}</div>;
  }

  return content;
}

/**
 * PageTransition - Wave transition effect between pages
 */
export interface PageTransitionProps {
  /** Whether the transition is active */
  active: boolean;
  /** Direction of the wave */
  direction?: 'up' | 'down';
  /** Callback when transition completes */
  onComplete?: () => void;
}

export function PageTransition({
  active,
  direction = 'up',
  onComplete,
}: PageTransitionProps): JSX.Element | null {
  if (!active) return null;

  return (
    <div
      className={`page-transition page-transition--${direction} ${active ? 'page-transition--active' : ''}`}
      onAnimationEnd={onComplete}
    >
      <svg className="page-transition__wave" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path
          className="page-transition__path"
          d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
        />
      </svg>
    </div>
  );
}
