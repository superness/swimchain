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
 * Two developer affordances survive, both wordless:
 *   - a dim dot in the bottom-right corner, and F1, toggle Task 1's
 *     diagnostics panel. It is the only way to see whether the sidecar is
 *     alive, so it stays reachable — just not visible enough to be part of the
 *     game.
 *   - `1` and `2` switch which sea is being folded (see demoSea.ts).
 *   - three query parameters — `?at=`, `?played=`, `?me=` — documented on
 *     `devParam` below. None of them is reachable from inside the game.
 *
 * The chain-sea parameters (`?rpc=`, `&cookie=`, `&who=`, …) are a FOURTH set,
 * and unlike those three they are gated on `import.meta.env.DEV` in both
 * `chainParams` and `buildChainSea` — see the comments there. They carry a
 * credential and a key derivation, "not reachable from inside the game" is not
 * a security property when `devtools` is on in release, and the static gate is
 * also what keeps `browserIdentity.ts` out of the production bundle at all.
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
 * WHAT `sea.publish` IS TODAY, stated plainly rather than implied. It appends
 * to the log this sea's own fold walks — which is what a local write does
 * before gossip carries it, since the node merges the mempool into
 * `get_replies` and a client sees its own write back immediately. The real
 * writer is one substitution, `(vec, say) => void sendPresence(ctx, vec, say)`,
 * and it is NOT made here because nothing in this plan establishes a room to
 * write into: `scripts/regtest-smoke.ts` is the only place a Shoal space and
 * room post are ever created, and the shell gets one in Task 7. Wiring an
 * unexercised chain writer would be dead code claiming a capability nobody has
 * run.
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
import { chainSea, type ChainSea } from './chainSea';
import { TheEdge } from './TheEdge';
import { afterWrite, OPEN_WATER, type Standing } from './wayIn';
import { identityFromLabel } from './browserIdentity';
import { paintFrame, type ScatterPaint, type Swimmer } from './seaPaint';
import { fitBodies, fitScale, followCamera, reckonSmooth, screenToWorld, type Camera, type Viewport } from './render';
import { boltProgress, wildClock, wildShelterBodies, wildViewAt } from './wildView';
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

type SceneKind = 'lively' | 'harness' | 'chain';

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
 * `get_rpc_config` (see Diagnostics.tsx), never from a URL.
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
 * Build the chain sea from the URL, or `null` if this window was not pointed
 * at a room. Synchronous on purpose: the signing key resolves asynchronously
 * (WebCrypto `importKey`), but `Sea.selfId` must be known on the first frame,
 * so the public key comes from `&id=` and `chainSea` checks the two agree once
 * the key arrives. That keeps the frame loop's construction unchanged.
 */
function buildChainSea(onWrite: (failure: SendFailure | null) => void): ChainSea | null {
  // THE STATIC GATE, and it is here as well as inside `chainParams` on purpose.
  // `import.meta.env.DEV` is replaced by the literal `false` in a production
  // build, so this becomes `if (true) return null;` and everything below it —
  // including the only reference anywhere to `identityFromLabel` — is dead code
  // rollup removes, taking `browserIdentity.ts` out of the bundle entirely.
  // Gating `chainParams` alone would not do that: rollup does not inline across
  // the call to prove the branch unreachable, so the weak dev key derivation
  // would still ship, unreferenced but present, in a release the operator has
  // no reason to expect it in. Verified by grepping `dist/` for `shoal-two:`
  // after `npm run build`.
  if (!import.meta.env.DEV) return null;
  const p = chainParams();
  if (p === null) return null;
  return chainSea({
    auth: {
      endpoint: p.rpc,
      authHeader: p.cookie === null ? null : `Basic ${btoa(`__cookie__:${p.cookie}`)}`,
    },
    spaceId: p.space,
    roomContentId: p.room,
    authorIdHex: p.id,
    signer: identityFromLabel(p.who),
    // Mid-world, so a fresh window is somewhere the other window's camera can
    // plausibly reach. The fold overrides this the moment a real vector for
    // this swimmer arrives; it only decides where the pointer starts steering
    // from before the first publish.
    spawn: { x: Math.round(WORLD_W / 2), y: Math.round(WORLD_H / 2) },
    onError: (where, err) => { console.error(`[shoal] chain sea (${where}):`, err); },
    // THE WAY IN (spec §2.16). Every write's outcome, typed — accepted, or
    // classified by `classifySendFailure` from the node's own JSON-RPC code.
    // What it MEANS is decided by `wayIn.afterWrite`, which raises the edge of
    // the water for exactly one of the three kinds and leaves the standing
    // alone for the other two. Nothing here reads an error message, and this
    // page never sees one.
    onWrite,
  });
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
  const [scene, setScene] = useState<SceneKind>(() => {
    if (chainParams() !== null) return 'chain';
    return devNumber('at') !== null ? 'harness' : 'lively';
  });
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const typingRef = useRef<string | null>(null);
  typingRef.current = typing;

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
      else if (e.key === '1' && chainParams() === null) setScene('lively');
      else if (e.key === '2' && chainParams() === null) setScene('harness');
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
    const chain = scene === 'chain'
      ? buildChainSea((failure) => { setStanding((s) => afterWrite(s, failure)); })
      : null;
    const sea: Sea = chain
      ?? (scene === 'harness'
        ? harnessSea(startWall, at ?? 0, devParam('me') ?? 'e0')
        : livelySea(startWall));

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
      const wall = Date.now();
      const authorMs = wall + TICK_MS;

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
      input = emitDue(input, authorMs, (vec, say) => sea.publish(vec, say));

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
  }, [scene]);

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
