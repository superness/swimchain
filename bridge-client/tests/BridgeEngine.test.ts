/**
 * BridgeEngine unit tests (SWIM-B7 behavior)
 *
 * Covers the mining message queue (messages arriving during PoW are queued,
 * not dropped, and drained afterwards), the 30-minute thread-parent window,
 * rate-limit re-checks at drain time, echo suppression, and PoW budget
 * accounting.
 *
 * PoW, identity, and the RPC client are mocked at the boundary — no real
 * mining, no network, no sockets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BridgeEngine } from '../src/services/BridgeEngine';
import { getEchoTracker } from '../src/services/EchoTracker';
import { getRateLimiter } from '../src/services/RateLimiter';
import { MAX_BRIDGE_POSTS_PER_HOUR } from '../src/types/constants';
import type { BridgeMessage } from '../src/types';
import type { SwimchainRpc } from '../src/lib/rpc';

const SPACE = 'sp1bridge';
const PUBKEY = 'ab'.repeat(32);

// Controls the mocked computePow: when auto is false, mining blocks until
// the test releases the pending resolvers (simulates in-progress mining).
const powControl = vi.hoisted(() => ({
  auto: true,
  pending: [] as Array<() => void>,
}));

vi.mock('../src/lib/action-pow', () => {
  const hexToBytes = (hex: string): Uint8Array => {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
  };
  const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  return {
    ActionType: { Post: 2, Reply: 3, Engage: 4 },
    createChallenge: async () => ({
      contentHash: new Uint8Array(32),
      timestamp: 1_700_000_000,
    }),
    computePow: async () => {
      if (!powControl.auto) {
        await new Promise<void>((resolve) => powControl.pending.push(resolve));
      }
      return {
        nonce: 1n,
        hash: new Uint8Array(32),
        nonceSpace: new Uint8Array(8),
        difficulty: 6,
        timestamp: 1_700_000_000,
      };
    },
    solutionToRpcParams: () => ({
      pow_nonce: '1',
      pow_difficulty: 6,
      pow_nonce_space: 'aa'.repeat(8),
      pow_hash: 'bb'.repeat(32),
      timestamp: 1_700_000_000,
    }),
    getDifficulty: () => 6,
    getConfig: () => ({ difficulty: 6 }),
    hexToBytes,
    bytesToHex,
  };
});

vi.mock('../src/hooks/useStoredIdentity', () => ({
  getStoredIdentity: () => ({
    address: 'cs1testidentity',
    publicKey: 'ab'.repeat(32),
    seed: 'cd'.repeat(32),
    createdAt: 0,
  }),
}));

vi.mock('../src/hooks/useBlocklist', () => ({
  getBlockedUserIds: () => new Set<string>(),
}));

vi.mock('@swimchain/core', () => ({
  Keypair: {
    fromSeed: () => ({
      sign: () => new Uint8Array(64),
    }),
  },
}));

type EnginePrivates = {
  handleIncomingMessage(message: BridgeMessage): Promise<void>;
  resolveThreadParent(message: BridgeMessage): string | null;
  messageQueue: Array<{ message: BridgeMessage; threadParentId: string | null }>;
  threadMap: Map<string, { contentId: string; timestamp: number }>;
};

const priv = (engine: BridgeEngine): EnginePrivates =>
  engine as unknown as EnginePrivates;

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeMessage(overrides: Partial<BridgeMessage> = {}): BridgeMessage {
  return {
    id: `irc:${Math.random().toString(36).slice(2)}`,
    platform: 'irc',
    sender: 'nick',
    senderDisplayName: 'nick',
    content: 'hello from the other side',
    source: '#swim',
    timestamp: new Date(),
    isBridged: false,
    ...overrides,
  };
}

let postCount = 0;

function makeEngine() {
  const engine = new BridgeEngine();
  engine.updateConfig({ targetSpace: SPACE });
  const rpc = {
    setIdentity: vi.fn(),
    submitPost: vi.fn(async () => ({ content_id: `sha256:post-${++postCount}` })),
    submitReply: vi.fn(async () => ({ content_id: `sha256:reply-${++postCount}` })),
  };
  engine.setRpcClient(rpc as unknown as SwimchainRpc);
  return { engine, rpc };
}

function releasePow() {
  powControl.auto = true;
  const pending = powControl.pending.splice(0);
  pending.forEach((resolve) => resolve());
}

beforeEach(() => {
  localStorage.clear();
  getEchoTracker().clear();
  getRateLimiter().clear();
  powControl.auto = true;
  powControl.pending = [];
});

describe('message queue during mining (SWIM-B7)', () => {
  it('queues messages that arrive while mining and drains them afterwards', async () => {
    const { engine, rpc } = makeEngine();
    powControl.auto = false;

    const first = priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:m1' }));
    await flush(); // let m1 reach the (blocked) computePow
    expect(engine.isMiningPow()).toBe(true);

    // These arrive mid-mining: they must be queued, not dropped
    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:m2' }));
    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:m3' }));
    expect(priv(engine).messageQueue).toHaveLength(2);
    expect(rpc.submitPost).not.toHaveBeenCalled();

    releasePow();
    await first;

    // Drain processes every queued message (drainQueue paces 100ms apart)
    await vi.waitFor(
      () => expect(rpc.submitPost).toHaveBeenCalledTimes(3),
      { timeout: 3000 }
    );
    expect(priv(engine).messageQueue).toHaveLength(0);
    expect(engine.isMiningPow()).toBe(false);
    // Thread parents were resolved before queuing, when no bridged post
    // existed yet for the source, so all three go out as new posts.
    expect(rpc.submitReply).not.toHaveBeenCalled();
  });

  it('re-checks the rate limit for queued messages at drain time', async () => {
    const { engine, rpc } = makeEngine();
    powControl.auto = false;

    const first = priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:first' }));
    await flush();
    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:queued' }));
    expect(priv(engine).messageQueue).toHaveLength(1);

    // The space hits its hourly cap while the first message is still mining
    const limiter = getRateLimiter();
    for (let i = 0; i < MAX_BRIDGE_POSTS_PER_HOUR; i++) limiter.recordPost(SPACE);

    releasePow();
    await first;

    await vi.waitFor(
      () => expect(priv(engine).messageQueue).toHaveLength(0),
      { timeout: 3000 }
    );
    expect(rpc.submitPost).toHaveBeenCalledTimes(1); // queued message dropped
    expect(
      engine.getActivityLog().some((entry) => entry.type === 'rate_limited')
    ).toBe(true);
  });
});

describe('thread parent resolution (30-minute window)', () => {
  it('threads a follow-up from the same source as a reply to the last bridged post', async () => {
    const { engine, rpc } = makeEngine();

    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:a' }));
    expect(rpc.submitPost).toHaveBeenCalledTimes(1);
    const parentId = priv(engine).threadMap.get('irc:#swim')!.contentId;

    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:b' }));
    expect(rpc.submitReply).toHaveBeenCalledTimes(1);
    expect(rpc.submitReply).toHaveBeenCalledWith(
      expect.objectContaining({ parentId, authorId: PUBKEY })
    );
    expect(rpc.submitPost).toHaveBeenCalledTimes(1); // no second new post
  });

  it('posts fresh for a different source (per-channel threading)', async () => {
    const { engine, rpc } = makeEngine();

    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:a', source: '#swim' }));
    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:b', source: '#other' }));

    expect(rpc.submitPost).toHaveBeenCalledTimes(2);
    expect(rpc.submitReply).not.toHaveBeenCalled();
  });

  it('honors the 30-minute window and evicts stale entries', () => {
    const { engine } = makeEngine();
    const message = makeMessage();
    const key = 'irc:#swim';

    expect(priv(engine).resolveThreadParent(message)).toBeNull();

    priv(engine).threadMap.set(key, {
      contentId: 'sha256:recent',
      timestamp: Date.now() - 29 * 60 * 1000,
    });
    expect(priv(engine).resolveThreadParent(message)).toBe('sha256:recent');

    priv(engine).threadMap.set(key, {
      contentId: 'sha256:stale',
      timestamp: Date.now() - 31 * 60 * 1000,
    });
    expect(priv(engine).resolveThreadParent(message)).toBeNull();
    expect(priv(engine).threadMap.has(key)).toBe(false); // stale entry evicted
  });
});

describe('intake guards', () => {
  it('skips messages already bridged (echo suppression)', async () => {
    const { engine, rpc } = makeEngine();
    getEchoTracker().markBridged('irc', 'irc:echo', 'sha256:already');

    await priv(engine).handleIncomingMessage(makeMessage({ id: 'irc:echo' }));

    expect(rpc.submitPost).not.toHaveBeenCalled();
    expect(priv(engine).messageQueue).toHaveLength(0);
  });

  it('rejects (does not queue) messages when the space is rate limited at intake', async () => {
    const { engine, rpc } = makeEngine();
    const limiter = getRateLimiter();
    for (let i = 0; i < MAX_BRIDGE_POSTS_PER_HOUR; i++) limiter.recordPost(SPACE);

    await priv(engine).handleIncomingMessage(makeMessage());

    expect(rpc.submitPost).not.toHaveBeenCalled();
    expect(priv(engine).messageQueue).toHaveLength(0);
    expect(
      engine.getActivityLog().some((entry) => entry.type === 'rate_limited')
    ).toBe(true);
  });
});

describe('PoW budget accounting', () => {
  it('spends 10 seconds of budget per bridged post', async () => {
    const { engine } = makeEngine();
    const before = engine.getRemainingPowBudget();

    await priv(engine).handleIncomingMessage(makeMessage());

    expect(engine.getRemainingPowBudget()).toBe(before - 10);
    expect(engine.canSpendPow(before - 10)).toBe(true);
    expect(engine.canSpendPow(before - 9)).toBe(false);
  });

  it('marks bridged messages in the echo tracker to prevent loops', async () => {
    const { engine, rpc } = makeEngine();
    const message = makeMessage({ id: 'irc:tracked' });

    await priv(engine).handleIncomingMessage(message);

    expect(rpc.submitPost).toHaveBeenCalledTimes(1);
    expect(getEchoTracker().isBridged('irc', 'irc:tracked')).toBe(true);
    // Re-delivery of the same message must not double-post
    await priv(engine).handleIncomingMessage(message);
    expect(rpc.submitPost).toHaveBeenCalledTimes(1);
  });
});
