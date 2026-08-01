/**
 * Module-level listener for the `SWIMCHAIN_RPC_CONFIG` handover message posted by the
 * Surf/desktop shell into an embedded game iframe (reef/chess/chips), so the games can
 * sign as the user's real node identity instead of a throwaway browser keypair.
 *
 * Plain module (no React) — a React provider/hook can wrap this later. Modeled on
 * `swimchain-frontend/src/hooks/useParentRpcConfig.ts`, sharing C1's hardened trust
 * (`./configTrust`) so the games get the same protection against a hostile embedding
 * frame repointing RPC calls (including sign_message) at an attacker.
 */
/**
 * RPC config + optional node identity the parent shell hands to an embedded game.
 * Compatible with configTrust's `ParentRpcConfigLike`.
 */
export interface ParentRpcConfig {
    rpcEndpoint?: string;
    rpcAuth?: string;
    /** Node identity public address (cs1...), if the shell shared it. */
    nodeAddress?: string;
    /** Node identity display name, if the shell shared it. */
    nodeDisplayName?: string;
}
/** Check if running inside an iframe (embedded in Surf/desktop). */
export declare function isInIframe(): boolean;
/** Get the current parent config synchronously (for use outside React). */
export declare function getParentConfig(): ParentRpcConfig | null;
/**
 * Subscribe to parent-config updates. Returns an unsubscribe function.
 *
 * Replays the current singleton synchronously if it is already set: the module
 * listener above attaches at import time and can populate `parentConfig` before a
 * consumer (e.g. a React effect) subscribes — the shell posts the handover on the
 * frame's `load` event, which can beat a post-commit effect. Without this replay a
 * late subscriber would never learn the config already arrived and would hang in
 * 'pending' forever.
 */
export declare function subscribeParentConfig(fn: (config: ParentRpcConfig | null) => void): () => void;
//# sourceMappingURL=parentConfig.d.ts.map