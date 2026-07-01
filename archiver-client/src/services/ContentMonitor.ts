/**
 * Content Monitor Service
 *
 * Monitors Swimchain content for decay risk and provides
 * at-risk content notifications.
 */

import type { AtRiskContent, SpaceId, UrgencyLevel } from '../types';
import {
  HALF_LIFE_SECONDS,
  DECAY_FLOOR_SECONDS,
  DECAY_THRESHOLD,
  MIN_HEAT_ARCHIVE_THRESHOLD,
  AUTO_ENGAGE_THRESHOLD,
  SCAN_INTERVAL_MS,
  POOL_REQUIRED_POW_SECS,
} from '../types/constants';

type ContentSubscriber = (content: AtRiskContent[]) => void;

/**
 * Service for monitoring content decay and identifying at-risk posts.
 */
export class ContentMonitor {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private subscribers: Set<ContentSubscriber> = new Set();
  private isRunning = false;
  private lastContent: AtRiskContent[] = [];

  /**
   * Calculate survival probability using SPEC_02 formula.
   *
   * survival = 0.5^(effectiveDecayTime / HALF_LIFE_SECONDS)
   * where effectiveDecayTime = max(0, timeSinceEngagement - DECAY_FLOOR_SECONDS)
   *
   * @param lastEngagementTime - Last engagement timestamp
   * @param now - Current time (defaults to now)
   * @returns Survival probability between 0 and 1
   */
  calculateSurvival(lastEngagementTime: Date, now: Date = new Date()): number {
    const timeSinceEngagement = (now.getTime() - lastEngagementTime.getTime()) / 1000;
    const effectiveDecayTime = Math.max(0, timeSinceEngagement - DECAY_FLOOR_SECONDS);
    return Math.pow(0.5, effectiveDecayTime / HALF_LIFE_SECONDS);
  }

  /**
   * Estimate when content will decay below the threshold.
   *
   * Solves for: DECAY_THRESHOLD = 0.5^(t / HALF_LIFE)
   * t = HALF_LIFE * log2(1/DECAY_THRESHOLD) = HALF_LIFE * 4 (for 6.25%)
   *
   * @param lastEngagementTime - Last engagement timestamp
   * @returns Estimated decay time
   */
  estimateDecayTime(lastEngagementTime: Date): Date {
    // 4 half-lives to reach 6.25% (0.5^4 = 0.0625)
    const halfLivesToDecay = Math.log2(1 / DECAY_THRESHOLD);
    const timeToDecay = DECAY_FLOOR_SECONDS + (HALF_LIFE_SECONDS * halfLivesToDecay);
    return new Date(lastEngagementTime.getTime() + timeToDecay * 1000);
  }

  /**
   * Estimate remaining time until decay based on current heat.
   *
   * @param currentHeat - Current heat value (0-1)
   * @returns Estimated seconds until decay, or Infinity if safe
   */
  estimateTimeUntilDecay(currentHeat: number): number {
    if (currentHeat <= DECAY_THRESHOLD) {
      return 0; // Already decayed
    }

    // Solve: DECAY_THRESHOLD = currentHeat * 0.5^(t / HALF_LIFE)
    // t = HALF_LIFE * log2(currentHeat / DECAY_THRESHOLD)
    const halfLivesRemaining = Math.log2(currentHeat / DECAY_THRESHOLD);
    return halfLivesRemaining * HALF_LIFE_SECONDS;
  }

  /**
   * Classify urgency based on current heat.
   *
   * @param heat - Current heat value (0-1)
   * @returns Urgency level
   */
  classifyUrgency(heat: number): UrgencyLevel {
    if (heat < MIN_HEAT_ARCHIVE_THRESHOLD) return 'critical'; // < 5%
    if (heat < AUTO_ENGAGE_THRESHOLD) return 'warning'; // < 10%
    return 'normal';
  }

  private rpcClient: import('../lib/rpc').SwimchainRpc | null = null;

  /**
   * Set the RPC client for making API calls
   */
  setRpcClient(client: import('../lib/rpc').SwimchainRpc | null): void {
    this.rpcClient = client;
  }

