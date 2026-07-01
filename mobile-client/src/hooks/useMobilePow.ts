/**
 * useMobilePow - React Hook for Mobile Proof of Work
 * Provides battery-conscious PoW with progress tracking
 * Per SPEC_03 and mobile-viability.md
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NativeArgon2, { MiningProgress, PowSolution } from '../native/NativeArgon2';
import { ARGON2_CONFIG, DIFFICULTY, BATTERY_ESTIMATES } from '../constants/protocol';

export type PowState = 'idle' | 'mining' | 'complete' | 'error' | 'cancelled';

export interface UseMobilePowResult {
  state: PowState;
  progress: MiningProgress | null;
  solution: PowSolution | null;
  error: string | null;
  mine: (challenge: Uint8Array, difficulty: number) => Promise<PowSolution>;
  cancel: () => void;
  estimateDuration: (difficulty: number) => number;
  estimateBattery: (durationMs: number) => number;
  isNativeAvailable: boolean;
}

/**
 * Hook for performing Proof of Work on mobile devices
 */
export function useMobilePow(): UseMobilePowResult {
  const [state, setState] = useState<PowState>('idle');
  const [progress, setProgress] = useState<MiningProgress | null>(null);
  const [solution, setSolution] = useState<PowSolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNativeAvailable, setIsNativeAvailable] = useState(true);

  const isMiningRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Check native module availability
  useEffect(() => {
    const available = NativeArgon2.isAvailable();
    setIsNativeAvailable(available);
    if (!available) {
      console.warn('NativeArgon2 module not available - PoW will fail');
    }
  }, []);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came back to foreground
        // Mining continues automatically in native code
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  /**
   * Estimate mining duration in milliseconds
   */
  const estimateDuration = useCallback((difficulty: number): number => {
    // Use known estimates from mobile-viability.md
    if (difficulty in DIFFICULTY.estimates) {
      return DIFFICULTY.estimates[difficulty as keyof typeof DIFFICULTY.estimates];
    }
    // Fallback: 2^difficulty * 100ms average per hash on mobile
    return Math.pow(2, difficulty) * 100;
  }, []);

  /**
   * Estimate battery usage as percentage
   */
  const estimateBattery = useCallback((durationMs: number): number => {
    // ~5% per 30 seconds of mining
    const thirtySecondIntervals = durationMs / 30000;
    return Math.round(thirtySecondIntervals * BATTERY_ESTIMATES.perThirtySeconds * 10) / 10;
  }, []);

  /**
   * Start mining for a valid PoW solution
   */
  const mine = useCallback(
    async (challenge: Uint8Array, difficulty: number): Promise<PowSolution> => {
      if (!isNativeAvailable) {
        const errMsg = 'Native Argon2 module not available';
        setState('error');
        setError(errMsg);
        throw new Error(errMsg);
      }

      if (isMiningRef.current) {
        throw new Error('Mining already in progress');
      }

      isMiningRef.current = true;
      setState('mining');
      setProgress(null);
      setSolution(null);
      setError(null);

      try {
        const result = await NativeArgon2.mine(
          challenge,
          difficulty,
          ARGON2_CONFIG,
          (prog) => {
            setProgress(prog);
          }
        );

        // Convert native result to PowSolution
        const powSolution: PowSolution = {
          nonce: result.nonce,
          hash: result.hash,
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
        };

        setSolution(powSolution);
        setState('complete');
        isMiningRef.current = false;

        return powSolution;
      } catch (err) {
        isMiningRef.current = false;

        const message = err instanceof Error ? err.message : 'Mining failed';

        if (message.includes('CANCELLED') || message.includes('cancelled')) {
          setState('cancelled');
          setError(null);
          throw new Error('Mining cancelled');
        }

        setState('error');
        setError(message);
        throw err;
      }
    },
    [isNativeAvailable]
  );

  /**
   * Cancel ongoing mining operation
   */
  const cancel = useCallback(() => {
    if (isMiningRef.current) {
      NativeArgon2.cancel();
      isMiningRef.current = false;
      setState('cancelled');
    }
  }, []);

  return {
    state,
    progress,
    solution,
    error,
    mine,
    cancel,
    estimateDuration,
    estimateBattery,
    isNativeAvailable,
  };
}

export default useMobilePow;
