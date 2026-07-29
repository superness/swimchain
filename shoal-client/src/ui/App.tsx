/**
 * The window — the sea, and nothing else on top of it.
 *
 * DISPLAY SIDE. This is the only file in the render path that reads a clock or
 * touches the DOM; `render.ts`, `seaPaint.ts` and `input.ts` are all pure in
 * the time they are handed, which is what lets the projection and all four
 * verbs be tested in node.
 *
 * THE DIEGETIC RULE (spec 1.1) IS WHY THERE IS NO CHROME HERE. Not a title,
 * not a legend, not a swimmer's name, not a size readout, not a cooldown
 * number — the whole surface is water and fish. Spec 2.8 says size is worn on
 * the body and IS the scoreboard, and spec 2.4 says the dart's cooldown is
 * displayed as prominently as size, so BOTH are worn on the body: the dart is
 * a ring of light around the player's own fish (`paintDartRing`), read in the
 * same glance, at the same place, at the same scale. A bar in a corner would
 * be a second, worse scoreboard competing with the one the game is about.
 *
 * The one text on the surface is a player's own speech — which is the point of
 * it (spec 2.6: speech is the honest tell that a swimmer is a person).
 *
 * THERE IS NOW A SECOND, AND EXACTLY ONE. A swimmer nobody has let into the
 * water yet is shown `TheEdge` (spec 2.16), which carries two written lines.
 * That is not a hole in the rule above but the rule's own exception: 2.16 says
 * a player who cannot reach the shoal must see A PLACE, NOT AN ERROR, and a
 * place with no way of saying what would change it is a dead end. The words
 * live in `wayIn.ts` and are held to the diegetic rule by name in
 * `wayIn.test.ts`; the surface itself is water, a boundary, and one small fish
 * circling on the wrong side of it. It appears for one classified failure and
 * for nothing else — see `wayIn.afterWrite`.
 *
 * AND THE WATER UNDER IT IS A SEA THEY CAN PLAY. A refused swimmer is put in
 * the shallows (`seaChoice.chooseWater`) rather than left standing in water
 * that carries nothing they do — while the same frame loop goes on publishing
 * their vectors into the real water, which is the only way they will ever find
 * out they have been let in. Both halves are in step 3 of the frame loop, and
 * `seaChoice.knockOn`'s header is where the reasoning lives.
 *
 * NOTHING IN THIS CLIENT ASKS FOR OR CHANGES ANYONE'S STANDING WITH THE WATER.
 * Being let in is part of being on the network, not something the game grants:
 * a build that claimed a standing offer on the player's behalf existed briefly
 * (`passage.ts`, commit 725a8c06) and was removed on that ruling. The only
 * thing this client does about a refusal is RECOGNISE it — one classified
 * error code becomes one place the player is standing in — which is why
 * `wayIn.ts` reads a `SendFailure` and nothing else.
 *
 * Two developer affordances survive, both wordless:
 *   - a dim dot in the bottom-right corner, and F1, toggle Task 1's
 *     diagnostics panel. It is the only way to see whether the sidecar is
 *     alive, so it stays reachable — just not visible enough to be part of the
 *     game.
 *   - `1`, `2` and `3` switch which offline sea is being folded — the shallows
 *     (shallows.ts, the default and the one a downloader lands in), the lively
 *     demo sea, and the harness replay (both demoSea.ts).
 *   - three query parameters — `?at=`, `?played=`, `?me=` — documented on
 *     `devParam` below. None of them is reachable from inside the game.
 *
 * The chain-sea parameters (`?rpc=`, `&cookie=`, `&who=`, …) are a FOURTH set,
 * and unlike those three they are gated on `import.meta.env.DEV` in both
 * `chainParams` and `devChainSea` — see the comments there. They carry a
 * credential and a key derivation, "not reachable from inside the game" is not
 * a security property when `devtools` is on in release, and the static gate is
 * also what keeps `browserIdentity.ts` out of the production bundle at all.
 *
 * THERE ARE TWO CONFIGURATION PATHS NOW (plan 4b, Task 2) AND THE GATE COVERS
 * ONLY ONE OF THEM. The second is `shellConfig.ts`: the desktop shell's own
 * `get_rpc_config`, the node's own identity, and a signer that signs THROUGH
 * the node — no URL, no key in the browser, nothing for the gate to protect.
 * That is what makes a shipped build able to reach real water at all. The rule
 * that picks between the two lives in `seaChoice.chooseSeaSource`, stated where
 * a test can drive it at both values of `import.meta.env.DEV`; the gate below
 * stays exactly where it was, because it is doing a second job the rule cannot
 * do (dropping `browserIdentity.ts` from the bundle).
 *
 * =============================================================================
 * THE TETHER, THE HUSH AND THE SCATTER (Task 6)
 * =============================================================================
 *
 * All three are readings produced by `tether.ts` from the fold's own numbers,
 * painted by `seaPaint.ts`, and wired together in step 6 of the frame loop
 * below. The one thing this file OWNS rather than passes through is the
 * snapshot of `state.lockedPositions` — the fold clears it the instant it has
 * used it, and the replay that follows needs exactly those bodies, because
 * the world one tick later is a different frame with three smaller fish in
 * it. See the comment on `lockedSnap`.
 *
 * There is still no text anywhere. The tether is geometry, the hush is
 * colour draining out of the water, and the scatter is a frozen diagram.
 *
 * =============================================================================
 * THE VERBS, AND THE ONE RULE ABOUT THEM (Task 5)
 * =============================================================================
 *
 * Hold the pointer to steer, release to stop. Space darts. `E` eats. `Enter`
 * opens a line to speak on, `Enter` again sends it, `Escape` abandons it.
 *
 *   input event -> applyInput -> intentAt -> shouldEmit -> sea.publish
 *
 * **Nothing on this page writes a vector.** The frame loop calls `emitDue`
 * (input.ts) and `emitDue` calls `sea.publish` only once `shouldEmit` has
 * agreed — at most once per frame, in practice about once every 3-8 s. A
 * per-frame emitter is exactly what the whole bridge exists to prevent: it
 * would breach the node's 120/min RPC write cap and crowd every other swimmer
 * out of the per-space mempool budget they all share.
 *
 * WHAT `sea.publish` IS. On an offline sea it appends to the log that sea's own
 * fold walks. On a chain sea it is `sendPresence` — mined, signed and submitted
 * — and the local append is the optimistic row that keeps the player's own fish
 * moving until the node hands the write back (`chainSea.ts`'s "two logs, not
 * one"). This paragraph used to say the chain writer was NOT wired because
 * nothing established a room to write into; both halves of that are now false.
 * `scripts/mint-water.ts` establishes the room, and `shellConfig` finds it
 * without a URL, so a shipped window publishes through the same call the smoke
 * scripts do.
 *
 * THE AUTHORING CLOCK IS `wall + TICK_MS`, not `wall`. An entry whose `ms` is
 * at or behind the last folded tick sends `advance` down its bounded-replay
 * path (shoalLoop.ts section 2) — correct, but a full epoch re-fold per write.
 * Authoring one tick ahead keeps every write strictly ahead of the fold, which
 * is the same thing demoSea's scripted swimmers do. The cost is that your own
 * vector takes effect on the next tick; `shouldEmit` and the vector share that
 * one clock read, so there is nowhere for two times to disagree.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Diagnostics } from './Diagnostics';
import { harnessSea, livelySea, type Sea } from './demoSea';
import { shallowsSea } from './shallows';
import { type ChainSea } from './chainSea';
import { chooseSeaSource, chooseWater, knockOn, retryDelayMs, seaFrom } from './seaChoice';
import { shellConfig, shellSurface, type ShellSeaConfig } from './shellConfig';
import { TheEdge } from './TheEdge';
import { afterWrite, OPEN_WATER, type Standing } from './wayIn';
import { identityFromLabel } from './browserIdentity';
import { paintFrame, type ScatterPaint, type Swimmer } from './seaPaint';
import { fitBodies, fitScale, followCamera, reckonSmooth, screenToWorld, type Camera, type Viewport } from './render';
import { boltProgress, wildClock, wildShelterBodies, wildViewAt } from './wildView';
import { NOWHERE, trackArrival, type Arrival } from './terrain';
import {
  applyInput, canClaimEat, createInput, dartCharge, eatTarget, emitDue,
  headingTo, isDarting, markEat, positionAt, refundOnHush,
  type InputEvent, type InputState,
} from './input';
import {
  hushRead, lockedBodies, premonition, readTether, scatterReplay, tetherOpacity,
  type TetherRead,
} from './tether';
import { canEat, cellCentre } from '../lib/bloom';
import { bodiesOf } from '../lib/shoalEngine';
import type { Body, ShelterBody } from '../lib/shelter';
import type { ReadonlyVisitMap } from '../lib/shoalTypes';
import type { SendFailure } from '../lib/shoalSend';
import { reckon } from '../lib/fixed';
import { HUSH_MS, TICK_MS, WORLD_H, WORLD_W } from '../lib/shoalConst';

/**
 * WHICH OFFLINE SEA — and nothing more than that.
 *
 * `'chain'` USED TO BE A THIRD MEMBER OF THIS UNION AND THAT WAS THE DEFECT.
 * Being in real water is not a scene a window can be switched to; it is a fact
 * about whether a configuration exists, and it is decided by `chooseSeaSource`
 * every time the frame effect runs. Modelling it as a scene meant a window had
 * to be PROMOTED into water by a state transition, the transition could only
 * fire from `'lively'`, and anything that had moved the scene elsewhere first
 * silently made the promotion a no-op.
 *
 * That is not theoretical: a shipped build spends up to 120 s on the offline
 * sea while `get_rpc_config` waits for the node to bind, and a new player
 * watching water and pressing keys to see what happens is the most likely
 * first-run behaviour there is. Pressing `2` in that window locked them out of
 * the game PERMANENTLY — the scene became `'harness'`, the promotion never
 * fired, and `inRealWater()` then went true and disabled the toggle they would
 * have needed to get back. `?at=` was a second door into the same state, and it
 * is not DEV-gated. Found by a reviewer pressing a key, which is exactly how it
 * would have been found by a player.
 *
 * With the union narrowed there is nothing to promote and nothing to miss: real
 * water simply supersedes whichever offline sea was being drawn, the moment it
 * exists. `App.test.ts` holds that under a deliberately slow cold start.
 *
 * THERE ARE THREE OF THEM NOW AND `'shallows'` IS THE DEFAULT (plan 4b, Task 3).
 * A window with no water to be in is not showing a placeholder any more; it is
 * showing the tutorial, which is spec §2.16's own answer to "never let a
 * downloader dead-end". `'lively'` and `'harness'` are unchanged and stay
 * reachable on `2` and `3` — see the key handler.
 */
