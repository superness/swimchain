/**
 * useFeedIdentity — unified identity + signing for feed-client.
 *
 * Feed-client can run in two modes:
 *
 *  - **node mode** (embedded in the desktop shell): the parent frame posts a
 *    `SWIMCHAIN_RPC_CONFIG` message that includes the node's identity address
 *    (`nodeAddress`). In this mode feed adopts the NODE's identity — exactly
 *    like forum/chat — and signs every action via the node's `sign_message`
 *    RPC. The browser never holds a keypair or seed, and the "create/import
 *    identity" onboarding gate is skipped entirely. This mirrors
 *    `chat-client/src/hooks/useChatIdentity.tsx` (PR #59) and
 *    `forum-client/src/hooks/useNodeIdentity.tsx`.
 *
 *  - **browser mode** (standalone in a normal browser tab): feed keeps its
 *    existing behavior — a browser keypair loaded from the localStorage seed
 *    (`useStoredKeypair`) signs locally.
 *
 * The mode is selected by {@link selectIdentityMode}. Signing call sites route
 * through {@link useFeedIdentity}'s async `sign` so they don't have to know
 * which mode they're in.
 *
 * NOTE: This hook only unifies *signing* (Ed25519) and the *current-user*
 * identity read. Encrypted DM / private-space creation needs a browser seed for
 * X25519 key agreement (ECDH), which the node does not expose (it offers only
 * `sign_message`). Those flows stay on the browser path and are effectively
 * disabled in pure node mode — see the PR description.
 */

import { useCallback, useMemo } from 'react';
import { useParentRpcConfig, isInIframe } from './useParentRpcConfig';
import { useNodeIdentity } from './useNodeIdentity';
import { useStoredKeypair } from './useStoredKeypair';
import { selectIdentityMode, type IdentityMode } from './identityMode';

export { selectIdentityMode };
export type { IdentityMode };

/** Convert Uint8Array to hex string. */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Convert hex string to Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Normalized identity + signer exposed to feed components. */
export interface FeedIdentity {
  /** Which identity source is active. */
  mode: IdentityMode;
  /** Hex-encoded 32-byte public key (null until resolved). */
  publicKey: string | null;
  /** cs1... bech32m address (null until resolved). */
  address: string | null;
  /** Optional human-readable name (node mode only, from the shell). */
  displayName?: string;
  /** Author public key as raw bytes (for PoW mining). */
  publicKeyBytes: Uint8Array | null;
  /** True once an identity is usable for posting/signing. */
  hasIdentity: boolean;
  /** True while the identity/mode is still being resolved. */
  isLoading: boolean;
  /**
   * Sign an action message. Async in both modes:
   *  - node mode → node's `sign_message` RPC (private key stays in the node);
   *  - browser mode → local keypair (wrapped to a Promise).
   * Resolves null if signing is unavailable.
   */
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
}

/**
 * Access the unified feed identity + signer. Safe to call anywhere below the
 * app providers (RpcProvider → NodeIdentityProvider → …).
 */
export function useFeedIdentity(): FeedIdentity {
  const parentConfig = useParentRpcConfig();
  const inIframe = isInIframe();
  const mode = selectIdentityMode(parentConfig, inIframe);

  // Node identity (fetched from the node via RPC; only meaningful in node mode).
  const node = useNodeIdentity();

  // Browser keypair (localStorage seed → WASM keypair; browser mode only).
  const {
    sign: browserSign,
    publicKey: browserPubKeyBytes,
    address: browserAddress,
    isLoading: browserLoading,
    keypair,
  } = useStoredKeypair();

  const publicKey = useMemo<string | null>(() => {
    if (mode === 'node') return node.identity?.publicKey ?? null;
    if (mode === 'browser') return browserPubKeyBytes ? bytesToHex(browserPubKeyBytes) : null;
    return null;
  }, [mode, node.identity, browserPubKeyBytes]);

  const address = useMemo<string | null>(() => {
    if (mode === 'node') return node.identity?.address ?? null;
    if (mode === 'browser') return browserAddress;
    return null;
  }, [mode, node.identity, browserAddress]);

  const publicKeyBytes = useMemo<Uint8Array | null>(() => {
    if (mode === 'node') return node.identity ? hexToBytes(node.identity.publicKey) : null;
    if (mode === 'browser') return browserPubKeyBytes;
    return null;
  }, [mode, node.identity, browserPubKeyBytes]);

  const displayName = useMemo<string | undefined>(() => {
    if (mode === 'node') {
      return typeof parentConfig?.nodeDisplayName === 'string' && parentConfig.nodeDisplayName.length > 0
        ? parentConfig.nodeDisplayName
        : undefined;
    }
    return undefined;
  }, [mode, parentConfig]);

  // Depend on the stable inner signers (node.sign / browserSign are memoized in
  // their hooks) rather than the whole `node` object, which is a fresh literal
  // each render — otherwise `sign`'s identity would churn and reset consumer
  // effects (e.g. the sponsorship poll interval).
  const nodeSign = node.sign;
  const sign = useCallback(
    async (message: Uint8Array): Promise<Uint8Array | null> => {
      if (mode === 'node') return nodeSign(message);
      // browser mode: local keypair (sync) wrapped as a Promise
      return browserSign(message);
    },
    [mode, nodeSign, browserSign],
  );

  const hasIdentity = useMemo(() => {
    if (mode === 'node') return node.identity !== null;
    if (mode === 'browser') return keypair !== null;
    return false;
  }, [mode, node.identity, keypair]);

  const isLoading = useMemo(() => {
    if (mode === 'pending') return true; // still waiting for the shell's config
    if (mode === 'node') return node.isLoading && node.identity === null;
    return browserLoading;
  }, [mode, node.isLoading, node.identity, browserLoading]);

  return {
    mode,
    publicKey,
    address,
    displayName,
    publicKeyBytes,
    hasIdentity,
    isLoading,
    sign,
  };
}
