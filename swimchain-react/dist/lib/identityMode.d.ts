/**
 * Pure identity-mode selection for the game clients (reef/chess/chips), shared via
 * `@swimchain/react` so all three pick the node identity the same way.
 *
 * Kept free of any React / SDK / WASM imports so it can be unit-tested in isolation.
 * Mirrors `chat-client/src/hooks/identityMode.ts:27-37`.
 */
import type { ParentRpcConfig } from './parentConfig';
export declare function selectIdentityMode(parentConfig: ParentRpcConfig | null, inIframe: boolean): 'node' | 'browser' | 'pending';
//# sourceMappingURL=identityMode.d.ts.map