type SceneKind = 'shallows' | 'lively' | 'harness';

/**
 * A real room on a real node, from query parameters — Task 7's capture, and
 * the first time anything in this window writes to a chain.
 *
 * `?rpc=` alone selects it; the rest are required alongside and the sea says
 * so loudly rather than half-starting:
 *
 *   ?rpc=http://127.0.0.1:29736   the node's RPC endpoint
 *   &cookie=<hex>                 contents of that node's `.cookie` file
 *   &space=sp1…                   the room's space, bech32m wire form
 *   &room=sha256:…                the room post every swimmer replies into
 *   &id=<64 hex>                  this window's public key (the camera's fish)
 *   &who=<label>                  the passphrase that derives that key
 *
 * `scripts/two-client-smoke.ts` prints both windows' URLs, fully formed, at
 * the end of a successful run — the parameters are fiddly on purpose (they
 * are not reachable from inside the game, exactly like `?at=`/`?played=`), and
 * a printed URL is less error-prone than a documented recipe.
 *
 * The cookie rides in the query string because a browser cannot read the
 * node's cookie file. That is acceptable for a localhost regtest capture and
 * for nothing else; a shipped shell gets its auth from the Tauri side through
 * `get_rpc_config` — `shellConfig.ts`, which is now the path a release build
 * actually takes — never from a URL.
 */
interface ChainParams {
  rpc: string;
  cookie: string | null;
  space: string;
  room: string;
  id: string;
  who: string;
}

