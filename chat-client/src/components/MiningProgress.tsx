/**
 * Mining progress indicator with tips
 */

import { useState, useEffect } from 'react';
import type { MiningProgress as MiningProgressType } from '../types';
import { formatRemainingTime } from '../utils/time';
import './MiningProgress.css';

interface MiningProgressProps {
  progress: MiningProgressType;
  onCancel: () => void;
}

const MINING_TIPS = [
  'PoW prevents spam without moderators...',
  'Your message is being secured on the chain...',
  'Mining ensures fair access for everyone...',
  'No centralized authority needed...',
  'This proof of work keeps the network healthy...',
];

export function MiningProgress({
  progress,
  onCancel,
}: MiningProgressProps): JSX.Element {
  const [tipIndex, setTipIndex] = useState(0);

  // Rotate tips every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % MINING_TIPS.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const totalEstimated = progress.elapsedMs + progress.estimatedRemainingMs;
  const percentComplete = Math.min(
    99,
    Math.round((progress.elapsedMs / totalEstimated) * 100)
  );

  return (
    <div className="mining-progress">
      <div className="mining-progress__bar-container">
        <div
          className="mining-progress__bar"
          style={{ width: `${percentComplete}%` }}
          role="progressbar"
          aria-valuenow={percentComplete}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mining progress"
        />
      </div>

      <div className="mining-progress__info">
        <span className="mining-progress__time">
          {formatRemainingTime(progress.estimatedRemainingMs)}
        </span>
        <span className="mining-progress__tip">{MINING_TIPS[tipIndex]}</span>
      </div>

      <button
        className="mining-progress__cancel btn btn-ghost btn-sm"
        onClick={onCancel}
        aria-label="Cancel mining"
      >
        Cancel
      </button>
    </div>
  );
}
