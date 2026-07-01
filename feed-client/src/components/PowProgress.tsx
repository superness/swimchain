/**
 * Proof-of-Work progress display with mining tips
 */

import { useState, useMemo } from 'react';
import './PowProgress.css';

// Local implementation of mining estimate (avoids @swimchain/react import)
function useMiningEstimate(difficulty: number): { formatted: string } {
  return useMemo(() => {
    const expectedAttempts = Math.pow(2, difficulty);
    const hashRate = 50000; // Approximate hash rate
    const seconds = expectedAttempts / hashRate;

    if (seconds < 60) return { formatted: `~${Math.round(seconds)}s` };
    if (seconds < 3600) return { formatted: `~${Math.round(seconds / 60)}m` };
    return { formatted: `~${Math.round(seconds / 3600)}h` };
  }, [difficulty]);
}

const MINING_TIPS = [
  "This proof-of-work prevents spam without needing moderators.",
  "Every post costs compute, making advertising economically irrational.",
  "You're not just waiting - you're defending the network.",
  "Continue browsing while mining by opening threads in new tabs.",
  "The mining process uses your CPU to find a hash with specific properties.",
  "Once complete, your identity will be valid across the entire network.",
  "Swimchain uses Ed25519 signatures for cryptographic identity.",
  "Your private key never leaves your browser.",
];

interface PowProgressProps {
  attempts: number;
  elapsedMs: number;
  difficulty: number;
  onCancel: () => void;
}

export function PowProgress({
  attempts,
  elapsedMs,
  difficulty,
  onCancel,
}: PowProgressProps): JSX.Element {
  const [tip] = useState(() => MINING_TIPS[Math.floor(Math.random() * MINING_TIPS.length)]);
  const { formatted: estimatedTime } = useMiningEstimate(difficulty);

  const elapsedSeconds = elapsedMs / 1000;
  const hashRate = elapsedMs > 0 ? Math.round(attempts / (elapsedMs / 1000)) : 0;

  // Calculate progress (rough estimate based on expected attempts)
  const expectedAttempts = Math.pow(2, difficulty);
  const progressPercent = Math.min((attempts / expectedAttempts) * 100, 95);

  return (
    <div className="pow-progress" role="status" aria-live="polite">
      <h3 className="pow-title">Mining Proof-of-Work</h3>

      <div className="pow-spinner" aria-hidden="true">
        <div className="spinner-cube">
          <div className="cube-face front"></div>
          <div className="cube-face back"></div>
          <div className="cube-face right"></div>
          <div className="cube-face left"></div>
          <div className="cube-face top"></div>
          <div className="cube-face bottom"></div>
        </div>
      </div>

      <div className="pow-stats">
        <div className="stat">
          <span className="stat-value">{attempts.toLocaleString()}</span>
          <span className="stat-label">Attempts</span>
        </div>
        <div className="stat">
          <span className="stat-value">{elapsedSeconds.toFixed(1)}s</span>
          <span className="stat-label">Elapsed</span>
        </div>
        <div className="stat">
          <span className="stat-value">{hashRate.toLocaleString()}</span>
          <span className="stat-label">Hashes/sec</span>
        </div>
      </div>

      <div
        className="pow-progress-bar"
        role="progressbar"
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Mining progress: ${Math.round(progressPercent)}%`}
      >
        <div
          className="progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <p className="pow-estimate">
        Estimated time: {estimatedTime}
      </p>

      <p className="pow-tip" aria-live="polite">
        Did you know? {tip}
      </p>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={onCancel}
      >
        Cancel Mining
      </button>
    </div>
  );
}
