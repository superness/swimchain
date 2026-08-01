import { jsx as _jsx } from "react/jsx-runtime";
// @vitest-environment happy-dom
/**
 * RpcProvider iframe-aware connect (Surf C2a Task 2, Step 2 — review finding #2).
 *
 * `parentConfig.ts`'s real `subscribeParentConfig` already replays the current
 * singleton synchronously on subscribe (see its docstring), which would mask a
 * missing mount read in THIS file: an implementation that only ever calls
 * `subscribeParentConfig` would still happen to connect immediately, because the
 * dependency papers over the bug. To test RpcProvider's own contract — "read
 * getParentConfig() directly at mount; don't rely on the subscribe callback firing
 * for a config that already arrived" — this file mocks `../lib/parentConfig` with a
 * deliberately NON-replaying `subscribeParentConfig` stub. Under that stub, the
 * ONLY way the config-already-arrived case can pass is a direct mount-time
 * `getParentConfig()` read, exactly what review finding #2 requires.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { RpcProvider, useRpc } from './useRpc';
import { LOCAL_TESTNET } from '../lib/rpc';
let mockParentConfig = null;
let mockListeners = [];
vi.mock('../lib/parentConfig', () => ({
    isInIframe: () => true,
    getParentConfig: () => mockParentConfig,
    // Deliberately non-replaying: registers the listener and nothing else. The
    // real module replays synchronously when a config is already present; this
    // stub does not, so this test only passes if RpcProvider itself reads
    // getParentConfig() at mount instead of depending on that replay.
    subscribeParentConfig: (fn) => {
        mockListeners.push(fn);
        return () => {
            mockListeners = mockListeners.filter((l) => l !== fn);
        };
    },
}));
function Probe() {
    const { connected, connecting } = useRpc();
    return _jsx("div", { "data-testid": "probe", children: connected ? 'connected' : connecting ? 'connecting' : 'idle' });
}
function fakeNodeInfoResponse() {
    return new Response(JSON.stringify({
        jsonrpc: '2.0',
        result: {
            version: '0.1.0',
            network: 'testnet',
            uptime_seconds: 0,
            peer_count: 0,
            block_height: 0,
            node_id: 'node',
            rpc_port: 1,
            p2p_port: 1,
        },
        id: 1,
    }), { status: 200, statusText: 'OK' });
}
function fakeFetch() {
    return vi.fn(async (_input, _init) => fakeNodeInfoResponse());
}
describe('RpcProvider — iframe config-already-arrived at mount (review finding #2)', () => {
    let fetchMock;
    beforeEach(() => {
        mockParentConfig = null;
        mockListeners = [];
        fetchMock = fakeFetch();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });
    it('connects to the parent endpoint (not LOCAL_TESTNET) using the singleton already present at mount', async () => {
        // Populate the (mocked) parentConfig singleton BEFORE RpcProvider mounts —
        // mirrors the real shell posting SWIMCHAIN_RPC_CONFIG on the iframe's `load`
        // event, which can beat a post-commit React effect.
        mockParentConfig = { rpcEndpoint: 'http://parent-node.example/rpc', rpcAuth: 'Basic parent-cookie' };
        render(_jsx(RpcProvider, { children: _jsx(Probe, {}) }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://parent-node.example/rpc');
        expect(url).not.toBe(LOCAL_TESTNET.endpoint);
        expect(init.headers).toMatchObject({ Authorization: 'Basic parent-cookie' });
        await waitFor(() => {
            expect(document.querySelector('[data-testid="probe"]')?.textContent).toBe('connected');
        });
    });
    it('waits (does not connect to LOCAL_TESTNET) when no config has arrived yet, then connects once one does', async () => {
        // No mockParentConfig set — getParentConfig() returns null at mount.
        render(_jsx(RpcProvider, { children: _jsx(Probe, {}) }));
        // Give the mount effect a tick; it must not have fetched LOCAL_TESTNET.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(mockListeners.length).toBe(1); // subscribed, waiting
        // Simulate the parent config arriving after mount by driving the
        // subscribed listener directly (this stub does not replay on subscribe).
        mockParentConfig = { rpcEndpoint: 'http://parent-node.example/rpc', rpcAuth: 'Basic parent-cookie' };
        mockListeners.forEach((fn) => fn(mockParentConfig));
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        const [url] = fetchMock.mock.calls[0];
        expect(url).toBe('http://parent-node.example/rpc');
        expect(url).not.toBe(LOCAL_TESTNET.endpoint);
    });
});
//# sourceMappingURL=useRpc.iframeConnect.test.js.map