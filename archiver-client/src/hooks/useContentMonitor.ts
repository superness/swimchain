/**
 * React hook for monitoring at-risk content
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AtRiskContent, SpaceId } from '../types';
import { ContentMonitor } from '../services/ContentMonitor';
import { getAutoEngageEngine } from '../services/AutoEngageEngine';
import { useRpc } from './useRpc';
import { getContentMonitor } from '../services/ContentMonitor';

interface UseContentMonitorResult {
  /** List of at-risk content */
  atRiskContent: AtRiskContent[];
  /** Whether data is currently loading */
  isLoading: boolean;
  /** When the data was last checked */
  lastChecked: Date | null;
  /** Error if fetch failed */
  error: Error | null;
  /** Manually refresh the content */
  refresh: () => Promise<void>;
  /** Number of critical items */
  criticalCount: number;
  /** Number of warning items */
  warningCount: number;
}

/**
 * Hook for monitoring content at risk of decay.
 *
 * @param spaces - Spaces to monitor
 * @param threshold - Maximum heat threshold (default: 0.10)
 * @returns Content monitoring state and controls
 */
export function useContentMonitor(
  spaces: SpaceId[],
  threshold?: number
): UseContentMonitorResult {
  const [atRiskContent, setAtRiskContent] = useState<AtRiskContent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const monitorRef = useRef<ContentMonitor | null>(null);
  const { rpc, connected } = useRpc();

  // Inject RPC client into ContentMonitor and AutoEngageEngine when available
  useEffect(() => {
    const monitor = getContentMonitor();
    const engine = getAutoEngageEngine();
    if (connected && rpc) {
      monitor.setRpcClient(rpc);
      engine.setRpcClient(rpc);
    } else {
      monitor.setRpcClient(null);
      engine.setRpcClient(null);
    }
  }, [rpc, connected]);

  // Calculate counts with memoization to avoid unnecessary recalculations
  const criticalCount = useMemo(
    () => atRiskContent.filter((c) => c.urgency === 'critical').length,
    [atRiskContent]
  );
  const warningCount = useMemo(
    () => atRiskContent.filter((c) => c.urgency === 'warning').length,
    [atRiskContent]
  );

  // Manual refresh function
  const refresh = useCallback(async () => {
    if (!monitorRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const content = await monitorRef.current.getAtRiskContent(spaces, threshold);
      setAtRiskContent(content);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [spaces, threshold]);

  useEffect(() => {
    // Use singleton monitor instance
    monitorRef.current = getContentMonitor();
    const monitor = monitorRef.current;

    // Subscribe to updates
    const unsubscribe = monitor.subscribe((content) => {
      setAtRiskContent(content);
      setLastChecked(new Date());
      setIsLoading(false);
    });

    // Start polling
    monitor.startPolling(spaces);

    // Cleanup
    return () => {
      unsubscribe();
      monitor.stopPolling();
    };
  }, [spaces.join(','), threshold]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    atRiskContent,
    isLoading,
    lastChecked,
    error,
    refresh,
    criticalCount,
    warningCount,
  };
}
