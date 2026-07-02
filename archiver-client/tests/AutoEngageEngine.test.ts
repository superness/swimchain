/**
 * AutoEngageEngine unit tests
 *
 * Covers the mine -> submit -> re-poll flow (PR #39), budget accounting
 * (only spent after the node accepts), midnight-UTC budget reset,
 * spam-flagged exclusion (SPEC_12), and priority math.
 *
 * PoW mining is mocked at the module boundary; the RPC client is a plain
 * object stub. No network, no real mining.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoEngageEngine } from '../src/services/AutoEngageEngine';
import type { AtRiskContent, ArchiverPolicy, BudgetState } from '../src/types';
import {
  AUTO_ENGAGE_THRESHOLD,
  DAILY_POW_BUDGET_SECS,
} from '../src/types/constants';
import { mineEngagementPow } from '../src/lib/engagement-pow';
import type { SwimchainRpc } from '../src/lib/rpc';

vi.mock('../src/lib/engagement-pow', () => ({
  mineEngagementPow: vi.fn(),
}));

const mockMine = vi.mocked(mineEngagementPow);

const PUBKEY = 'ab'.repeat(32); // 64 hex chars
const CONTENT_ID = 'sha256:aabbcc';

const POW_RESULT = {
  nonce: '12345',
  difficulty: 6,
  nonceSpace: 'aa'.repeat(8),
  hash: 'bb'.repeat(32),
  timestamp: 1_700_000_000,
  attempts: 42,
  elapsedMs: 10,
};

function makeContent(overrides: Partial<AtRiskContent> = {}): AtRiskContent {
  return {
    postHash: CONTENT_ID,
    spaceId: 'sp1test',
    title: 'test post',
    author: 'cs1author',
    heat: 0.08,
    estimatedDecayTime: new Date(),
    replyCount: 2,
    poolStatus: { currentSeconds: 10, requiredSeconds: 60, contributorCount: 1 },
    urgency: 'warning',
    ...overrides,
  };
}

function makePolicy(overrides: Partial<ArchiverPolicy> = {}): ArchiverPolicy {
  return {
    spaceId: 'sp1test',
    autoEngage: true,
    archive: true,
    minEngagementSeconds: 15,
    ...overrides,
  };
}

type RpcStub = {
  signMessage: ReturnType<typeof vi.fn>;
  submitEngagement: ReturnType<typeof vi.fn>;
  getPoolForContent: ReturnType<typeof vi.fn>;
};

function makeRpc(overrides: Partial<RpcStub> = {}): RpcStub {
  return {
    signMessage: vi.fn(async () => ({
      signature: 'cc'.repeat(64),
      public_key: PUBKEY,
    })),
    submitEngagement: vi.fn(async () => ({
      engaged: true,
      reaction_stored: false,
      content_id: CONTENT_ID,
      emoji: null,
    })),
    getPoolForContent: vi.fn(async () => ({
      has_pool: true,
      total_pow: 30,
      required_pow: 60,
      status: 'active',
      contributor_count: 3,
      expires_at: 0,
    })),
    ...overrides,
  };
}

function makeEngine(rpc: RpcStub | null = makeRpc()): {
  engine: AutoEngageEngine;
  rpc: RpcStub | null;
} {
  const engine = new AutoEngageEngine();
  engine.setAuthorPubkey(PUBKEY);
  engine.setRpcClient(rpc as unknown as SwimchainRpc | null);
  return { engine, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockMine.mockResolvedValue(POW_RESULT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('shouldAutoEngage', () => {
  it('engages content below threshold with permissive policy', () => {
    const { engine } = makeEngine();
    expect(engine.shouldAutoEngage(makeContent(), makePolicy())).toBe(true);
  });

  it('respects policy.autoEngage = false', () => {
    const { engine } = makeEngine();
    expect(
      engine.shouldAutoEngage(makeContent(), makePolicy({ autoEngage: false }))
    ).toBe(false);
  });

  it('never engages spam-flagged content (SPEC_12)', () => {
    const { engine } = makeEngine();
    expect(
      engine.shouldAutoEngage(makeContent({ spamFlagged: true }), makePolicy())
    ).toBe(false);
  });

  it('skips content at or above the heat threshold', () => {
    const { engine } = makeEngine();
    expect(
      engine.shouldAutoEngage(makeContent({ heat: AUTO_ENGAGE_THRESHOLD }), makePolicy())
    ).toBe(false);
    expect(
      engine.shouldAutoEngage(makeContent({ heat: 0.5 }), makePolicy())
    ).toBe(false);
  });

  it('skips content whose pool is already complete', () => {
    const { engine } = makeEngine();
    const content = makeContent({
      poolStatus: { currentSeconds: 60, requiredSeconds: 60, contributorCount: 4 },
    });
    expect(engine.shouldAutoEngage(content, makePolicy())).toBe(false);
  });
});

describe('calculatePriority', () => {
  it('computes the documented weighted formula', () => {
    const { engine } = makeEngine();
    // heatUrgency = (0.10 - 0.05) / 0.10 = 0.5
    // replyValue = log10(9 + 1) / 3 = 1/3
    // poolProgress = 30 / 60 = 0.5
    // priority = 0.5*0.5 + (1/3)*0.3 + 0.5*0.2 = 0.25 + 0.1 + 0.1 = 0.45
    const content = makeContent({
      heat: 0.05,
      replyCount: 9,
      poolStatus: { currentSeconds: 30, requiredSeconds: 60, contributorCount: 2 },
    });
    expect(engine.calculatePriority(content)).toBeCloseTo(0.45, 10);
  });

  it('caps at 1.0 for maximally urgent content', () => {
    const { engine } = makeEngine();
    const content = makeContent({
      heat: 0,
      replyCount: 999, // log10(1000)/3 = 1
      poolStatus: { currentSeconds: 60, requiredSeconds: 60, contributorCount: 5 },
    });
    expect(engine.calculatePriority(content)).toBeCloseTo(1.0, 10);
  });

  it('clamps heat urgency to zero for content above the threshold', () => {
    const { engine } = makeEngine();
    const content = makeContent({
      heat: 0.5,
      replyCount: 0,
      poolStatus: { currentSeconds: 0, requiredSeconds: 60, contributorCount: 0 },
    });
    expect(engine.calculatePriority(content)).toBe(0);
  });
});

describe('getEngagementQueue', () => {
  it('filters by policy and sorts by priority descending', () => {
    const { engine } = makeEngine();
    const urgent = makeContent({ postHash: 'sha256:urgent', heat: 0.01, replyCount: 50 });
    const mild = makeContent({ postHash: 'sha256:mild', heat: 0.09, replyCount: 0 });
    const spam = makeContent({ postHash: 'sha256:spam', heat: 0.01, spamFlagged: true });
    const noPolicy = makeContent({ postHash: 'sha256:orphan', spaceId: 'sp1other', heat: 0.02 });

    const policies = new Map([['sp1test', makePolicy()]]);
    const queue = engine.getEngagementQueue([mild, spam, urgent, noPolicy], policies);

    expect(queue.map((c) => c.postHash)).toEqual(['sha256:urgent', 'sha256:mild']);
  });
});

describe('engage: mine -> submit -> re-poll flow', () => {
  it('submits on-chain, records budget, and re-polls authoritative pool status', async () => {
    const { engine, rpc } = makeEngine();
    const content = makeContent();

    const result = await engine.engage(content, 15);

    expect(result.success).toBe(true);
    expect(result.secondsContributed).toBe(15);
    expect(mockMine).toHaveBeenCalledWith(
      CONTENT_ID,
      PUBKEY,
      true,
      undefined,
      expect.any(Function)
    );
    expect(rpc!.signMessage).toHaveBeenCalledWith(
      `engage:${CONTENT_ID}:12345:${POW_RESULT.timestamp}`
    );
    expect(rpc!.submitEngagement).toHaveBeenCalledWith(
      expect.objectContaining({
        content_id: CONTENT_ID,
        author_id: PUBKEY,
        pow_nonce: 12345, // JSON number, not string
        pow_difficulty: POW_RESULT.difficulty,
        signature: 'cc'.repeat(64),
        timestamp: POW_RESULT.timestamp,
      })
    );
    // Budget only spent on success
    expect(engine.getUsedBudget()).toBe(15);

    // Pool re-polled from node: total_pow 30 / required_pow 60 = 0.5 progress
    expect(rpc!.getPoolForContent).toHaveBeenCalledWith(CONTENT_ID);
    expect(result.newPoolStatus).toEqual({
      currentSeconds: 30, // round(0.5 * 60)
      requiredSeconds: 60,
      contributorCount: 3,
    });
  });

  it('does NOT spend budget when the node rejects the submission', async () => {
    const rpc = makeRpc({
      submitEngagement: vi.fn(async () => {
        throw new Error('submit_engagement rejected: invalid pow');
      }),
    });
    const { engine } = makeEngine(rpc);
    const content = makeContent();

    const result = await engine.engage(content, 15);

    expect(result.success).toBe(false);
    expect(result.error).toContain('submit_engagement rejected');
    expect(result.secondsContributed).toBe(0);
    // Critical: failure must not consume the daily budget
    expect(engine.getUsedBudget()).toBe(0);
    // And must not fabricate pool progress
    expect(result.newPoolStatus).toEqual(content.poolStatus);
    // Failed submit must not be followed by a re-poll
    expect(rpc.getPoolForContent).not.toHaveBeenCalled();
  });

  it('falls back to previous pool status when re-poll fails (never invents progress)', async () => {
    const rpc = makeRpc({
      getPoolForContent: vi.fn(async () => {
        throw new Error('pool lookup failed');
      }),
    });
    const { engine } = makeEngine(rpc);
    const content = makeContent();

    const result = await engine.engage(content, 15);

    expect(result.success).toBe(true);
    expect(engine.getUsedBudget()).toBe(15); // node accepted, budget spent
    expect(result.newPoolStatus).toEqual(content.poolStatus); // unchanged, not fabricated
  });

  it('does not fabricate pool math when the node reports no pool', async () => {
    const rpc = makeRpc({
      getPoolForContent: vi.fn(async () => ({
        has_pool: false,
        total_pow: 0,
        required_pow: 0,
        status: 'none',
        contributor_count: 0,
        expires_at: 0,
      })),
    });
    const { engine } = makeEngine(rpc);
    const content = makeContent();

    const result = await engine.engage(content, 15);

    expect(result.success).toBe(true);
    expect(result.newPoolStatus).toEqual(content.poolStatus);
  });

  it('rejects when the node signs with a different key than was mined against', async () => {
    const rpc = makeRpc({
      signMessage: vi.fn(async () => ({
        signature: 'cc'.repeat(64),
        public_key: 'ff'.repeat(32),
      })),
    });
    const { engine } = makeEngine(rpc);

    const result = await engine.engage(makeContent(), 15);

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not match');
    expect(rpc.submitEngagement).not.toHaveBeenCalled();
    expect(engine.getUsedBudget()).toBe(0);
  });

  it('accepts a matching key regardless of hex case', async () => {
    const rpc = makeRpc({
      signMessage: vi.fn(async () => ({
        signature: 'cc'.repeat(64),
        public_key: PUBKEY.toUpperCase(),
      })),
    });
    const { engine } = makeEngine(rpc);

    const result = await engine.engage(makeContent(), 15);
    expect(result.success).toBe(true);
  });

  it('fails fast without an RPC client (no fake success while disconnected)', async () => {
    const { engine } = makeEngine(null);

    const result = await engine.engage(makeContent(), 15);

    expect(result.success).toBe(false);
    expect(result.error).toContain('RPC client not set');
    expect(mockMine).not.toHaveBeenCalled();
    expect(engine.getUsedBudget()).toBe(0);
  });

  it('fails fast without an author pubkey', async () => {
    const engine = new AutoEngageEngine();
    engine.setRpcClient(makeRpc() as unknown as SwimchainRpc);

    const result = await engine.engage(makeContent(), 15);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Author public key not set');
    expect(mockMine).not.toHaveBeenCalled();
  });

  it('rejects concurrent engagements', async () => {
    const { engine } = makeEngine();
    let release!: (v: typeof POW_RESULT) => void;
    mockMine.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );

    const first = engine.engage(makeContent(), 10);
    // Let the first engage reach the mining await
    await Promise.resolve();
    expect(engine.isEngagementInProgress()).toBe(true);

    const second = await engine.engage(makeContent(), 10);
    expect(second.success).toBe(false);
    expect(second.error).toBe('Engagement already in progress');

    release(POW_RESULT);
    const firstResult = await first;
    expect(firstResult.success).toBe(true);
    expect(engine.isEngagementInProgress()).toBe(false);
    expect(engine.getUsedBudget()).toBe(10); // only the first spent budget
  });

  it('treats mining cancellation as non-error, non-spend', async () => {
    const { engine, rpc } = makeEngine();
    mockMine.mockRejectedValueOnce(new Error('Mining cancelled'));

    const result = await engine.engage(makeContent(), 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Engagement cancelled');
    expect(rpc!.submitEngagement).not.toHaveBeenCalled();
    expect(engine.getUsedBudget()).toBe(0);
  });

  it('validates author pubkey length', () => {
    const engine = new AutoEngageEngine();
    expect(() => engine.setAuthorPubkey('abcd')).toThrow('64 hex characters');
  });
});

describe('daily budget', () => {
  it('enforces the budget limit before mining', async () => {
    const { engine } = makeEngine();
    engine.setBudgetLimit(100);

    const result = await engine.engage(makeContent(), 101);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Daily budget exceeded');
    expect(mockMine).not.toHaveBeenCalled();
  });

  it('allows spending exactly up to the limit', () => {
    const { engine } = makeEngine();
    engine.setBudgetLimit(100);
    expect(engine.canEngage(100)).toBe(true);
    engine.recordEngagement(50);
    expect(engine.canEngage(50)).toBe(true);
    expect(engine.canEngage(51)).toBe(false);
    expect(engine.getRemainingBudget()).toBe(50);
  });

  it('defaults to the spec daily budget', () => {
    const { engine } = makeEngine();
    expect(engine.getBudgetLimit()).toBe(DAILY_POW_BUDGET_SECS);
  });

  it('resets used budget at midnight UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T23:59:00Z'));

    const engine = new AutoEngageEngine();
    engine.recordEngagement(500);
    expect(engine.getUsedBudget()).toBe(500);
    expect(engine.getBudgetState().date).toBe('2026-07-01');

    // One second before midnight UTC: still the same budget day
    vi.setSystemTime(new Date('2026-07-01T23:59:59Z'));
    expect(engine.getUsedBudget()).toBe(500);

    // Cross midnight UTC: budget resets
    vi.setSystemTime(new Date('2026-07-02T00:00:01Z'));
    expect(engine.getUsedBudget()).toBe(0);
    expect(engine.getRemainingBudget()).toBe(engine.getBudgetLimit());
    expect(engine.getBudgetState().date).toBe('2026-07-02');
  });

  it('notifies budget subscribers on reset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));

    const engine = new AutoEngageEngine();
    engine.recordEngagement(200);

    const states: BudgetState[] = [];
    const unsubscribe = engine.subscribeToBudget((s) => states.push(s));
    expect(states[0]?.used).toBe(200); // immediate notification

    vi.setSystemTime(new Date('2026-07-02T00:00:01Z'));
    engine.getBudgetState(); // triggers reset check
    expect(states[states.length - 1]?.used).toBe(0);

    unsubscribe();
  });

  it('persists budget state across engine instances within the same UTC day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));

    const first = new AutoEngageEngine();
    first.setBudgetLimit(1000);
    first.recordEngagement(250);

    const second = new AutoEngageEngine();
    expect(second.getUsedBudget()).toBe(250);
    expect(second.getBudgetLimit()).toBe(1000);
  });

  it('resets persisted budget from a previous day on load', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    const first = new AutoEngageEngine();
    first.recordEngagement(300);

    vi.setSystemTime(new Date('2026-07-02T08:00:00Z'));
    const second = new AutoEngageEngine();
    expect(second.getUsedBudget()).toBe(0);
  });
});
