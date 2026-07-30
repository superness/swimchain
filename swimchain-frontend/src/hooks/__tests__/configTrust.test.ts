import { describe, it, expect } from 'vitest';
import { isConfigMessageTrusted, mergeTrustedConfig } from '../configTrust';

const SELF = 'http://localhost:5173';
const parent = {};
const sibling = {};
const ctx = { selfOrigin: SELF, parentWindow: parent };

describe('isConfigMessageTrusted', () => {
  it('trusts an exact same-origin message from the real parent window', () => {
    expect(isConfigMessageTrusted({ origin: SELF, source: parent }, ctx)).toBe(true);
  });
  it('trusts the enumerated Tauri shell origins from the parent', () => {
    for (const o of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'])
      expect(isConfigMessageTrusted({ origin: o, source: parent }, ctx)).toBe(true);
  });
  it('rejects a prefix-lookalike origin', () => {   // §7
    expect(isConfigMessageTrusted({ origin: 'http://localhost.evil.com', source: parent }, ctx)).toBe(false);
    expect(isConfigMessageTrusted({ origin: 'http://tauri.localhost.evil.com', source: parent }, ctx)).toBe(false);
  });
  it('rejects a message whose source is not window.parent', () => {   // §7
    expect(isConfigMessageTrusted({ origin: SELF, source: sibling }, ctx)).toBe(false);
    expect(isConfigMessageTrusted({ origin: SELF, source: null }, ctx)).toBe(false);
  });
  it('rejects an empty origin', () => {
    expect(isConfigMessageTrusted({ origin: '', source: parent }, ctx)).toBe(false);
  });
});

describe('mergeTrustedConfig (endpoint-keyed first-wins)', () => {
  const base = { rpcEndpoint: 'http://127.0.0.1:9736', rpcAuth: 'Basic x', nodeAddress: '', nodeDisplayName: '' };
  it('accepts the first config', () => {
    expect(mergeTrustedConfig(null, base)).toBe(base);
  });
  it('fills an empty nodeAddress from a later same-endpoint message (launcher node-mode flip)', () => {
    const later = { ...base, nodeAddress: 'cs1abc', nodeDisplayName: 'Alice' };
    const merged = mergeTrustedConfig(base, later);
    expect(merged.nodeAddress).toBe('cs1abc');
    expect(merged.nodeDisplayName).toBe('Alice');
    expect(merged.rpcEndpoint).toBe(base.rpcEndpoint);
  });
  it('never overwrites an already-set nodeAddress', () => {
    const first = { ...base, nodeAddress: 'cs1first' };
    const later = { ...base, nodeAddress: 'cs1second' };
    expect(mergeTrustedConfig(first, later).nodeAddress).toBe('cs1first');
  });
  it('REFUSES a repoint: a later message changing rpcEndpoint or rpcAuth is dropped', () => {   // §7 + the security property
    expect(mergeTrustedConfig(base, { ...base, rpcEndpoint: 'http://attacker.test' })).toBe(base);
    expect(mergeTrustedConfig(base, { ...base, rpcAuth: 'Basic evil' })).toBe(base);
  });
  it('REFUSES a repoint even when bundled with a nodeAddress fill (the repoint guard must reject the whole message, not just the endpoint)', () => {
    const merged = mergeTrustedConfig(base, { ...base, rpcEndpoint: 'http://attacker.test', nodeAddress: 'cs1evil' });
    expect(merged).toBe(base);
    expect(merged.nodeAddress).toBe('');
  });
});
