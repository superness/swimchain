import { describe, it, expect } from 'vitest';
import { selectIdentityMode } from './identityMode';

describe('selectIdentityMode', () => {
  it('returns "browser" when not in an iframe (standalone tab), regardless of config', () => {
    expect(selectIdentityMode(null, false)).toBe('browser');
    expect(selectIdentityMode({ nodeAddress: 'cs1abc' }, false)).toBe('browser');
  });

  it('returns "pending" when embedded but the parent config has not arrived yet', () => {
    expect(selectIdentityMode(null, true)).toBe('pending');
    expect(selectIdentityMode(undefined, true)).toBe('pending');
  });

  it('returns "node" when embedded with a config that carries a node address', () => {
    expect(selectIdentityMode({ nodeAddress: 'cs1nodeaddress' }, true)).toBe('node');
  });

  it('returns "browser" when embedded but the config has no node address', () => {
    expect(selectIdentityMode({}, true)).toBe('browser');
    expect(selectIdentityMode({ nodeAddress: '' }, true)).toBe('browser');
    expect(selectIdentityMode({ nodeDisplayName: 'Someone' }, true)).toBe('browser');
  });
});
