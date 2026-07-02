/**
 * Engage Button Component
 *
 * Button to contribute PoW to content preservation.
 * Uses real Argon2id PoW mining via @swimchain/react.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { getAutoEngageEngine } from '../services/AutoEngageEngine';
import { useRpc } from '../hooks/useRpc';
import type { AtRiskContent, PoolStatus } from '../types';
import './EngageButton.css';

interface EngageButtonProps {
  /** Content ID to engage with (sha256:... format) */
  postHash: string;
  /** Seconds of PoW to contribute (for budget tracking) */
  seconds: 5 | 15 | 30;
  /** Current pool status (optional, for pool tracking) */
  poolStatus?: PoolStatus;
  /** Callback when engagement completes */
  onComplete?: (success: boolean, error?: string) => void;
}

type ButtonState = 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';

/** Get screen reader-friendly status message */
function getStatusMessage(state: ButtonState, seconds: number, hashRate?: number): string {
  switch (state) {
    case 'mining':
      const rateStr = hashRate ? ` (${hashRate.toFixed(1)} h/s)` : '';
      return `Mining ${seconds} seconds of proof of work${rateStr}...`;
    case 'complete':
      return `Successfully contributed ${seconds} seconds of proof of work`;
    case 'error':
      return 'Engagement failed. Please try again.';
    case 'cancelled':
      return 'Engagement cancelled.';
    default:
      return '';
  }
}

export function EngageButton({
  postHash,
  seconds,
  poolStatus,
  onComplete,
}: EngageButtonProps): JSX.Element {
  const [state, setState] = useState<ButtonState>('idle');
  const [progress, setProgress] = useState(0);
  const [hashRate, setHashRate] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // Track mining start time for progress estimation
  const startTimeRef = useRef<number>(0);

  const { rpc, connected } = useRpc();
  const engine = getAutoEngageEngine();

  // Inject the RPC client into the engine so it can fetch real pool status
  useEffect(() => {
    engine.setRpcClient(connected && rpc ? rpc : null);
  }, [engine, rpc, connected]);

  const canEngage = engine.canEngage(seconds);

  const handleCancel = useCallback(() => {
    if (state === 'mining') {
      engine.cancelEngagement();
      setState('cancelled');
      setStatusMessage(getStatusMessage('cancelled', seconds));

      // Reset after delay
      setTimeout(() => {
        setState('idle');
        setProgress(0);
        setHashRate(0);
        setStatusMessage('');
      }, 2000);
    }
  }, [state, engine, seconds]);

  const handleClick = async () => {
    if (state !== 'idle' || !canEngage) return;

    setState('mining');
    setProgress(0);
    setHashRate(0);
    setStatusMessage(getStatusMessage('mining', seconds));
    startTimeRef.current = Date.now();

    // Create a minimal AtRiskContent for the engine
    const content: AtRiskContent = {
      postHash,
      spaceId: '', // Not needed for PoW mining
      title: '',
      author: '',
      heat: 0,
      estimatedDecayTime: new Date(),
      replyCount: 0,
      poolStatus: poolStatus ?? {
        currentSeconds: 0,
        requiredSeconds: 60,
        contributorCount: 0,
      },
      urgency: 'normal',
    };

    try {
      const result = await engine.engage(
        content,
        seconds,
        (attempts, _elapsedMs, rate) => {
          // Estimate progress based on expected attempts for testnet difficulty 6
          // Expected attempts = 2^6 = 64 for testnet
          const expectedAttempts = 64;
          const estimatedProgress = Math.min(99, (attempts / expectedAttempts) * 100);
          setProgress(estimatedProgress);
          setHashRate(rate);
          setStatusMessage(getStatusMessage('mining', seconds, rate));
        }
      );

      if (result.success) {
        setState('complete');
        setProgress(100);
        setStatusMessage(getStatusMessage('complete', seconds));
        onComplete?.(true);

        // Reset after delay
        setTimeout(() => {
          setState('idle');
          setProgress(0);
          setHashRate(0);
          setStatusMessage('');
        }, 2000);
      } else if (result.error === 'Engagement cancelled') {
        // Already handled by handleCancel
      } else {
        setState('error');
        setStatusMessage(result.error ?? 'Engagement failed');
        onComplete?.(false, result.error);

        // Reset after delay
        setTimeout(() => {
          setState('idle');
          setProgress(0);
          setHashRate(0);
          setStatusMessage('');
        }, 3000);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState('error');
      setStatusMessage(errorMessage);
      onComplete?.(false, errorMessage);

      // Reset after delay
      setTimeout(() => {
        setState('idle');
        setProgress(0);
        setHashRate(0);
        setStatusMessage('');
      }, 3000);
    }
  };

  return (
    <>
      <button
        className={`engage-button engage-button--${state}`}
        onClick={state === 'mining' ? handleCancel : handleClick}
        disabled={state === 'complete' || (state === 'idle' && !canEngage)}
        aria-label={
          state === 'mining'
            ? 'Cancel mining'
            : `Engage with ${seconds} seconds of proof of work`
        }
        title={
          !canEngage && state === 'idle'
            ? 'Daily budget exceeded'
            : state === 'mining'
              ? 'Click to cancel'
              : undefined
        }
      >
        {state === 'mining' && (
          <div
            className="engage-button__progress"
            style={{ width: `${progress}%` }}
          />
        )}
        <span className="engage-button__content">
          {state === 'idle' && `+${seconds}s`}
          {state === 'mining' && (hashRate > 0 ? `${hashRate.toFixed(1)}h/s` : 'Mining...')}
          {state === 'complete' && '\u2713'}
          {state === 'error' && '\u2717'}
          {state === 'cancelled' && '\u2715'}
        </span>
      </button>
      {/* Screen reader announcement for status changes */}
      <span className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </span>
    </>
  );
}
