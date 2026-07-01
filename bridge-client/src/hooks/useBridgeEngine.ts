/**
 * Bridge Engine Hook
 *
 * Connects the BridgeEngine to the RPC client.
 */

import { useEffect } from 'react';
import { useRpc } from './useRpc';
import { getBridgeEngine } from '../services/BridgeEngine';

/**
 * Hook that connects the BridgeEngine to the RPC client when available.
 * Call this once in your app (e.g., in Dashboard or App).
 */
export function useBridgeEngineRpc(): void {
  const { rpc, connected } = useRpc();

  useEffect(() => {
    const engine = getBridgeEngine();

    if (connected && rpc) {
      engine.setRpcClient(rpc);
    } else {
      engine.setRpcClient(null);
    }
  }, [rpc, connected]);
}
