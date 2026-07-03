/**
 * useChatIdentity — unified identity + signing for chat-client.
 *
 * Chat-client can run in two modes:
 *
 *  - **node mode** (embedded in the desktop shell): the parent frame posts a
 *    `SWIMCHAIN_RPC_CONFIG` message that includes the node's identity address
 *    (`nodeAddress`). In this mode chat adopts the NODE's identity — exactly
 *    like forum/feed/search — and signs every action via the node's
 *    `sign_message` RPC. The browser never holds a keypair or seed, and the
 *    "create/import identity" onboarding gate is skipped entirely. This mirrors
 *    `forum-client/src/hooks/useNodeIdentity.tsx`.
 *
 *  - **browser mode** (standalone in a normal browser tab): chat keeps its
 *    existing behavior — a browser keypair managed by `@swimchain/frontend`'s
 *    `IdentityProvider` (localStorage seed) signs locally.
 *
 * The mode is selected by {@link selectIdentityMode}. All identity reads and all
 * signing in chat go through {@link useChatIdentity} so call sites don't have to
 * know which mode they're in.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  useIdentityContext,
  useStoredKeypair,
  useParentRpcConfig,
  isInIframe,
  hexToBytes,
  bytesToHex,
} from '@swimchain/frontend';
import { useRpc } from './useRpc';
import { selectIdentityMode, type IdentityMode } from './identityMode';

export { selectIdentityMode };
export type { IdentityMode };

/** Normalized identity exposed to chat components. */
export interface ChatIdentity {
  /** Hex-encoded 32-byte public key. */
  publicKey: string;
  /** cs1... bech32m address. */
  address: string;
  /** Optional human-readable name (node mode only, from the shell). */
  displayName?: string;
}

export interface ChatIdentityContextValue {
  /** Which identity source is active. */
  mode: IdentityMode;
  /** The active identity, or null if none is available yet. */
  identity: ChatIdentity | null;
  /** True once an identity is usable for posting/signing. */
  hasIdentity: boolean;
  /** True while the identity/mode is still being resolved. */
  isLoading: boolean;
  /** Author public key as raw bytes (for PoW mining). */
  publicKeyBytes: Uint8Array | null;
  /**
   * Sign an action message. Async in both modes:
   *  - node mode → node's `sign_message` RPC (private key stays in the node);
   *  - browser mode → local keypair (wrapped to a Promise).
   * Resolves null if signing is unavailable.
   */
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
}

const ChatIdentityContext = createContext<ChatIdentityContextValue | null>(null);

interface NodeIdentityState {
  publicKey: string;
  address: string;
}

/**
 * Provider that resolves the active identity (node or browser) and wires the
 * RPC auth "ready" flag. Wrap the app in this once, inside `IdentityProvider`
 * and the `RpcProvider`.
 */
