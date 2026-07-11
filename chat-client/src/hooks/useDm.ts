import { useState, useCallback, useEffect } from 'react';
import { useRpc } from './useRpc';
import { useChatIdentity } from './useChatIdentity';
import { useIdentityContext, wasm, hexToBytes, bytesToHex } from '@swimchain/frontend';
import {
  getDMSpaceId,
  loadDmList,
  upsertDmEntry,
  removeDmEntry,
  markDmRead,
  type DmEntry,
} from '../lib/dm';

export interface UseDmResult {
  dms: DmEntry[];
  /** Start a DM. Resolves the DM space id on success, or false on failure. */
  sendRequest: (target: string) => Promise<string | false>;
  acceptRequest: (spaceId: string, other: string) => Promise<boolean>;
  declineRequest: (spaceId: string, other: string) => Promise<boolean>;
  markRead: (spaceId: string) => void;
  removeDm: (other: string) => void;
  pendingReceived: DmEntry[];
  pendingSent: DmEntry[];
  activeDms: DmEntry[];
  totalUnread: number;
}

/**
 * DM conversation state.
 *
 *  - **node mode** (desktop): the node holds the identity key, does the X25519
 *    key-wrap + anti-spam PoW, and gossips the request over the network. The
 *    browser calls `request_dm_managed` / `accept_dm_managed` and polls
 *    `get_pending_dm_requests` to surface incoming requests. No client crypto.
 *  - **browser mode**: the local seed signs and mines PoW (legacy path).
 */
