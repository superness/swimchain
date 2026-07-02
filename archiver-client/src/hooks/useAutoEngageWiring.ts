/**
 * Wires the AutoEngageEngine singleton to live app state.
 *
 * The engine needs three things before engage() can submit on-chain:
 * - an RPC client (to sign, submit, and re-poll pool status)
 * - the author public key (the node identity used for PoW mining)
 * - the network mode (testnet vs mainnet PoW difficulty)
 *
 * Follows the same injection pattern used for ContentMonitor in
 * useContentMonitor.ts.
 */

import { useEffect } from 'react';
import { useRpc } from './useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { getAutoEngageEngine } from '../services/AutoEngageEngine';

export function useAutoEngageWiring(): void {
  const { rpc, connected, nodeInfo } = useRpc();
  const { identity } = useIdentityContext();

  // Inject RPC client when connected, clear when disconnected
  useEffect(() => {
    const engine = getAutoEngageEngine();
    engine.setRpcClient(connected && rpc ? rpc : null);
  }, [rpc, connected]);

  // Inject the node identity's public key for PoW mining/submission
  useEffect(() => {
    const engine = getAutoEngageEngine();
    if (identity?.publicKey && identity.publicKey.length === 64) {
      engine.setAuthorPubkey(identity.publicKey);
    }
  }, [identity]);

  // Match PoW difficulty to the node's network
  useEffect(() => {
    const engine = getAutoEngageEngine();
    if (nodeInfo?.network) {
      engine.setTestnetMode(nodeInfo.network !== 'mainnet');
    }
  }, [nodeInfo]);
}