export function ChatIdentityProvider({ children }: { children: ReactNode }): JSX.Element {
  const parentConfig = useParentRpcConfig();
  const inIframe = isInIframe();
  const mode = selectIdentityMode(parentConfig, inIframe);

  const { rpc, connected, setRemoteSigner } = useRpc();

  // ---- Browser identity (localStorage keypair via the SDK) ----
  const { identity: browserIdentity, isLoading: browserLoading } = useIdentityContext();
  const { sign: browserSign, publicKey: browserPubKeyBytes } = useStoredKeypair();

  // ---- Node identity (fetched from the node via RPC, node mode only) ----
  const [nodeIdentity, setNodeIdentity] = useState<NodeIdentityState | null>(null);
  const [nodeError, setNodeError] = useState<string | null>(null);

  const fetchNodeIdentity = useCallback(async () => {
    if (!rpc || !connected) return;
    try {
      const result = await rpc.call<{
        has_identity: boolean;
        public_key: string | null;
        address: string | null;
      }>('get_identity_info', {});

      if (result.has_identity && result.public_key && result.address) {
        setNodeIdentity({ publicKey: result.public_key, address: result.address });
        setNodeError(null);
      } else {
        setNodeIdentity(null);
        setNodeError('Node has no identity loaded');
      }
    } catch (err) {
      setNodeIdentity(null);
      setNodeError(err instanceof Error ? err.message : 'Failed to fetch node identity');
    }
  }, [rpc, connected]);

  // Fetch (with a few retries for the connect race) only in node mode.
  useEffect(() => {
    if (mode !== 'node' || !connected) {
      return;
    }
    fetchNodeIdentity();

    const retryDelays = [500, 1500, 3000];
    const timeouts = retryDelays.map((delay) =>
      setTimeout(() => {
        setNodeIdentity((current) => {
          if (!current) fetchNodeIdentity();
          return current;
        });
      }, delay),
    );
    return () => timeouts.forEach(clearTimeout);
  }, [mode, connected, fetchNodeIdentity]);

  // ---- Resolve the active identity for the current mode ----
  const identity = useMemo<ChatIdentity | null>(() => {
    if (mode === 'node') {
      if (!nodeIdentity) return null;
      return {
        publicKey: nodeIdentity.publicKey,
        address: nodeIdentity.address,
        displayName:
          typeof parentConfig?.nodeDisplayName === 'string'
            ? parentConfig.nodeDisplayName
            : undefined,
      };
    }
    if (mode === 'browser') {
      // Browser identity requires a seed (for local signing) to be usable.
      if (browserIdentity?.seed && browserIdentity.publicKey && browserIdentity.address) {
        return { publicKey: browserIdentity.publicKey, address: browserIdentity.address };
      }
    }
    return null;
  }, [mode, nodeIdentity, parentConfig, browserIdentity]);

  const publicKeyBytes = useMemo<Uint8Array | null>(() => {
    if (!identity) return null;
    if (mode === 'node') return hexToBytes(identity.publicKey);
    return browserPubKeyBytes ?? hexToBytes(identity.publicKey);
  }, [mode, identity, browserPubKeyBytes]);

  // ---- Unified async signer ----
  const sign = useCallback(
    async (message: Uint8Array): Promise<Uint8Array | null> => {
      if (mode === 'node') {
        if (!rpc || !connected) return null;
        try {
          const result = await rpc.call<{ signature: string; public_key: string }>(
            'sign_message',
            { message: bytesToHex(message) },
          );
          return hexToBytes(result.signature);
        } catch {
          return null;
        }
      }
      // browser mode: local keypair (sync) wrapped as a Promise
      return browserSign(message);
    },
    [mode, rpc, connected, browserSign],
  );

  // ---- Wire the RPC "auth ready" flag once an identity is active ----
  // Registering a remote signer flips `authReady`, which gates the data hooks.
  // In node mode the remote signer is the node's sign_message; in browser mode
  // it wraps the local keypair (RPC requests are still authed by the local
  // keypair the RPC client holds, so this is only used to mark auth ready).
  useEffect(() => {
    if (!rpc || !connected || !identity) return;
    const remoteSignHex = async (messageHex: string): Promise<string | null> => {
      const sig = await sign(hexToBytes(messageHex));
      return sig ? bytesToHex(sig) : null;
    };
    setRemoteSigner(identity.publicKey, remoteSignHex);
  }, [rpc, connected, identity, sign, setRemoteSigner]);

  // ---- Loading / readiness ----
  const isLoading = useMemo(() => {
    if (mode === 'pending') return true; // still waiting for the shell's config
    if (mode === 'node') return !nodeIdentity && !nodeError;
    return browserLoading;
  }, [mode, nodeIdentity, nodeError, browserLoading]);

  const value: ChatIdentityContextValue = {
    mode,
    identity,
    hasIdentity: identity !== null,
    isLoading,
    publicKeyBytes,
    sign,
  };

  return (
    <ChatIdentityContext.Provider value={value}>{children}</ChatIdentityContext.Provider>
  );
}

/** Access the unified chat identity. Must be used within {@link ChatIdentityProvider}. */
export function useChatIdentity(): ChatIdentityContextValue {
  const ctx = useContext(ChatIdentityContext);
  if (!ctx) {
    throw new Error('useChatIdentity must be used within a ChatIdentityProvider');
  }
  return ctx;
}
