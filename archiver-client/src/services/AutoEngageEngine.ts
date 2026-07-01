/**
 * Auto-Engage Engine
 *
 * Manages automatic engagement with at-risk content to prevent decay.
 * Implements priority-based engagement and daily budget management.
 */

import type {
  AtRiskContent,
  ArchiverPolicy,
  BudgetState,
  EngagementResult,
  SpaceId,
} from '../types';
import {
  AUTO_ENGAGE_THRESHOLD,
  DAILY_POW_BUDGET_SECS,
  STORAGE_KEYS,
} from '../types/constants';
import { mineEngagementPow } from '../lib/engagement-pow';

type BudgetSubscriber = (state: BudgetState) => void;

/**
 * Engine for automatic content engagement.
 */
/**
 * Progress callback for engagement mining
 */
export type EngagementProgressCallback = (
  attempts: number,
  elapsedMs: number,
  hashRate: number
) => void;

/**
 * Engine for automatic content engagement.
 */
export class AutoEngageEngine {
  private dailyBudgetUsed: number = 0;
  private dailyBudgetLimit: number = DAILY_POW_BUDGET_SECS;
  private lastResetDate: string = '';
  private isEngaging: boolean = false;
  private isCancelled: boolean = false;
  private budgetSubscribers: Set<BudgetSubscriber> = new Set();
  private authorPubkeyHex: string | null = null;
  private isTestnet: boolean = true;

  constructor() {
    this.loadBudgetState();
  }

  /**
   * Set the author's public key for PoW mining.
   * This must be called before engage() can work.
   *
   * @param pubkeyHex - 64-character hex string of the author's public key
   */
  setAuthorPubkey(pubkeyHex: string): void {
    if (pubkeyHex.length !== 64) {
      throw new Error('Public key must be 64 hex characters (32 bytes)');
    }
    this.authorPubkeyHex = pubkeyHex;
  }

  /**
   * Set whether to use testnet difficulty.
   *
   * @param isTestnet - True for testnet (lower difficulty), false for mainnet
   */
  setTestnetMode(isTestnet: boolean): void {
    this.isTestnet = isTestnet;
  }

  /**
   * Calculate engagement priority (0-1, higher = more urgent).
   *
   * Formula:
   *   priority = (heatUrgency * 0.5) + (replyValue * 0.3) + (poolProgress * 0.2)
   *
   * where:
   *   heatUrgency = (AUTO_ENGAGE_THRESHOLD - heat) / AUTO_ENGAGE_THRESHOLD
   *   replyValue = min(1, log10(replyCount + 1) / 3)
   *   poolProgress = currentSeconds / requiredSeconds
   *
   * @param content - Content to calculate priority for
   * @returns Priority score between 0 and 1
   */
  calculatePriority(content: AtRiskContent): number {
    // Heat urgency: lower heat = higher urgency
    const heatUrgency = Math.max(
      0,
      (AUTO_ENGAGE_THRESHOLD - content.heat) / AUTO_ENGAGE_THRESHOLD
    );

    // Reply value: more replies = more valuable
    // log10(1) = 0, log10(10) = 1, log10(100) = 2, log10(1000) = 3
    const replyValue = Math.min(1, Math.log10(content.replyCount + 1) / 3);

    // Pool progress: closer to completion = higher priority
    const poolProgress =
      content.poolStatus.currentSeconds / content.poolStatus.requiredSeconds;

    return heatUrgency * 0.5 + replyValue * 0.3 + poolProgress * 0.2;
  }

  /**
   * Determine if content should be auto-engaged based on policy.
   *
   * @param content - Content to check
   * @param policy - Policy for the content's space
   * @returns Whether to auto-engage
   */
  shouldAutoEngage(content: AtRiskContent, policy: ArchiverPolicy): boolean {
    // Check policy allows auto-engage
    if (!policy.autoEngage) return false;

    // Check content is below threshold
    if (content.heat >= AUTO_ENGAGE_THRESHOLD) return false;

    // Check pool isn't already complete
    if (
      content.poolStatus.currentSeconds >= content.poolStatus.requiredSeconds
    ) {
      return false;
    }

    return true;
  }

