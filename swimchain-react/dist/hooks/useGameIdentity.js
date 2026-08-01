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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRpc } from './useRpc';
import { useStoredIdentity, useStoredKeypair } from './useStoredIdentity';
import { getParentConfig, isInIframe, subscribeParentConfig, } from '../lib/parentConfig';
import { selectIdentityMode } from '../lib/identityMode';
import { hexToBytes, bytesToHex } from '../lib/utils';
/**
 * Resolve the active game identity (node or browser) and expose a single
 * `sign` function games use for action payloads. See the module docstring for
 * the SEAM 1 (transport) vs SEAM 2 (action payload) split — this hook is what
 * centralizes that decision so call sites don't have to know which mode
 * they're in.
 */
export function useGameIdentity() {
    // ---- Mode selection ----
    // getParentConfig() covers the case where the shell's postMessage already
    // landed before this hook mounted (its `load`-event handover can beat a
    // post-commit effect); subscribeParentConfig covers everything after,
    // including a replay if the singleton was already populated.
    const [parentConfig, setParentConfig] = useState(() => getParentConfig());
    useEffect(() => subscribeParentConfig(setParentConfig), []);
    const inIframe = isInIframe();
    const mode = selectIdentityMode(parentConfig, inIframe);
    const { rpc, connected, setAuth } = useRpc();
    // ---- Browser identity (localStorage keypair) ----
    // Always mounted (Rules of Hooks) regardless of mode, but its data is only
    // ever surfaced into `identity`/`sign` when mode === 'browser' below — see
    // the split-brain guard note there.
    const { identity: storedIdentity, isLoading: browserIdentityLoading, saveIdentity: saveBrowserIdentity, clearIdentity: clearBrowserIdentity, } = useStoredIdentity();
    const { keypair: browserKeypair, publicKey: browserPublicKeyBytes, publicKeyHex: browserPublicKeyHex, sign: browserSignSync, } = useStoredKeypair();
    // ---- Node identity (fetched from the node via RPC, node mode only) ----
    const [nodeIdentity, setNodeIdentity] = useState(null);
    const [nodeError, setNodeError] = useState(null);
    const fetchNodeIdentity = useCallback(async () => {
        if (!rpc || !connected)
            return;
        try {
            const result = await rpc.call('get_identity_info', {});
            if (result.has_identity && result.public_key && result.address) {
                setNodeIdentity({ publicKeyHex: result.public_key, address: result.address });
                setNodeError(null);
            }
            else {
                setNodeIdentity(null);
                setNodeError('Node has no identity loaded');
            }
        }
        catch (err) {
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
        const timeouts = retryDelays.map((delay) => setTimeout(() => {
            setNodeIdentity((current) => {
                if (!current)
                    fetchNodeIdentity();
                return current;
            });
        }, delay));
        return () => timeouts.forEach(clearTimeout);
    }, [mode, connected, fetchNodeIdentity]);
    // ---- Resolve the active identity for the current mode ----
    // Split-brain guard: while embedded and node-authoritative (mode 'node' or
    // 'pending'), NEVER surface the browser/localStorage identity here, even
    // though useStoredIdentity/useStoredKeypair above are always mounted and may
    // hold a stale identity from a prior standalone session. Only the
    // mode === 'browser' branch reads storedIdentity/browserPublicKey*.
    const identity = useMemo(() => {
        if (mode === 'node') {
            if (!nodeIdentity)
                return null;
            return {
                publicKey: hexToBytes(nodeIdentity.publicKeyHex),
                publicKeyHex: nodeIdentity.publicKeyHex,
                address: nodeIdentity.address,
                displayName: typeof parentConfig?.nodeDisplayName === 'string'
                    ? parentConfig.nodeDisplayName
                    : undefined,
            };
        }
        if (mode === 'browser') {
            if (storedIdentity?.seed && storedIdentity.publicKey && storedIdentity.address) {
                return {
                    publicKey: browserPublicKeyBytes ?? hexToBytes(storedIdentity.publicKey),
                    publicKeyHex: browserPublicKeyHex ?? storedIdentity.publicKey,
                    address: storedIdentity.address,
                    displayName: storedIdentity.displayName,
                };
            }
        }
        return null; // mode === 'pending', or no usable identity yet
    }, [mode, nodeIdentity, parentConfig, storedIdentity, browserPublicKeyBytes, browserPublicKeyHex]);
    // ---- Unified async signer (SEAM 2 — action payloads, NOT transport auth) ----
    const sign = useCallback(async (message) => {
        if (mode === 'node') {
            if (!rpc || !connected)
                return null;
            try {
                const result = await rpc.call('sign_message', { message: bytesToHex(message) });
                return hexToBytes(result.signature);
            }
            catch {
                return null;
            }
        }
        // browser mode (and pending, harmlessly: no keypair loaded ⇒ null)
        return browserSignSync(message);
    }, [mode, rpc, connected, browserSignSync]);
    // ---- Transport auth (SEAM 1) — browser mode ONLY, with a clear-on-flip. ----
    // CRITICAL: node mode must NEVER push a SIGNING setAuth here — that would
    // wire the node's sign_message-based signer into the transport seam and
    // recurse forever (see module docstring). Node mode leaves `signatureAuth`
    // null so `call()` falls back to the `authHeader` cookie.
    //
    // But a mode FLIP away from 'browser' (browser → node or browser → pending
    // — the launcher's normal cold-launch race, see module docstring) can leave
    // a stale signing `signatureAuth` on the rpc client from the 'browser' beat.
    // Since `call()`'s precedence is signatureAuth → authHeader → auth, that
    // stale entry would keep authenticating every request — including
    // get_identity_info/sign_message themselves — as the old browser key
    // instead of the node's cookie, silently defeating node mode. `prevModeRef`
    // tracks the mode from the previous run of this effect so we can clear
    // with `setAuth(null)` exactly on that transition — never on a mount that
    // starts directly in 'node'/'pending' (nothing stale to clear there), and
    // never as a wire-up of the node signer (null cannot recurse into
    // sign_message, so this does not reintroduce the SEAM 1/SEAM 2 hazard).
    const prevModeRef = useRef(null);
    useEffect(() => {
        const prevMode = prevModeRef.current;
        prevModeRef.current = mode;
        if (mode === 'browser') {
            if (!browserKeypair || !browserPublicKeyHex)
                return;
            setAuth({
                publicKey: browserPublicKeyHex,
                sign: (m) => {
                    const s = browserSignSync(m);
                    if (!s)
                        throw new Error('useGameIdentity: browser signing failed');
                    return s;
                },
            });
            return;
        }
        if (prevMode === 'browser') {
            setAuth(null);
        }
    }, [mode, browserKeypair, browserPublicKeyHex, browserSignSync, setAuth]);
    // ---- Loading / readiness ----
    const isLoading = useMemo(() => {
        if (mode === 'pending')
            return true; // still waiting for the shell's config
        if (mode === 'node')
            return !nodeIdentity && !nodeError;
        return browserIdentityLoading;
    }, [mode, nodeIdentity, nodeError, browserIdentityLoading]);
    // ---- Browser-mode passthroughs (no-ops while embedded/node-authoritative) ----
    const saveIdentity = useCallback((next) => {
        if (mode === 'node' || mode === 'pending')
            return;
        saveBrowserIdentity(next);
    }, [mode, saveBrowserIdentity]);
    const clearIdentity = useCallback(() => {
        if (mode === 'node' || mode === 'pending')
            return;
        clearBrowserIdentity();
    }, [mode, clearBrowserIdentity]);
    return {
        mode,
        identity,
        hasIdentity: identity !== null,
        isLoading,
        sign,
        saveIdentity,
        clearIdentity,
    };
}
//# sourceMappingURL=useGameIdentity.js.map