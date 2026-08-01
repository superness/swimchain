/**
 * SwimchainRpc.call auth-header precedence (Surf C2a Task 2, Step 1).
 *
 * `signatureAuth` (X-CS-* transport) > `authHeader` (raw `Authorization`, the
 * node-identity cookie handed over via SWIMCHAIN_RPC_CONFIG) > `auth`
 * (Basic username/password, browser-mode fallback). This file only exercises
 * the authHeader/auth branches — signatureAuth is covered by never being set
 * (the class defaults `signatureAuth` to null until `setSignatureAuth` is
 * called), so no crypto.subtle/WebCrypto setup is needed here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwimchainRpc } from './rpc';
function fakeFetch() {
    return vi.fn(async (_input, _init) => new Response(JSON.stringify({
        jsonrpc: '2.0',
        result: { ok: true },
        id: 1,
    }), { status: 200, statusText: 'OK' }));
}
function headersOf(fetchMock, callIndex = 0) {
    const init = fetchMock.mock.calls[callIndex]?.[1];
    return (init?.headers ?? {});
}
describe('SwimchainRpc.call — Authorization header', () => {
    let fetchMock;
    beforeEach(() => {
        fetchMock = fakeFetch();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });
    it('emits config.authHeader verbatim as Authorization (no re-encoding)', async () => {
        const rpc = new SwimchainRpc({
            endpoint: 'http://node.example/rpc',
            // Already a complete header value (e.g. 'Basic base64(__cookie__:hex)')
            // — must be emitted raw, not re-wrapped in another `Basic ${btoa(...)}`.
            authHeader: 'Basic __cookie__:deadbeef-not-base64',
        });
        await rpc.call('get_info');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(headersOf(fetchMock)['Authorization']).toBe('Basic __cookie__:deadbeef-not-base64');
    });
    it('falls back to Basic auth from config.auth when authHeader is not set', async () => {
        const rpc = new SwimchainRpc({
            endpoint: 'http://node.example/rpc',
            auth: { username: '__cookie__', password: 'deadbeef' },
        });
        await rpc.call('get_info');
        expect(headersOf(fetchMock)['Authorization']).toBe(`Basic ${btoa('__cookie__:deadbeef')}`);
    });
    it('authHeader takes precedence over auth when both are set', async () => {
        const rpc = new SwimchainRpc({
            endpoint: 'http://node.example/rpc',
            authHeader: 'Basic raw-header-wins',
            auth: { username: 'should-be-ignored', password: 'should-be-ignored' },
        });
        await rpc.call('get_info');
        expect(headersOf(fetchMock)['Authorization']).toBe('Basic raw-header-wins');
    });
    it('signatureAuth takes precedence over authHeader when both are configured', async () => {
        const rpc = new SwimchainRpc({
            endpoint: 'http://node.example/rpc',
            authHeader: 'Basic should-be-ignored',
        });
        rpc.setSignatureAuth({
            publicKey: 'deadbeef'.repeat(8),
            sign: () => new Uint8Array(64).fill(1),
        });
        await rpc.call('get_info');
        const headers = headersOf(fetchMock);
        expect(headers['X-CS-Identity']).toBe('deadbeef'.repeat(8));
        expect(headers['Authorization']).toBeUndefined();
    });
    it('emits no Authorization header when neither authHeader nor auth is set', async () => {
        const rpc = new SwimchainRpc({ endpoint: 'http://node.example/rpc' });
        await rpc.call('get_info');
        expect(headersOf(fetchMock)['Authorization']).toBeUndefined();
    });
});
//# sourceMappingURL=rpc.test.js.map