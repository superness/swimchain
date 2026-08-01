// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { subscribeParentConfig, getParentConfig } from './parentConfig';
// The module listener attaches at import time (this file's first import of
// parentConfig above), before any test body runs — mirroring how the shell can post
// SWIMCHAIN_RPC_CONFIG before a React provider's effect subscribes (shell.mjs:377
// posts on frame `load`, which can beat React's post-commit effect).
//
// These tests drive the REAL listener registered by parentConfig.ts (via
// window.dispatchEvent), not a re-implementation of the trust check — the thing under
// test is the wiring at parentConfig.ts's `if (!isConfigMessageTrusted(...)) return;`
// gate, same as the module a real embedding frame talks to.
function postConfig(data, opts = {}) {
    const origin = opts.origin ?? window.location.origin;
    const source = 'source' in opts ? opts.source : window;
    window.dispatchEvent(new MessageEvent('message', {
        data,
        origin,
        source: source,
    }));
}
const VALID_CONFIG = {
    type: 'SWIMCHAIN_RPC_CONFIG',
    rpcEndpoint: 'http://127.0.0.1:9736',
    rpcAuth: 'Basic x',
    nodeAddress: 'cs1abc',
};
describe('parentConfig message listener', () => {
    it('no config yet: subscribing does not replay (nothing to replay)', () => {
        expect(getParentConfig()).toBeNull();
        let calls = 0;
        const unsubscribe = subscribeParentConfig(() => {
            calls += 1;
        });
        expect(calls).toBe(0);
        unsubscribe();
    });
    // --- Reject path: the one load-bearing security check in this file. A hostile
    // frame that isn't the real parent, or a lookalike origin, must never get its
    // config adopted — that would let it repoint every RPC call (including
    // sign_message) at an attacker. ---
    it('rejects a message from an untrusted origin (dropped, not adopted)', () => {
        postConfig(VALID_CONFIG, { origin: 'http://evil.test' });
        expect(getParentConfig()).toBeNull();
        // Nothing to replay either — the message was never accepted.
        let calls = 0;
        const unsubscribe = subscribeParentConfig(() => {
            calls += 1;
        });
        expect(calls).toBe(0);
        unsubscribe();
    });
    it('rejects a prefix-lookalike origin (exact match only, never startsWith/prefix)', () => {
        postConfig(VALID_CONFIG, { origin: `${window.location.origin}.evil.com` });
        expect(getParentConfig()).toBeNull();
    });
    it('rejects a message whose source is not window.parent (not sent by the real parent frame)', () => {
        postConfig(VALID_CONFIG, { source: {} });
        expect(getParentConfig()).toBeNull();
    });
    // --- Accept path, proven right after the rejects: the gate drops only the bad
    // messages — a genuinely trusted one still gets through. ---
    it('accepts a trusted message right after the rejects above', () => {
        postConfig(VALID_CONFIG);
        expect(getParentConfig()).not.toBeNull();
        expect(getParentConfig()?.nodeAddress).toBe('cs1abc');
    });
    it('replay-on-subscribe: a subscriber that attaches AFTER the config already arrived is notified synchronously', () => {
        // The singleton was already populated by the previous (accept-path) test.
        expect(getParentConfig()?.nodeAddress).toBe('cs1abc');
        // Subscribe only now — after the singleton was already populated. Without
        // replay-on-subscribe this callback would never fire and a consumer would hang
        // in 'pending' forever.
        let received;
        let calls = 0;
        const unsubscribe = subscribeParentConfig((config) => {
            calls += 1;
            received = config;
        });
        expect(calls).toBe(1);
        expect(received?.nodeAddress).toBe('cs1abc');
        unsubscribe();
    });
});
//# sourceMappingURL=parentConfig.test.js.map