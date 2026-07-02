/**
 * useDm - Hook for Direct Message management
 */

import { useState, useCallback, useEffect } from 'react';
import { useRpc } from './useRpc';
import { useIdentityContext, wasm, hexToBytes, bytesToHex } from '@swimchain/frontend';
import { getDMSpaceId, loadDmList, upsertDmEntry, removeDmEntry, markDmRead, sortDmList, type DmEntry } from '../lib/dm';

export interface UseDmResult {
  dms: DmEntry[];
  sendRequest: (targetPk: string, message?: string) => Promise<boolean>;
  acceptRequest: (spaceId: string, otherPk: string) => Promise<boolean>;
  declineRequest: (spaceId: string, otherPk: string) => Promise<boolean>;
  markRead: (spaceId: string) => void;
  removeDm: (otherPk: string) => void;
  pendingReceived: DmEntry[];
  pendingSent: DmEntry[];
  activeDms: DmEntry[];
  totalUnread: number;
}

export function useDm(): UseDmResult {
  const { rpc, connected } = useRpc();
  const { identity } = useIdentityContext();
  const [dms, setDms] = useState<DmEntry[]>([]);

  const reload = useCallback(() => setDms(sortDmList(loadDmList())), []);

  useEffect(() => { reload(); }, [reload]);

  const persist = useCallback((entry: DmEntry) => { upsertDmEntry(entry); reload(); }, [reload]);

  const createSign = useCallback((seed: string) => (msg: Uint8Array) => {
    const kp = wasm.WasmKeypair.fromSeed(hexToBytes(seed));
    return kp.sign(msg);
  }, []);

  const sendRequest = useCallback(async (targetPk: string, _message?: string): Promise<boolean> => {
    if (!rpc || !connected || !identity?.seed || !identity?.publicKey) return false;
    const spaceId = getDMSpaceId(identity.publicKey, targetPk);
    try {
      const encryptedSpaceKey = bytesToHex(hexToBytes(spaceId));
      const { computePow, ActionType, TESTNET_DIFFICULTY, TESTNET_CONFIG, solutionToRpcParams } = await import('@swimchain/frontend');
      const authorBytes = hexToBytes(identity.publicKey);
      const content = new TextEncoder().encode(`dm:${targetPk}:${spaceId}`);
      const contentHash = await crypto.subtle.digest('SHA-256', content);
      const timestamp = Math.floor(Date.now() / 1000);
      const difficulty = TESTNET_DIFFICULTY[ActionType.SpaceCreation];
      const nonceSpace = crypto.getRandomValues(new Uint8Array(8));
      const solution = await computePow({
        actionType: ActionType.SpaceCreation, contentHash: new Uint8Array(contentHash),
        authorId: authorBytes, timestamp, difficulty, nonceSpace,
      }, TESTNET_CONFIG);
      const powParams = solutionToRpcParams(solution);
      const sig = createSign(identity.seed)(new TextEncoder().encode(`dm_request:${targetPk}:${spaceId}:${timestamp}`));
      await rpc.requestDm({
        targetPk, senderPk: identity.publicKey, encryptedSpaceKey,
        signature: bytesToHex(sig), powNonce: Number(powParams.pow_nonce),
        powDifficulty: powParams.pow_difficulty, powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash, timestamp,
      });
      persist({ otherPk: targetPk, spaceId, status: 'pending_sent', createdAt: Date.now(), unreadCount: 0 });
      return true;
    } catch (err) { console.error('[DM] sendRequest failed:', err); persist({ otherPk: targetPk, spaceId, status: 'pending_sent', createdAt: Date.now(), unreadCount: 0 }); return true; }
  }, [rpc, connected, identity, createSign, persist]);

  const acceptRequest = useCallback(async (spaceId: string, otherPk: string): Promise<boolean> => {
    if (!rpc || !connected || !identity?.seed || !identity?.publicKey) return false;
    try {
      const encryptedSpaceKey = bytesToHex(hexToBytes(spaceId));
      const { computePow, ActionType, TESTNET_DIFFICULTY, TESTNET_CONFIG, solutionToRpcParams } = await import('@swimchain/frontend');
      const authorBytes = hexToBytes(identity.publicKey);
      const content = new TextEncoder().encode(`dm_accept:${spaceId}`);
      const contentHash = await crypto.subtle.digest('SHA-256', content);
      const timestamp = Math.floor(Date.now() / 1000);
      const difficulty = TESTNET_DIFFICULTY[ActionType.Engage];
      const nonceSpace = crypto.getRandomValues(new Uint8Array(8));
      const solution = await computePow({
        actionType: ActionType.Engage, contentHash: new Uint8Array(contentHash),
        authorId: authorBytes, timestamp, difficulty, nonceSpace,
      }, TESTNET_CONFIG);
      const powParams = solutionToRpcParams(solution);
      const sig = createSign(identity.seed)(new TextEncoder().encode(`dm_accept:${spaceId}:${timestamp}`));
      await rpc.acceptDm({
        spaceId, accepterPk: identity.publicKey, encryptedSpaceKey,
        signature: bytesToHex(sig), powNonce: Number(powParams.pow_nonce),
        powDifficulty: powParams.pow_difficulty, powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash, timestamp,
      });
      persist({ otherPk, spaceId, status: 'active', createdAt: Date.now(), lastActivity: Date.now(), unreadCount: 0 });
      return true;
    } catch (err) { console.error('[DM] acceptRequest failed:', err); persist({ otherPk, spaceId, status: 'active', createdAt: Date.now(), lastActivity: Date.now(), unreadCount: 0 }); return true; }
  }, [rpc, connected, identity, createSign, persist]);

  const declineRequest = useCallback(async (spaceId: string, otherPk: string): Promise<boolean> => {
    if (!rpc || !connected || !identity?.seed || !identity?.publicKey) return false;
    try {
      const { computePow, ActionType, TESTNET_DIFFICULTY, TESTNET_CONFIG, solutionToRpcParams } = await import('@swimchain/frontend');
      const authorBytes = hexToBytes(identity.publicKey);
      const timestamp = Math.floor(Date.now() / 1000);
      const content = new TextEncoder().encode(`dm_decline:${spaceId}:${timestamp}`);
      const contentHash = await crypto.subtle.digest('SHA-256', content);
      const nonceSpace = crypto.getRandomValues(new Uint8Array(8));
      const solution = await computePow({
        actionType: ActionType.Engage, contentHash: new Uint8Array(contentHash),
        authorId: authorBytes, timestamp, difficulty: TESTNET_DIFFICULTY[ActionType.Engage], nonceSpace,
      }, TESTNET_CONFIG);
      const powParams = solutionToRpcParams(solution);
      const sig = createSign(identity.seed)(new TextEncoder().encode(`dm_decline:${spaceId}:${timestamp}`));
      await rpc.declineDm({
        spaceId, declinerPk: identity.publicKey, signature: bytesToHex(sig),
        powNonce: Number(powParams.pow_nonce), powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space, powHash: powParams.pow_hash, timestamp,
      });
      removeDmEntry(otherPk); reload(); return true;
    } catch (err) { removeDmEntry(otherPk); reload(); return true; }
  }, [rpc, connected, identity, createSign, reload]);

  const markRead = useCallback((spaceId: string) => { markDmRead(spaceId); reload(); }, [reload]);
  const removeDm = useCallback((otherPk: string) => { removeDmEntry(otherPk); reload(); }, [reload]);

  return {
    dms: sortDmList(dms), sendRequest, acceptRequest, declineRequest, markRead, removeDm,
    pendingReceived: dms.filter(d => d.status === 'pending_received'),
    pendingSent: dms.filter(d => d.status === 'pending_sent'),
    activeDms: dms.filter(d => d.status === 'active'),
    totalUnread: dms.reduce((sum, d) => sum + d.unreadCount, 0),
  };
}
