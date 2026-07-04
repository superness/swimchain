/**
 * useSearchIdentity — node-vs-browser identity for search-client.
 *
 * Search-client is almost entirely read-only (search, suggest, trending,
 * view). Its RPC reads are authenticated at the transport level:
 *
 *  - **node mode** (embedded in the desktop shell): the parent frame posts a
 *    `SWIMCHAIN_RPC_CONFIG` message with the node's `rpcAuth` (Basic auth) and
 *    the node identity `nodeAddress`. Search reads ride the node's Basic auth,
 *    so no browser keypair is needed. Search adopts the NODE identity for
 *    display and as the stable per-user key for client-side state (blocklist,
 *    search history) — mirroring forum/chat/feed. The browser never holds a
 *    keypair, and the "create/import identity" flow is skipped.
 *
 *  - **browser mode** (standalone tab): unchanged. Reads use the browser
 *    keypair's signature auth (via `@swimchain/frontend`); client-side state
 *    keeps its existing localStorage keys.
 *
 * Mode selection mirrors chat-client's `selectIdentityMode`.
 */

import { useParentRpcConfig, isInIframe } from './useParentRpcConfig';

export type SearchIdentityMode = 'node' | 'browser' | 'pending';

/** The subset of the parent-frame config that drives mode selection. */
export interface ParentConfigLike {
  nodeAddress?: string;
  nodeDisplayName?: string;
}

/**
 * Decide whether search adopts the node identity or the browser keypair.
 *
 * - Not in an iframe → standalone browser tab → `browser`.
 * - In an iframe but no parent config yet → `pending` (the desktop shell posts
 *   config asynchronously; don't fall back to browser before it arrives).
 * - In an iframe with a config that carries a node address → `node`.
 * - In an iframe with a config that does NOT carry a node address → `browser`.
 */
export function selectIdentityMode(
  parentConfig: ParentConfigLike | null | undefined,
  inIframe: boolean,
): SearchIdentityMode {
  if (!inIframe) return 'browser';
  if (!parentConfig) return 'pending';
  if (typeof parentConfig.nodeAddress === 'string' && parentConfig.nodeAddress.length > 0) {
    return 'node';
  }
  return 'browser';
}

/**
 * Namespace a localStorage base key by the node address in node mode, so
 * client-side state is stable per node identity and consistent with the other
 * embedded clients. In browser mode the base key is returned unchanged (keeps
 * standalone behavior and existing data intact).
 */
export function storageKeyFor(base: string, nodeAddress?: string | null): string {
  return nodeAddress ? `${base}:${nodeAddress}` : base;
}

export interface SearchIdentity {
  mode: SearchIdentityMode;
  /** True when embedded in the desktop shell with a node identity available. */
  isNodeMode: boolean;
  /** cs1... node address (node mode only). */
  nodeAddress?: string;
  /** Human-readable node identity name from the shell (node mode only). */
  nodeDisplayName?: string;
}

/** Resolve the active identity mode + node display info for search-client. */
export function useSearchIdentity(): SearchIdentity {
  const parentConfig = useParentRpcConfig();
  const inIframe = isInIframe();
  const mode = selectIdentityMode(parentConfig, inIframe);

  if (mode === 'node' && parentConfig) {
    return {
      mode,
      isNodeMode: true,
      nodeAddress: parentConfig.nodeAddress,
      nodeDisplayName: parentConfig.nodeDisplayName,
    };
  }

  return { mode, isNodeMode: false };
}