/**
 * Build the sea this window is actually pointed at, or `null` for the offline
 * sea. Synchronous on purpose: `Sea.selfId` must be known on the first frame,
 * so both paths hand over a public key up front and a `Promise` for the signer.
 * On the dev path the key comes from `&id=` and the signer resolves later
 * (WebCrypto `importKey`); on the shell path both are already known by the time
 * a `ShellSeaConfig` exists, which is why `shell` arrives here as a value the
 * caller has already awaited rather than as a promise to await inside the
 * frame loop.
 *
 * THE RULE IS `chooseSeaSource` and it is not restated here — see seaChoice.ts
 * for what a release build does in each of the three cases, and why the dev
 * path wins the one contest that can occur (`tauri dev`).
 *
 * THE WAY IN (spec §2.16) rides along on both paths, from `seaFrom`. Every
 * write's outcome is typed — accepted, or classified by `classifySendFailure`
 * from the node's own JSON-RPC code — and what it MEANS is decided by
 * `wayIn.afterWrite`. Nothing here reads an error message, and this page never
 * sees one.
 */
function buildChainSea(
  shell: ShellSeaConfig | null,
  onWrite: (failure: SendFailure | null) => void,
): ChainSea | null {
  switch (chooseSeaSource(import.meta.env.DEV, chainParams() !== null, shell !== null)) {
    case 'dev': return devChainSea(onWrite);
    // `chooseSeaSource` only answers `shell` when it was told there is one, so
    // this narrowing can never actually fall through — it is here because the
    // compiler cannot know that and a non-null assertion would be a worse way
    // of saying the same thing.
    case 'shell': return shell === null ? null : seaFrom(shell, onWrite);
    case 'offline': return null;
  }
}

/**
 * The DEV path: a real room on a real node, from query parameters — Task 7's
 * capture, and the first thing in this window that ever wrote to a chain.
 */
function devChainSea(onWrite: (failure: SendFailure | null) => void): ChainSea | null {
  // THE STATIC GATE, and it is here as well as inside `chainParams` on purpose.
  // `import.meta.env.DEV` is replaced by the literal `false` in a production
  // build, so this becomes `if (true) return null;` and everything below it —
  // including the only reference anywhere to `identityFromLabel` — is dead code
  // rollup removes, taking `browserIdentity.ts` out of the bundle entirely.
  // Gating `chainParams` alone would not do that: rollup does not inline across
  // the call to prove the branch unreachable, so the weak dev key derivation
  // would still ship, unreferenced but present, in a release the operator has
  // no reason to expect it in.
  //
  // IT IS ALSO WHY THIS FUNCTION EXISTS SEPARATELY FROM `buildChainSea`. The
  // shell path must run in a release build, so `buildChainSea` can no longer
  // open with `if (!import.meta.env.DEV) return null;` — and a gate that had
  // become a branch inside a function that keeps going would have left
  // `identityFromLabel` reachable and `browserIdentity.ts` in the bundle. The
  // gate must DOMINATE the reference, which means the reference has to live in
  // a function the gate can return out of.
  //
  // Verified after `npm run build` by grepping `dist/assets/*.js` (NOT `dist/`,
  // which includes the sourcemap: `sourcesContent` embeds comments verbatim, so
  // this very paragraph would answer a search for the dev key's own prefix).
  // `seaChoice.test.ts` section 3 holds the arrangement in place by name.
  if (!import.meta.env.DEV) return null;
  const p = chainParams();
  if (p === null) return null;
  return seaFrom({
    auth: {
      endpoint: p.rpc,
      authHeader: p.cookie === null ? null : `Basic ${btoa(`__cookie__:${p.cookie}`)}`,
    },
    spaceId: p.space,
    roomContentId: p.room,
    authorIdHex: p.id,
    signer: identityFromLabel(p.who),
  }, onWrite);
}

function chainParams(): ChainParams | null {
  // DEV ONLY, and enforced rather than documented. Everything this function
  // reads is a development affordance with no place in a shipped build:
  //
  //  - `&who=` derives a signing key as `sha256('shoal-two:' + label)` with no
  //    KDF (browserIdentity.ts says so itself), so anyone who knows the label
  //    holds the key;
  //  - `&cookie=` takes the node's RPC credential out of the address bar,
  //    which is acceptable for a localhost regtest capture and nothing else;
  //  - `&rpc=` points the shell at an arbitrary endpoint.
  //
  // None of it is reachable from inside the game, but `location.search` is
  // settable from the inspector and `devtools` is enabled in RELEASE
  // (src-tauri/Cargo.toml) — so "not reachable" was never the same as "not
  // available". `import.meta.env.DEV` is the only thing that makes it true.
  if (!import.meta.env.DEV) return null;
  const rpc = devParam('rpc');
  if (rpc === null) return null;
  const space = devParam('space');
  const room = devParam('room');
  const id = devParam('id');
  const who = devParam('who');
  if (space === null || room === null || id === null || who === null) {
    // Half a configuration would render an empty sea that looks exactly like a
    // node with nobody in it — the single most confusing failure available
    // here. Better to be unmistakable in the console than plausible on screen.
    console.error('[shoal] ?rpc= needs &space=, &room=, &id= and &who= alongside it; '
      + 'run scripts/two-client-smoke.ts, which prints both windows\' URLs.');
    return null;
  }
  return { rpc, cookie: devParam('cookie'), space, room, id, who };
}

/** How long a swept swimmer is drawn dazed. Spec 2.9's "a few seconds". */
const DAZED_MS = 2_500;

/** How much open water the frozen replay leaves around the outermost fish. */
const REPLAY_MARGIN_CU = 220;

/** A word is at most this long. Long enough for a warning, short enough that
 *  it fits over a fish. */
const SAY_MAX = 60;

/**
 * A cell absent from `lastVisit` reads as ready — the same trick
 * `shoalEngine.foldTick` uses to tell `canEat` "this bloom already latched,
 * don't re-run the fallow test". Mirrored here so the on-screen cue agrees
 * with the fold about whether a bite would credit. EMPTY FOREVER.
 */
const NEVER_VISITED: ReadonlyVisitMap = new Map();

/**
 * ACCUMULATED PLAYTIME, for the tether's fade (spec 2.10).
 *
 * "The tether fades with accumulated playtime" — accumulated, not per
 * session, because it is a measure of how much this player has learned and
 * learning does not reset when a window closes. So it is persisted, and the
 * only thing on hand to persist it in is the browser's own store. It carries
 * no identity, no world state and nothing another client ever reads; a
 * failure to read or write it costs a returning player nothing worse than
 * their tether staying legible for longer.
 */
const PLAYED_KEY = 'shoal.playedMs';

