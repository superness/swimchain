/**
 * Which water this window is in, and how a configuration becomes a sea —
 * plan 4b, Task 2.
 *
 * `App.tsx` had ONE configuration path and it was switched off in every shipped
 * build. There are two now, and this module holds the parts of that which can
 * be run outside a browser: the RULE that picks between them, and the
 * CONSTRUCTION that turns whichever won into a `ChainSea`. What stays in
 * `App.tsx` is the one thing that cannot move — the static `import.meta.env.DEV`
 * gate that keeps `browserIdentity.ts` out of the bundle (see `App.tsx:167-190`,
 * and section 3 of this module's test, which holds that gate in place by name).
 *
 * ## THE RULE, AND WHY IT IS A FUNCTION RATHER THAN A `??`
 *
 * `chooseSeaSource` states, in one place a test can drive, what a build does
 * with each combination of the two paths. The static gate makes the dev path
 * unreachable in a release build and is the security property; this function is
 * the BEHAVIOUR — including the case the gate exists for, `dev=false` with
 * query parameters present and no shell, which must be the offline sea and not
 * an attempt to honour them. A test can assert that; it cannot assert anything
 * about a `??` in a component file that never loads under `tsx`.
 *
 * The two are deliberately belt AND braces, and neither is redundant: remove
 * the gate and the weak key derivation ships (unreachable, but present, in an
 * app whose release build enables devtools); remove this rule and the gate
 * still holds but nothing states what a shipped build DOES.
 *
 * ## No player-facing text lives here
 *
 * Spec §1.1. `onError` below is developer output on the same channel
 * `chainSea` has always used; nothing in this module is drawn.
 */
import { chainSea, type ChainSea } from './chainSea';
import type { RpcAuth } from '../lib/shoalRpc';
import type { SendFailure, SignFn } from '../lib/shoalSend';
import { WORLD_H, WORLD_W } from '../lib/shoalConst';

/**
 * Where a sea's configuration came from, or that there wasn't one.
 *
 *   dev      query parameters — a room a developer typed, with a browser-held
 *            key and the node's cookie in the address bar. DEV BUILDS ONLY.
 *   shell    the desktop shell and the node it started (`shellConfig.ts`) —
 *            no URL, no key in the browser. Available in a release build.
 *   offline  neither. The window shows water nobody else is in.
 */
export type SeaSource = 'dev' | 'shell' | 'offline';

/**
 * WHERE and WHO — the subset of `ChainSeaConfig` both paths produce, and the
 * whole of what they disagree about. `spawn`, `onError` and `onWrite` are the
 * same on either path and are decided by `seaFrom` below, so the two callers
 * cannot drift on them.
 */
export interface WaterConfig {
  readonly auth: RpcAuth;
  readonly spaceId: string;
  readonly roomContentId: string;
  readonly authorIdHex: string;
  readonly signer: Promise<{ publicKeyHex: string; sign: SignFn }>;
}

/**
 * Which of the two configurations a window should swim in.
 *
 * `dev` is `import.meta.env.DEV`, passed rather than read, so this rule can be
 * driven at both values from a test — under `tsx` there is no `import.meta.env`
 * at all and reading it here would make the module unloadable.
 *
 * THE PRECEDENCE IS DEV FIRST, and only one context can even raise the
 * question: `tauri dev`, which is a dev build WITH a shell. A developer who
 * typed `?rpc=&space=&room=` named a specific room on a specific node and is
 * almost certainly running `scripts/two-client-smoke.ts`, which prints those
 * URLs; silently joining the shell's own water instead would replace the sea
 * being captured with a different one that looks very much like it. In a
 * release build the question cannot arise, because `chainParams` is behind the
 * same static gate and reports no parameters however many are in the URL.
 *
 * THE CASE THE GATE EXISTS FOR IS `dev=false, devParams=true, shell=false`.
 * `devtools` is enabled in release (`src-tauri/Cargo.toml`) and `location`
 * is settable from an inspector, so a release build being handed query
 * parameters is a thing that can happen — and the answer is `offline`, not an
 * attempt to honour them.
 */
export function chooseSeaSource(dev: boolean, devParams: boolean, shell: boolean): SeaSource {
  if (dev && devParams) return 'dev';
  if (shell) return 'shell';
  return 'offline';
}

// ---------------------------------------------------------------------------
// Looking again
// ---------------------------------------------------------------------------

