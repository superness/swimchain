/**
 * React hook for content decay calculations
 *
 * Provides real-time decay state updates using requestAnimationFrame.
 */
import { type DecayState } from "@swimchain/core";
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
export declare function useDecay(createdAtSecs: number, lastEngagementSecs: number, options?: UseDecayOptions): DecayState | null;
/**
 * Hook for a single decay calculation (non-reactive)
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @returns Decay state, or null if WASM not loaded
 */
export declare function useDecayOnce(createdAtSecs: number, lastEngagementSecs: number): DecayState | null;
/**
 * Hook for checking if content is currently protected
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @returns true if content is within protection period
 */
export declare function useIsProtected(createdAtSecs: number): boolean;
/**
 * Hook for checking if content is decayed
 *
 * @param createdAtSecs - Content creation timestamp (UNIX seconds)
 * @param lastEngagementSecs - Last engagement timestamp (UNIX seconds)
 * @returns true if content has decayed below threshold
 */
export declare function useIsDecayed(createdAtSecs: number, lastEngagementSecs: number): boolean;
//# sourceMappingURL=useDecay.d.ts.map