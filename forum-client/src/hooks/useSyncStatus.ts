/**
 * Hook for sync status
 *
 * Uses RPC to get real sync status from the node.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from './useRpc';
import type { SyncStatus } from '../types';

interface UseSyncStatusResult {
  syncStatus: SyncStatus;
  connected: boolean;
  refresh: () => void;
}

const DEFAULT_STATUS: SyncStatus = {
  chainPercent: 0,
  peerCount: 0,
  peersReceiving: 0,
  peersSending: 0,
  storageMB: 0,
  storageTargetMB: 500,
  lastBlockTime: 0,
  state: 'offline',
};

export function useSyncStatus(): UseSyncStatusResult {
  const { rpc, connected } = useRpc();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_STATUS);

  const fetchStatus = useCallback(async () => {
    if (!rpc || !connected) {
      setSyncStatus(DEFAULT_STATUS);
      return;
    }

    try {
      const status = await rpc.getSyncStatus();

      // Map RPC response to SyncStatus type
      const state: SyncStatus['state'] =
        status.state === 'synced' ? 'synced' :
        status.state === 'syncing' ? 'syncing' :
        status.state === 'behind' ? 'behind' : 'offline';

      setSyncStatus({
        chainPercent: status.chain_percent,
        peerCount: status.peer_count,
        peersReceiving: 0, // TODO: RPC doesn't provide this yet
        peersSending: 0,   // TODO: RPC doesn't provide this yet
        storageMB: status.storage_mb,
        storageTargetMB: status.storage_target_mb,
        lastBlockTime: status.last_block_time ?? 0,
        state,
      });
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
      setSyncStatus(prev => ({ ...prev, state: 'offline' }));
    }
  }, [rpc, connected]);

  // Fetch on mount and when connection changes
  useEffect(() => {
    fetchStatus();

    // Poll every 10 seconds for updates
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { syncStatus, connected, refresh: fetchStatus };
}
