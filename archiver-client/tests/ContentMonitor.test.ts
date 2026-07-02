/**
 * ContentMonitor unit tests
 *
 * Covers SPEC_02 decay/survival math, urgency classification, at-risk
 * scanning with spam-flag marking (SPEC_12), and polling lifecycle.
 * RPC is stubbed at the boundary; timers are faked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentMonitor } from '../src/services/ContentMonitor';
import type { AtRiskContent } from '../src/types';
import {
  HALF_LIFE_SECONDS,
  DECAY_FLOOR_SECONDS,
  DECAY_THRESHOLD,
  POOL_REQUIRED_POW_SECS,
} from '../src/types/constants';
import type { SwimchainRpc, ContentResult } from '../src/lib/rpc';

const T0 = new Date('2026-07-01T00:00:00Z');

function secondsAfter(base: Date, secs: number): Date {
  return new Date(base.getTime() + secs * 1000);
}

function makeItem(overrides: Partial<ContentResult> = {}): ContentResult {
  return {
    content_id: 'sha256:item',
    space_id: 'sp1test',
    author_id: 'cs1author',
    title: 'a title',
    body: 'a body',
    created_at: 1_700_000_000,
    last_engagement: 1_700_000_000,
    reply_count: 1,
    has_pool: false,
    pool_progress: 0,
    survival_probability: 0.08,
    ...overrides,
  };
}

type RpcStub = {
  listSpaceContent: ReturnType<typeof vi.fn>;
  getPoolForContent: ReturnType<typeof vi.fn>;
  getSpamFlaggedIds: ReturnType<typeof vi.fn>;
};

function makeRpc(overrides: Partial<RpcStub> = {}): RpcStub {
  return {
    listSpaceContent: vi.fn(async () => ({ items: [] as ContentResult[] })),
    getPoolForContent: vi.fn(async () => ({
      has_pool: true,
      total_pow: 15,
      required_pow: 60,
      status: 'active',
      contributor_count: 4,
      expires_at: 0,
    })),
    getSpamFlaggedIds: vi.fn(async () => new Set<string>()),
    ...overrides,
  };
}

let monitor: ContentMonitor;

beforeEach(() => {
  monitor = new ContentMonitor();
});

afterEach(() => {
  monitor.stopPolling();
  vi.useRealTimers();
});

describe('calculateSurvival (SPEC_02)', () => {
  it('is 1.0 within the 48h decay floor', () => {
    expect(monitor.calculateSurvival(T0, T0)).toBe(1);
    expect(monitor.calculateSurvival(T0, secondsAfter(T0, DECAY_FLOOR_SECONDS))).toBe(1);
    expect(monitor.calculateSurvival(T0, secondsAfter(T0, 3600))).toBe(1);
  });

  it('halves per half-life after the floor', () => {
    const oneHalfLife = secondsAfter(T0, DECAY_FLOOR_SECONDS + HALF_LIFE_SECONDS);
    expect(monitor.calculateSurvival(T0, oneHalfLife)).toBeCloseTo(0.5, 10);

    const twoHalfLives = secondsAfter(T0, DECAY_FLOOR_SECONDS + 2 * HALF_LIFE_SECONDS);
    expect(monitor.calculateSurvival(T0, twoHalfLives)).toBeCloseTo(0.25, 10);
  });

  it('reaches the 6.25% decay threshold after exactly 4 half-lives', () => {
    const fourHalfLives = secondsAfter(T0, DECAY_FLOOR_SECONDS + 4 * HALF_LIFE_SECONDS);
    expect(monitor.calculateSurvival(T0, fourHalfLives)).toBeCloseTo(DECAY_THRESHOLD, 10);
  });
});

describe('estimateDecayTime', () => {
  it('projects floor + 4 half-lives from last engagement', () => {
    const expected = secondsAfter(T0, DECAY_FLOOR_SECONDS + 4 * HALF_LIFE_SECONDS);
    expect(monitor.estimateDecayTime(T0).getTime()).toBe(expected.getTime());
  });
});

describe('estimateTimeUntilDecay', () => {
  it('returns 0 for already-decayed content', () => {
    expect(monitor.estimateTimeUntilDecay(DECAY_THRESHOLD)).toBe(0);
    expect(monitor.estimateTimeUntilDecay(0.01)).toBe(0);
  });

  it('solves for remaining half-lives from current heat', () => {
    // 0.125 -> log2(0.125/0.0625) = 1 half-life remaining
    expect(monitor.estimateTimeUntilDecay(0.125)).toBeCloseTo(HALF_LIFE_SECONDS, 5);
    // 0.5 -> 3 half-lives remaining
    expect(monitor.estimateTimeUntilDecay(0.5)).toBeCloseTo(3 * HALF_LIFE_SECONDS, 5);
    // 1.0 -> 4 half-lives remaining
    expect(monitor.estimateTimeUntilDecay(1.0)).toBeCloseTo(4 * HALF_LIFE_SECONDS, 5);
  });
});

describe('classifyUrgency', () => {
  it('classifies by heat thresholds with correct boundaries', () => {
    expect(monitor.classifyUrgency(0.01)).toBe('critical');
    expect(monitor.classifyUrgency(0.049)).toBe('critical');
    expect(monitor.classifyUrgency(0.05)).toBe('warning'); // boundary: not critical
    expect(monitor.classifyUrgency(0.09)).toBe('warning');
    expect(monitor.classifyUrgency(0.1)).toBe('normal'); // boundary: not warning
    expect(monitor.classifyUrgency(0.9)).toBe('normal');
  });
});

describe('getAtRiskContent', () => {
  it('returns empty without an RPC client (no fabricated data)', async () => {
    const result = await monitor.getAtRiskContent(['sp1test']);
    expect(result).toEqual([]);
  });

  it('filters to the at-risk band and sorts most-urgent first', async () => {
    const rpc = makeRpc({
      listSpaceContent: vi.fn(async () => ({
        items: [
          makeItem({ content_id: 'sha256:healthy', survival_probability: 0.9 }),
          makeItem({ content_id: 'sha256:warning', survival_probability: 0.08 }),
          makeItem({ content_id: 'sha256:decayed', survival_probability: 0.01 }),
          makeItem({ content_id: 'sha256:critical', survival_probability: 0.07 }),
        ],
      })),
    });
    monitor.setRpcClient(rpc as unknown as SwimchainRpc);

    const result = await monitor.getAtRiskContent(['sp1test']);

    // healthy (>= threshold) and decayed (< DECAY_THRESHOLD) are excluded
    expect(result.map((c) => c.postHash)).toEqual([
      'sha256:critical',
      'sha256:warning',
    ]);
    expect(result[0]?.heat).toBe(0.07);
    expect(monitor.getLastContent()).toEqual(result);
  });

  it('converts pool progress to seconds and fetches contributor counts', async () => {
    const rpc = makeRpc({
      listSpaceContent: vi.fn(async () => ({
        items: [
          makeItem({
            content_id: 'sha256:pooled',
            survival_probability: 0.07,
            has_pool: true,
            pool_progress: 0.5,
          }),
        ],
      })),
    });
    monitor.setRpcClient(rpc as unknown as SwimchainRpc);

    const [item] = await monitor.getAtRiskContent(['sp1test']);

    expect(rpc.getPoolForContent).toHaveBeenCalledWith('sha256:pooled');
    expect(item?.poolStatus).toEqual({
      currentSeconds: 30, // round(0.5 * 60)
      requiredSeconds: POOL_REQUIRED_POW_SECS,
      contributorCount: 4,
    });
  });

  it('marks spam-flagged content so the engage engine can exclude it (SPEC_12)', async () => {
    const rpc = makeRpc({
      listSpaceContent: vi.fn(async () => ({
        items: [
          makeItem({ content_id: 'sha256:clean', survival_probability: 0.08 }),
          makeItem({ content_id: 'sha256:spam', survival_probability: 0.07 }),
        ],
      })),
      getSpamFlaggedIds: vi.fn(async () => new Set(['sha256:spam'])),
    });
    monitor.setRpcClient(rpc as unknown as SwimchainRpc);

    const result = await monitor.getAtRiskContent(['sp1test']);

    const spam = result.find((c) => c.postHash === 'sha256:spam');
    const clean = result.find((c) => c.postHash === 'sha256:clean');
    expect(spam?.spamFlagged).toBe(true);
    expect(clean?.spamFlagged).toBeUndefined();
  });

  it('falls back to body excerpt then Untitled for missing titles', async () => {
    const rpc = makeRpc({
      listSpaceContent: vi.fn(async () => ({
        items: [
          makeItem({
            content_id: 'sha256:bodyonly',
            title: null,
            body: 'body text here',
            survival_probability: 0.08,
          }),
          makeItem({
            content_id: 'sha256:bare',
            title: null,
            body: null,
            survival_probability: 0.08,
          }),
        ],
      })),
    });
    monitor.setRpcClient(rpc as unknown as SwimchainRpc);

    const result = await monitor.getAtRiskContent(['sp1test']);
    expect(result.find((c) => c.postHash === 'sha256:bodyonly')?.title).toBe('body text here');
    expect(result.find((c) => c.postHash === 'sha256:bare')?.title).toBe('Untitled');
  });

  it('survives a failing space scan and keeps scanning others', async () => {
    const rpc = makeRpc({
      listSpaceContent: vi.fn(async (spaceId: string) => {
        if (spaceId === 'sp1bad') throw new Error('space unavailable');
        return {
          items: [makeItem({ content_id: 'sha256:ok', survival_probability: 0.08 })],
        };
      }),
    });
    monitor.setRpcClient(rpc as unknown as SwimchainRpc);

    const result = await monitor.getAtRiskContent(['sp1bad', 'sp1good']);
    expect(result.map((c) => c.postHash)).toEqual(['sha256:ok']);
  });
});

describe('polling lifecycle', () => {
  it('polls on the configured interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(monitor, 'getAtRiskContent')
      .mockResolvedValue([] as AtRiskContent[]);

    monitor.startPolling(['sp1test'], 1000);
    expect(monitor.isPolling()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1); // initial fetch

    await vi.advanceTimersByTimeAsync(3000);
    expect(spy).toHaveBeenCalledTimes(4);

    monitor.stopPolling();
    expect(monitor.isPolling()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(spy).toHaveBeenCalledTimes(4); // no further polls
  });

  it('does not double-start polling', async () => {
    vi.useFakeTimers();
    const spy = vi
      .spyOn(monitor, 'getAtRiskContent')
      .mockResolvedValue([] as AtRiskContent[]);

    monitor.startPolling(['sp1test'], 1000);
    monitor.startPolling(['sp1test'], 1000); // ignored
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(2); // one initial + one interval, not doubled
  });

  it('notifies subscribers with fetched content', async () => {
    vi.useFakeTimers();
    const content = [
      {
        postHash: 'sha256:x',
        spaceId: 'sp1test',
        title: 't',
        author: 'a',
        heat: 0.05,
        estimatedDecayTime: new Date(),
        replyCount: 0,
        poolStatus: { currentSeconds: 0, requiredSeconds: 60, contributorCount: 0 },
        urgency: 'warning',
      } as AtRiskContent,
    ];
    vi.spyOn(monitor, 'getAtRiskContent').mockResolvedValue(content);

    const received: AtRiskContent[][] = [];
    const unsubscribe = monitor.subscribe((c) => received.push(c));

    monitor.startPolling(['sp1test'], 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual([content]);

    unsubscribe();
    expect(monitor.getSubscriberCount()).toBe(0);
  });
});
