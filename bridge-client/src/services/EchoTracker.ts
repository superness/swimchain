/**
 * Echo Tracker Service
 *
 * Prevents message loops by tracking which messages have been bridged.
 */

import type { Platform, EchoEntry } from '../types';
import { ECHO_TTL_MS } from '../types/constants';

/**
 * Tracks bridged messages to prevent echo loops.
 */
export class EchoTracker {
  private seen = new Map<string, EchoEntry>();
  private reverseIndex = new Map<string, string>(); // targetId -> sourceKey for O(1) lookups
  private readonly ttlMs: number;

  constructor(ttlMs: number = ECHO_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Create a tracking key for a message.
   */
  private makeKey(platform: Platform, messageId: string): string {
    return `${platform}:${messageId}`;
  }

  /**
   * Mark a message as bridged.
   *
   * @param sourcePlatform - Platform the message came from
   * @param sourceMessageId - ID on source platform
   * @param targetId - ID on target platform
   */
  markBridged(
    sourcePlatform: Platform,
    sourceMessageId: string,
    targetId: string
  ): void {
    const key = this.makeKey(sourcePlatform, sourceMessageId);
    this.seen.set(key, {
      targetId,
      timestamp: Date.now(),
    });
    // Add reverse index for O(1) wasBridgedTo() lookups
    this.reverseIndex.set(targetId, key);
    this.cleanup();
  }

  /**
   * Check if a message has already been bridged.
   *
   * @param platform - Platform of the message
   * @param messageId - Message ID
   * @returns Whether the message was already bridged
   */
  isBridged(platform: Platform, messageId: string): boolean {
    const key = this.makeKey(platform, messageId);
    const entry = this.seen.get(key);

    if (!entry) return false;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.seen.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Check if a message was bridged TO a specific target.
   * Used to detect if an incoming message is actually a bridged message.
   * Uses reverse index for O(1) lookup instead of O(n) iteration.
   *
   * @param targetId - Target message ID to check
   * @returns Whether this target was a bridge destination
   */
  wasBridgedTo(targetId: string): boolean {
    const sourceKey = this.reverseIndex.get(targetId);
    if (!sourceKey) {
      return false;
    }

    const entry = this.seen.get(sourceKey);
    if (!entry) {
      // Clean up stale reverse index entry
      this.reverseIndex.delete(targetId);
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.seen.delete(sourceKey);
      this.reverseIndex.delete(targetId);
      return false;
    }

    return true;
  }

  /**
   * Get tracking info for a message.
   */
  getEntry(platform: Platform, messageId: string): EchoEntry | undefined {
    const key = this.makeKey(platform, messageId);
    const entry = this.seen.get(key);

    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.seen.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.seen) {
      if (now - entry.timestamp > this.ttlMs) {
        this.seen.delete(key);
        this.reverseIndex.delete(entry.targetId);
      }
    }
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.seen.clear();
    this.reverseIndex.clear();
  }

  /**
   * Get the number of tracked entries.
   */
  size(): number {
    this.cleanup();
    return this.seen.size;
  }
}

/**
 * Singleton instance.
 */
let _instance: EchoTracker | null = null;

export function getEchoTracker(): EchoTracker {
  if (!_instance) {
    _instance = new EchoTracker();
  }
  return _instance;
}
