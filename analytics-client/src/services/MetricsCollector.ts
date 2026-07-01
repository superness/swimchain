/**
 * Metrics Collector Service
 *
 * Collects and processes network health and space metrics.
 * Based on SPEC_09 health score formula and CLIENT_DESIGN requirements.
 */

import {
  type AnalyticsConfig,
  type NetworkHealth,
  type SpaceMetrics,
  type HealthHistoryPoint,
  type Alert,
  type AlertType,
  type AlertSeverity,
  type MetricsCallbacks,
  type NetworkStatsResponse,
  type SpaceStatsResponse,
  type RecentPost,
  calculateHealthScore,
  getHealthStatus,
  createHeatDistribution,
  getDefaultConfig,
  METRICS_POLL_INTERVAL_MS,
  HISTORY_SNAPSHOT_INTERVAL_MS,
  MAX_HISTORY_POINTS,
  ALERT_LOW_SWIMMERS,
  ALERT_HIGH_RISK_POSTS,
  ALERT_STALE_SYNC_MINUTES,
  ALERT_LOW_AVG_HEAT,
  STORAGE_KEY_CONFIG,
  STORAGE_KEY_HISTORY,
  STORAGE_KEY_WATCHED_SPACES,
} from '../types';

// "At risk" threshold per SPEC_09 section 6.1.2 (25%)
// Posts below this threshold are considered "at risk" of decay
const RISK_THRESHOLD = 0.25; // 25%

// Maximum alerts to keep in memory (FIFO eviction)
const MAX_ALERTS = 100;

class MetricsCollectorImpl {
  private config: AnalyticsConfig;
  private networkHealth: NetworkHealth | null = null;
  private healthHistory: HealthHistoryPoint[] = [];
  private spaceMetrics: Map<string, SpaceMetrics> = new Map();
  private recentPosts: RecentPost[] = [];
  private alerts: Alert[] = [];
  private alertIdCounter = 0;

  private callbacks: MetricsCallbacks = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private historyTimer: ReturnType<typeof setInterval> | null = null;
  private isCollecting = false;

  constructor() {
    this.config = this.loadConfig();
    this.healthHistory = this.loadHistory();
  }

  // === Configuration ===

  getConfig(): AnalyticsConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AnalyticsConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();

