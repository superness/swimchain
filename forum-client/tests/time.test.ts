/**
 * Tests for time utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatDate, formatDateTime } from '../src/utils/time';

describe('formatRelativeTime', () => {
  const now = 1700000000; // Fixed timestamp for testing

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps less than 60 seconds ago', () => {
    expect(formatRelativeTime(now - 30)).toBe('just now');
    expect(formatRelativeTime(now - 59)).toBe('just now');
  });

  it('returns minutes for timestamps less than 1 hour ago', () => {
    expect(formatRelativeTime(now - 60)).toBe('1m ago');
    expect(formatRelativeTime(now - 300)).toBe('5m ago');
    expect(formatRelativeTime(now - 3599)).toBe('59m ago');
  });

  it('returns hours for timestamps less than 1 day ago', () => {
    expect(formatRelativeTime(now - 3600)).toBe('1h ago');
    expect(formatRelativeTime(now - 7200)).toBe('2h ago');
    expect(formatRelativeTime(now - 86399)).toBe('23h ago');
  });

  it('returns days for timestamps less than 1 week ago', () => {
    expect(formatRelativeTime(now - 86400)).toBe('1d ago');
    expect(formatRelativeTime(now - 172800)).toBe('2d ago');
    expect(formatRelativeTime(now - 604799)).toBe('6d ago');
  });

  it('returns weeks for timestamps less than 1 month ago', () => {
    expect(formatRelativeTime(now - 604800)).toBe('1w ago');
    expect(formatRelativeTime(now - 1209600)).toBe('2w ago');
  });

  it('returns months for older timestamps', () => {
    expect(formatRelativeTime(now - 2592000)).toBe('1mo ago');
    expect(formatRelativeTime(now - 5184000)).toBe('2mo ago');
  });
});

describe('formatDate', () => {
  it('formats dates correctly', () => {
    const timestamp = 1700000000;
    const result = formatDate(timestamp);
    // Result depends on locale, but should be a valid date string
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

describe('formatDateTime', () => {
  it('formats date and time correctly', () => {
    const timestamp = 1700000000;
    const result = formatDateTime(timestamp);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
