/**
 * ChallengeManager - Handles PoW challenge lifecycle
 * Manages challenge fetching, expiry detection, and refresh
 * Per SPEC_03: 10-minute challenge expiry
 */

import {
  CHALLENGE_EXPIRY_SECS,
  CHALLENGE_REFRESH_THRESHOLD,
  MAX_POW_RETRIES,
  REJECTION_REASONS,
} from '../constants/protocol';

// Action types that require PoW
export type ActionType = 'post' | 'reply' | 'engage';

// PoW Challenge from network
export interface PoWChallenge {
  id: string;
  challenge: Uint8Array;
  difficulty: number;
  expiresAt: number; // Unix timestamp ms
}

// Internal challenge state
interface ChallengeState {
  challenge: PoWChallenge;
  fetchedAt: number;
}

// Challenge fetch callback type
export type ChallengeFetcher = (
  actionType: ActionType,
  contentHash: Uint8Array
) => Promise<PoWChallenge>;

/**
 * ChallengeManager - Manages PoW challenge lifecycle
 */
export class ChallengeManager {
  private currentChallenge: ChallengeState | null = null;
  private fetcher: ChallengeFetcher | null = null;
  private refreshCheckInterval: ReturnType<typeof setInterval> | null = null;
  private onExpiryWarning: ((timeRemaining: number) => void) | null = null;

  /**
   * Set the challenge fetcher function
   */
  setFetcher(fetcher: ChallengeFetcher): void {
    this.fetcher = fetcher;
  }

  /**
   * Set callback for expiry warnings
   */
  setExpiryWarningCallback(callback: (timeRemaining: number) => void): void {
    this.onExpiryWarning = callback;
  }

  /**
   * Fetch a new challenge from the network
   */
  async fetchChallenge(
    actionType: ActionType,
    contentHash: Uint8Array
  ): Promise<PoWChallenge> {
    if (!this.fetcher) {
      throw new Error('Challenge fetcher not configured');
    }

    const challenge = await this.fetcher(actionType, contentHash);

    this.currentChallenge = {
      challenge,
      fetchedAt: Date.now(),
    };

    return challenge;
  }

  /**
   * Get current challenge or fetch new one if needed
   */
  async getChallenge(
    actionType: ActionType,
    contentHash: Uint8Array
  ): Promise<PoWChallenge> {
    if (this.shouldRefresh()) {
      return this.fetchChallenge(actionType, contentHash);
    }
    return this.currentChallenge!.challenge;
  }

  /**
   * Check if challenge should be refreshed (approaching expiry)
   */
  shouldRefresh(): boolean {
    if (!this.currentChallenge) return true;

    const elapsed = Date.now() - this.currentChallenge.fetchedAt;
    const thresholdMs = CHALLENGE_EXPIRY_SECS * CHALLENGE_REFRESH_THRESHOLD * 1000;

    return elapsed > thresholdMs;
  }

  /**
   * Check if challenge has expired
   */
  isExpired(): boolean {
    if (!this.currentChallenge) return true;
    return Date.now() > this.currentChallenge.challenge.expiresAt;
  }

  /**
   * Get time remaining until expiry (ms)
   */
  getTimeRemaining(): number {
    if (!this.currentChallenge) return 0;
    return Math.max(0, this.currentChallenge.challenge.expiresAt - Date.now());
  }

  /**
   * Get time until refresh threshold (ms)
   */
  getTimeUntilRefreshNeeded(): number {
    if (!this.currentChallenge) return 0;

    const thresholdMs = CHALLENGE_EXPIRY_SECS * CHALLENGE_REFRESH_THRESHOLD * 1000;
    const elapsed = Date.now() - this.currentChallenge.fetchedAt;

    return Math.max(0, thresholdMs - elapsed);
  }

