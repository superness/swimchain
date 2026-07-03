import { describe, it, expect } from 'vitest';
import { selectIdentityMode } from './identityMode';

describe('selectIdentityMode', () => {
  it('standalone tab (not in an iframe) uses the browser keypair', () => {
    expect(selectIdentityMode(null, false)).toBe('browser');
    // Even if a config somehow exists, not being embedded means browser mode.
    expect(selectIdentityMode({ nodeAddress: 'cs1abc' }, false)).toBe('browser');
  });

  it('embedded but no parent config yet stays pending (shell posts config async)', () => {
    expect(selectIdentityMode(null, true)).toBe('pending');
    expect(selectIdentityMode(undefined, true)).toBe('pending');
  });

  it('embedded with a shared node address adopts the node identity', () => {
    expect(selectIdentityMode({ nodeAddress: 'cs1abc', nodeDisplayName: 'Alice' }, true)).toBe(
      'node',
    );
    expect(selectIdentityMode({ nodeAddress: 'cs1xyz' }, true)).toBe('node');
  });

  it('embedded but the shell withheld the node address falls back to browser', () => {
    // Parent config present (rpc endpoint/auth) but no identity shared.
    expect(selectIdentityMode({}, true)).toBe('browser');
    expect(selectIdentityMode({ nodeAddress: '' }, true)).toBe('browser');
    expect(selectIdentityMode({ nodeDisplayName: 'Alice' }, true)).toBe('browser');
  });
});
