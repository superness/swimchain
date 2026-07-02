/**
 * MetricsCollector unit tests
 *
 * Covers SPEC_09 health-score math, heat calculation (survival_probability
 * * 100), the real engagementsLast24h filtering (PR #36), active-swimmer
 * counting from chain data, and disconnected-state behavior (explicit
 * empty-state markers, not fake healthy zeros).
 *
 * RPC is a plain object stub; collection polling is never started, so no
 * timers are left running.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { getMetricsCollector } from '../src/services/MetricsCollector';
import {
  calculateHealthScore,
  getHealthStatus,
  createHeatDistribution,
  NETWORK_STATUS,
} from '../src/types';
import type { SwimchainRpc, ContentResult, EngageActionInfo } from '../src/lib/rpc';

const NOW_SECS = () => Math.floor(Date.now() / 1000);

function makeItem(overrides: Partial<ContentResult> = {}): ContentResult {
  return {
    content_id: 'sha256:item',
    space_id: 'sp1test',
    author_id: 'cs1author',
    title: 't',
    body: 'b',
    created_at: NOW_SECS(),
    last_engagement: NOW_SECS(),
    reply_count: 0,
    survival_probability: 1.0,
    ...overrides,
  };
}

function makeAction(overrides: Partial<EngageActionInfo> = {}): EngageActionInfo {
  return {
    content_hash: 'sha256:item',
    actor: 'cs1actor',
    timestamp: NOW_SECS() - 100,
    pow_work: 1,
    emoji: null,
    block_hash: 'sha256:block',
    ...overrides,
  };
}

interface RpcStubOptions {
  peers?: unknown[];
  spaces?: Array<{ space_id: string; name: string | null; post_count: number; last_activity: number | null }>;
  itemsBySpace?: Record<string, ContentResult[]>;
  engagements?: { total_engage_actions: number; content_stats: unknown[]; actions?: EngageActionInfo[] };
  lastBlockTime?: number;
}

function makeRpc(opts: RpcStubOptions = {}) {
  return {
    getSyncStatus: vi.fn(async () => ({
      chain_percent: 100,
      peer_count: opts.peers?.length ?? 0,
      storage_mb: 1,
      storage_target_mb: 100,
      last_block_time: opts.lastBlockTime ?? NOW_SECS() - 60, // 1 minute ago
      state: 'synced' as const,
    })),
    getPeers: vi.fn(async () => opts.peers ?? []),
    listSpaces: vi.fn(async () => ({ spaces: opts.spaces ?? [] })),
    listSpaceContent: vi.fn(async (spaceId: string) => ({
      items: opts.itemsBySpace?.[spaceId] ?? [],
    })),
    getChainEngagements: vi.fn(async () => (
      opts.engagements ?? { total_engage_actions: 0, content_stats: [], actions: [] }
    )),
  };
}

function asRpc(stub: ReturnType<typeof makeRpc>): SwimchainRpc {
  return stub as unknown as SwimchainRpc;
}

const collector = getMetricsCollector();

afterEach(() => {
  collector.stop();
  collector.setCallbacks({});
  collector.setRpcClient(null as unknown as SwimchainRpc);
});

describe('calculateHealthScore (SPEC_09 §6)', () => {
  it('awards a perfect 100 for a fully healthy network', () => {
    // 10+ swimmers (30) + <5 at risk (30) + fresh sync (20) + 100% heat (20)
    expect(calculateHealthScore(10, 0, 1, 100)).toBe(100);
    expect(calculateHealthScore(50, 4, 4.9, 100)).toBe(100);
  });

  it('scales the swimmer component up to 30 points at 10 swimmers', () => {
    expect(calculateHealthScore(0, 0, 1, 0)).toBe(30 + 20); // risk + sync only
    expect(calculateHealthScore(5, 0, 1, 0)).toBe(15 + 30 + 20);
    expect(calculateHealthScore(20, 0, 1, 0)).toBe(30 + 30 + 20); // capped
  });

  it('degrades the risk component as at-risk posts rise', () => {
    expect(calculateHealthScore(10, 4, 1, 0)).toBe(30 + 30 + 20);
    expect(calculateHealthScore(10, 10, 1, 0)).toBe(30 + 20 + 20); // 30-10
    expect(calculateHealthScore(10, 35, 1, 0)).toBe(30 + 0 + 20); // floored at 0
  });

  it('gives sync points only when sync is under 5 minutes old', () => {
    expect(calculateHealthScore(0, 100, 4.99, 0)).toBe(20);
    expect(calculateHealthScore(0, 100, 5, 0)).toBe(0);
    expect(calculateHealthScore(0, 100, 999, 0)).toBe(0);
  });

  it('scales heat linearly to 20 points', () => {
    expect(calculateHealthScore(0, 100, 999, 50)).toBe(10);
    expect(calculateHealthScore(0, 100, 999, 100)).toBe(20);
  });
});

describe('getHealthStatus', () => {
  it('maps scores to categorical statuses', () => {
    expect(getHealthStatus(100)).toBe(NETWORK_STATUS.HEALTHY);
    expect(getHealthStatus(80)).toBe(NETWORK_STATUS.HEALTHY);
    expect(getHealthStatus(79)).toBe(NETWORK_STATUS.DEGRADED);
    expect(getHealthStatus(60)).toBe(NETWORK_STATUS.DEGRADED);
    expect(getHealthStatus(40)).toBe(NETWORK_STATUS.DEGRADED);
    expect(getHealthStatus(39)).toBe(NETWORK_STATUS.UNHEALTHY);
    expect(getHealthStatus(1)).toBe(NETWORK_STATUS.UNHEALTHY);
    expect(getHealthStatus(0)).toBe(NETWORK_STATUS.UNKNOWN);
  });
});

describe('createHeatDistribution', () => {
  it('buckets values into 10 deciles with percentages', () => {
    const dist = createHeatDistribution([5, 15, 15, 95]);
    expect(dist.totalPosts).toBe(4);
    expect(dist.buckets).toHaveLength(10);
    expect(dist.buckets[0]).toMatchObject({ min: 0, max: 10, count: 1, percentage: 25 });
    expect(dist.buckets[1]).toMatchObject({ min: 10, max: 20, count: 2, percentage: 50 });
    expect(dist.buckets[9]).toMatchObject({ min: 90, max: 100, count: 1 });
  });

  it('includes 100 in the last bucket', () => {
    const dist = createHeatDistribution([100]);
    expect(dist.buckets[9]?.count).toBe(1);
  });

  it('computes the median for odd and even counts', () => {
    expect(createHeatDistribution([10, 30, 50]).medianHeat).toBe(30);
    expect(createHeatDistribution([10, 20, 30, 40]).medianHeat).toBe(25);
  });

  it('handles empty input without NaN', () => {
    const dist = createHeatDistribution([]);
    expect(dist.totalPosts).toBe(0);
    expect(dist.medianHeat).toBe(0);
    expect(dist.buckets.every((b) => b.percentage === 0)).toBe(true);
  });
});

describe('space heat metrics (heat = survival_probability * 100)', () => {
  it('converts survival probability to 0-100 heat and aggregates', async () => {
    const space = 'sp1heat';
    const rpc = makeRpc({
      spaces: [{ space_id: space, name: null, post_count: 3, last_activity: null }],
      itemsBySpace: {
        [space]: [
          makeItem({ content_id: 'sha256:cold', survival_probability: 0.2, author_id: 'cs1a' }),
          makeItem({ content_id: 'sha256:hot', survival_probability: 0.8, author_id: 'cs1b' }),
          makeItem({ content_id: 'sha256:fresh', survival_probability: undefined, author_id: 'cs1a' }),
        ],
      },
    });
    collector.updateConfig({ watchedSpaces: [space] });
    collector.setRpcClient(asRpc(rpc));
    await collector.refresh();

    const metrics = collector.getSpaceMetrics(space);
    expect(metrics).toBeDefined();
    expect(metrics!.totalPosts).toBe(3);
    // heats: 20, 80, 100 (missing survival_probability defaults to 1.0)
    expect(metrics!.avgHeat).toBeCloseTo((20 + 80 + 100) / 3, 5);
    expect(metrics!.postsAtRisk).toBe(1); // heat < 25
    expect(metrics!.healthyPosts).toBe(2); // heat >= 75
    expect(metrics!.activeContributors).toBe(2); // unique authors
    expect(metrics!.heatDistribution.totalPosts).toBe(3);
    expect(metrics!.heatDistribution.buckets[2]?.count).toBe(1); // 20 in [20,30)
  });
});

describe('engagementsLast24h filtering (PR #36)', () => {
  it('counts only actions with timestamps inside the 24h window', async () => {
    const space = 'sp1eng';
    const rpc = makeRpc({
      spaces: [{ space_id: space, name: null, post_count: 1, last_activity: null }],
      itemsBySpace: { [space]: [makeItem()] },
      engagements: {
        total_engage_actions: 4,
        content_stats: [],
        actions: [
          makeAction({ timestamp: NOW_SECS() - 100 }), // in window
          makeAction({ timestamp: NOW_SECS() - 3600 }), // in window
          makeAction({ timestamp: NOW_SECS() - 24 * 3600 - 100 }), // outside
          makeAction({ timestamp: NOW_SECS() - 7 * 24 * 3600 }), // way outside
        ],
      },
    });
    collector.updateConfig({ watchedSpaces: [space] });
    collector.setRpcClient(asRpc(rpc));
    await collector.refresh();

    expect(collector.getSpaceMetrics(space)!.engagementsLast24h).toBe(2);
  });

  it('falls back to the aggregate total when per-action data is unavailable', async () => {
    const space = 'sp1engfallback';
    const rpc = makeRpc({
      spaces: [{ space_id: space, name: null, post_count: 1, last_activity: null }],
      itemsBySpace: { [space]: [makeItem()] },
      engagements: { total_engage_actions: 7, content_stats: [] }, // no actions array
    });
    collector.updateConfig({ watchedSpaces: [space] });
    collector.setRpcClient(asRpc(rpc));
    await collector.refresh();

    expect(collector.getSpaceMetrics(space)!.engagementsLast24h).toBe(7);
  });
});

describe('network health collection', () => {
  it('uses unique 24h actors as the real active-swimmer metric', async () => {
    const rpc = makeRpc({
      peers: [{ peer_id: 'p1' }, { peer_id: 'p2' }, { peer_id: 'p3' }],
      engagements: {
        total_engage_actions: 3,
        content_stats: [],
        actions: [
          makeAction({ actor: 'cs1alice' }),
          makeAction({ actor: 'cs1alice' }),
          makeAction({ actor: 'cs1bob' }),
          makeAction({ actor: 'cs1stale', timestamp: NOW_SECS() - 2 * 24 * 3600 }),
        ],
      },
    });
    collector.updateConfig({ watchedSpaces: ['sp1swimmers'] });
    collector.setRpcClient(asRpc(rpc));
    await collector.refresh();

    // 2 unique actors within 24h beats peers.length (3)
    expect(collector.getNetworkHealth()!.activeSwimmers).toBe(2);
  });

  it('falls back to peer count when no chain engagement data exists', async () => {
    const rpc = makeRpc({
      peers: [{ peer_id: 'p1' }, { peer_id: 'p2' }, { peer_id: 'p3' }],
      engagements: { total_engage_actions: 0, content_stats: [], actions: [] },
    });
    collector.updateConfig({ watchedSpaces: ['sp1peers'] });
    collector.setRpcClient(asRpc(rpc));
    await collector.refresh();

    expect(collector.getNetworkHealth()!.activeSwimmers).toBe(3);
  });

  it('computes score and breakdown for an empty but synced network', async () => {
    const rpc = makeRpc({});
    collector.updateConfig({ watchedSpaces: ['sp1empty'] });
    collector.setRpcClient(asRpc(rpc));
    await collector.refresh();

    const health = collector.getNetworkHealth()!;
    // 0 swimmers (0) + 0 at-risk (30) + fresh sync (20) + 0 heat (0) = 50
    expect(health.score).toBe(50);
    expect(health.status).toBe(NETWORK_STATUS.DEGRADED);
    expect(health.breakdown).toEqual({
      swimmerScore: 0,
      riskScore: 30,
      syncScore: 20,
      heatScore: 0,
    });
  });
});

describe('disconnected-state behavior', () => {
  it('reports explicit empty-state markers, not fake healthy zeros', async () => {
    collector.updateConfig({ watchedSpaces: ['sp1disc'] });
    collector.setRpcClient(null as unknown as SwimchainRpc);
    await collector.refresh();

    const health = collector.getNetworkHealth()!;
    // The disconnected contract: sync age is pinned to 999 minutes so the
    // sync component scores 0 and the state cannot read as "fresh".
    expect(health.lastSyncAgeMinutes).toBe(999);
    expect(health.activeSwimmers).toBe(0);
    expect(health.avgHeat).toBe(0);
    expect(health.breakdown.syncScore).toBe(0);
    expect(health.score).toBe(30); // only the trivially-empty risk component
    expect(health.status).toBe(NETWORK_STATUS.UNHEALTHY);

    // Stale sync must surface as an alert
    expect(collector.getAlerts().some((a) => a.type === 'stale_sync')).toBe(true);
  });

  it('returns explicit zero space metrics while disconnected', async () => {
    const space = 'sp1discspace';
    collector.updateConfig({ watchedSpaces: [space] });
    collector.setRpcClient(null as unknown as SwimchainRpc);
    await collector.refresh();

    const metrics = collector.getSpaceMetrics(space)!;
    expect(metrics.totalPosts).toBe(0);
    expect(metrics.avgHeat).toBe(0);
    expect(metrics.engagementsLast24h).toBe(0);
    expect(metrics.heatDistribution.totalPosts).toBe(0);
  });
});

describe('collection lifecycle', () => {
  it('start/stop manage polling without leaking timers', () => {
    vi.useFakeTimers();
    try {
      collector.setRpcClient(null as unknown as SwimchainRpc);
      expect(collector.isRunning()).toBe(false);
      collector.start();
      expect(collector.isRunning()).toBe(true);
      collector.start(); // idempotent
      collector.stop();
      expect(collector.isRunning()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
