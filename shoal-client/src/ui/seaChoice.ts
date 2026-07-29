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
import type { Vec } from '../lib/shoalTypes';
import { MIN_EMIT_GAP_MS } from '../lib/shoalEmit';
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
// Which water the player's own body is in
// ---------------------------------------------------------------------------

/**
 * The sea the frame loop folds and draws — which is NOT the same question as
 * `chooseSeaSource`, and keeping the two apart is the whole of this section.
 *
 *   scene     there is no configuration, so there is no water to be in. The
 *             offline scene picker decides (`App.tsx`'s `SceneKind`).
 *   chain     real water, and it will have us.
 *   shallows  real water, and it will NOT have us yet (spec §2.16). The
 *             player swims the tutorial water while their own writes keep
 *             knocking at the door of the real one — see `knockOn`.
 */
export type PlayedWater = 'scene' | 'chain' | 'shallows';

/**
 * WHICH WATER THE PLAYER PLAYS IN, given whether a configuration exists and
 * whether the water has refused them.
 *
 * ## The lockout this function is one half of
 *
 * "If refused, show the shallows instead of the real water" is the obvious
 * implementation and it is a SILENT PERMANENT LOCKOUT. The shallows is
 * offline. If it replaces the chain sea, this client stops writing — and a
 * write that goes through is the only evidence it will ever have that somebody
 * has let this swimmer in (`wayIn.ts`). The one signal that could lift the
 * edge is the one the swap deletes. No error, nothing wrong in the logs, and
 * the door can only be opened from a side nobody is standing on.
 *
 * So this function answers where the player's BODY is, and `knockOn` below
 * answers where their WRITES go, and the two answers are deliberately
 * different while the edge is up. Two presences, not two seas.
 *
 * ## Why `atTheEdge` cannot decide anything when there is no chain sea
 *
 * It never happens — the standing is raised by a refused chain write, so a
 * window that never had a chain sea cannot be at the edge — but the rule is
 * written to be total rather than to rely on that, because the caller's own
 * `null` check and this one would otherwise have to agree by hand. A window
 * with no configuration shows the offline scene whatever it believes about its
 * standing.
 */
export function chooseWater(hasChain: boolean, atTheEdge: boolean): PlayedWater {
  if (!hasChain) return 'scene';
  return atTheEdge ? 'shallows' : 'chain';
}

/**
 * KEEP KNOCKING. Publish the vector the player just authored into the real
 * water as well, while their body is swimming in the shallows.
 *
 * ## Why this is a re-stamp of the player's own vector and not a second life
 *
 * There is exactly ONE emitter in this client (`input.emitDue`, called once
 * per frame from `App.tsx` step 3, and only when `shouldEmit` agrees), and
 * that is a rate discipline as much as an architecture: `MIN_EMIT_GAP_MS`
 * is the only thing keeping one window from crowding the per-space mempool
 * budget every swimmer shares (shoalEmit.ts). A separate knocker with a timer
 * of its own would be a second emitter answering to nothing, and it would
 * double this window's write rate the moment the edge went up — at exactly the
 * moment the node has told us it wants fewer of our writes, not more.
 *
 * So the knock is the write the player's own game was making anyway. Nothing
 * is fabricated: the vector is theirs, from the swimmer they are steering, in
 * the same world coordinates. The only thing that changes is the timestamp.
 *
 * ## The timestamp is the load-bearing part
 *
 * `vec.t` arrives on the SHALLOWS' clock, which is a constant instant inside a
 * constant epoch (`SHALLOWS_OPEN_MS`) so that the teaching moment lands on the
 * same tick on every machine. That instant is somewhere in 1970. A write
 * carrying it would be refused by the node's own timestamp window rather than
 * by `check_identity_sponsored`, so the client would stop hearing the one
 * error code its standing is built on — and an acceptance, when it finally
 * came, would never arrive at all. `wallAuthorMs` is the caller's own frame
 * clock, read once, the same read `App.tsx` derives the sea instant from.
 *
 * ## Eat claims are NOT knocked, and that is not an oversight
 *
 * A presence vector is a statement about the swimmer's own body, and that body
 * is the same body in either water. An eat claim is a claim on one cell of one
 * sea's bloom map, judged against where everybody else in THAT sea has been —
 * and in the real water this swimmer has never been anywhere. Knocking it
 * would be asking to be credited for a bite taken somewhere else.
 */
/**
 * MAY A WRITE LEAVE THIS WINDOW FOR THE NODE AT `wallMs`, given when the last
 * one did?
 *
 * ## Why the floor needs a second home, on a second clock
 *
 * `shouldEmit` (shoalEmit.ts) already holds `MIN_EMIT_GAP_MS`, and its own
 * header calls the floor absolute with "no change-of-mind exception" — it is
 * the only thing keeping one window from crowding the per-space mempool budget
 * that every swimmer in the water shares. But it holds it against an
 * `InputState`, and the input state is REBUILT whenever the standing changes,
 * because the shallows and the real water keep clocks decades apart and
 * carrying one across is a lockout of its own (App.tsx's effect deps). A fresh
 * `InputState` has a null `last`, for which `shouldEmit` returns true
 * unconditionally — so the first write on the far side of a transition left
 * 94 ms after the one before it. Measured, both ways: `[115, 8001, 37, 8013,
 * 8017]` for a window refused twice and then let in.
 *
 * So the floor is enforced a second time HERE, on the wall clock, where it can
 * be true across a rebuild: this is the one clock both seas' writes are stamped
 * on (`knockOn` re-stamps the shallows'), and the one the node's rate limit
 * actually runs on. `lastNodeWriteMs` lives in a ref that outlives the frame
 * effect, which is the whole point of it.
 *
 * ## What a refused write costs, stated rather than hidden
 *
 * `emitDue` has already called `markEmitted` by the time this answers, so a
 * write the floor turns away is one this swimmer's peers never see: the world's
 * copy of their vector is one behind until the next emit. That is bounded by
 * `MAX_EMIT_GAP_MS` (8 s) plus this floor (3 s), against a `PRESENCE_TTL_MS` of
 * 90 s, and it can only happen on the two frames a session where the standing
 * changes. The alternative — writing anyway — is breaking the one rule that
 * protects everybody else in the space, to save one vector at a moment when
 * this window has just published a nearly identical one.
 *
 * `lastNodeWriteMs < 0` is "this window has never written", which must not be
 * treated as a write at the epoch.
 */
export function nodeWriteDue(lastNodeWriteMs: number, wallMs: number): boolean {
  return lastNodeWriteMs < 0 || wallMs - lastNodeWriteMs >= MIN_EMIT_GAP_MS;
}

export function knockOn(
  chain: ChainSea | null,
  water: PlayedWater,
  vec: Vec,
  wallAuthorMs: number,
  say?: string,
): void {
  // `'chain'` means the played sea IS this chain sea and has already been
  // handed the write; knocking as well would publish everything twice.
  if (chain === null || water !== 'shallows') return;
  chain.publish({ ...vec, t: wallAuthorMs }, say);
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
