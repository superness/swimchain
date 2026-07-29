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

import { createSHA256 } from 'hash-wasm';

import { encodeWireSpaceId, nodeIdentity, rpcCall, type RpcAuth } from '../lib/shoalRpc';
import type { SignFn } from '../lib/shoalSend';

// ---------------------------------------------------------------------------
// The water
// ---------------------------------------------------------------------------

/**
 * The app namespace every Shoal space lives under. `create_space` derives an
 * app-namespaced space's id from `(app, display)` alone — `app_space_id_16`,
 * `sha256("app:<app>:v1:<display>")[..16]`, App-classed
 * (`src/types/space_class.rs:70-73`) — so `@shoal:main` names ONE space that
 * every node computes identically and nobody can squat.
 */
export const WATER_APP = 'shoal';

/**
 * The display half of `@shoal:main`.
 *
 * IT IS MATCHED AGAINST `SpaceSummary.name` AS WRITTEN HERE, without the
 * `@shoal:` marker, and that is not a shortcut — `list_spaces` reports app
 * spaces by their CLEAN display name with the marker stripped, and carries the
 * namespace separately in `app` (`src/rpc/types.rs:754-763`). Matching the full
 * `@shoal:main` against `name` would find nothing, on a node where the space is
 * present and healthy, and this module would then report no water forever.
 */
export const WATER_NAME = 'main';

/**
 * What `create_space` is given for this water — the two halves above, joined in
 * the form `parse_app_space_name` accepts (`src/types/space_class.rs:52`).
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

/** The room post every swimmer replies into. Its title and body are the whole
 *  of its identity: `submit_post` hashes `${title}\n\n${body}` and the content
 *  id is that hash, so the room needs no lookup table, no configuration and no
 *  discovery — deriving it from these two strings is exact.
 *
 *  THE SPACE IS NOT IN THAT PREIMAGE (`src/rpc/methods.rs:2086-2089`) and
 *  `get_replies` is keyed on the parent content id alone. THIS IS CONTENT
 *  ADDRESSING WORKING, NOT A NODE BUG — the same identical-bytes-are-one-object
 *  rule holds across `submit_post`, `submit_reply` and `submit_edit`, and
 *  "fixing" it by salting the preimage with a space id would be a consensus
 *  change that re-scored every content id ever minted. Nobody should go looking
 *  for that.
 *
 *  What it means for US is a naming obligation, and it is ours alone: two
 *  spaces whose room posts share a title and body share ONE room and one reply
 *  set. So a room that must stay separate needs separate TEXT, not merely a
 *  separate space — see `scripts/regtest-smoke.ts`, where it was not true until
 *  Task 2 and the smoke's moves would have landed in the real water. */
export const ROOM_TITLE = 'The Shoal';
export const ROOM_BODY = 'the room every swimmer replies into';

/**
 * `sha256:<hex>` for the room post, derived the way the node derives it.
 *
 * Async only because `hash-wasm` is (the same digest `shoalSend` mines over);
 * the value is constant for a given title/body and this module computes it once
 * per call, not per write.
 */
