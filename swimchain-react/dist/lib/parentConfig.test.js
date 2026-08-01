// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { subscribeParentConfig, getParentConfig } from './parentConfig';
// The module listener attaches at import time (this file's first import of
// parentConfig above), before any test body runs — mirroring how the shell can post
// SWIMCHAIN_RPC_CONFIG before a React provider's effect subscribes (shell.mjs:377
// posts on frame `load`, which can beat React's post-commit effect).
function postTrustedConfig(data) {
    window.dispatchEvent(new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: window,
    }));
}
describe('subscribeParentConfig', () => {
    it('no config yet: subscribing does not replay (nothing to replay)', () => {
        expect(getParentConfig()).toBeNull();
        let calls = 0;
        const unsubscribe = subscribeParentConfig(() => {
            calls += 1;
        });
        expect(calls).toBe(0);
        unsubscribe();
    });
    it('replay-on-subscribe: a subscriber that attaches AFTER the config already arrived is notified synchronously', () => {
        postTrustedConfig({
            type: 'SWIMCHAIN_RPC_CONFIG',
            rpcEndpoint: 'http://127.0.0.1:9736',
            rpcAuth: 'Basic x',
            nodeAddress: 'cs1abc',
        });
        expect(getParentConfig()).not.toBeNull();
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