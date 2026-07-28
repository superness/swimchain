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
 * Two developer affordances survive, both wordless:
 *   - a dim dot in the bottom-right corner, and F1, toggle Task 1's
 *     diagnostics panel. It is the only way to see whether the sidecar is
 *     alive, so it stays reachable — just not visible enough to be part of the
 *     game.
 *   - `1` and `2` switch which sea is being folded (see demoSea.ts).
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
import { paintFrame, type Swimmer } from './seaPaint';
import { fitScale, followCamera, screenToWorld, type Camera, type Viewport } from './render';
import {
  applyInput, canClaimEat, createInput, dartCharge, eatTarget, emitDue,
  headingTo, isDarting, markEat, positionAt, type InputEvent, type InputState,
} from './input';
import { canEat, cellCentre } from '../lib/bloom';
import type { ReadonlyVisitMap } from '../lib/shoalTypes';
import { reckon } from '../lib/fixed';
import { TICK_MS, WORLD_H, WORLD_W } from '../lib/shoalConst';

type SceneKind = 'lively' | 'harness';

/** How long a swept swimmer is drawn dazed. Spec 2.9's "a few seconds". */
const DAZED_MS = 2_500;

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

export function App() {
  const [showDiag, setShowDiag] = useState(false);
  const [scene, setScene] = useState<SceneKind>('lively');
  /** The line being typed, or null when not speaking. */
  const [typing, setTyping] = useState<string | null>(null);
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
      else if (e.key === '1') setScene('lively');
      else if (e.key === '2') setScene('harness');
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
    const sea: Sea = scene === 'harness' ? harnessSea(startWall) : livelySea(startWall);

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
      // so the cue on screen and the credit the world gives cannot disagree.
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

      const swimmers: Swimmer[] = [];
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

      // Follow the player. Before their first vector arrives — and in the
      // harness scenario for its first fold — there is nobody to follow, so
      // the camera sits on the middle of the water rather than at the origin,
      // which would open on empty black.
      const tx = me ? me.x : WORLD_W / 2;
      const ty = me ? me.y : WORLD_H / 2;
      if (cam === null) cam = { x: tx, y: ty, scale: fitScale(view) };
      cam = followCamera(cam, tx, ty, view);

      paintFrame(ctx, { view, cam, atMs, swimmers, aim, bite });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [scene]);

  return (
    <div style={S.page}>
      <canvas ref={canvasRef} style={S.canvas} />
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
