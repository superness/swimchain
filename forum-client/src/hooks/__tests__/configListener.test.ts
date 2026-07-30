// @vitest-environment happy-dom
/**
 * Drives forum-client's REAL config-handover listeners — not the pure trust
 * functions (those live in ../configTrust.ts, a byte-identical copy of
 * @swimchain/frontend's canonical configTrust.ts, diff-verified in the C1
 * Task 3 report). This proves forum-client actually WIRED
 * isConfigMessageTrusted + mergeTrustedConfig into both of its window
 * 'message' listeners:
 *   1. useParentRpcConfig.ts's module-singleton config store.
 *   2. useRpc.tsx's second listener, which triggers a reconnect.
 *
 * Narrow mutation check (mirrors the Task 2 review finding that
 * mergeTrustedConfig's own endpoint lock can mask a broken trust gate): the
 * first-ever-message and nodeAddress-spoof cases below exist so the gate is
 * exercised somewhere the merge CANNOT be the thing doing the rejecting.
 * Reverting ONLY useParentRpcConfig.ts's `event.source !== ctx.parentWindow`
 * check (leaving origin logic intact) fails the first-ever-sibling-source
 * and nodeAddress-spoof assertions below; reverting ONLY the origin
 * exact-match to a prefix check (`origin.startsWith(ctx.selfOrigin)`, source
 * check intact) fails the first-ever-lookalike-origin assertion. Reverting
 * useRpc.tsx's messageHandler to drop its isConfigMessageTrusted guard
 * entirely makes the second describe block's "still attached" assertions
 * fail (the hostile messages would trip removeEventListener). Each verified
 * individually against forum's own source, then reverted — see
 * task-3-report.md.
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

describe('useParentRpcConfig listener (real handler)', () => {
  it('stores a first trusted config, merges a same-endpoint fill, refuses a repoint, and rejects sibling/lookalike sources', async () => {
    const { getParentConfig } = await import('../useParentRpcConfig');

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

    // nodeAddress-spoof: SAME endpoint as the lock (so mergeTrustedConfig's
    // endpoint lock can't be what blocks this — it WOULD accept a
    // same-endpoint nodeAddress fill), hostile source. Only the trust gate
    // can reject this one. (forum's ParentRpcConfig doesn't carry
    // nodeAddress, so this also proves an unrecognized field from a hostile
    // source never gets a chance to reach the merge at all.)
    post(
      {
        type: 'SWIMCHAIN_RPC_CONFIG',
        rpcEndpoint: 'http://127.0.0.1:19736',
        rpcAuth: 'Basic first',
        nodeAddress: 'cs1spoofed',
      },
      { source: {} },
    );
    expect(getParentConfig()).toEqual({ rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic first' });

    // (b) a later trusted message that changes rpcEndpoint is ignored (repoint refused)
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

describe('useRpc.tsx second config listener (real handler)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.doUnmock('../useParentRpcConfig');
    vi.doUnmock('../../lib/rpc');
  });

  it('drops untrusted config messages before touching the reconnect handler; accepts a trusted one', async () => {
    // Force the "waiting in an iframe for parent config" branch so the second
    // listener gets installed, and stub the RPC client so an accepted config
    // can't attempt a real network connect.
    vi.resetModules();
    vi.doMock('../useParentRpcConfig', async (importOriginal) => {
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
