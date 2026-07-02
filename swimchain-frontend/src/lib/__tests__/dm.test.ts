/**
 * Tests for Direct Message (DM) utilities
 *
 * Tests deterministic DM space ID generation and DM helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  getDMSpaceId,
  isDMSpace,
  getDMSpaceName,
  canInitiateDM,
  getDMStatusText,
  getDMAction,
  DMStatus,
} from '../dm';

describe('getDMSpaceId', () => {
  it('should produce deterministic IDs from two public keys', () => {
    const pk1 = 'aabbccddee' + '1'.repeat(42);
    const pk2 = '1122334455' + '2'.repeat(42);
    const id1 = getDMSpaceId(pk1, pk2);
    const id2 = getDMSpaceId(pk1, pk2);
    expect(id1).toBe(id2);
  });

  it('should be commutative (A,B === B,A)', () => {
    const pk1 = 'aaaa1111' + 'a'.repeat(44);
    const pk2 = 'bbbb2222' + 'b'.repeat(44);
    const ab = getDMSpaceId(pk1, pk2);
    const ba = getDMSpaceId(pk2, pk1);
    expect(ab).toBe(ba);
  });

  it('should produce 32-character hex (16 bytes)', () => {
    const pk1 = '01020304' + 'f'.repeat(44);
    const pk2 = '05060708' + 'e'.repeat(44);
    const id = getDMSpaceId(pk1, pk2);
    expect(id.length).toBe(32);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it('should produce different IDs for different key pairs', () => {
    const pk1 = 'aaa' + '1'.repeat(45);
    const pk2a = 'bbb' + '2'.repeat(45);
    const pk2b = 'ccc' + '3'.repeat(45);
    const idA = getDMSpaceId(pk1, pk2a);
    const idB = getDMSpaceId(pk1, pk2b);
    expect(idA).not.toBe(idB);
  });

  it('should be case-insensitive', () => {
    const pk1 = 'AAaa1111' + 'f'.repeat(44);
    const pk2 = 'BBbb2222' + 'e'.repeat(44);
    const upper = getDMSpaceId(pk1.toUpperCase(), pk2.toUpperCase());
    const lower = getDMSpaceId(pk1.toLowerCase(), pk2.toLowerCase());
    const mixed = getDMSpaceId(pk1, pk2);
    expect(upper).toBe(lower);
    expect(lower).toBe(mixed);
  });
});

describe('isDMSpace', () => {
  it('should return true for a valid DM space', () => {
    const pk1 = '11112222' + 'a'.repeat(44);
    const pk2 = '33334444' + 'b'.repeat(44);
    const spaceId = getDMSpaceId(pk1, pk2);
    expect(isDMSpace(spaceId, pk1, pk2)).toBe(true);
    expect(isDMSpace(spaceId, pk2, pk1)).toBe(true);
  });

  it('should return false for wrong key pair', () => {
    const pk1 = 'aaaa' + '1'.repeat(46);
    const pk2 = 'bbbb' + '2'.repeat(46);
    const pk3 = 'cccc' + '3'.repeat(46);
    const spaceId = getDMSpaceId(pk1, pk2);
    expect(isDMSpace(spaceId, pk1, pk3)).toBe(false);
  });
});

describe('getDMSpaceName', () => {
  it('should produce truncated address names', () => {
    const name = getDMSpaceName(
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      'deadbeef' + 'f'.repeat(48)
    );
    expect(name).toMatch(/^[a-f0-9.]+ <> [a-f0-9.]+$/);
    expect(name.length).toBeLessThan(40);
  });

  it('should handle short addresses', () => {
    const name = getDMSpaceName('abc', 'def');
    expect(name).toBe('abc <> def');
  });
});

describe('canInitiateDM', () => {
  it('should allow DM when none or declined', () => {
    expect(canInitiateDM('none')).toBe(true);
    expect(canInitiateDM('declined')).toBe(true);
  });

  it('should not allow DM when pending or active', () => {
    expect(canInitiateDM('pending_sent')).toBe(false);
    expect(canInitiateDM('pending_received')).toBe(false);
    expect(canInitiateDM('active')).toBe(false);
  });
});

describe('getDMStatusText', () => {
  it('should return display texts for all statuses', () => {
    expect(getDMStatusText('none')).toBe('Message');
    expect(getDMStatusText('pending_sent')).toBe('Request Pending');
    expect(getDMStatusText('pending_received')).toBe('Accept Request');
    expect(getDMStatusText('active')).toBe('Open Chat');
    expect(getDMStatusText('declined')).toBe('Message');
  });
});

describe('getDMAction', () => {
  it('should return correct actions for each status', () => {
    expect(getDMAction('none')).toBe('send_request');
    expect(getDMAction('declined')).toBe('send_request');
    expect(getDMAction('pending_received')).toBe('accept');
    expect(getDMAction('active')).toBe('open');
    expect(getDMAction('pending_sent')).toBe('none');
  });
});
