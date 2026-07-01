/**
 * React hook for content decay calculations
 *
 * Provides real-time decay state updates using requestAnimationFrame.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { calculateDecay, type DecayState } from "@swimchain/core";
import { useSwimchain } from "../SwimchainProvider";

/**
 * Hook to track page visibility state
 * Returns true when the page is visible
 */
function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

/**
 * Options for useDecay hook
 */
export interface UseDecayOptions {
  /** Update interval in milliseconds (default: 1000) */
  updateInterval?: number;
  /** Whether to enable real-time updates (default: true) */
  realTime?: boolean;
  /** Custom half-life in seconds (default: protocol default) */
  halfLifeSecs?: number;
}

/**
 * Hook for calculating content decay in real-time
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @param options - Optional configuration
 * @returns Decay state, or null if WASM not loaded
 *
 * @example
 * ```tsx
 * function ContentCard({ content }) {
 *   const decay = useDecay(content.createdAt, content.lastEngagement);
 *
 *   if (!decay) return <div>Loading...</div>;
 *
 *   return (
 *     <div>
 *       <p>{content.text}</p>
 *       <div className="heat-bar" style={{ width: `${decay.currentHeat * 100}%` }} />
 *       {decay.isDecayed && <span>Expired</span>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useDecay(
  createdAtSecs: number,
  lastEngagementSecs: number,
  options: UseDecayOptions = {}
): DecayState | null {
  const { isLoaded } = useSwimchain();
  const isVisible = usePageVisibility();
  const [state, setState] = useState<DecayState | null>(null);
  const rafRef = useRef<number>();
  const lastUpdateRef = useRef<number>(0);

  const { updateInterval = 1000, realTime = true } = options;

  const update = useCallback(() => {
    if (!isLoaded) return;

    const now = Date.now();
    // Throttle updates based on interval
    if (now - lastUpdateRef.current < updateInterval) {
      if (realTime && isVisible) {
        rafRef.current = requestAnimationFrame(update);
      }
      return;
    }

    lastUpdateRef.current = now;
    const nowSecs = Math.floor(now / 1000);

    try {
      const newState = calculateDecay(createdAtSecs, lastEngagementSecs, nowSecs);
      setState(newState);
    } catch (error) {
      console.error("Decay calculation error:", error);
    }

    if (realTime && isVisible) {
      rafRef.current = requestAnimationFrame(update);
    }
  }, [isLoaded, createdAtSecs, lastEngagementSecs, updateInterval, realTime, isVisible]);

  useEffect(() => {
    if (!isLoaded) return;

    // Cancel any existing RAF when visibility changes
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }

    // Only start updates when visible
    if (isVisible) {
      update();
    }

    // Cleanup
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isLoaded, isVisible, update]);

  return state;
}

/**
 * Hook for a single decay calculation (non-reactive)
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @returns Decay state, or null if WASM not loaded
 */
export function useDecayOnce(
  createdAtSecs: number,
  lastEngagementSecs: number
): DecayState | null {
  return useDecay(createdAtSecs, lastEngagementSecs, { realTime: false });
}

/**
 * Hook for checking if content is currently protected
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @returns true if content is within protection period
 */
export function useIsProtected(createdAtSecs: number): boolean {
  const decay = useDecay(createdAtSecs, createdAtSecs, { updateInterval: 60000 });
  return decay?.isProtected ?? false;
}

/**
 * Hook for checking if content is decayed
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @returns true if content has decayed below threshold
 */
export function useIsDecayed(
  createdAtSecs: number,
  lastEngagementSecs: number
): boolean {
  const decay = useDecay(createdAtSecs, lastEngagementSecs, { updateInterval: 60000 });
  return decay?.isDecayed ?? false;
}
