// @vitest-environment happy-dom
/**
 * useGameIdentity (Surf C2a Task 3).
 *
 * The load-bearing thing under test is the SEAM 1 (transport, `setAuth`) vs
 * SEAM 2 (action payload, `me.sign`) split: node mode must NEVER call
 * `setAuth`/`setSignatureAuth`, because the node signer itself calls
 * `rpc.call('sign_message', ...)` — wiring it into `setAuth` would make every
 * `call()` recurse into `sign_message` into `setAuth`'s signer into
 * `call('sign_message')` forever. A test that only stubs `rpc.call` and checks
 * the returned `identity` looks right would NOT catch that recursion (the
 * stub just answers `sign_message` without caring who invoked it) — so both
 * tests below assert directly on a `setAuth` spy, not just on shape.
 *
 * `useRpc`, `useStoredIdentity`/`useStoredKeypair`, and `parentConfig` are all
 * mocked so each test can force a specific mode deterministically without a
 * real RpcProvider/WASM keypair. Mock fields are kept as plain function types
 * (not `ReturnType<typeof vi.fn>`) so the spies can be reassigned test-to-test
 * without fighting `Mock<...>` generic-invariance in structural typing; each
 * test asserts against the locally-held spy variable it created.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { hexToBytes } from '../lib/utils';
import type { ParentRpcConfig } from '../lib/parentConfig';

interface MockRpc {
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

interface MockUseRpcReturn {
  rpc: MockRpc | null;
  connected: boolean;
  setAuth: (auth: unknown) => void;
}

interface MockStoredIdentity {
  seed: string;
  publicKey: string;
  address: string;
  createdAt: number;
  displayName?: string;
}

interface MockUseStoredIdentityReturn {
  identity: MockStoredIdentity | null;
  isLoading: boolean;
  error: string | null;
  saveIdentity: (identity: MockStoredIdentity) => void;
  clearIdentity: () => void;
  hasIdentity: boolean;
}

interface MockUseStoredKeypairReturn {
  keypair: unknown;
  publicKey: Uint8Array | null;
  publicKeyHex: string | null;
  address: string | null;
  isLoading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
}

// ---- Mock: ../lib/parentConfig (mode selection inputs) ----
let mockInIframe = false;
let mockParentConfig: ParentRpcConfig | null = null;
vi.mock('../lib/parentConfig', () => ({
  isInIframe: () => mockInIframe,
  getParentConfig: () => mockParentConfig,
  subscribeParentConfig: (fn: (c: ParentRpcConfig | null) => void) => {
    if (mockParentConfig !== null) fn(mockParentConfig);
    return () => {};
  },
}));

// ---- Mock: ./useRpc (rpc/connected/setAuth — the transport seam) ----
let mockUseRpcReturn: MockUseRpcReturn;
vi.mock('./useRpc', () => ({
  useRpc: () => mockUseRpcReturn,
}));

// ---- Mock: ./useStoredIdentity (localStorage-backed browser identity) ----
let mockStoredIdentityReturn: MockUseStoredIdentityReturn;
let mockStoredKeypairReturn: MockUseStoredKeypairReturn;
vi.mock('./useStoredIdentity', () => ({
  useStoredIdentity: () => mockStoredIdentityReturn,
  useStoredKeypair: () => mockStoredKeypairReturn,
}));

// Import AFTER the mocks are declared (vi.mock calls are hoisted by vitest,
// but keeping the import below them documents the dependency).
import { useGameIdentity } from './useGameIdentity';

describe('useGameIdentity', () => {
  beforeEach(() => {
    mockInIframe = false;
    mockParentConfig = null;
  });

  afterEach(() => {
    cleanup();
  });

  describe('browser mode (standalone tab)', () => {
    const BROWSER_PUBKEY_HEX = 'aa'.repeat(32);
    const BROWSER_ADDRESS = 'cs1browserstandalone';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vi.fn()'s
    // Mock<Args, Return> is invariant on mockImplementation, so a spy typed
    // narrowly at creation can't be held in a `Mock<any[], unknown>`-typed
    // variable; `any` here is the pragmatic escape (assertions below still
    // get full type-checking on `expect(...)`, just not on the spy variable
    // itself).
    let saveIdentitySpy: any;
    let clearIdentitySpy: any;
    let browserSignSpy: any;
    let setAuthSpy: any;
    let rpcCallSpy: any;

    beforeEach(() => {
      mockInIframe = false;
      mockParentConfig = null;

      saveIdentitySpy = vi.fn();
      clearIdentitySpy = vi.fn();
      browserSignSpy = vi.fn((_m: Uint8Array) => new Uint8Array([9, 9, 9]));
      setAuthSpy = vi.fn();
      rpcCallSpy = vi.fn(async (method: string) => {
        if (method === 'get_identity_info') {
          return { has_identity: false, public_key: null, address: null };
        }
        if (method === 'sign_message') {
          return { signature: '00'.repeat(64), public_key: '' };
        }
        throw new Error(`unexpected rpc.call(${method})`);
      });

      mockStoredIdentityReturn = {
        identity: {
          seed: 'ab'.repeat(32),
          publicKey: BROWSER_PUBKEY_HEX,
          address: BROWSER_ADDRESS,
          createdAt: 1,
        },
        isLoading: false,
        error: null,
        saveIdentity: saveIdentitySpy,
        clearIdentity: clearIdentitySpy,
        hasIdentity: true,
      };
      mockStoredKeypairReturn = {
        keypair: {},
        publicKey: hexToBytes(BROWSER_PUBKEY_HEX),
        publicKeyHex: BROWSER_PUBKEY_HEX,
        address: BROWSER_ADDRESS,
        isLoading: false,
        error: null,
        sign: browserSignSpy,
      };
      mockUseRpcReturn = {
        rpc: { call: rpcCallSpy },
        connected: true,
        setAuth: setAuthSpy,
      };
    });

    it('resolves identity from localStorage, pushes setAuth with the browser keypair, and never calls sign_message', async () => {
      const { result, unmount } = renderHook(() => useGameIdentity());

      expect(result.current.mode).toBe('browser');
      expect(result.current.identity?.address).toBe(BROWSER_ADDRESS);
      expect(result.current.identity?.publicKeyHex).toBe(BROWSER_PUBKEY_HEX);
      expect(result.current.hasIdentity).toBe(true);
      expect(result.current.isLoading).toBe(false);

      // Browser mode IS the transport auth — setAuth must be pushed with the
      // browser keypair's public key.
      await waitFor(() => expect(setAuthSpy).toHaveBeenCalled());
      expect(setAuthSpy).toHaveBeenCalledWith(expect.objectContaining({ publicKey: BROWSER_PUBKEY_HEX }));

      // me.sign uses the local keypair, never the node's sign_message RPC.
      const sig = await act(async () => result.current.sign(new Uint8Array([1, 2, 3])));
      expect(sig).toEqual(new Uint8Array([9, 9, 9]));
      expect(browserSignSpy).toHaveBeenCalled();
      expect(rpcCallSpy.mock.calls.some(([method]: [string]) => method === 'sign_message')).toBe(false);

      unmount();
    });

    it('saveIdentity/clearIdentity pass through to localStorage in browser mode', () => {
      const { result, unmount } = renderHook(() => useGameIdentity());

      const next = { seed: 'x', publicKey: 'y', address: 'z', createdAt: 2 };
      result.current.saveIdentity(next);
      expect(saveIdentitySpy).toHaveBeenCalledWith(next);

      result.current.clearIdentity();
      expect(clearIdentitySpy).toHaveBeenCalled();

      unmount();
    });
  });

  describe('node mode (embedded, shell shared a node identity)', () => {
    const NODE_PUBKEY_HEX = 'bb'.repeat(32);
    const NODE_ADDRESS = 'cs1nodeidentity';
    const NODE_SIGNATURE_HEX = 'cc'.repeat(64);

    // A DECOY browser identity distinct from the node identity. If the node
    // branch ever leaked this in (the split-brain bug), the assertions below
    // that check `identity`/`sign` against the NODE's values — not the
    // decoy's — would fail.
    const DECOY_PUBKEY_HEX = 'ff'.repeat(32);
    const DECOY_ADDRESS = 'cs1DECOYbrowseridentity';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the
    // browser-mode describe block above for why these are `any`.
    let saveIdentitySpy: any;
    let clearIdentitySpy: any;
    let decoySignSpy: any;
    let setAuthSpy: any;
    let rpcCallSpy: any;

    beforeEach(() => {
      mockInIframe = true;
      mockParentConfig = {
        rpcEndpoint: 'http://node.example/rpc',
        rpcAuth: 'Basic node-cookie',
        nodeAddress: NODE_ADDRESS,
        // nodeDisplayName intentionally omitted — Surf doesn't post it today
        // (finding #4): displayName must come out undefined, not fabricated.
      };

      saveIdentitySpy = vi.fn();
      clearIdentitySpy = vi.fn();
      decoySignSpy = vi.fn((_m: Uint8Array) => new Uint8Array([7, 7, 7]));
      setAuthSpy = vi.fn();
      rpcCallSpy = vi.fn(async (method: string) => {
        if (method === 'get_identity_info') {
          return { has_identity: true, public_key: NODE_PUBKEY_HEX, address: NODE_ADDRESS };
        }
        if (method === 'sign_message') {
          return { signature: NODE_SIGNATURE_HEX, public_key: NODE_PUBKEY_HEX };
        }
        throw new Error(`unexpected rpc.call(${method})`);
      });

      mockStoredIdentityReturn = {
        identity: {
          seed: 'decoyseed'.padEnd(64, '0'),
          publicKey: DECOY_PUBKEY_HEX,
          address: DECOY_ADDRESS,
          createdAt: 1,
        },
        isLoading: false,
        error: null,
        saveIdentity: saveIdentitySpy,
        clearIdentity: clearIdentitySpy,
        hasIdentity: true,
      };
      mockStoredKeypairReturn = {
        keypair: {},
        publicKey: hexToBytes(DECOY_PUBKEY_HEX),
        publicKeyHex: DECOY_PUBKEY_HEX,
        address: DECOY_ADDRESS,
        isLoading: false,
        error: null,
        sign: decoySignSpy,
      };
      mockUseRpcReturn = {
        rpc: { call: rpcCallSpy },
        connected: true,
        setAuth: setAuthSpy,
      };
    });

    it('resolves identity from get_identity_info, NEVER calls setAuth (anti-recursion), and signs via sign_message', async () => {
      const { result, unmount } = renderHook(() => useGameIdentity());

      expect(result.current.mode).toBe('node');
      // get_identity_info hasn't resolved yet on the first render — this is
      // exactly the window finding #3 exists for: mode flips to 'node'
      // instantly but the identity fetch is async.
      expect(result.current.identity).toBeNull();
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.identity).not.toBeNull());

      // The identity is the NODE's, not the decoy browser identity —
      // split-brain guard.
      expect(result.current.identity?.address).toBe(NODE_ADDRESS);
      expect(result.current.identity?.publicKeyHex).toBe(NODE_PUBKEY_HEX);
      expect(result.current.identity?.displayName).toBeUndefined();
      expect(result.current.hasIdentity).toBe(true);
      expect(result.current.isLoading).toBe(false);

      // ANTI-RECURSION GUARD: setAuth/setSignatureAuth must NEVER be called in
      // node mode. The node signer calls rpc.call('sign_message', ...); wiring
      // it into setAuth would make every call() recurse into sign_message
      // into setAuth's signer into call('sign_message') forever.
      expect(setAuthSpy).not.toHaveBeenCalled();

      // SPLIT-BRAIN GUARD: the decoy browser keypair's sign was never touched.
      expect(decoySignSpy).not.toHaveBeenCalled();

      // me.sign (SEAM 2) goes through sign_message, and returns the NODE's
      // signature — not anything derived from the decoy keypair.
      const sig = await act(async () => result.current.sign(new Uint8Array([1, 2, 3])));
      expect(sig).toEqual(hexToBytes(NODE_SIGNATURE_HEX));

      const signMessageCalls = rpcCallSpy.mock.calls.filter(([method]: [string]) => method === 'sign_message');
      expect(signMessageCalls.length).toBeGreaterThan(0);
      expect(signMessageCalls[0][1]).toEqual({ message: '010203' });

      unmount();
    });

    it('saveIdentity/clearIdentity are no-ops in node mode (never touch localStorage)', async () => {
      const { result, unmount } = renderHook(() => useGameIdentity());
      await waitFor(() => expect(result.current.identity).not.toBeNull());

      result.current.saveIdentity({ seed: 'x', publicKey: 'y', address: 'z', createdAt: 2 });
      expect(saveIdentitySpy).not.toHaveBeenCalled();

      result.current.clearIdentity();
      expect(clearIdentitySpy).not.toHaveBeenCalled();

      unmount();
    });
  });

  describe('pending mode (embedded, shell config not yet arrived)', () => {
    it('reports isLoading=true and identity=null, ignoring any stale localStorage identity', () => {
      mockInIframe = true;
      mockParentConfig = null; // shell hasn't posted SWIMCHAIN_RPC_CONFIG yet

      const setAuthSpy = vi.fn();

      mockStoredIdentityReturn = {
        identity: {
          seed: 'stale'.padEnd(64, '0'),
          publicKey: 'ee'.repeat(32),
          address: 'cs1staleFromPriorSession',
          createdAt: 1,
        },
        isLoading: false,
        error: null,
        saveIdentity: vi.fn(),
        clearIdentity: vi.fn(),
        hasIdentity: true,
      };
      mockStoredKeypairReturn = {
        keypair: {},
        publicKey: hexToBytes('ee'.repeat(32)),
        publicKeyHex: 'ee'.repeat(32),
        address: 'cs1staleFromPriorSession',
        isLoading: false,
        error: null,
        sign: vi.fn(),
      };
      mockUseRpcReturn = { rpc: null, connected: false, setAuth: setAuthSpy };

      const { result, unmount } = renderHook(() => useGameIdentity());

      expect(result.current.mode).toBe('pending');
      expect(result.current.identity).toBeNull();
      expect(result.current.hasIdentity).toBe(false);
      expect(result.current.isLoading).toBe(true);
      expect(setAuthSpy).not.toHaveBeenCalled();

      unmount();
    });
  });
});