export function useDm(): UseDmResult {
  const { rpc, connected } = useRpc();
  const { mode, identity: chatIdentity } = useChatIdentity();
  const { identity: browserIdentity } = useIdentityContext();
  const isNode = mode === 'node';
  const myPubKey = chatIdentity?.publicKey ?? browserIdentity?.publicKey ?? null;

  const [dms, setDms] = useState<DmEntry[]>([]);
  const reload = useCallback(
    () =>
      setDms(
        loadDmList().sort(
          (a, b) => (b.lastActivity ?? b.createdAt) - (a.lastActivity ?? a.createdAt)
        )
      ),
    []
  );
  useEffect(() => {
    reload();
  }, [reload]);
  const put = useCallback(
    (e: DmEntry) => {
      upsertDmEntry(e);
      reload();
    },
    [reload]
  );

  // Node mode: poll the node for DM requests addressed to us and surface them as
  // pending_received conversations (deduped against what we already track).
  useEffect(() => {
    if (!isNode || !rpc || !connected || !myPubKey) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const [incoming, outgoing] = await Promise.all([
          rpc.getPendingDmRequests({ user: myPubKey }),
          rpc.getSentDmRequests({ user: myPubKey }).catch(() => ({ requests: [] })),
        ]);
        if (cancelled) return;
        const existing = loadDmList();
        let changed = false;

        // Incoming requests → surface as pending_received.
        for (const req of incoming.requests) {
          const other = req.requester;
          const cur = existing.find(e => e.otherPk.toLowerCase() === other.toLowerCase());
          // Never downgrade an already-active conversation back to a request.
          if (cur && cur.status === 'active') continue;
          upsertDmEntry({
            otherPk: other,
            spaceId: cur?.spaceId ?? '',
            status: 'pending_received',
            createdAt: (req.created_at ?? 0) * 1000 || Date.now(),
            unreadCount: cur?.unreadCount ?? 1,
          });
          changed = true;
        }

        // Outgoing requests: accepted → active; declined → drop.
        for (const req of outgoing.requests) {
          const other = req.recipient;
          const cur = existing.find(e => e.otherPk.toLowerCase() === other.toLowerCase());
          if (req.status === 'accepted') {
            if (cur?.status === 'active') continue;
            upsertDmEntry({
              otherPk: other,
              spaceId: req.space_id ?? cur?.spaceId ?? '',
              status: 'active',
              createdAt: cur?.createdAt ?? ((req.created_at ?? 0) * 1000 || Date.now()),
              lastActivity: Date.now(),
              unreadCount: cur?.unreadCount ?? 0,
            });
            changed = true;
          } else if (req.status === 'declined' && cur && cur.status !== 'active') {
            removeDmEntry(other);
            changed = true;
          }
        }

        if (changed) reload();
      } catch {
        // Transient (node still connecting) — retry on the next tick.
      }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [isNode, rpc, connected, myPubKey, reload]);

  // Browser-mode local signer (seed-based). Unused in node mode.
  const browserSign = useCallback(
    (seed: string) => (m: Uint8Array) => wasm.WasmKeypair.fromSeed(hexToBytes(seed)).sign(m),
    []
  );

  const sendRequest = useCallback(
    async (target: string): Promise<string | false> => {
      if (!rpc || !connected || !myPubKey) return false;
      const t = target.trim();

      // Node mode: the node does everything (key-wrap, PoW, gossip). `t` may be a
      // hex pubkey or a cs1… address; the node resolves both.
      if (isNode) {
        try {
          const res = await rpc.requestDmManaged({ recipient: t });
          put({
            otherPk: res.recipient,
            spaceId: res.space_id,
            status: 'pending_sent',
            createdAt: Date.now(),
            unreadCount: 0,
          });
          return res.space_id;
        } catch {
          return false;
        }
      }

      // Browser mode (legacy): local seed signs + mines PoW.
      const seed = browserIdentity?.seed;
      if (!seed) return false;
      const sid = getDMSpaceId(myPubKey, t);
      try {
        const {
          computePow,
          ActionType,
          getDifficulty,
          getConfig,
          solutionToRpcParams: toRpc,
        } = await import('@swimchain/frontend');
        const ts = Math.floor(Date.now() / 1e3);
        const ch = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dm:' + t + ':' + sid))
        );
        const ns = crypto.getRandomValues(new Uint8Array(8));
        const sol = await computePow(
          {
            actionType: ActionType.SpaceCreation,
            contentHash: ch,
            authorId: hexToBytes(myPubKey),
            timestamp: ts,
            difficulty: getDifficulty(ActionType.SpaceCreation, true),
            nonceSpace: ns,
          },
          getConfig(true)
        );
        const pp = toRpc(sol);
        await rpc.requestDm({
          targetPk: t,
          senderPk: myPubKey,
          encryptedSpaceKey: bytesToHex(hexToBytes(sid)),
          signature: bytesToHex(
            browserSign(seed)(new TextEncoder().encode('dm:' + t + ':' + sid + ':' + ts))
          ),
          powNonce: Number(pp.pow_nonce),
          powDifficulty: pp.pow_difficulty,
          powNonceSpace: pp.pow_nonce_space,
          powHash: pp.pow_hash,
          timestamp: ts,
        });
        put({ otherPk: t, spaceId: sid, status: 'pending_sent', createdAt: Date.now(), unreadCount: 0 });
        return sid;
      } catch {
        put({ otherPk: t, spaceId: sid, status: 'pending_sent', createdAt: Date.now(), unreadCount: 0 });
        return sid;
      }
    },
    [rpc, connected, myPubKey, isNode, browserIdentity, browserSign, put]
  );

  const acceptRequest = useCallback(
    async (sid: string, opk: string): Promise<boolean> => {
      if (!rpc || !connected || !myPubKey) return false;

      // Node mode: the node unwraps the sealed key and joins the DM space.
      if (isNode) {
        try {
          const res = await rpc.acceptDmManaged({ requester: opk });
          put({
            otherPk: opk,
            spaceId: res.space_id,
            status: 'active',
            createdAt: Date.now(),
            lastActivity: Date.now(),
            unreadCount: 0,
          });
          return true;
        } catch {
          return false;
        }
      }

      // Browser mode (legacy).
      const seed = browserIdentity?.seed;
      if (!seed) return false;
      try {
        const {
          computePow,
          ActionType,
          getDifficulty,
          getConfig,
          solutionToRpcParams: toRpc,
        } = await import('@swimchain/frontend');
        const ts = Math.floor(Date.now() / 1e3);
        const ch = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dm_a:' + sid))
        );
        const ns = crypto.getRandomValues(new Uint8Array(8));
        const sol = await computePow(
          {
            actionType: ActionType.Engage,
            contentHash: ch,
            authorId: hexToBytes(myPubKey),
            timestamp: ts,
            difficulty: getDifficulty(ActionType.Engage, true),
            nonceSpace: ns,
          },
          getConfig(true)
        );
        const pp = toRpc(sol);
        await rpc.acceptDm({
          spaceId: sid,
          accepterPk: myPubKey,
          encryptedSpaceKey: bytesToHex(hexToBytes(sid)),
          signature: bytesToHex(browserSign(seed)(new TextEncoder().encode('dm_a:' + sid + ':' + ts))),
          powNonce: Number(pp.pow_nonce),
          powDifficulty: pp.pow_difficulty,
          powNonceSpace: pp.pow_nonce_space,
          powHash: pp.pow_hash,
          timestamp: ts,
        });
        put({
          otherPk: opk,
          spaceId: sid,
          status: 'active',
          createdAt: Date.now(),
          lastActivity: Date.now(),
          unreadCount: 0,
        });
        return true;
      } catch {
        put({
          otherPk: opk,
          spaceId: sid,
          status: 'active',
          createdAt: Date.now(),
          lastActivity: Date.now(),
          unreadCount: 0,
        });
        return true;
      }
    },
    [rpc, connected, myPubKey, isNode, browserIdentity, browserSign, put]
  );

  const declineRequest = useCallback(
    async (sid: string, opk: string): Promise<boolean> => {
      if (!rpc || !connected || !myPubKey) return false;

      // Node mode: mark declined on the node + notify the requester, then drop locally.
      if (isNode) {
        try {
          await rpc.declineDmManaged({ requester: opk });
        } catch {
          // Best-effort notify; still drop locally.
        }
        removeDmEntry(opk);
        reload();
        return true;
      }

      const seed = browserIdentity?.seed;
      if (!seed) {
        removeDmEntry(opk);
        reload();
        return true;
      }
      try {
        const {
          computePow,
          ActionType,
          getDifficulty,
          getConfig,
          solutionToRpcParams: toRpc,
        } = await import('@swimchain/frontend');
        const ts = Math.floor(Date.now() / 1e3);
        const ch = new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dm_d:' + sid))
        );
        const ns = crypto.getRandomValues(new Uint8Array(8));
        const sol = await computePow(
          {
            actionType: ActionType.Engage,
            contentHash: ch,
            authorId: hexToBytes(myPubKey),
            timestamp: ts,
            difficulty: getDifficulty(ActionType.Engage, true),
            nonceSpace: ns,
          },
          getConfig(true)
        );
        const pp = toRpc(sol);
        await rpc.declineDm({
          spaceId: sid,
          declinerPk: myPubKey,
          signature: bytesToHex(browserSign(seed)(new TextEncoder().encode('dm_d:' + sid + ':' + ts))),
          powNonce: Number(pp.pow_nonce),
          powDifficulty: pp.pow_difficulty,
          powNonceSpace: pp.pow_nonce_space,
          powHash: pp.pow_hash,
          timestamp: ts,
        });
      } catch {
        // Best-effort; remove locally regardless.
      } finally {
        removeDmEntry(opk);
        reload();
      }
      return true;
    },
    [rpc, connected, myPubKey, isNode, browserIdentity, browserSign, reload]
  );

  return {
    dms,
    sendRequest,
    acceptRequest,
    declineRequest,
    markRead: useCallback(
      (s: string) => {
        markDmRead(s);
        reload();
      },
      [reload]
    ),
    removeDm: useCallback(
      (o: string) => {
        removeDmEntry(o);
        reload();
      },
      [reload]
    ),
    pendingReceived: dms.filter(d => d.status === 'pending_received'),
    pendingSent: dms.filter(d => d.status === 'pending_sent'),
    activeDms: dms.filter(d => d.status === 'active'),
    totalUnread: dms.reduce((s, d) => s + d.unreadCount, 0),
  };
}
