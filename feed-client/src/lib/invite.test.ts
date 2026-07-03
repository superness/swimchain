/**
 * Invite token round-trip tests (SWIM-INV-2)
 */

import { describe, it, expect } from 'vitest';
import {
  encodeInviteToken,
  decodeInviteToken,
  buildInviteUrl,
  extractInviteToken,
  parseInviteInput,
  type InvitePayload,
} from './invite';

const SAMPLE: InvitePayload = {
  v: 1,
  offer_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  sponsor: '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
  net: 'testnet',
};

describe('invite token', () => {
  it('round-trips encode -> decode', () => {
    const token = encodeInviteToken(SAMPLE);
    const decoded = decodeInviteToken(token);
    expect(decoded).toEqual(SAMPLE);
  });

  it('produces a URL-safe token (no +, /, =, #)', () => {
    const token = encodeInviteToken(SAMPLE);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('round-trips through the full invite URL', () => {
    const token = encodeInviteToken(SAMPLE);
    const url = buildInviteUrl(token);
    expect(url).toBe(`https://swimchain.io/i/#${token}`);
    const decoded = parseInviteInput(url);
    expect(decoded).toEqual(SAMPLE);
  });

  it('accepts a bare token pasted directly', () => {
    const token = encodeInviteToken(SAMPLE);
    expect(parseInviteInput(token)).toEqual(SAMPLE);
    expect(parseInviteInput(`  ${token}  `)).toEqual(SAMPLE);
  });

  it('accepts the #invite=<token> deep-link form', () => {
    const token = encodeInviteToken(SAMPLE);
    expect(extractInviteToken(`#invite=${token}`)).toBe(token);
    expect(parseInviteInput(`#invite=${token}`)).toEqual(SAMPLE);
  });

  it('returns null for empty input', () => {
    expect(parseInviteInput('')).toBeNull();
    expect(parseInviteInput('   ')).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(() => parseInviteInput('not a real token!!!')).toThrow();
    expect(() => decodeInviteToken('aGVsbG8')).toThrow(); // "hello" - valid b64, not JSON
  });

  it('rejects unsupported versions', () => {
    const json = JSON.stringify({ v: 2, offer_id: 'x', sponsor: 'y', net: 'testnet' });
    const token = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeInviteToken(token)).toThrow(/version/i);
  });

  it('rejects payloads with missing fields', () => {
    const json = JSON.stringify({ v: 1, offer_id: 'abc' });
    const token = btoa(json).replace(/=+$/, '');
    expect(() => decodeInviteToken(token)).toThrow(/missing fields/i);
  });
});
