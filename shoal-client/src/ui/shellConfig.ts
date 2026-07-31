/**
 * The Shoal — the NON-DEV way to be configured (plan 4b, Task 1).
 *
 * `buildChainSea` has exactly one configuration path today and it is gated off
 * in every shipped build (`App.tsx:167-177`): query parameters, a signing key
 * derived as `sha256('shoal-two:' + label)`, and the node's RPC cookie in the
 * address bar. That gate is correct and this module does not touch it. This is
 * the second path — the one the gate does not need to cover, because it has
 * neither a URL nor a key.
 *
 * A complete sea configuration is four things, and this module gets all four
 * from the desktop shell and the node it already started:
 *
 *   endpoint + auth   the shell's own `get_rpc_config` command (main.rs:171)
 *   identity          the node's `get_identity_info`, adopted as the player's
 *   a signer          the node's `sign_message`, over the same cookie auth
 *   the water         a named body of water, resolved from the node's own
 *                     space listing plus a room post whose id is fully
 *                     determined by its text
 *
 * ## THE BROWSER NEVER HOLDS A KEY, AND THIS IS NOT A CHOICE OF STYLE
 *
 * `submit_reply` REQUIRES a caller-supplied signature. It builds an `Action`
 * from `params.signature` and runs `validate_content_action_authenticity` over
 * it before anything enters the mempool (`src/rpc/methods.rs:3161-3197`), and
 * cookie auth buys no exemption from that: the node will not author a reply
 * *as itself* just because the caller proved it may talk to it.
 *
 * What cookie auth DOES buy is `sign_message` (`src/rpc/methods.rs:8496`),
 * which signs caller-chosen bytes with the node's own keypair and hands back
 * the 64 bytes. That method is deliberately NOT in `AUTH_EXEMPT_METHODS`
 * (`src/rpc/server.rs:460-467`: "an unauthenticated exemption is a signing
 * oracle") — so it is reachable exactly by a caller holding the cookie, which
 * is what the shell hands this window and nothing else.
 *
 * So the answer is "the caller must sign", and the game still needs no key of
 * its own: it signs THROUGH the node. `shoalRpc.nodeIdentity` already
 * implements precisely that pairing (`get_identity_info` for who, `sign_message`
 * for the signature) and is used here verbatim rather than reimplemented.
 *
 * ## ALL FOUR OR NOTHING
 *
 * Every failure below returns `null`. Never a partial object, never a config
 * with an empty `authorIdHex` or a guessed room — plan 4a's own comment on the
 * dev path names half a configuration "the single most confusing failure
 * available here", and it is worse on this path: a shipped build would render
 * an empty sea that is indistinguishable from a quiet one, with no address bar
 * to inspect and no dev server log to read. A `null` sends the caller to the
 * offline water and says why in the console; a half-configuration sends a
 * player somewhere that looks real and is not.
 *
 * ## READINESS IS INHERITED, NOT REIMPLEMENTED
 *
 * `get_rpc_config` already polls the node's own `.rpc_addr`/`.cookie` handoff
 * files until the node has actually bound RPC, and fails fast with the real
 * reason the moment startup is known to have failed (main.rs:144-201). Every
 * call this module makes happens AFTER that command resolves, on the endpoint
 * it returned — so an identity read cannot race the node's startup, and cannot
 * come from anywhere but the node the shell just started. That is the whole
 * reason the identity is read over RPC rather than off the disk by a second
 * Tauri command: `get_identity_info` reports the keypair the RUNNING node
 * loaded, so it cannot disagree with the node the writes are going to.
 *
 * ## WHY THIS DOES NOT GO THROUGH `resolveAuth`
 *
 * `shoalRpc.resolveAuth` is the right function for Diagnostics and for the
 * smoke scripts: it tries every place a node's address could come from,
 * including an app-shell `SWIMCHAIN_RPC_CONFIG` postMessage from a parent
 * frame and a `SHOAL_RPC_ENDPOINT` env override. That breadth is exactly what
 * this path must not have. A parent-supplied envelope is an endpoint chosen by
 * something outside the shell — the same class of value as `?rpc=`, which is
 * half the reason the dev gate exists — and it would carry the cookie this
 * window signs with to wherever it pointed. THE SHELL'S OWN COMMAND IS THE
 * ONLY SOURCE HERE, and `null` when there isn't one.
 *
 * ## WHY THE IDENTITY IS NOT A SECOND TAURI COMMAND
 *
 * The obvious shape — a shell command that reads the identity off disk
 * alongside `get_rpc_config` — is worse in the exact way the brief warns
 * about. `sw identity show` reads `identity.enc` (`src/cli/commands/identity.rs:226-244`)
 * and that file exists from first-run bootstrap onward, so a disk-backed
 * command would happily answer BEFORE the node has bound RPC, or after it has
 * died — an identity with no node behind it, which is precisely the stale
 * answer readiness is supposed to prevent. `get_identity_info` reports the
 * keypair the RUNNING node loaded, over the endpoint `get_rpc_config` only
 * returns once the node published it, and it is the same identity
 * `sign_message` will sign with because it is the same process. There is no
 * ordering in which those two can disagree.
 *
 * ## No player-facing text lives here
 *
 * Spec §1.1's diegetic rule. The console lines below are developer output on a
 * path a player never sees rendered, exactly like `chainParams`' own; nothing
 * in this module is drawn.
 */