  /**
   * Get content at risk of decay in specified spaces.
   *
   * @param spaces - Spaces to monitor
   * @param threshold - Maximum heat to include (default: AUTO_ENGAGE_THRESHOLD)
   * @returns Array of at-risk content sorted by urgency
   */
  async getAtRiskContent(
    spaces: SpaceId[],
    threshold: number = AUTO_ENGAGE_THRESHOLD
  ): Promise<AtRiskContent[]> {
    console.log(`[ContentMonitor] Scanning ${spaces.length} spaces for at-risk content`);

    if (!this.rpcClient) {
      console.warn('[ContentMonitor] No RPC client available');
      return [];
    }

    // Fetch all spaces in parallel for better performance
    const spaceResults = await Promise.all(
      spaces.map(async (spaceId) => {
        try {
          const result = await this.rpcClient!.listSpaceContent(spaceId);
          return { spaceId, items: result.items };
        } catch (error) {
          console.error(`[ContentMonitor] Failed to scan space ${spaceId}:`, error);
          return { spaceId, items: [] };
        }
      })
    );

    const atRiskContent: AtRiskContent[] = [];

    for (const { spaceId, items } of spaceResults) {
      for (const item of items) {
        const heat = item.survival_probability ?? 1.0;

        // Only include content below threshold
        if (heat >= threshold) continue;
        if (heat < DECAY_THRESHOLD) continue; // Already decayed

        const urgency = this.classifyUrgency(heat);
        const estimatedDecayTime = this.estimateDecayTime(new Date(item.last_engagement));

        // Fetch pool details for contributor count
        let contributorCount = 0;
        if (this.rpcClient && item.has_pool) {
          try {
            const pool = await this.rpcClient.getPoolForContent(item.content_id);
            if (pool) {
              contributorCount = pool.contributor_count;
            }
          } catch {
            // Fall back to 0 if pool lookup fails
          }
        }

        atRiskContent.push({
          postHash: item.content_id,
          spaceId,
          title: item.title ?? item.body?.substring(0, 80) ?? 'Untitled',
          author: item.author_id,
          heat,
          estimatedDecayTime,
          replyCount: item.reply_count ?? 0,
          poolStatus: {
            currentSeconds: Math.round((item.pool_progress ?? 0) * 60),
            requiredSeconds: POOL_REQUIRED_POW_SECS,
            contributorCount,
          },
          urgency,
        });
      }
    }

    // Check spam status and mark flagged content (SPEC_12)
    if (this.rpcClient && atRiskContent.length > 0) {
      try {
        const contentIds = atRiskContent.map((c) => c.postHash);
        const spamFlaggedIds = await this.rpcClient.getSpamFlaggedIds(contentIds);

        if (spamFlaggedIds.size > 0) {
          console.log(
            `[ContentMonitor] ${spamFlaggedIds.size} items spam-flagged, excluding from engagement`
          );
        }

        for (const item of atRiskContent) {
          if (spamFlaggedIds.has(item.postHash)) {
            item.spamFlagged = true;
          }
        }
      } catch (error) {
        console.warn('[ContentMonitor] Failed to check spam status, proceeding without filter:', error);
      }
    }

    // Sort by heat (lowest first = most urgent)
    atRiskContent.sort((a, b) => a.heat - b.heat);

    this.lastContent = atRiskContent;
    return atRiskContent;
  }

  /**
   * Get the last fetched at-risk content.
   */
  getLastContent(): AtRiskContent[] {
    return this.lastContent;
  }

  /**
   * Start polling for at-risk content.
   *
   * @param spaces - Spaces to monitor
   * @param intervalMs - Polling interval in milliseconds
   */
  startPolling(spaces: SpaceId[], intervalMs: number = SCAN_INTERVAL_MS): void {
    if (this.pollingTimer) {
      console.log('[ContentMonitor] Polling already running');
      return;
    }

    this.isRunning = true;
    console.log(`[ContentMonitor] Starting polling with ${intervalMs}ms interval`);

    // Initial fetch
    this.fetchAndNotify(spaces);

    // Set up interval
    this.pollingTimer = setInterval(() => {
      this.fetchAndNotify(spaces);
    }, intervalMs);
  }

  /**
   * Stop polling for at-risk content.
   */
  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isRunning = false;
    console.log('[ContentMonitor] Polling stopped');
  }

  /**
   * Check if polling is currently running.
   */
  isPolling(): boolean {
    return this.isRunning;
  }

  /**
   * Subscribe to at-risk content updates.
   *
   * @param callback - Function to call with updated content
   * @returns Unsubscribe function
   */
  subscribe(callback: ContentSubscriber): () => void {
    this.subscribers.add(callback);

    // Immediately notify with last known content
    if (this.lastContent.length > 0) {
      callback(this.lastContent);
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get the number of subscribers.
   */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  /**
   * Internal method to fetch and notify subscribers.
   */
  private async fetchAndNotify(spaces: SpaceId[]): Promise<void> {
    try {
      const content = await this.getAtRiskContent(spaces);
      this.notifySubscribers(content);
    } catch (error) {
      console.error('[ContentMonitor] Error fetching at-risk content:', error);
    }
  }

  /**
   * Notify all subscribers with new content.
   */
  private notifySubscribers(content: AtRiskContent[]): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(content);
      } catch (error) {
        console.error('[ContentMonitor] Error in subscriber callback:', error);
      }
    });
  }
}

/**
 * Singleton instance for shared use.
 */
let _instance: ContentMonitor | null = null;

export function getContentMonitor(): ContentMonitor {
  if (!_instance) {
    _instance = new ContentMonitor();
  }
  return _instance;
}