  /**
   * Get queue of content to engage, sorted by priority (highest first).
   *
   * @param atRisk - At-risk content
   * @param policies - Policies by space ID
   * @returns Sorted queue of content to engage
   */
  getEngagementQueue(
    atRisk: AtRiskContent[],
    policies: Map<SpaceId, ArchiverPolicy>
  ): AtRiskContent[] {
    return atRisk
      .filter((c) => {
        const policy = policies.get(c.spaceId);
        return policy && this.shouldAutoEngage(c, policy);
      })
      .sort((a, b) => this.calculatePriority(b) - this.calculatePriority(a));
  }

  /**
   * Engage with content by contributing PoW.
   *
   * Uses real Argon2id PoW mining via @swimchain/react.
   *
   * @param content - Content to engage with
   * @param seconds - Seconds of PoW to contribute (used for budget tracking)
   * @param onProgress - Optional progress callback
   * @returns Result of the engagement
   */
  async engage(
    content: AtRiskContent,
    seconds: number,
    onProgress?: EngagementProgressCallback
  ): Promise<EngagementResult> {
    if (this.isEngaging) {
      return {
        success: false,
        secondsContributed: 0,
        newPoolStatus: content.poolStatus,
        error: 'Engagement already in progress',
      };
    }

    if (!this.authorPubkeyHex) {
      return {
        success: false,
        secondsContributed: 0,
        newPoolStatus: content.poolStatus,
        error: 'Author public key not set. Call setAuthorPubkey() first.',
      };
    }

    if (!this.canEngage(seconds)) {
      return {
        success: false,
        secondsContributed: 0,
        newPoolStatus: content.poolStatus,
        error: 'Daily budget exceeded',
      };
    }

    this.isEngaging = true;
    this.isCancelled = false;

    try {
      console.log(
        `[AutoEngageEngine] Mining PoW for ${content.postHash} (${this.isTestnet ? 'testnet' : 'mainnet'} difficulty)`
      );

      // Mine real Argon2id PoW
      const powResult = await mineEngagementPow(
        content.postHash,
        this.authorPubkeyHex,
        this.isTestnet,
        onProgress,
        () => this.isCancelled
      );

      console.log(
        `[AutoEngageEngine] PoW complete: ${powResult.attempts} attempts in ${powResult.elapsedMs}ms`
      );

      // Record the engagement (using budget seconds, not actual mining time)
      this.recordEngagement(seconds);

      // Calculate new pool status
      const newCurrentSeconds = Math.min(
        content.poolStatus.requiredSeconds,
        content.poolStatus.currentSeconds + seconds
      );

      return {
        success: true,
        secondsContributed: seconds,
        newPoolStatus: {
          ...content.poolStatus,
          currentSeconds: newCurrentSeconds,
          contributorCount: content.poolStatus.contributorCount + 1,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Don't treat cancellation as an error
      if (errorMessage === 'Mining cancelled') {
        return {
          success: false,
          secondsContributed: 0,
          newPoolStatus: content.poolStatus,
          error: 'Engagement cancelled',
        };
      }

      return {
        success: false,
        secondsContributed: 0,
        newPoolStatus: content.poolStatus,
        error: errorMessage,
      };
    } finally {
      this.isEngaging = false;
      this.isCancelled = false;
    }
  }

  /**
   * Cancel the current engagement mining.
   */
  cancelEngagement(): void {
    if (this.isEngaging) {
      this.isCancelled = true;
      console.log('[AutoEngageEngine] Cancellation requested');
    }
  }

  /**
   * Check if budget allows engagement.
   *
   * @param seconds - Seconds of PoW to check
   * @returns Whether the engagement is within budget
   */
  canEngage(seconds: number): boolean {
    this.resetDailyBudgetIfNeeded();
    return this.dailyBudgetUsed + seconds <= this.dailyBudgetLimit;
  }

  /**
   * Record a PoW contribution.
   *
   * @param seconds - Seconds of PoW contributed
   */
  recordEngagement(seconds: number): void {
    this.dailyBudgetUsed += seconds;
    this.persistBudgetState();
    this.notifyBudgetSubscribers();
  }

  /**
   * Get remaining daily budget in seconds.
   */
  getRemainingBudget(): number {
    this.resetDailyBudgetIfNeeded();
    return Math.max(0, this.dailyBudgetLimit - this.dailyBudgetUsed);
  }

  /**
   * Get used budget in seconds.
   */
  getUsedBudget(): number {
    this.resetDailyBudgetIfNeeded();
    return this.dailyBudgetUsed;
  }

  /**
   * Get daily budget limit in seconds.
   */
  getBudgetLimit(): number {
    return this.dailyBudgetLimit;
  }

  /**
   * Set daily budget limit in seconds.
   */
  setBudgetLimit(seconds: number): void {
    this.dailyBudgetLimit = Math.max(0, seconds);
    this.persistBudgetState();
  }

  /**
   * Get current budget state.
   */
  getBudgetState(): BudgetState {
    this.resetDailyBudgetIfNeeded();
    return {
      used: this.dailyBudgetUsed,
      date: this.lastResetDate,
      limit: this.dailyBudgetLimit,
    };
  }

  /**
   * Check whether an engagement is currently in progress.
   */
  isEngagementInProgress(): boolean {
    return this.isEngaging;
  }

  /**
   * Subscribe to budget state updates.
   *
   * @param callback - Function to call with updated budget state
   * @returns Unsubscribe function
   */
  subscribeToBudget(callback: BudgetSubscriber): () => void {
    this.budgetSubscribers.add(callback);

    // Immediately notify with current state
    callback(this.getBudgetState());

    return () => {
      this.budgetSubscribers.delete(callback);
    };
  }

  /**
   * Notify all budget subscribers with current state.
   */
  private notifyBudgetSubscribers(): void {
    const state = this.getBudgetState();
    this.budgetSubscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.error('[AutoEngageEngine] Error in budget subscriber:', error);
      }
    });
  }

  /**
   * Check and reset daily budget if needed.
   * Reset happens at midnight UTC.
   */
  private resetDailyBudgetIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0] ?? ''; // YYYY-MM-DD UTC

    if (this.lastResetDate !== today) {
      console.log(
        `[AutoEngageEngine] Resetting daily budget. Previous: ${this.lastResetDate}, New: ${today}`
      );
      this.dailyBudgetUsed = 0;
      this.lastResetDate = today;
      this.persistBudgetState();
      this.notifyBudgetSubscribers();
    }
  }

  /**
   * Load budget state from localStorage.
   */
  private loadBudgetState(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BUDGET);
      if (saved) {
        const state = JSON.parse(saved) as BudgetState;
        this.dailyBudgetUsed = state.used;
        this.lastResetDate = state.date;
        this.dailyBudgetLimit = state.limit;
      }
    } catch (error) {
      console.error('[AutoEngageEngine] Error loading budget state:', error);
    }

    // Always check if we need to reset
    this.resetDailyBudgetIfNeeded();
  }

  /**
   * Persist budget state to localStorage.
   */
  private persistBudgetState(): void {
    const state: BudgetState = {
      used: this.dailyBudgetUsed,
      date: this.lastResetDate,
      limit: this.dailyBudgetLimit,
    };

    try {
      localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(state));
    } catch (error) {
      console.error('[AutoEngageEngine] Error saving budget state:', error);
    }
  }
}

/**
 * Singleton instance for shared use.
 */
let _instance: AutoEngageEngine | null = null;

export function getAutoEngageEngine(): AutoEngageEngine {
  if (!_instance) {
    _instance = new AutoEngageEngine();
  }
  return _instance;
}
