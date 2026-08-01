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
import { isConfigMessageTrusted, mergeTrustedConfig } from './configTrust';
// Global singleton (persists across subscriber instances, same pattern as
// swimchain-frontend's useParentRpcConfig.ts).
let parentConfig = null;
let listeners = [];
// Set up the message listener once. SSR/test-guarded so a pure module that only
// type-imports from this file (e.g. identityMode.ts) never touches `window`.
if (typeof window !== 'undefined') {
    window.addEventListener('message', (event) => {
        const ctx = { selfOrigin: window.location.origin, parentWindow: window.parent };
        // Validate origin + source before accepting any config (rejects lookalike origins
        // and messages not sent by this frame's real parent — see configTrust.ts).
        if (!isConfigMessageTrusted(event, ctx)) {
            return;
        }
        if (event.data?.type === 'SWIMCHAIN_RPC_CONFIG') {
            const incoming = {
                rpcEndpoint: event.data.rpcEndpoint,
                rpcAuth: event.data.rpcAuth,
                ...(typeof event.data.nodeAddress === 'string'
                    ? { nodeAddress: event.data.nodeAddress }
                    : {}),
                ...(typeof event.data.nodeDisplayName === 'string'
                    ? { nodeDisplayName: event.data.nodeDisplayName }
                    : {}),
            };
            const next = mergeTrustedConfig(parentConfig, incoming);
            if (next !== parentConfig) {
                parentConfig = next;
                listeners.forEach((fn) => fn(parentConfig));
            }
        }
    });
}
/** Check if running inside an iframe (embedded in Surf/desktop). */
export function isInIframe() {
    if (typeof window === 'undefined')
        return false;
    return Boolean(window.parent) && window.parent !== window;
}
/** Get the current parent config synchronously (for use outside React). */
export function getParentConfig() {
    return parentConfig;
}
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
export function subscribeParentConfig(fn) {
    listeners.push(fn);
    if (parentConfig !== null) {
        fn(parentConfig);
    }
    return () => {
        listeners = listeners.filter((l) => l !== fn);
    };
}
//# sourceMappingURL=parentConfig.js.map