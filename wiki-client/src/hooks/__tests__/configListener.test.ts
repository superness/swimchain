// @vitest-environment happy-dom
/**
 * Drives wiki-client's REAL config-handover listeners — not the pure trust
 * functions (those are covered by @swimchain/frontend's own configTrust
 * tests). This proves wiki-client actually WIRED isConfigMessageTrusted +
 * mergeTrustedConfig into both of its window 'message' listeners:
 *   1. useParentRpcConfig.ts's module-singleton config store.
 *   2. useRpc.tsx's second listener, which triggers a reconnect.
 *
 * wiki-client has no `test` script (run this file directly with
 * `npx vitest run src/hooks/__tests__/configListener.test.ts`); vitest,
 * happy-dom, and @testing-library/react were added as minimal devDeps for
 * this task (wiki previously had zero test runner — see task-2-report.md).
 *
 * Mutation check (see task-2-report.md): reverting useParentRpcConfig.ts's
 * listener body to the old `ALLOWED_PARENT_ORIGINS.includes(origin)` +
 * no-source-check logic makes the sibling-source and prefix-lookalike
 * assertions below fail (both messages would be wrongly accepted). Reverting
 * useRpc.tsx's messageHandler to drop the isConfigMessageTrusted guard makes
 * the second describe block's "still attached" assertions fail (the hostile
 * messages would trip removeEventListener). Verified, then reverted.
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

    // (a) a first trusted same-origin config is stored
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic first' });
    expect(getParentConfig()).toEqual({ rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic first' });

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

    // (c) a sibling-source message (event.source !== window.parent) is rejected outright
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' }, { source: {} });
    expect(getParentConfig()?.rpcEndpoint).toBe('http://127.0.0.1:19736');

    // (c) a prefix-lookalike origin (starts with, but is not, the trusted origin) is rejected
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
