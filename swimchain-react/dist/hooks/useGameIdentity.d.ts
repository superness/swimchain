/**
 * useGameIdentity — unified identity + signing for embeddable game clients
 * (reef/chess/chips).
 *
 * A game can run in one of three modes:
 *
 *  - **node mode** (embedded in the Surf/desktop shell, shell shared a node
 *    identity): the game adopts the user's real NODE identity and signs every
 *    action via the node's `sign_message` RPC. The browser never holds a
 *    keypair or seed, and the "create/import identity" mint gate is skipped.
 *
 *  - **browser mode** (standalone tab, or embedded with no node identity to
 *    lend): unchanged legacy behavior — a browser keypair persisted in
 *    localStorage (`useStoredIdentity` / `useStoredKeypair`) signs locally.
 *
 *  - **pending**: embedded, still waiting for the shell's `SWIMCHAIN_RPC_CONFIG`
 *    handover. Callers must render a loading state, not the mint gate.
 *
 * The mode is selected by {@link selectIdentityMode}. Mirrors
 * `chat-client/src/hooks/useChatIdentity.tsx`.
 *
 * ---
 * ## SEAM 1 vs SEAM 2 — READ THIS BEFORE TOUCHING `setAuth`
 *
 * `@swimchain/react`'s `useRpc().setAuth` (→ `SwimchainRpc.setSignatureAuth`)
 * is the **transport** auth seam: `SwimchainRpc.call()` invokes it on EVERY
 * request to build the `X-CS-*` signature headers. The node signer works by
 * calling `rpc.call('sign_message', ...)`. Wiring the node signer into
 * `setAuth` would recurse forever: `call → setAuth's sign → call('sign_message')
 * → setAuth's sign → …` — no request would ever complete.
 *
 * So:
 *  - **Node mode never calls `setAuth`.** `signatureAuth` stays `null`, and
 *    `SwimchainRpc.call()` falls back to its `authHeader` branch (the node
 *    identity's cookie, handed over via `SWIMCHAIN_RPC_CONFIG`) for transport
 *    auth on `sign_message` and every other request. The node signer is
 *    exposed ONLY as this hook's returned `sign` — SEAM 2, the action-payload
 *    seam games use as `me.sign`, awaited by `signAction`, which submits via
 *    `call()` (transport = cookie, no recursion).
 *  - **Browser mode calls `setAuth`** with the local keypair — the browser key
 *    IS the transport auth (no cookie exists standalone).
 *
 * This mirrors `chat-client/src/lib/rpc.ts:278-289`, which never routes its
 * remote (node) signer into the header-building branch of `call()`.
 *
 * ### The browser→node flip (launcher cold-launch race)
 *
 * The real launcher shell (`launcher-apps/app-shell/web/embed.js`) sends the
 * FIRST `SWIMCHAIN_RPC_CONFIG` with `nodeAddress: ''` (the node identity
 * isn't loaded yet), then re-posts it once `get_identity_info` resolves.
 * `selectIdentityMode` therefore starts as `'browser'` and flips to `'node'`
 * a moment later — this is the NORMAL cold-launch path, not a rare edge case.
 * During the `'browser'` beat this hook calls `setAuth({publicKey, sign})`;
 * if nothing clears it on the flip, `SwimchainRpc.call()`'s precedence
 * (`signatureAuth → authHeader → auth`, `rpc.ts:254-272`) means EVERY
 * subsequent request — including `get_identity_info`/`sign_message`
 * themselves — keeps signing with the stale browser keypair instead of using
 * the node's cookie, silently defeating node mode. A `useRef` tracks the
 * previous mode so a transition AWAY from `'browser'` (browser → node or
 * browser → pending) clears the transport auth with `setAuth(null)`. This is
 * a CLEAR, not a wire-up: passing `null` cannot recurse into `sign_message`,
 * so it does not reintroduce the SEAM 1/SEAM 2 hazard above. Mounting
 * directly into `'node'`/`'pending'` (no prior `'browser'` beat) never calls
 * `setAuth` at all, clear or otherwise — there is nothing stale to clear.
 *
 * @packageDocumentation
 */
import { type StoredIdentity } from './useStoredIdentity';
/** Which identity source is active. */
export type IdentityMode = 'node' | 'browser' | 'pending';
/** Normalized identity exposed to game components, regardless of mode. */
export interface GameIdentity {
    /** Raw 32-byte public key. */
    publicKey: Uint8Array;
    /** Hex-encoded public key. */
    publicKeyHex: string;
    /** cs1... bech32m address. */
    address: string;
    /**
     * Optional human-readable name. Node mode only, sourced from the shell's
     * `nodeDisplayName` (`get_identity_info` returns no name — finding #4).
     * Empty/undefined in Surf today since the shell doesn't post it yet.
     */
    displayName?: string;
}
export interface UseGameIdentityResult {
    /** Which identity source is active. */
    mode: IdentityMode;
    /** The active identity, or null if none is available yet. */
    identity: GameIdentity | null;
    /** True once an identity is usable for signing/posting (`identity !== null`). */
    hasIdentity: boolean;
    /**
     * True while the identity/mode is still being resolved. Callers MUST check
     * this before the `!hasIdentity` mint gate — otherwise the mint gate flashes
     * during the async node-identity fetch while embedded.
     */
    isLoading: boolean;
    /**
     * Sign an action-payload message (SEAM 2 — `me.sign`, NOT transport auth).
     * Node mode → the node's `sign_message` RPC (private key never leaves the
     * node). Browser mode → the local keypair, wrapped to an async signature.
     * Resolves null if signing is unavailable.
     */
    sign: (message: Uint8Array) => Promise<Uint8Array | null>;
    /** Save a browser identity to localStorage. No-op in node/pending mode. */
    saveIdentity: (identity: StoredIdentity) => void;
    /** Clear the stored browser identity. No-op in node/pending mode. */
    clearIdentity: () => void;
}
/**
 * Resolve the active game identity (node or browser) and expose a single
 * `sign` function games use for action payloads. See the module docstring for
 * the SEAM 1 (transport) vs SEAM 2 (action payload) split — this hook is what
 * centralizes that decision so call sites don't have to know which mode
 * they're in.
 */
export declare function useGameIdentity(): UseGameIdentityResult;
//# sourceMappingURL=useGameIdentity.d.ts.map