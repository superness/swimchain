/**
 * Pure identity-mode selection for feed-client.
 *
 * Kept free of any React / SDK / WASM imports so it can be unit-tested in
 * isolation and reused by {@link ./useFeedIdentity}.
 *
 * Mirrors chat-client's `identityMode.ts` (PR #59) so both clients adopt the
 * node identity the same way when embedded in the desktop shell.
 */

/** Which identity source feed should use. */
export type IdentityMode = 'node' | 'browser' | 'pending';

/** The subset of the parent-frame config that drives mode selection. */
export interface ParentConfigLike {
  nodeAddress?: string;
  nodeDisplayName?: string;
}

/**
 * Decide whether feed adopts the node identity or the browser keypair.
 *
 * - Not in an iframe → standalone browser tab → `browser`.
 * - In an iframe but no parent config yet → `pending` (the desktop shell posts
 *   config asynchronously; don't fall back to the browser gate before it
 *   arrives — this matches the RPC layer, which also waits for parent config).
 * - In an iframe with a config that shares a node address → `node`.
 * - In an iframe with a config that does NOT share a node address → `browser`.
 */
export function selectIdentityMode(
  parentConfig: ParentConfigLike | null | undefined,
  inIframe: boolean,
): IdentityMode {
  if (!inIframe) return 'browser';
  if (!parentConfig) return 'pending';
  if (typeof parentConfig.nodeAddress === 'string' && parentConfig.nodeAddress.length > 0) {
    return 'node';
  }
  return 'browser';
}