import { nodeIdentity, type RpcAuth } from '../lib/shoalRpc';
import { WATER_APP, waterNamed, type Water } from '../lib/water';
import type { SignFn } from '../lib/shoalSend';

// ---------------------------------------------------------------------------
// The water
// ---------------------------------------------------------------------------

/**
 * The app namespace and the display name of the water a shipped build joins.
 *
 * `WATER_APP` is re-exported from `src/lib/water.ts`, which is where the whole
 * derivation moved: an app-namespaced space's id and every one of its rooms are
 * functions of the SAME name, and holding those two derivations in two modules
 * with nothing joining them is what Task 1's review called "where the next
 * symptomless fork lives". `waterNamed(WATER_NAME)` does both at once and
 * returns the `Water` everything downstream takes.
 *
 * `WATER_NAME` is the display half of `@shoal:main`, without the marker — the
 * form `list_spaces` reports and the form `roomTextFor` requires.
 */
export { WATER_APP } from '../lib/water';
export const WATER_NAME = 'main';

/**
 * What `create_space` is given for this water, in the form
 * `parse_app_space_name` accepts (`src/types/space_class.rs:52`).
 *
 * EXPORTED SO WHATEVER MINTS THE WATER AND WHATEVER JOINS IT CANNOT DRIFT, and
 * that is now enforced rather than hoped for: `scripts/mint-water.ts` is the
 * only thing that creates this space, it imports this constant rather than
 * typing the name, and `seaChoice.test.ts` section 4 fails if it ever grows a
 * `@shoal:` literal of its own. The failure being prevented has no symptom to
 * find it by — a mistyped name mints a space that exists, is healthy, accepts
 * writes, and is invisible to every shipped build forever.
 *
 * The smoke scripts are NOT copies of this and must not import it: they mint
 * `@shoal:smoke`, `@shoal:two` and `@shoal:cp` precisely so a test run cannot
 * write into the water people are playing in.
 */
export const WATER_SPACE_NAME = `@${WATER_APP}:${WATER_NAME}`;

/**
 * The water a shipped build swims in — the space id AND the name every hour's
 * room is derived from, produced together.
 *
 * ## `ROOM_TITLE`, `ROOM_BODY` AND `roomContentId` USED TO LIVE HERE AND ARE GONE
 *
 * They named ONE room, forever, and a room is a function of the hour now
 * (`shoalRoom.ts`). Keeping them would have left two modules naming two
 * different rooms with the same constant name — which Task 1's review flagged
 * and deferred to this task precisely because this task deletes one side.
 *
 * With them goes this module's `roomReady` gate, and that is a fix rather than
 * a loss. It asked `get_content` whether the room post had arrived and returned
 * `null` until it had — a purely local read on a network that fetches content
 * only on demand, so a fresh install waited for a peer to answer a
 * `request_content` broadcast. Plan 4b's live run measured that wait at
 * **3 m 18 s**. There is nothing to wait for now: `chainSea` MINTS the hour's
 * room itself, idempotently, and a client that minted a post can reply to it on
 * its own node immediately (`mintRoom`'s header traces why). A room nobody has
 * minted is not a reason to keep a player out of the water; it is a reason for
 * this client to make one.
 *
 * `waterSpaceId()` is kept as a thin wrapper for the harness and the tests that
 * only want the id. Ordinary callers take the whole `Water`.
 */
export async function shellWater(): Promise<Water> {
  return waterNamed(WATER_NAME);
}

/** The water's space id alone, in the node's bech32m wire form (`sp1…`) —
 *  derived, never discovered. See `water.waterNamed` for the full argument
 *  (a fresh install's `list_spaces` reports `name: null` forever). */
export async function waterSpaceId(): Promise<string> {
  return (await shellWater()).spaceId;
}

// ---------------------------------------------------------------------------
// The shell's command surface
// ---------------------------------------------------------------------------

/** The one Tauri capability this module uses. Narrow on purpose: a test injects
 *  this, and a test that could inject anything wider would be proving less. */
