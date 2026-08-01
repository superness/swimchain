// @vitest-environment happy-dom
/**
 * Drives chat-client's REAL config-handover listeners.
 *
 * chat's FIRST listener (useParentRpcConfig) is not chat's own code — chat
 * imports the hardened hook from @swimchain/frontend (Task 1 fixed it, and
 * @swimchain/frontend's own configTrust.test.ts mutation-checks the pure
 * isConfigMessageTrusted/mergeTrustedConfig functions it's built from). The
 * first describe block below still dispatches real MessageEvents at it —
 * that's an INTEGRATION check that chat's dependency wiring actually reaches
 * the hardened listener (the finding from Task 2's review: a pure fn passing
 * doesn't prove a client wired it in), not a source mutation of chat's own
 * code, since there is none to mutate here.
 *
 * chat's SECOND listener — the one-time reconnect trigger in useRpc.tsx —
 * IS chat's own code, added in this task (C1 Task 3). The second describe
 * block below drives it through RpcProvider and narrow-mutation-checks
 * chat's own gate: reverting ONLY the `isConfigMessageTrusted(...)` guard in
 * useRpc.tsx's messageHandler (leaving everything else) makes the "still
 * attached" assertions fail, because the hostile messages would then trip
 * removeEventListener. Verified against chat's own source, then reverted —
 * see task-3-report.md.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const SELF = window.location.origin; // http://localhost:3000 under happy-dom

function post(data: unknown, opts: { origin?: string; source?: unknown } = {}) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: opts.origin ?? SELF,
      source: (opts.source ?? window.parent) as MessageEventSource,
    }),
  );
}

describe('@swimchain/frontend useParentRpcConfig listener, as wired into chat (real handler)', () => {
  it('stores a first trusted config, merges a same-endpoint fill, refuses a repoint, and rejects sibling/lookalike sources', async () => {
    const { getParentConfig } = await import('@swimchain/frontend');

    // FIRST-EVER hostile messages, before any config is locked: parentConfig
    // is still null here, so mergeTrustedConfig(null, incoming) would accept
    // UNCONDITIONALLY if it were ever called — the trust gate is the ONLY
    // thing standing between a hostile first message and getting stored.
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' }, { source: {} });
    expect(getParentConfig()).toBeNull();

    post(
      { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' },
      { origin: `${SELF}.evil.com` },
    );
    expect(getParentConfig()).toBeNull();

    // (a) a first trusted same-origin config is stored
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic first' });
    expect(getParentConfig()).toEqual({ rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic first' });

    // nodeAddress-spoof: SAME endpoint as the lock (mergeTrustedConfig WOULD
    // accept a same-endpoint nodeAddress fill — its own lock can't be what
    // blocks this), hostile source. Only the trust gate can reject this one.
    post(
      {
        type: 'SWIMCHAIN_RPC_CONFIG',
        rpcEndpoint: 'http://127.0.0.1:19736',
        rpcAuth: 'Basic first',
        nodeAddress: 'cs1spoofed',
      },
      { source: {} },
    );
    expect(getParentConfig()?.nodeAddress).toBeUndefined();

    // (b) a second trusted, same-endpoint config that only fills nodeAddress is applied
    post({
      type: 'SWIMCHAIN_RPC_CONFIG',
      rpcEndpoint: 'http://127.0.0.1:19736',
      rpcAuth: 'Basic first',
      nodeAddress: 'cs1abc',
      nodeDisplayName: 'Alice',
    });
    expect(getParentConfig()).toEqual({
      rpcEndpoint: 'http://127.0.0.1:19736',
      rpcAuth: 'Basic first',
      nodeAddress: 'cs1abc',
      nodeDisplayName: 'Alice',
    });

    // ...but a later trusted message that changes rpcEndpoint is ignored (repoint refused)
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' });
    expect(getParentConfig()?.rpcEndpoint).toBe('http://127.0.0.1:19736');

    // (c) a sibling-source message (event.source !== window.parent) is rejected outright.
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' }, { source: {} });
    expect(getParentConfig()?.rpcEndpoint).toBe('http://127.0.0.1:19736');

    // (c) a prefix-lookalike origin (starts with, but is not, the trusted origin) is rejected.
    post(
      { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' },
      { origin: `${SELF}.evil.com` },
    );
    expect(getParentConfig()?.rpcEndpoint).toBe('http://127.0.0.1:19736');
  });
});

describe("useRpc.tsx second config listener — chat's own gate (real handler)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.doUnmock('@swimchain/frontend');
    vi.doUnmock('../../lib/rpc');
  });

  it('drops untrusted config messages before touching the reconnect handler; accepts a trusted one', async () => {
    // Force the "waiting in an iframe for parent config" branch so the second
    // listener gets installed, and stub the RPC client so an accepted config
    // can't attempt a real network connect. isConfigMessageTrusted is kept
    // real (imported via importOriginal) — only isInIframe/getParentConfig
    // are overridden, so this exercises chat's ACTUAL gate.
    vi.resetModules();
    vi.doMock('@swimchain/frontend', async (importOriginal) => {
      const actual = await importOriginal<Record<string, unknown>>();
      return { ...actual, isInIframe: () => true, getParentConfig: () => null };
    });
    vi.doMock('../../lib/rpc', async (importOriginal) => {
      const actual = await importOriginal<Record<string, unknown>>();
      return {
        ...actual,
        initRpc: () => ({ connect: async () => false, getNodeInfo: () => null }),
      };
    });

    const { RpcProvider } = await import('../useRpc');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const messageRemovals = () => removeSpy.mock.calls.filter((c) => c[0] === 'message').length;

    render(React.createElement(RpcProvider, { children: null }));

    // sibling-source: rejected — the one-time listener must still be attached
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test' }, { source: {} });
    expect(messageRemovals()).toBe(0);

    // prefix-lookalike origin: rejected too
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test' }, { origin: `${SELF}.evil.com` });
    expect(messageRemovals()).toBe(0);

    // trusted: accepted — the listener removes itself (one-time reconnect trigger)
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic ok' });
    expect(messageRemovals()).toBe(1);

    // let the mocked connect() promise settle before unmount to avoid act() noise
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
