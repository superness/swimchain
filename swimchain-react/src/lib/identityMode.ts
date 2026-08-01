/**
 * Pure identity-mode selection for the game clients (reef/chess/chips), shared via
 * `@swimchain/react` so all three pick the node identity the same way.
 *
 * Kept free of any React / SDK / WASM imports so it can be unit-tested in isolation.
 * Mirrors `chat-client/src/hooks/identityMode.ts:27-37`.
 */

import type { ParentRpcConfig } from './parentConfig';

// Standalone tab ⇒ always browser (localStorage keypair, the mint gate — unchanged).
// Embedded (in Surf/desktop) ⇒ wait for the parent config ('pending'); once it arrives,
// adopt the NODE identity iff it carries a non-empty nodeAddress, else fall back to browser.
export function selectIdentityMode(
  parentConfig: ParentRpcConfig | null,
  inIframe: boolean,
): 'node' | 'browser' | 'pending' {
  if (!inIframe) return 'browser';
  if (parentConfig == null) return 'pending';
  return parentConfig.nodeAddress && parentConfig.nodeAddress.length > 0 ? 'node' : 'browser';
}