export type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * The desktop shell's command surface, or `null` when there isn't one.
 *
 * Reached through `globalThis.window` rather than the bare `window` identifier
 * so this module stays importable under plain `tsx` (where `window` is not
 * defined at all and the bare reference is a `ReferenceError`, not `undefined`).
 * `__TAURI__` is the global Tauri v2 injects when `app.withGlobalTauri` is true
 * — the same one `shoalRpc.tauriConfig` reads, and the reason that flag must
 * stay set in `tauri.conf.json`.
 *
 * `null` here is what makes a browser build unaffected by this whole module: no
 * shell, no configuration, and the caller falls back to whatever it showed
 * before.
 */
export function shellSurface(): InvokeFn | null {
  const win = (globalThis as {
    window?: { __TAURI__?: { core?: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } } };
  }).window;
  const core = win?.__TAURI__?.core;
  if (!core || typeof core.invoke !== 'function') return null;
  return <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => core.invoke<T>(cmd, args);
}

// ---------------------------------------------------------------------------
// The assembled configuration
// ---------------------------------------------------------------------------

/**
 * Everything `chainSea` needs, and nothing it does not. Deliberately shaped as
 * the subset of `ChainSeaConfig` that describes WHERE and WHO — `spawn`,
 * `onError` and `onWrite` are the caller's business and are not decided here.
 */
export interface ShellSeaConfig {
  readonly auth: RpcAuth;
  /** The space AND the name every hour's room is derived from, produced
   *  together by `waterNamed` — see `src/lib/water.ts` on why it is one value
   *  and not a `spaceId` beside a room string. */
  readonly water: Water;
  /** The node's public key, hex — adopted as this player's swimmer id. */
  readonly authorIdHex: string;
  /** The node's bech32m address. Not used to write; carried because it is the
   *  one form of this identity a human can be shown, and diagnostics wants it. */
  readonly address: string;
  /** Already resolved by the time this object exists — a `Promise` only because
   *  that is the shape `ChainSeaConfig.signer` takes. Signing happens on the
   *  node (`sign_message`); nothing here holds a private key. */
  readonly signer: Promise<{ publicKeyHex: string; sign: SignFn }>;
}

interface RpcConfigDto {
  endpoint?: string;
  auth?: string | null;
}

/** Developer output, on a path no player sees rendered (see the module header). */
function say(what: string): void {
  console.error(`[shoal] ${what}`);
}

/**
 * Assemble the whole sea configuration from the shell, or `null`.
 *
 * `null` — never a partial object — when ANY of these is true:
 *   - there is no shell (a browser build, or `withGlobalTauri` off);
 *   - `get_rpc_config` failed or returned no endpoint;
 *   - the node reported no usable identity.
 *
 * TWO REASONS HAVE LEFT THAT LIST. "The node has never heard of this water"
 * went when the space id became derived rather than looked up (`waterNamed`) —
 * there is no listing to miss. "The room post has not arrived yet" went with
 * this task: there is no fixed room any more, and the hour's room is minted by
 * whoever needs it rather than waited for (`shellWater`'s header, and
 * `chainSea`'s `ensureRoom`). What is left are two states of a node that has
 * only just started, both of which pass within seconds.
 *
 * `invoke` is a parameter so a test can drive the whole assembly through a fake
 * command surface; it defaults to the real one, so ordinary callers pass
 * nothing and get the shell if there is a shell.
 */
export async function shellConfig(invoke: InvokeFn | null = shellSurface()): Promise<ShellSeaConfig | null> {
  if (invoke === null) return null; // no shell: a browser build is unaffected

  let cfg: RpcConfigDto;
  try {
    cfg = await invoke<RpcConfigDto>('get_rpc_config');
  } catch (e) {
    say(`the shell could not say where the water is: ${String(e)}`);
    return null;
  }
  if (!cfg || typeof cfg.endpoint !== 'string' || cfg.endpoint === '') {
    say('the shell returned no endpoint');
    return null;
  }
  const auth: RpcAuth = { endpoint: cfg.endpoint, authHeader: cfg.auth ?? null };

  // WHO. `nodeIdentity` throws unless the node reported a public key AND an
  // address, so there is no shape of answer that yields a config with an empty
  // author. The signer it returns calls `sign_message` over this same auth.
  let identity: { publicKeyHex: string; address: string; sign: SignFn };
  try {
    identity = await nodeIdentity(auth);
  } catch (e) {
    say(`no identity to swim as: ${String(e)}`);
    return null;
  }

  // WHERE. Pure computation over one constant — no round trip, so it cannot
  // fail for want of a peer, and no room to wait for (see `shellWater`).
  let water: Water;
  try {
    water = await shellWater();
  } catch (e) {
    say(`could not work out where ${WATER_SPACE_NAME} is: ${String(e)}`);
    return null;
  }

  return {
    auth,
    water,
    authorIdHex: identity.publicKeyHex,
    address: identity.address,
    signer: Promise.resolve({ publicKeyHex: identity.publicKeyHex, sign: identity.sign }),
  };
}