/**
 * How long to wait before asking the shell again, given how many times it has
 * already answered "not yet". Geometric from `RETRY_BASE_MS`, capped at
 * `RETRY_CAP_MS`, and it never gives up.
 *
 * ## WHY THERE IS A RETRY AT ALL
 *
 * `shellConfig` returns `null` for six different reasons and only one of them
 * is permanent. The permanent one is "there is no shell at all" — a browser
 * tab — and `App.tsx` returns before ever reaching this schedule for it. Of the
 * rest, one cannot happen twice and the other four are the ordinary condition
 * of a node that has just started:
 *
 *   - `get_rpc_config` failed, or named no endpoint — the node is up as a
 *     process but has not bound RPC yet, which takes up to 120 s from launch;
 *   - the node reported no identity — it is answering, but busy;
 *   - working out where the water is threw. This one is pure computation now
 *     (`waterSpaceId` and `roomContentId` are sha256 over two constants), so it
 *     cannot be a transient and a retry will not help it; it is retried anyway
 *     because a schedule that has to be told which failures are worth repeating
 *     is a schedule that will one day be told wrong;
 *   - THE ROOM'S BODY HAS NOT ARRIVED YET, which is not an error in any sense
 *     and is the reason this retry earns its place. Content on this network is
 *     fetched only when something asks: a fresh install's node holds the room's
 *     content BLOCK within seconds and its BODY only once `request_content` has
 *     been driven and a peer has answered. `shellConfig` drives that ask on
 *     every miss, so each turn of this schedule is a fresh attempt rather than
 *     the same question repeated.
 *
 * "THE NODE HAS NEVER HEARD OF THIS WATER" USED TO BE ON THAT LIST AND IS GONE.
 * The space id was discovered by matching `list_spaces`, which is why a listing
 * call and a slow sync were both reasons to look again. It is derived now
 * (`shellConfig.waterSpaceId`) — sha256 over `WATER_APP`/`WATER_NAME` — so
 * there is no listing to throw and nothing left to not-find. `shellConfig`'s
 * own header says so by name.
 *
 * Asking once meant a first launch that lost any one of those coin flips
 * showed the offline sea FOREVER, until the player thought to restart — which
 * is the same outcome, and the same silence, as the scene lockout this file's
 * `SceneKind` comment describes. A game that is installed and left open should
 * join the water when the water shows up.
 *
 * ## WHY IT NEVER GIVES UP, AND WHY THAT IS CHEAP
 *
 * There is no attempt count at which "the body still has not arrived" becomes
 * false, so any ceiling would be a number chosen to look reasonable and would
 * strand exactly the players with the slowest connections. At the cap this
 * costs four localhost RPCs a minute — and each turn is three or four local
 * reads, not a page walk: the space id is computed rather than searched for, so
 * nothing here scales with how many spaces a node knows about. It stops the
 * instant a configuration exists.
 *
 * `attempt` is clamped before the shift so a window left open for a week cannot
 * overflow the exponent into a nonsense delay.
 */
export const RETRY_BASE_MS = 2_000;
export const RETRY_CAP_MS = 60_000;

export function retryDelayMs(attempt: number): number {
  const n = Math.max(0, Math.min(attempt, 30));
  return Math.min(RETRY_BASE_MS * 2 ** n, RETRY_CAP_MS);
}

/**
 * Mid-world, so a fresh window is somewhere another window's camera can
 * plausibly reach.
 *
 * It only decides where the pointer starts steering from before the first
 * publish — the fold overrides it the moment a real vector for this swimmer
 * arrives. Shared by both paths deliberately: a dev capture and a shipped build
 * that opened in different places would make every screenshot of one a lie
 * about the other.
 */
export const SEA_SPAWN = { x: Math.round(WORLD_W / 2), y: Math.round(WORLD_H / 2) } as const;

/**
 * Turn a configuration — from either path — into the sea the frame loop folds.
 *
 * The caller passes `onWrite` because only it knows what to do with a refusal
 * (spec §2.16: `wayIn.afterWrite` raises the edge of the water for exactly one
 * of the three kinds). Everything else is fixed here so the two paths cannot
 * end up with different spawns, different error channels, or — the one that
 * would actually be silent — one of them missing `onWrite` and never showing a
 * newcomer why nothing they do reaches the water.
 */
export function seaFrom(cfg: WaterConfig, onWrite: (failure: SendFailure | null) => void): ChainSea {
  return chainSea({
    auth: cfg.auth,
    spaceId: cfg.spaceId,
    roomContentId: cfg.roomContentId,
    authorIdHex: cfg.authorIdHex,
    signer: cfg.signer,
    spawn: SEA_SPAWN,
    onError: (where, err) => { console.error(`[shoal] chain sea (${where}):`, err); },
    onWrite,
  });
}