function readPlayed(): number {
  try {
    const v = Number(window.localStorage.getItem(PLAYED_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0; // private mode, or no store at all. A newcomer, then.
  }
}

function writePlayed(ms: number): void {
  try {
    window.localStorage.setItem(PLAYED_KEY, String(Math.round(ms)));
  } catch { /* as above: losing this is not worth a broken frame */ }
}

/**
 * Two wordless developer affordances, both read once from the address bar and
 * neither reachable in the app itself:
 *
 *  - `?at=<ms>` starts the harness replay that many ms into its own scenario,
 *    which is the only practical way to capture the hush (18.25 s in) and the
 *    two-second scatter freeze (26.25 s in) repeatably.
 *  - `?played=<ms>` overrides the accumulated playtime, so the fade can be
 *    looked at without waiting ten minutes for it.
 *  - `?me=<id>` follows a different one of the harness fixture's twelve
 *    swimmers. The fixture's own `e0` sits in the sheltered cluster, so it is
 *    the only way to see the hush from inside a swimmer the sweep is about to
 *    take — which is the moment spec 2.10 is entirely about.
 *
 * NONE OF THE THREE IS DEV-GATED, AND AFTER THE `SceneKind` FIX NONE OF THEM
 * NEEDS TO BE. That was a live question: `?at=` selects the harness sea, the
 * harness sea used to block the promotion into real water, and a release build
 * with `devtools` on can be handed a query string — so `?at=` was a second door
 * into the same permanent lockout `2` opened. Gating it would have closed that
 * one door; narrowing `SceneKind` removed the room behind both. What `?at=`
 * does in a shipped build now is choose which offline sea is drawn during the
 * seconds before a configuration arrives, which is worth nothing to an attacker
 * and costs a player nothing. Unlike `?rpc=` and `&who=` these three carry no
 * credential and derive no key, so there is nothing here the gate was ever for.
 *
 * The one cost, stated so nobody rediscovers it: under `tauri dev`, `?at=` is
 * superseded by the shell's water a moment after the window opens. Harness
 * captures are taken from the browser dev server (`npm run dev`, port 5196),
 * where there is no shell and never was one — which is where every `?at=`
 * screenshot in `docs/` came from.
 */
function devParam(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

function devNumber(name: string): number | null {
  const raw = devParam(name);
  if (raw === null) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

export function App() {
  const [showDiag, setShowDiag] = useState(false);
  /**
   * Which offline sea to draw when there is no real water — read once, because
   * `?at=` cannot change while a window is open. It says NOTHING about whether
   * this window is in real water; see `SceneKind`.
   */
  const [scene, setScene] = useState<SceneKind>(() => (devNumber('at') !== null ? 'harness' : 'shallows'));
  /** The line being typed, or null when not speaking. */
  const [typing, setTyping] = useState<string | null>(null);
  /**
   * Where this client stands with the water (spec §2.16). Raised by a write
   * the node refused for want of a voucher, lifted by a write it accepted —
   * see `wayIn.ts`. It lives in React state rather than in the frame loop
   * because it changes at most twice in a session and drives DOM, not paint;
   * the frame loop is untouched by it, and the sea keeps folding and drawing
   * underneath exactly as it did.
   *
   * `afterWrite` returns the SAME object when nothing changed, so the accepted
   * write every few seconds does not re-render the tree.
   */
  const [standing, setStanding] = useState<Standing>(OPEN_WATER);
  /**
   * THE SHELL'S CONFIGURATION, once it exists — `null` until then, and `null`
   * forever in a browser tab (`shellConfig` returns `null` the moment it finds
   * no `window.__TAURI__`, without a single RPC).
   *
   * IT IS ASYNCHRONOUS AND THE WINDOW MUST NOT WAIT FOR IT. `get_rpc_config`
   * polls the node's own `.rpc_addr`/`.cookie` handoff for up to 120 s
   * (src-tauri/src/main.rs:172-200), because on a cold first launch the shell
   * has just started a node that has to open its database and bind a port. A
   * window that rendered nothing until that resolved would be a black rectangle
   * for a minute and a half on exactly the launch a new player judges the game
   * by. So the offline sea is drawn from frame one and real water supersedes it
   * underneath the player when this lands. IT SUPERSEDES WHICHEVER OFFLINE SEA
   * WAS BEING DRAWN, unconditionally — see `SceneKind` for the lockout that
   * making it conditional produced.
   */
  const [shell, setShell] = useState<ShellSeaConfig | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const typingRef = useRef<string | null>(null);
  typingRef.current = typing;
  /** The same value, readable from the key handler's `[]`-deps closure. */
  const shellRef = useRef<ShellSeaConfig | null>(null);
  shellRef.current = shell;
  /** Is this window in water other people are in? Either path counts. */
  const inRealWater = () => chainParams() !== null || shellRef.current !== null;

  useEffect(() => {
    // A window the dev path has already won does not ask. Asked through the
    // same rule rather than by restating it: if a shell configuration could not
    // change the answer, fetching one would only cost a needless teardown and
    // rebuild of the very sea a capture is being taken of.
    if (chooseSeaSource(import.meta.env.DEV, chainParams() !== null, true) === 'dev') return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /**
     * ASK, AND KEEP ASKING UNTIL THERE IS WATER.
     *
     * `shellConfig` answers `null` for six reasons, and the ones that matter
     * here are the ordinary condition of a node that has just started: RPC not
     * bound yet, no identity yet, and — most of all — THE ROOM'S BODY HAS NOT
     * ARRIVED YET, which is true of every fresh install until something has
     * asked the network for it and a peer has answered. (`shellConfig` does the
     * asking on each miss, so these attempts are not the same question over and
     * over.) Asking ONCE meant a first launch that lost any one of those coin
     * flips showed the offline sea forever, with no error, until the player
     * thought to restart. That is the same outcome and the same silence as the
     * scene lockout on `SceneKind`, arrived at from a different direction, and
     * it is not acceptable in a build whose whole purpose is that somebody can
     * install it and play.
     *
     * "This node has never heard of this water" was the reason this comment
     * used to lead with, and it is no longer one of them: the space id is
     * derived rather than looked up (`shellConfig.waterSpaceId`), so there is
     * no listing to miss. `seaChoice.retryDelayMs` carries the full list.
     *
     * The schedule is `retryDelayMs` (seaChoice.ts), which says why it never
     * gives up and what that costs. A throw is treated as "not yet" for the
     * same reason: `shellConfig` catches its own failures, so anything reaching
     * here is unexpected, and giving up permanently on something unexpected is
     * the behaviour being removed.
     */
    const ask = async (attempt: number): Promise<void> => {
      // A BROWSER TAB IS NOT A SLOW SHELL, and must not be retried at. There is
      // no shell coming, so this returns before any RPC and the loop ends.
      if (shellSurface() === null) return;
      let cfg: ShellSeaConfig | null = null;
      try {
        cfg = await shellConfig();
      } catch (e) {
        console.error('[shoal] shell configuration:', e);
      }
      if (!alive) return;
      if (cfg !== null) {
        // THE ONLY THING THAT HAPPENS ON SUCCESS. There is deliberately no scene
        // change alongside it: the frame effect re-runs on `shell` and asks
        // `chooseSeaSource` again, which answers `'shell'` whatever offline sea
        // was on screen. A second `setScene` here was the lockout.
        setShell(cfg);
        return;
      }
      timer = setTimeout(() => { void ask(attempt + 1); }, retryDelayMs(attempt));
    };
    void ask(0);

    return () => {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  /**
   * The queue between the DOM's event handlers and the frame loop.
   *
   * Events are QUEUED rather than applied where they arrive, because
   * `applyInput` needs the instant they happened and the frame loop owns the
   * clock — and because a dart pressed between two frames must be folded in
   * with the frame's own `nowMs`, not with a second clock read. Everything
   * that touches `InputState` therefore happens in one place, once per frame.
   */
  const pendingRef = useRef<InputEvent[]>([]);
  const push = (e: InputEvent) => { pendingRef.current.push(e); };
  /**
   * Eat is the one verb that is not an `InputEvent`: it does not change what
   * the swimmer INTENDS, it asks for a claim on the bloom underneath at this
   * instant. Keeping it out of `InputState` is deliberate — `intentAt` must
   * stay a function of steering and the dart alone, or "eating" would become
   * something the world could read off your vector.
   */
  const wantsBiteRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While a line is open every key belongs to it — otherwise typing "e"
      // would take a bite and the space bar would spend the dart.
      if (typingRef.current !== null) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const text = typingRef.current.trim();
          if (text.length > 0) push({ kind: 'say', text });
          setTyping(null);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setTyping(null);
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          setTyping((v) => (v === null ? v : v.slice(0, -1)));
        } else if (e.key.length === 1) {
          e.preventDefault();
          setTyping((v) => (v === null ? v : (v + e.key).slice(0, SAY_MAX)));
        }
        return;
      }
      if (e.key === 'F1' || e.key === '`') { e.preventDefault(); setShowDiag((v) => !v); }
      // The demo-scene toggle is disabled once this window is pointed at a
      // real room: switching away would tear down the live socket and the
      // room's log, and switching back would rebuild them — a stray keystroke
      // during a capture would silently replace the sea being photographed
      // with a scripted one that looks very much like it.
      //
      // THE SHELL'S WATER COUNTS AS A REAL ROOM, and this is the half that had
      // to change. Until Task 2 a release build never held a chain sea, so the
      // toggle could only ever swap one offline sea for another; now a keypress
      // in a shipped window would drop a player out of the water they share with
      // other people and into a scripted one that looks almost identical, with
      // no way back and nothing said about it. Same rule, one more source.
      //
      // IT IS STILL LIVE DURING A COLD START, when `inRealWater()` is false
      // because no configuration has arrived yet, and that is correct rather
      // than a gap: there is no water to protect, the scene picks between two
      // offline seas, and whichever one is chosen is superseded the moment a
      // configuration lands. THIS IS ONLY TRUE BECAUSE THE SCENE NO LONGER
      // GATES THE PROMOTION — see `SceneKind`. Held by `App.test.ts`.
      // `1` is the shallows (the default), `2` the lively demo sea, `3` the
      // harness replay. Three offline seas, one key each, all under the same
      // guard; none of them is reachable once this window is in real water.
      else if (e.key === '1' && !inRealWater()) setScene('shallows');
      else if (e.key === '2' && !inRealWater()) setScene('lively');
      else if (e.key === '3' && !inRealWater()) setScene('harness');
      else if (e.key === ' ') { e.preventDefault(); push({ kind: 'dart' }); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); wantsBiteRef.current = true; }
      else if (e.key === 'Enter') { e.preventDefault(); setTyping(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startWall = Date.now();
    const at = devNumber('at');
    // Built once per scene, and torn down by this effect's cleanup — a chain
    // sea owns a WebSocket and timers, so leaking one across a hot reload
    // would leave a growing pile of subscribers on the node.
    // REAL WATER FIRST, ALWAYS. `buildChainSea` returns `null` exactly when
    // `chooseSeaSource` says `'offline'`, so the scene below is consulted only
    // when there is no water to be in — never as a way of REFUSING water that
    // exists. The reverse of that sentence is the lockout described on
    // `SceneKind`.
    const chain = buildChainSea(shell, (failure) => { setStanding((s) => afterWrite(s, failure)); });
    /**
     * WHICH WATER THE PLAYER'S OWN BODY IS IN (spec §2.16). Three answers, and
     * the third is the newcomer's: real water that will not have them yet, so
     * they swim the shallows while their writes keep knocking at its door.
     * The rule is `seaChoice.chooseWater`, stated where a test can drive it at
     * all four combinations rather than as a conditional in a component.
     *
     * THE SHALLOWS IS NOT DRAWN *INSTEAD OF* WRITING. Step 3 below hands every
     * vector to `knockOn` as well, so the chain sea keeps offering — that
     * invariant is the only thing between this and a silent permanent lockout,
     * and `App.test.ts` §6 asserts it on the wire. Read `chooseWater`'s header
     * before touching either half.
     *
     * The offline scene picker is consulted only when there is no water at all
     * — never as a way of refusing water that exists (`SceneKind`).
     */
    const water = chooseWater(chain !== null, standing.atTheEdge);
    const sea: Sea = water === 'chain' && chain !== null
      ? chain
      : water === 'shallows'
        ? shallowsSea(startWall)
        : (scene === 'harness'
          ? harnessSea(startWall, at ?? 0, devParam('me') ?? 'e0')
          : scene === 'lively'
            ? livelySea(startWall)
            : shallowsSea(startWall));

    // The tether's fade clock. `?played=` overrides it for a screenshot.
    const playedOverride = devNumber('played');
    const playedBase = playedOverride ?? readPlayed();
    let playedSavedAt = startWall;

    /**
     * THE LOCKED ARRANGEMENT, kept across frames.
     *
     * `state.lockedPositions` exists only between the input lock and the
     * resolve tick — the fold clears it the instant it has used it — but the
     * replay that follows needs exactly those bodies, because they are the
     * ones the sweep judged. The world one instant later is NOT the same
     * frame: three fish have just paid SCATTER_COST. So it is snapshotted the
     * first frame it appears (the dread window is four seconds, sixteen folded
     * ticks, so a rendering loop cannot miss it), and the replay checks the
     * snapshot belongs to the hush that produced this sweep before trusting
     * it — a lock is always exactly HUSH_MS - LOCK_MS before its own
     * resolution.
     */
    let lockedSnap: Body[] | null = null;
    let lockedAtMs = -1;

    /**
     * WHICH NAMED PLACE THE PLAYER IS AT (spec 2.13), kept across frames.
     *
     * Effect-local rather than a ref, so that a new sea starts at `NOWHERE`
     * and the first place its player reaches announces itself — a window that
     * carried an arrival across a sea change would silently swallow the one
     * announcement that sea had to make.
     */
    let arrival: Arrival = NOWHERE;

    let input: InputState = createInput(sea.spawn.x, sea.spawn.y, 0);
    // The pointer, in CSS pixels, while it is held — or null. Held state lives
    // here rather than in React so a drag never re-renders the tree.
    let pointer: { x: number; y: number } | null = null;
    const onDown = (ev: PointerEvent) => {
      if (typingRef.current !== null) return;
      canvas.setPointerCapture(ev.pointerId);
      pointer = { x: ev.clientX, y: ev.clientY };
    };
    const onMove = (ev: PointerEvent) => {
      if (pointer !== null) pointer = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = () => { pointer = null; push({ kind: 'release' }); };

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    let cam: Camera | null = null;
    let raf = 0;
    let alive = true;

    const frame = () => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);

      // The window, in CSS pixels; the backing store, in device pixels. Both
      // are re-read every frame so a resize needs no listener and can never
      // leave the projection on a stale viewport.
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const view: Viewport = { w: cssW, h: cssH };

      // ONE CLOCK READ PER FRAME, and one authoring instant derived from it.
      //
      // THE AUTHORING INSTANT IS ON THE *SEA'S* CLOCK, not the window's. For a
      // real room and for `livelySea` those are the same number (`seaMs` is the
      // identity on both), so this changed nothing for either; for a sea that
      // maps the wall clock onto a timeline of its own — `harnessSea`'s replay,
      // and `shallowsSea`'s fixed scenario — it is the difference between a
      // client that agrees with the world it is drawing and one that does not.
      //
      // It was already wrong before the shallows existed, silently: step 5 below
      // asks the fold's own `canEat` with `nowMs: authorMs` against `me.vec` and
      // `me.lastBiteMs`, both of which carry the SEA's time. On the harness
      // replay those two clocks are ~147_600_000 ms apart, so `reckon(me.vec,
      // authorMs)` was reckoning three days forward and the bite cue could only
      // ever answer "no". Nothing else noticed because that sea's `publish` is
      // inert. Reading the one clock the sea itself keeps fixes the cue and is
      // what lets the shallows be played rather than only watched.
      const wall = Date.now();
      const authorMs = sea.seaMs(wall) + TICK_MS;

      // --- 1. Fold the events that arrived since the last frame, at the one
      // instant this frame owns.
      const queued = pendingRef.current;
      if (queued.length > 0) {
        pendingRef.current = [];
        for (const e of queued) input = applyInput(input, e, authorMs);
      }
      const wantsBite = wantsBiteRef.current;
      wantsBiteRef.current = false;

      // --- 2. Steering is a HELD state, not an event: the pointer names a
      // world point every frame and the heading is the direction from where
      // this swimmer actually is to that point. Derived here (not in the
      // handler) because it depends on the camera, which moves under a
      // stationary pointer.
      let aim: { x: number; y: number } | null = null;
      if (pointer !== null && cam !== null) {
        const r = canvas.getBoundingClientRect();
        const w = screenToWorld(cam, view, pointer.x - r.left, pointer.y - r.top);
        const me = positionAt(input, authorMs);
        aim = w;
        input = applyInput(input, { kind: 'steer', heading: headingTo(w.x - me.x, w.y - me.y) }, authorMs);
      }

      // --- 3. THE ONE PLACE A VECTOR CAN LEAVE. `emitDue` asks `shouldEmit`
      // and calls `sea.publish` only if it agrees.
      //
      // AND WHILE THE EDGE IS UP IT LEAVES TWICE: once into the water the
      // player can see and act in, and once into the water that has refused
      // them, re-stamped onto this frame's own wall clock (`knockOn`). Still
      // ONE emitter, still one `shouldEmit` decision, so the write rate is
      // exactly what it would have been — a second timer here would double
      // this window's share of the mempool budget at the one moment the node
      // has said it wants fewer writes from us, and it would be a second place
      // for the emit floor to be got wrong.
      //
      // A CLIENT THAT STOPS KNOCKING IS SEALED IN. A write that goes through
      // is the only evidence this client will ever have that somebody has let
      // this swimmer in, and there is no second channel and nothing to poll.
      // `knockOn` is a no-op in the other two waters, so this line is the
      // whole of the difference.
      input = emitDue(input, authorMs, (vec, say) => {
        sea.publish(vec, say);
        knockOn(chain, water, vec, wall + TICK_MS, say);
      });

      // --- 4. Fold the world forward and draw it.
      const state = sea.step(wall);
      const atMs = sea.seaMs(wall);
      const said = sea.speechAt(atMs);
      const me = state.fish.get(sea.selfId);

      // --- 5. Eating. The claim is judged by the FOLD's own `canEat` against
      // the fold's own vector for this swimmer — never a display-side guess —
      // so the cue on screen and the credit the world gives are computed from
      // the same rule and the same numbers.
      //
      // NOT "cannot disagree", which is one tick too strong. `canEat` is asked
      // here at `authorMs` against `state`, the world folded to `wall`; the
      // real claim is judged by `foldTick` at the tick covering `authorMs`,
      // which is one tick LATER and has had another `markVisits` pass run over
      // it. Another fish crossing into BLOOM_VISIT_R in that window, or the
      // bloom's sixth bite landing from someone else, flips the answer between
      // the cue and the credit. The window is exactly TICK_MS, the cue is the
      // best prediction available, and it is honest about being a prediction.
      // Only the near field is knowable: see the report on why there is no map
      // of where food is.
      let bite: { x: number; y: number } | null = null;
      if (me && canClaimEat(input, authorMs)) {
        const cell = eatTarget(input, authorMs);
        const at = reckon(me.vec, authorMs);
        const latched = state.bloomSinceMs.has(cell);
        const ok = canEat({
          lastVisit: latched ? NEVER_VISITED : state.lastVisit,
          bitesTaken: state.bitesTaken,
          cell,
          // The claimant is this client's own swimmer: the fold judges the
          // real claim the same way, so the cue and the credit still agree.
          id: sea.selfId,
          fishX: at.x,
          fishY: at.y,
          lastBiteMs: me.lastBiteMs,
          nowMs: authorMs,
        });
        if (ok) {
          bite = cellCentre(cell);
          if (wantsBite) {
            sea.publishEat(cell, authorMs);
            input = markEat(input, authorMs);
          }
        }
      }

      // --- 6. THE TETHER, THE HUSH AND THE SCATTER (Task 6). Every number
      // below is read out of the fold — `bodiesOf`, `hushStartMs`, `tension`,
      // `lockedPositions`, `lastTaken` — and shaped by `tether.ts`. Nothing
      // here re-derives shelter, exposure or a verdict.
      const bodies = bodiesOf(state);
      const hush = hushRead(state.hushStartMs, atMs);

      // SPEC 2.12, T+0: the hush refunds the action timer, so one action always
      // suffices to survive a telegraph. Driven off the fold's own
      // `hushStartMs` rather than off a phase transition this loop watches for,
      // so a dropped frame cannot lose it and a re-render cannot double it —
      // `refundOnHush` is idempotent per hush. It is called BEFORE the dart
      // ring is read below, so the ring and the verb agree on the same frame.
      input = refundOnHush(input, state.hushStartMs);

      // Snapshot the sweep's own arrangement the moment it is frozen.
      const lockedNow = lockedBodies(state);
      if (lockedNow !== null) { lockedSnap = lockedNow; lockedAtMs = atMs; }

      // The replay reads the locked frame if that frame belongs to THIS
      // sweep; otherwise the live one, which is honest about being second
      // best rather than silently showing the wrong moment.
      const freshLock = lockedSnap !== null
        && state.lastSweepMs - lockedAtMs > 0 && state.lastSweepMs - lockedAtMs <= HUSH_MS;
      const replayBodies = freshLock && lockedSnap ? lockedSnap : bodies;
      const replay = scatterReplay(state, atMs, replayBodies);
      // The frozen frame is drawn at the instant the sweep JUDGED, so the
      // arrangement on screen is the one that decided it — see render.ts's
      // header on the display never disagreeing with the fold.
      const drawMs = replay === null ? atMs : (freshLock ? lockedAtMs : replay.atMs);

      // --- 6b. THE WILD SHOAL (spec 2.6). Read at `drawMs` — the instant this
      // frame is DRAWN AT, which during the scatter freeze is deliberately in
      // the past. Two things follow from using one instant for both halves:
      //
      //  - a swimmer is never sheltered by a fish that has already fled,
      //    because position and disappearance come out of the same clock;
      //  - the frozen replay shows the ocean as it was when the sweep judged,
      //    which is EMPTY. `wildClock` recognises a pre-sweep instant and
      //    keeps the shoal gone; without that the fold has already reset
      //    `hushStartMs` to -1 and thirty-six fish blink into the diagram.
      const clock = wildClock(drawMs, state.hushStartMs, state.lastSweepMs);
      const wildBodies = wildShelterBodies(sea.wildSeed, drawMs, clock);

      // AFTER THE LOCK THE TETHER STOPS LISTENING. It is read off the frozen
      // bodies, so it hangs where the player was and no longer answers to
      // them — which is what makes spec 2.12's input lock a thing you feel
      // rather than a rule you are told about.
      const tetherBodies = hush.locked && lockedNow !== null ? lockedNow : bodies;
      const meBody = tetherBodies.find((b) => b.id === sea.selfId) ?? null;
      // THE ONE PLACE THE TWO POPULATIONS MEET ON THIS PAGE. Wild fish shelter
      // you at half a person (WILD_SHELTER_WEIGHT), so the tether has to count
      // them or it would be drawing a shorter tether than the shelter score it
      // claims to be. That is what makes the bolt land: the strands it is
      // holding you up with are the ones that all leave at once.
      //
      // They are added to the LIVE reading only. After the lock the tether is
      // read off `lockedNow`, which is people alone — correct, and not a
      // special case anyone has to maintain: the bolt completes at
      // hush+WILD_BOLT_MS (2_000) and the lock lands at LOCK_MS (4_000), so
      // there is never a wild fish left to count by then anyway.
      const shelterPop: ShelterBody[] = hush.locked && lockedNow !== null
        ? tetherBodies
        : [...bodies, ...wildBodies];
      const tether: TetherRead | null = meBody === null ? null : readTether(meBody, shelterPop);

      const scatter: ScatterPaint | null = replay === null ? null : {
        progress: replay.progress,
        taken: replay.taken,
        // Every fish's tether, taken or not: a replay that drew only the
        // victims would be an accusation instead of an argument.
        tethers: replay.bodies.map((b) => readTether(b, replay.bodies)),
      };

      const moment = replay !== null ? 'scatter' : hush.phase !== 'calm' ? 'hush' : 'ambient';
      const playedMs = playedBase + (wall - startWall);
      if (playedOverride === null && wall - playedSavedAt > 5_000) {
        playedSavedAt = wall;
        writePlayed(playedMs);
      }

      const swimmers: Swimmer[] = [];
      if (replay !== null) {
        // The frozen frame is drawn from the bodies the sweep judged. Speed 0
        // so `reckonSmooth` returns those exact coordinates; the heading is
        // cosmetic and comes from whatever vector the fish last published.
        for (const b of replay.bodies) {
          swimmers.push({
            id: b.id,
            size: b.size,
            vec: { x: b.x, y: b.y, heading: state.fish.get(b.id)?.vec.heading ?? 0, speed: 0, t: drawMs },
            self: b.id === sea.selfId,
            scattered: replay.taken.includes(b.id),
          });
        }
      } else {
        for (const f of state.fish.values()) {
          const self = f.id === sea.selfId;
          swimmers.push({
            id: f.id,
            size: f.size,
            vec: f.vec,
            self,
            scattered: state.lastTaken.includes(f.id) && atMs - state.lastSweepMs < DAZED_MS,
            // A dart cooldown is not on the wire, so this client knows only its
            // own. Everyone else's ring is simply absent rather than guessed.
            charge: self ? dartCharge(input, authorMs) : undefined,
            darting: self ? isDarting(input, authorMs) : undefined,
            say: said.get(f.id),
          });
        }
      }

      // Follow the player. Before their first vector arrives — and in the
      // harness scenario for its first fold — there is nobody to follow, so
      // the camera sits on the middle of the water rather than at the origin,
      // which would open on empty black. During a replay the camera holds on
      // the frozen frame with everything else in it.
      const tx = me ? me.x : WORLD_W / 2;
      const ty = me ? me.y : WORLD_H / 2;
      if (cam === null) cam = { x: tx, y: ty, scale: fitScale(view) };
      cam = followCamera(cam, tx, ty, view);
      // ...except during the replay, which is a diagram and needs every
      // participant inside it. The ordinary framing provably cannot manage
      // that (render.ts's `fitBodies`), and an argument with one of its three
      // subjects off the edge of the window is not an argument.
      const shownCam = replay === null
        ? cam
        : fitBodies(replay.bodies, view, REPLAY_MARGIN_CU);

      // The wild shoal to DRAW. Interpolated between fold ticks (the shelter
      // read above is not — see wildView.ts), and handed the player's own
      // drawn position, which reaches nothing but which way a fish points.
      const mePoint = me ? reckonSmooth(me.vec, drawMs) : null;
      const wild = wildViewAt(sea.wildSeed, drawMs, clock, mePoint);

      // WHICH NAMED PLACE THE PLAYER IS AT (spec 2.13). Off the DRAWN
      // position, not the last published vector: the name should land when
      // the fish on screen reaches the kelp, which is what the player can
      // see. It reaches nothing else — terrain is a game object and this
      // never touches the fold. A frame with no player (before the first
      // vector, or mid-replay) leaves the arrival exactly as it was rather
      // than announcing an exit the player did not make.
      if (mePoint !== null) {
        arrival = trackArrival(arrival, mePoint.x, mePoint.y, drawMs);
      }

      paintFrame(ctx, {
        view,
        cam: shownCam,
        atMs: drawMs,
        swimmers,
        wild,
        bolt: boltProgress(clock),
        aim,
        bite,
        tether,
        tetherAlpha: tetherOpacity(playedMs, moment),
        hush,
        // A premonition is a sense of a hush that has NOT started; once one
        // has, the hush itself is the signal.
        premonition: hush.phase === 'calm' && me ? premonition(state.tension, me.size) : 0,
        scatter,
        place: arrival,
      });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      chain?.stop();
    };
    // `shell` is a dependency and not a ref read on purpose: the sea has to be
    // REBUILT when a configuration lands rather than picked up on some later
    // frame — `chainSea` takes its auth, its room and its signer at
    // construction.
    //
    // IT REBUILDS EXACTLY ONCE because `setShell` is called at most once per
    // window: the retry loop above returns the moment it succeeds, and a
    // configuration cannot change while a window is open (the node the shell
    // started is the node it started). Nothing else is set alongside it — the
    // `lively -> chain` scene change that used to accompany it was the lockout
    // and is gone.
    //
    // `standing.atTheEdge` IS A DEPENDENCY, AND IT IS A REBUILD RATHER THAN A
    // SWAP INSIDE THE LOOP. Two clocks meet here: the shallows maps the wall
    // clock onto a fixed instant in a fixed epoch, so a window that switched
    // seas mid-loop would carry an `InputState` whose `lastEmitMs` is decades
    // ahead of the new sea's own time — and `shouldEmit` compares exactly
    // those two numbers, so the next write would be due in fifty-six years.
    // The lockout, by a different road. Everything the loop keeps across
    // frames (the input state, the camera, the arrival, the locked snapshot)
    // is effect-local, so re-running the effect is what puts every one of them
    // back to a start the new sea agrees with, and the shallows opens on its
    // first second rather than partway through the one lesson it exists for.
    //
    // It costs one chain-sea teardown and rebuild (a socket, a refetch), and
    // it happens at most twice in a session: `afterWrite` returns the SAME
    // object unless the standing actually changed, so the accepted or refused
    // write every few seconds re-renders nothing and re-runs nothing.
  }, [scene, shell, standing.atTheEdge]);

  return (
    <div style={S.page}>
      <canvas ref={canvasRef} style={S.canvas} />
      {/* THE EDGE OF THE WATER (spec §2.16). Over the live canvas, never
          instead of it: the sea keeps folding and drawing underneath, because
          a player who cannot get in has to see a place, not an error. */}
      {standing.atTheEdge && <TheEdge />}
      {typing !== null && (
        // A bare line with a caret. No label, no placeholder, no send button —
        // the diegetic rule holds here too, and there is nothing to say about
        // it that pressing Enter does not already say.
        <div style={S.sayLine}>
          <span>{typing}</span>
          <span style={S.caret}>|</span>
        </div>
      )}
      {showDiag && (
        <div style={S.diagOverlay}>
          <Diagnostics />
        </div>
      )}
      <button
        style={S.dot}
        aria-label="diagnostics"
        onClick={() => setShowDiag((v) => !v)}
      />
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { position: 'fixed', inset: 0, background: '#01060a', overflow: 'hidden' },
  canvas: { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' },
  diagOverlay: { position: 'absolute', inset: 0, overflow: 'auto', background: 'rgba(3, 15, 22, 0.94)' },
  sayLine: {
    position: 'absolute',
    left: '50%',
    bottom: 46,
    transform: 'translateX(-50%)',
    maxWidth: '70vw',
    padding: '7px 14px',
    borderRadius: 14,
    background: 'rgba(4, 22, 31, 0.72)',
    color: '#ffdfae',
    font: '500 14px/1.2 ui-sans-serif, system-ui, sans-serif',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  },
  caret: { opacity: 0.75 },
  // Wordless, dim, and out of the way: a developer can find it, a player will
  // never read it as part of the game.
  dot: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 9,
    height: 9,
    padding: 0,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(150, 200, 220, 0.22)',
    cursor: 'pointer',
  },
};