export async function roomContentId(): Promise<string> {
  const hasher = await createSHA256();
  hasher.update(new TextEncoder().encode(`${ROOM_TITLE}\n\n${ROOM_BODY}`));
  return `sha256:${hasher.digest('hex')}`;
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
  readonly spaceId: string;
  readonly roomContentId: string;
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

/** The App space class byte, the first of the 16 (`SpaceClass::App.byte()`,
 *  src/types/space_class.rs:15-23). */
const APP_CLASS_BYTE = 0x05;

/**
 * The water's space id, in the node's own bech32m wire form — **derived, not
 * discovered**.
 *
 * ## WHY THIS IS NOT A `list_spaces` LOOKUP ANY MORE
 *
 * It used to be, matching `(app, name)` against the node's listing. **That
 * cannot work on a fresh install, which is the only machine that matters
 * here**, and Task 4's live run is what showed it. A brand-new node that had
 * fully synced mainnet reported this exact space as:
 *
 *     {"space_id":"sp1qqz4vc5lj…","class":"app",
 *      "app":null,"name":null,"name_unresolved":true,"post_count":1}
 *
 * `app` and `name` come from the on-chain space REGISTRY, written only by
 * `register_spaces_from_content_block` (src/node/router/router.rs:4947-4980),
 * which returns early unless the content block carries `space_metadata` — and
 * the block this node synced logged `space_metadata=NONE`. The name is
 * recoverable only by asking a peer (`resolve_space_name` broadcasts
 * `GET_SPACE_META`), and in the live run four peers were asked and **none ever
 * answered**. So the match had nothing to match on, forever, and the player sat
 * in the shallows.
 *
 * ## WHY DERIVING IS EXACT RATHER THAN A GUESS
 *
 * An app-namespaced space is NAME-ADDRESSED: `create_space` derives its id from
 * `(app, display)` alone — `app_space_id_16`, `sha256("app:<app>:v1:<display>")[..16]`
 * with the class byte in front (src/types/space_class.rs:70-73) — then
 * `encode_space_id` wraps it bech32m (src/rpc/methods.rs:186-194). Both inputs
 * are `WATER_APP` and `WATER_NAME`, two constants this module already owns and
 * `scripts/mint-water.ts` already imports. So this computes the same id the
 * minter computed, from the same two strings, and it cannot drift.
 *
 * **This is not the "baking" Task 3b rejected.** Baking would paste a literal
 * `sp1…` into the client — a second source of truth for a value derived from
 * constants already here. Deriving adds no second source, needs no round trip,
 * and Task 3b's own argument ("the id is a pure function of two constants this
 * client already holds") is precisely the argument for it.
 *
 * ## WHAT WAS GIVEN UP, DELIBERATELY
 *
 * `list_spaces` is gone from this path entirely rather than kept as a fallback.
 * A fallback would be a check that fails exactly on a fresh install, which is
 * the case it would exist to serve. It is also not needed as a readiness
 * signal: `submit_reply` rejects an unknown PARENT outright
 * (src/rpc/methods.rs:3070-3084) and never validates the space separately, so
 * `roomReady` below is the gate that actually decides whether a write can land.
 * Dropping it also removes a full chain + content-store scan (the node's own
 * comment on `build_space_list`) from every retry.
 */
export async function waterSpaceId(): Promise<string> {
  const hasher = await createSHA256();
  hasher.update(new TextEncoder().encode(`app:${WATER_APP}:v1:${WATER_NAME}`));
  const digest = hasher.digest('binary');

  const id16 = new Uint8Array(16);
  id16[0] = APP_CLASS_BYTE;
  id16.set(digest.subarray(0, 15), 1); // apply_class: class byte + hash[..15]
  return encodeWireSpaceId(id16);
}

/**
 * Is the room post here YET — and if not, ask the network for it.
 *
 * ## `get_content` NEVER FETCHES, AND THAT IS THE DESIGN
 *
 * It is a purely local `content_store.get` (src/rpc/methods.rs:4240-4460).
 * Nodes on this network fetch content on demand only, so a body nobody has
 * asked for never arrives — see the project's own standing note on this
 * ("content getting needs a driver"). Task 4's live run watched exactly that:
 * the room's content BLOCK was on the fresh node's chain with `"body":null`,
 * and it stayed that way while the window retried, because nothing in this
 * client had ever asked.
 *
 * So this asks. `request_content` (src/rpc/methods.rs:8251) marks the id wanted,
 * queries the DHT for providers and broadcasts `WHO_HAS`; it returns
 * immediately with `found_locally` / `requested` / `discovering` and the body
 * arrives later over `DATA_CONTENT`. In the live run the answer took **3 m 18 s**
 * to come back, served by four ordinary peers — the content was on the network
 * the whole time and only the asking was missing.
 *
 * IT RETURNS `false` RATHER THAN WAITING. The caller (`seaChoice.retryDelayMs`)
 * already owns a patient, never-give-up schedule and keeps the shallows playing
 * meanwhile, which is exactly the right place for a three-minute wait to live.
 * Blocking here would freeze that loop on a call with no deadline of its own.
 *
 * A failing `request_content` is logged and swallowed: it is a best-effort
 * nudge, and the next attempt will nudge again.
 */
async function roomReady(auth: RpcAuth, contentId: string): Promise<boolean> {
  try {
    await rpcCall<unknown>(auth, 'get_content', { content_id: contentId });
    return true;
  } catch {
    try {
      await rpcCall<unknown>(auth, 'request_content', { content_id: contentId });
    } catch (e) {
      say(`could not ask the water for ${contentId}: ${String(e)}`);
    }
    return false;
  }
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
 *   - the node reported no usable identity;
 *   - the room post's body has not arrived yet (which is asked for on the way).
 *
 * "The node has never heard of this water" is NO LONGER one of them: the space
 * id is derived rather than looked up, so there is nothing left to not-find.
 * See `waterSpaceId`.
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

  // WHERE. The space is derived from two constants, so it cannot fail for want
  // of a peer; the room is the one thing that has to actually be here.
  let spaceId: string;
  let room: string;
  try {
    spaceId = await waterSpaceId();
    room = await roomContentId();
  } catch (e) {
    say(`could not work out where ${WATER_SPACE_NAME} is: ${String(e)}`);
    return null;
  }
  if (!(await roomReady(auth, room))) {
    say(`${WATER_SPACE_NAME} is here but ${room} has not arrived yet — asked for it`);
    return null;
  }

  return {
    auth,
    spaceId,
    roomContentId: room,
    authorIdHex: identity.publicKeyHex,
    address: identity.address,
    signer: Promise.resolve({ publicKeyHex: identity.publicKeyHex, sign: identity.sign }),
  };
}