    // Restart collection with new settings if running
    if (this.isCollecting) {
      this.stop();
      this.start();
    }
  }

  private loadConfig(): AnalyticsConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (stored) {
        return { ...getDefaultConfig(), ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load analytics config:', e);
    }
    return getDefaultConfig();
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save analytics config:', e);
    }
  }

  private loadHistory(): HealthHistoryPoint[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (stored) {
        const data = JSON.parse(stored);
        return data.map((p: Record<string, unknown>) => ({
          ...p,
          timestamp: new Date(p.timestamp as string),
        }));
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
    return [];
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(this.healthHistory));
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  }

  // === Collection Control ===

  start(): void {
    if (this.isCollecting || !this.config.enabled) return;

    this.isCollecting = true;

    // Initial collection
    this.collectNetworkHealth();
    this.collectWatchedSpaces();

    // Set up polling
    this.pollTimer = setInterval(() => {
      this.collectNetworkHealth();
      this.collectWatchedSpaces();
    }, this.config.pollIntervalMs || METRICS_POLL_INTERVAL_MS);

    // Set up history snapshots
    this.historyTimer = setInterval(() => {
      this.snapshotHistory();
    }, HISTORY_SNAPSHOT_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.historyTimer) {
      clearInterval(this.historyTimer);
      this.historyTimer = null;
    }
    this.isCollecting = false;
  }

  isRunning(): boolean {
    return this.isCollecting;
  }

  // === Callbacks ===

  setCallbacks(callbacks: MetricsCallbacks): void {
    this.callbacks = callbacks;
  }

  // === Data Collection ===

  private async collectNetworkHealth(): Promise<void> {
    try {
      const stats = await this.fetchNetworkStats();

      const breakdown = {
        swimmerScore: Math.min(30, (stats.activeSwimmers / 10) * 30),
        riskScore: stats.postsAtRisk < 5 ? 30 : Math.max(0, 30 - stats.postsAtRisk),
        syncScore: stats.lastSyncAgeMinutes < 5 ? 20 : 0,
        heatScore: (stats.avgHeat / 100) * 20,
      };

      const score = calculateHealthScore(
        stats.activeSwimmers,
        stats.postsAtRisk,
        stats.lastSyncAgeMinutes,
        stats.avgHeat
      );

      this.networkHealth = {
        score,
        status: getHealthStatus(score),
        activeSwimmers: stats.activeSwimmers,
        postsAtRisk: stats.postsAtRisk,
        lastSyncAgeMinutes: stats.lastSyncAgeMinutes,
        avgHeat: stats.avgHeat,
        breakdown,
        timestamp: new Date(),
      };

      // Check for alerts
      this.checkAlerts(this.networkHealth);

      // Notify callback
      this.callbacks.onNetworkHealth?.(this.networkHealth);
    } catch (error) {
      console.error('Failed to collect network health:', error);
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async collectWatchedSpaces(): Promise<void> {
    const spacesToWatch = this.config.watchedSpaces.length > 0
      ? this.config.watchedSpaces
      : await this.getAccessibleSpaces();

    for (const spaceId of spacesToWatch) {
      try {
        const metrics = await this.collectSpaceMetrics(spaceId);
        this.spaceMetrics.set(spaceId, metrics);
        this.callbacks.onSpaceMetrics?.(metrics);
      } catch (error) {
        console.error(`Failed to collect metrics for space ${spaceId}:`, error);
      }
    }
  }

  private async collectSpaceMetrics(spaceId: string): Promise<SpaceMetrics> {
    const stats = await this.fetchSpaceStats(spaceId);

    const heatValues = stats.posts.map(p => p.heat);
    const heatDistribution = createHeatDistribution(heatValues);

    const postsAtRisk = stats.posts.filter(p => p.heat < RISK_THRESHOLD * 100).length;
    const healthyPosts = stats.posts.filter(p => p.heat >= 75).length;
    const avgHeat = heatValues.length > 0
      ? heatValues.reduce((a, b) => a + b, 0) / heatValues.length
      : 0;

    // Calculate 24h activity
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const postsLast24h = stats.posts.filter(
      p => now - new Date(p.createdAt).getTime() < day
    ).length;

    // Update recent posts list
    this.updateRecentPosts(stats, spaceId);

    return {
      spaceId,
      name: stats.name,
      totalPosts: stats.postCount,
      postsAtRisk,
      healthyPosts,
      avgHeat,
      heatDistribution,
      activeContributors: stats.memberCount,
      postsLast24h,
      engagementsLast24h: 0, // TODO: Fetch from API
      timestamp: new Date(),
    };
  }

  private updateRecentPosts(stats: SpaceStatsResponse, spaceId: string): void {
    const newPosts: RecentPost[] = stats.posts.map(p => ({
      id: p.id,
      spaceId,
      authorId: p.authorId,
      heat: p.heat,
      createdAt: new Date(p.createdAt),
      lastEngagement: new Date(p.lastEngagement),
      engagementCount: p.engagementCount,
      isAtRisk: p.heat < RISK_THRESHOLD * 100,
    }));

    // Merge with existing and sort by creation time
    const allPosts = [...this.recentPosts.filter(p => p.spaceId !== spaceId), ...newPosts];
    allPosts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    this.recentPosts = allPosts.slice(0, 50);
  }

  private snapshotHistory(): void {
    if (!this.networkHealth) return;

    const point: HealthHistoryPoint = {
      timestamp: new Date(),
      score: this.networkHealth.score,
      activeSwimmers: this.networkHealth.activeSwimmers,
      postsAtRisk: this.networkHealth.postsAtRisk,
      avgHeat: this.networkHealth.avgHeat,
    };

    this.healthHistory.push(point);

    // Trim to max points
    if (this.healthHistory.length > MAX_HISTORY_POINTS) {
      this.healthHistory = this.healthHistory.slice(-MAX_HISTORY_POINTS);
    }

    this.saveHistory();
  }

  // === Alerts ===

  private checkAlerts(health: NetworkHealth): void {
    const newAlerts: Alert[] = [];

    if (health.activeSwimmers < ALERT_LOW_SWIMMERS) {
      newAlerts.push(this.createAlert(
        'low_swimmers',
        'warning',
        `Low swimmer count: ${health.activeSwimmers}`,
        `Network has only ${health.activeSwimmers} active swimmers. Content may decay without engagement.`
      ));
    }

    if (health.postsAtRisk > ALERT_HIGH_RISK_POSTS) {
      newAlerts.push(this.createAlert(
        'high_risk_posts',
        'critical',
        `${health.postsAtRisk} posts at risk`,
        `${health.postsAtRisk} posts are below the decay threshold and may be lost.`
      ));
    }

    if (health.lastSyncAgeMinutes > ALERT_STALE_SYNC_MINUTES) {
      newAlerts.push(this.createAlert(
        'stale_sync',
        'warning',
        'Sync is stale',
        `Last sync was ${Math.round(health.lastSyncAgeMinutes)} minutes ago.`
      ));
    }

    if (health.avgHeat < ALERT_LOW_AVG_HEAT) {
      newAlerts.push(this.createAlert(
        'low_avg_heat',
        'warning',
        'Low average network heat',
        `Network average heat is ${health.avgHeat.toFixed(1)}%, indicating low engagement.`
      ));
    }

    // Only add new alerts that don't duplicate existing unacknowledged ones
    for (const alert of newAlerts) {
      const isDuplicate = this.alerts.some(
        a => a.type === alert.type && !a.acknowledged
      );
      if (!isDuplicate) {
        this.alerts.push(alert);
        this.callbacks.onAlert?.(alert);
      }
    }

    // FIFO eviction: remove oldest alerts if exceeding MAX_ALERTS
    if (this.alerts.length > MAX_ALERTS) {
      this.alerts = this.alerts.slice(-MAX_ALERTS);
    }
  }

  private createAlert(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    details?: string
  ): Alert {
    return {
      id: `alert-${++this.alertIdCounter}`,
      type,
      severity,
      message,
      details,
      timestamp: new Date(),
      acknowledged: false,
    };
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  clearAcknowledgedAlerts(): void {
    this.alerts = this.alerts.filter(a => !a.acknowledged);
  }

  // === API Calls (Real RPC implementations) ===

  private rpcClient: import('../lib/rpc').SwimchainRpc | null = null;

  /**
   * Set the RPC client for making API calls
   */
  setRpcClient(client: import('../lib/rpc').SwimchainRpc | null): void {
    this.rpcClient = client;
    if (client && this.isCollecting) {
      // Refresh data with new client
      this.refresh();
    }
  }

  private async fetchNetworkStats(): Promise<NetworkStatsResponse & { lastSyncAgeMinutes: number }> {
    if (!this.rpcClient) {
      return {
        activeSwimmers: 0,
        totalPosts: 0,
        postsAtRisk: 0,
        avgHeat: 0,
        lastSyncTimestamp: new Date().toISOString(),
        lastSyncAgeMinutes: 999,
      };
    }

    try {
      const [syncStatus, peers, spaces] = await Promise.all([
        this.rpcClient.getSyncStatus(),
        this.rpcClient.getPeers(),
        this.rpcClient.listSpaces(),
      ]);

      // Calculate aggregate stats from spaces
      let totalPosts = 0;
      let postsAtRisk = 0;
      let totalHeat = 0;
      let postCount = 0;

      // Parallelize space content fetching (batch of 5 concurrent requests)
      const BATCH_SIZE = 5;
      for (let i = 0; i < spaces.spaces.length; i += BATCH_SIZE) {
        const batch = spaces.spaces.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (space) => {
            totalPosts += space.post_count;
            try {
              const content = await this.rpcClient!.listSpaceContent(space.space_id);
              let batchHeat = 0;
              let batchCount = 0;
              let batchRisk = 0;
              for (const item of content.items) {
                const heat = (item.survival_probability ?? 1.0) * 100;
                batchHeat += heat;
                batchCount++;
                if (heat < RISK_THRESHOLD * 100) {
                  batchRisk++;
                }
              }
              return { heat: batchHeat, count: batchCount, risk: batchRisk };
            } catch {
              // Space might not have content
              return { heat: 0, count: 0, risk: 0 };
            }
          })
        );
        // Aggregate batch results
        for (const result of batchResults) {
          totalHeat += result.heat;
          postCount += result.count;
          postsAtRisk += result.risk;
        }
      }

      const avgHeat = postCount > 0 ? totalHeat / postCount : 0;
      const lastSyncTime = syncStatus.last_block_time ?? Math.floor(Date.now() / 1000);
      const lastSyncAgeMinutes = (Date.now() / 1000 - lastSyncTime) / 60;

      return {
        activeSwimmers: peers.length,
        totalPosts,
        postsAtRisk,
        avgHeat,
        lastSyncTimestamp: new Date(lastSyncTime * 1000).toISOString(),
        lastSyncAgeMinutes,
      };
    } catch (error) {
      console.error('[MetricsCollector] Failed to fetch network stats:', error);
      throw error;
    }
  }

  private async fetchSpaceStats(spaceId: string): Promise<SpaceStatsResponse> {
    if (!this.rpcClient) {
      return {
        spaceId,
        name: spaceId,
        postCount: 0,
        memberCount: 0,
        posts: [],
      };
    }

    try {
      const content = await this.rpcClient.listSpaceContent(spaceId);

      const posts = content.items.map(item => ({
        id: item.content_id,
        heat: (item.survival_probability ?? 1.0) * 100,
        authorId: item.author_id,
        createdAt: new Date(item.created_at).toISOString(),
        lastEngagement: new Date(item.last_engagement).toISOString(),
        engagementCount: item.reply_count ?? 0,
      }));

      const uniqueAuthors = new Set(posts.map(p => p.authorId));

      return {
        spaceId,
        name: spaceId,
        postCount: posts.length,
        memberCount: uniqueAuthors.size,
        posts,
      };
    } catch (error) {
      console.error(`[MetricsCollector] Failed to fetch space stats for ${spaceId}:`, error);
      throw error;
    }
  }

  private async getAccessibleSpaces(): Promise<string[]> {
    // First check stored watched spaces
    try {
      const stored = localStorage.getItem(STORAGE_KEY_WATCHED_SPACES);
      if (stored) {
        const spaces = JSON.parse(stored);
        if (spaces.length > 0) return spaces;
      }
    } catch {
      // Ignore
    }

    // Fall back to fetching from RPC
    if (!this.rpcClient) {
      return [];
    }

    try {
      const result = await this.rpcClient.listSpaces();
      return result.spaces.map(s => s.space_id);
    } catch (error) {
      console.error('[MetricsCollector] Failed to fetch spaces:', error);
      return [];
    }
  }

  // === Getters ===

  getNetworkHealth(): NetworkHealth | null {
    return this.networkHealth;
  }

  getHealthHistory(): HealthHistoryPoint[] {
    return [...this.healthHistory];
  }

  getSpaceMetrics(spaceId: string): SpaceMetrics | undefined {
    return this.spaceMetrics.get(spaceId);
  }

  getAllSpaceMetrics(): SpaceMetrics[] {
    return Array.from(this.spaceMetrics.values());
  }

  getRecentPosts(): RecentPost[] {
    return [...this.recentPosts];
  }

  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  getUnacknowledgedAlerts(): Alert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  // === Manual Refresh ===

  async refresh(): Promise<void> {
    await this.collectNetworkHealth();
    await this.collectWatchedSpaces();
  }
}

// Singleton instance
let instance: MetricsCollectorImpl | null = null;

export function getMetricsCollector(): MetricsCollectorImpl {
  if (!instance) {
    instance = new MetricsCollectorImpl();
  }
  return instance;
}

export type { MetricsCollectorImpl as MetricsCollector };
