/**
 * useWikiIdentity — unified identity + signing for wiki-client.
 *
 * Wiki-client can run in two modes:
 *
 *  - **node mode** (embedded in the desktop shell): the parent frame posts a
 *    `SWIMCHAIN_RPC_CONFIG` message that includes the node's identity address
 *    (`nodeAddress`). In this mode wiki adopts the NODE's identity — exactly
 *    like forum/chat/feed — and signs every write (page create/edit, discussion
 *    replies, spam reports) via the node's `sign_message` RPC. The browser never
 *    holds a keypair or seed, and the "create/import identity" gate is skipped.
 *    Mirrors `feed-client/src/hooks/useFeedIdentity.tsx` (PR #64) and
 *    `forum-client/src/hooks/useNodeIdentity.tsx`.
 *
 *  - **browser mode** (standalone in a normal browser tab): wiki keeps its
 *    existing behavior — the SDK's `IdentityProvider` stored identity
 *    (localStorage seed) signs locally via a WASM keypair.
 *
 * The mode is selected by {@link selectIdentityMode}. Signing call sites route
 * through this hook's async `sign` so they don't have to know which mode they're
 * in — they always sign the same exact bytes (preserving the PoW-over-exact-
 * node-bytes contract); only WHO holds the key changes.
 */

import { useCallback, useMemo } from 'react';
import { useIdentityContext, hexToBytes } from '@swimchain/frontend';
import { useParentRpcConfig, isInIframe } from './useParentRpcConfig';
import { useNodeIdentity } from './useNodeIdentity';
import { selectIdentityMode, type IdentityMode } from './identityMode';

export { selectIdentityMode };
export type { IdentityMode };

/** Normalized identity + signer exposed to wiki components. */
export interface WikiIdentity {
  /** Which identity source is active. */
  mode: IdentityMode;
  /** Hex-encoded 32-byte public key (null until resolved). */
  publicKey: string | null;
  /** cs1... bech32m address (null until resolved). */
  address: string | null;
  /** Optional human-readable name (node mode only, from the shell). */
  displayName?: string;
  /** True once an identity is usable for posting/signing. */
  hasIdentity: boolean;
  /** True while the identity/mode is still being resolved. */
  isLoading: boolean;
  /**
   * Sign a message. Async in both modes:
   *  - node mode → node's `sign_message` RPC (private key stays in the node);
   *  - browser mode → local WASM keypair from the stored seed.
   * Resolves null if signing is unavailable.
   */
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
}

/**
 * Access the unified wiki identity + signer. Must be called below both the
 * SDK IdentityProvider (browser identity) and NodeIdentityProvider.
 */
export function useWikiIdentity(): WikiIdentity {
  const parentConfig = useParentRpcConfig();
  const inIframe = isInIframe();
  const mode = selectIdentityMode(parentConfig, inIframe);

  // Node identity (fetched from the node via RPC; only meaningful in node mode).
  const node = useNodeIdentity();

  // Browser identity (localStorage stored identity with seed; browser mode only).
  const { identity: browserIdentity } = useIdentityContext();

  const publicKey = useMemo<string | null>(() => {
    if (mode === 'node') return node.identity?.publicKey ?? null;
    if (mode === 'browser') return browserIdentity?.publicKey ?? null;
    return null;
  }, [mode, node.identity, browserIdentity]);

  const address = useMemo<string | null>(() => {
    if (mode === 'node') return node.identity?.address ?? null;
    if (mode === 'browser') return browserIdentity?.address ?? null;
    return null;
  }, [mode, node.identity, browserIdentity]);

  const displayName = useMemo<string | undefined>(() => {
    if (mode === 'node') {
      return typeof parentConfig?.nodeDisplayName === 'string' && parentConfig.nodeDisplayName.length > 0
        ? parentConfig.nodeDisplayName
        : undefined;
    }
    return undefined;
  }, [mode, parentConfig]);

  // Depend on the stable inner node signer (node.sign is memoized in its hook)
  // rather than the whole `node` object, which is a fresh literal each render.
  const nodeSign = node.sign;
  const browserSeed = browserIdentity?.seed;
  const sign = useCallback(
    async (message: Uint8Array): Promise<Uint8Array | null> => {
      if (mode === 'node') return nodeSign(message);
      // browser mode: sign locally with the stored seed's WASM keypair.
      if (!browserSeed) return null;
      const { wasm } = await import('@swimchain/frontend');
      const keypair = wasm.WasmKeypair.fromSeed(hexToBytes(browserSeed));
      try {
        return keypair.sign(message);
      } finally {
        keypair.free();
      }
    },
    [mode, nodeSign, browserSeed],
  );

  const hasIdentity = useMemo(() => {
    if (mode === 'node') return node.identity !== null;
    if (mode === 'browser') return Boolean(browserIdentity?.publicKey && browserIdentity?.seed);
    return false;
  }, [mode, node.identity, browserIdentity]);

  const isLoading = useMemo(() => {
    if (mode === 'pending') return true; // still waiting for the shell's config
    if (mode === 'node') return node.isLoading && node.identity === null;
    return false;
  }, [mode, node.isLoading, node.identity]);

  return {
    mode,
    publicKey,
    address,
    displayName,
    hasIdentity,
    isLoading,
    sign,
  };
}
