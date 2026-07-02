/**
 * EchoTracker unit tests
 *
 * Covers loop prevention: forward and reverse lookups, TTL expiry,
 * platform-scoped keys, and cleanup. Time is faked; no real waiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EchoTracker } from '../src/services/EchoTracker';

const TTL = 1000;

let tracker: EchoTracker;

beforeEach(() => {
  vi.useFakeTimers();
  tracker = new EchoTracker(TTL);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EchoTracker', () => {
  it('tracks bridged messages by platform and id', () => {
    tracker.markBridged('irc', 'msg-1', 'sha256:target');
    expect(tracker.isBridged('irc', 'msg-1')).toBe(true);
    expect(tracker.isBridged('irc', 'msg-2')).toBe(false);
  });

  it('scopes keys by platform (same id on another platform is distinct)', () => {
    tracker.markBridged('irc', 'msg-1', 'sha256:target');
    expect(tracker.isBridged('matrix', 'msg-1')).toBe(false);
    expect(tracker.isBridged('cs', 'msg-1')).toBe(false);
  });

  it('detects reverse bridging via wasBridgedTo (O(1) reverse index)', () => {
    tracker.markBridged('matrix', 'event-1', 'sha256:posted');
    expect(tracker.wasBridgedTo('sha256:posted')).toBe(true);
    expect(tracker.wasBridgedTo('sha256:other')).toBe(false);
  });

  it('expires entries after the TTL (forward lookup)', () => {
    tracker.markBridged('irc', 'msg-1', 'sha256:target');
    vi.advanceTimersByTime(TTL); // exactly at TTL: still valid (> comparison)
    expect(tracker.isBridged('irc', 'msg-1')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tracker.isBridged('irc', 'msg-1')).toBe(false);
  });

  it('expires entries after the TTL (reverse lookup)', () => {
    tracker.markBridged('irc', 'msg-1', 'sha256:target');
    vi.advanceTimersByTime(TTL + 1);
    expect(tracker.wasBridgedTo('sha256:target')).toBe(false);
    // Second lookup after cleanup of the stale reverse index entry
    expect(tracker.wasBridgedTo('sha256:target')).toBe(false);
  });

  it('getEntry returns the target id and expires with the TTL', () => {
    tracker.markBridged('cs', 'sha256:post', 'irc:#chan:1');
    expect(tracker.getEntry('cs', 'sha256:post')?.targetId).toBe('irc:#chan:1');
    vi.advanceTimersByTime(TTL + 1);
    expect(tracker.getEntry('cs', 'sha256:post')).toBeUndefined();
  });

  it('cleanup drops only expired entries', () => {
    tracker.markBridged('irc', 'old', 'sha256:old');
    vi.advanceTimersByTime(TTL / 2);
    tracker.markBridged('irc', 'new', 'sha256:new');
    vi.advanceTimersByTime(TTL / 2 + 1); // 'old' expired, 'new' still fresh

    expect(tracker.size()).toBe(1);
    expect(tracker.isBridged('irc', 'new')).toBe(true);
    expect(tracker.wasBridgedTo('sha256:old')).toBe(false);
    expect(tracker.wasBridgedTo('sha256:new')).toBe(true);
  });

  it('clear removes everything including the reverse index', () => {
    tracker.markBridged('irc', 'a', 'sha256:a');
    tracker.markBridged('matrix', 'b', 'sha256:b');
    tracker.clear();
    expect(tracker.size()).toBe(0);
    expect(tracker.isBridged('irc', 'a')).toBe(false);
    expect(tracker.wasBridgedTo('sha256:b')).toBe(false);
  });
});
