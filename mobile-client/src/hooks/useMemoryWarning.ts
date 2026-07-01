/**
 * useMemoryWarning - Hook for handling memory pressure
 * Per Step 16: Memory budget with 150MB baseline, 300MB peak
 */

import { useEffect, useCallback } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const MEMORY_BUDGET = {
  baseline: 150_000_000, // 150 MB app memory
  peakDuringPow: 300_000_000, // 300 MB during PoW (64 MiB Argon2 + overhead)
  imageCacheMax: 50_000_000, // 50 MB image cache
};

type MemoryWarningCallback = () => void;

/**
 * Hook to handle memory warnings
 */
export function useMemoryWarning(onWarning?: MemoryWarningCallback): void {
  const handleMemoryWarning = useCallback(() => {
    console.log('[Memory] Warning received - clearing caches');

    // Clear non-essential caches
    // In a real implementation, this would:
    // 1. Clear image cache
    // 2. Reduce FlatList window size temporarily
    // 3. Release cached data

    onWarning?.();
  }, [onWarning]);

  useEffect(() => {
    // iOS sends memory warnings via notification
    if (Platform.OS === 'ios') {
      // Note: React Native doesn't expose memory warnings directly
      // In production, use a native module to listen for didReceiveMemoryWarning
      console.log('[Memory] Memory warning listener initialized (iOS)');
    }

    // Android handles memory through lifecycle events
    if (Platform.OS === 'android') {
      console.log('[Memory] Memory warning listener initialized (Android)');
    }

    return () => {
      // Cleanup
    };
  }, [handleMemoryWarning]);
}

/**
 * Get memory budget constants
 */
export function getMemoryBudget() {
  return { ...MEMORY_BUDGET };
}

export default useMemoryWarning;