  /**
   * Check if there's enough time remaining before starting mining
   * Returns info about whether mining should proceed
   */
  validateBeforeMining(estimatedMiningTimeMs: number): {
    canProceed: boolean;
    timeRemaining: number;
    reason?: string;
  } {
    const timeRemaining = this.getTimeRemaining();
    // Require at least 2 minutes buffer beyond estimated mining time
    const minimumBufferMs = 120000; // 2 minutes
    const requiredTime = estimatedMiningTimeMs + minimumBufferMs;

    if (timeRemaining < requiredTime) {
      return {
        canProceed: false,
        timeRemaining,
        reason: timeRemaining < minimumBufferMs
          ? 'Challenge expires too soon. Please refresh and try again.'
          : `Not enough time. Mining takes ~${Math.round(estimatedMiningTimeMs / 1000)}s but only ${Math.round(timeRemaining / 1000)}s remaining.`,
      };
    }

    return {
      canProceed: true,
      timeRemaining,
    };
  }

  /**
   * Start monitoring for expiry during mining
   */
  startExpiryMonitoring(checkIntervalMs: number = 30000): void {
    this.stopExpiryMonitoring();

    this.refreshCheckInterval = setInterval(() => {
      if (this.shouldRefresh() && this.onExpiryWarning) {
        this.onExpiryWarning(this.getTimeRemaining());
      }
    }, checkIntervalMs);
  }

  /**
   * Stop expiry monitoring
   */
  stopExpiryMonitoring(): void {
    if (this.refreshCheckInterval) {
      clearInterval(this.refreshCheckInterval);
      this.refreshCheckInterval = null;
    }
  }

  /**
   * Handle submission rejection and determine if retry is needed
   * Returns user-friendly messages with actionable recovery steps
   */
  handleRejection(reason: number): {
    shouldRetry: boolean;
    needsNewChallenge: boolean;
    message: string;
    userMessage: string;
    recoveryStep: string;
  } {
    switch (reason) {
      case REJECTION_REASONS.EXPIRED_CHALLENGE:
        return {
          shouldRetry: true,
          needsNewChallenge: true,
          message: 'Challenge expired. Fetching new challenge...',
          userMessage: 'Your mining proof expired before submission.',
          recoveryStep: 'We\'ll automatically retry with a fresh challenge. This may take a minute.',
        };

      case REJECTION_REASONS.INVALID_HASH:
        return {
          shouldRetry: true,
          needsNewChallenge: true,
          message: 'Invalid hash. Retrying with new challenge...',
          userMessage: 'The proof-of-work result was invalid.',
          recoveryStep: 'Retrying automatically. If this persists, try restarting the app.',
        };

      case REJECTION_REASONS.INVALID_SIGNATURE:
        return {
          shouldRetry: false,
          needsNewChallenge: false,
          message: 'Invalid signature. Please check your identity.',
          userMessage: 'Your identity signature could not be verified.',
          recoveryStep: 'Go to Settings > Identity to verify or restore your identity.',
        };

      case REJECTION_REASONS.INSUFFICIENT_DIFFICULTY:
        return {
          shouldRetry: true,
          needsNewChallenge: true,
          message: 'Difficulty too low. Fetching new challenge...',
          userMessage: 'The network requires more proof-of-work.',
          recoveryStep: 'Fetching updated requirements. Mining will resume shortly.',
        };

      default:
        return {
          shouldRetry: false,
          needsNewChallenge: false,
          message: `Unknown rejection reason: ${reason}`,
          userMessage: 'Your submission was rejected by the network.',
          recoveryStep: 'Please try again. If this persists, check your network connection.',
        };
    }
  }

  /**
   * Clear current challenge
   */
  clear(): void {
    this.currentChallenge = null;
    this.stopExpiryMonitoring();
  }

  /**
   * Get challenge info for display
   */
  getChallengeInfo(): {
    hasChallenge: boolean;
    difficulty: number;
    timeRemaining: number;
    shouldRefresh: boolean;
  } {
    return {
      hasChallenge: this.currentChallenge !== null,
      difficulty: this.currentChallenge?.challenge.difficulty ?? 0,
      timeRemaining: this.getTimeRemaining(),
      shouldRefresh: this.shouldRefresh(),
    };
  }
}

// Singleton instance
export const challengeManager = new ChallengeManager();

export default challengeManager;
