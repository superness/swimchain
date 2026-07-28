/**
 * The four verbs — steer, dart, eat, speak (spec 2.4).
 *
 * DISPLAY SIDE, and the strictest part of it. Floats are permitted in
 * `src/ui/`, but everything this module puts INTO a `Vec` is an integer: a
 * heading is a brad, a speed is one of three constants, and a position comes
 * from the engine's own `reckon`. The only float here is `dartCharge`, which
 * exists purely to fill a ring on screen and never reaches the wire.
 *
 * NO CLOCK. Every function takes `nowMs`. `src/ui/` is allowed to read a wall
 * clock, but this module deliberately does not: the emit cadence, the dart
 * cooldown and the eat cooldown are all decided against a time the CALLER
 * passes in, which is what lets the whole of it be driven at a fixed step in a
 * test with no browser (input.test.ts) and what stops two different clocks
 * disagreeing inside one frame.
 *
 * =============================================================================
 * INPUT NEVER WRITES. THIS IS THE POINT OF THE MODULE.
 * =============================================================================
 *
 * The pipeline is: **input produces an intent `Vec`; `shouldEmit` decides
 * whether it reaches the room; a writer writes it.** This module owns the
 * first two and is structurally incapable of the third — it imports
 * `shoalEmit` (the decision) and never `shoalSend` or `shoalRpc` (the writer
 * and the transport), which input.test.ts asserts by reading this file's own
 * source rather than by trusting the sentence you are reading.
 *
 * `emitDue` is the single seam. It is handed a `write` callback and calls it
 * at most once per frame, only after `shouldEmit` has agreed. Substituting
 * `sendPresence` for that callback is all that connecting this to a real room
 * takes:
 *
 *   emitDue(input, nowMs, (vec, say) => void sendPresence(ctx, vec, say))
 *
 * — the signatures already line up, deliberately. Why that substitution is not
 * made in the shell today is stated in App.tsx: this plan never establishes a
 * room to write into (Task 7's two-client smoke is the only place a room is
 * created at all), so the shell's writer appends to the log its own fold
 * reads, which is exactly what a local write does before gossip carries it.
 *
 * A per-frame emitter is what the bridge exists to prevent: it would breach
 * the node's 120/min RPC write cap and crowd every other swimmer out of the
 * per-space mempool budget they all share (shoalEmit.ts's header does the
 * arithmetic). input.test.ts pins the rate directly — a minute of per-frame
 * steering writes 21 times, not 3_750.
 *
 * =============================================================================
 * WHY THE LOCAL FISH IS DEAD-RECKONED OFF THE LAST *EMITTED* VECTOR
 * =============================================================================
 *
 * `positionAt` and `intentAt` reckon from `state.last` — the vector that was
 * actually published — never from a locally-simulated position that ran ahead
 * of it. That is not a simplification, it is the same rule render.ts states:
 * the display must never disagree with the fold. If the player's own fish
 * turned the instant they moved the pointer while every other client still saw
 * it going straight (because no vector had been written yet), the player would
 * watch the shark take a fish that was, on their screen, somewhere else.
 *
 * The visible consequence is that a turn takes effect when it is WRITTEN, up
 * to MIN_EMIT_GAP_MS later. Spec 2.4 asks for exactly this — "hold a heading
 * and glide with weight" — and the weight is not a smoothing filter, it is the
 * write cadence made visible. The dart is the one instant verb, which is what
 * makes it the currency.
 *
 * =============================================================================
 * THE DART, AND THE TWO THINGS THAT ARE NOT OBVIOUS ABOUT IT
 * =============================================================================
 *
 * 1. **A dart has a start AND an end, and both are speed changes**, so both are
 *    changes of mind and both must reach the writer. Omitting the end would
 *    leave every other client reckoning this swimmer at SPEED_DART until the
 *    next keep-alive — up to MAX_EMIT_GAP_MS of phantom travel.
 *
 * 2. **The end cannot be published when it happens.** DART_MS (900) is far
 *    below MIN_EMIT_GAP_MS (3_000) and the floor is absolute — shoalEmit.ts's
 *    header is explicit that it has no change-of-mind exception, because such
 *    an exception is precisely what a 60fps loop would exploit. So the burst
 *    the WORLD sees lasts MIN_EMIT_GAP_MS, not DART_MS: measured in
 *    input.test.ts at 2_100 ms of extra dart-speed travel, 464 cu. The 900 ms
 *    governs only when this module stops calling itself darting (and therefore
 *    when the ring on screen stops showing a burst).
 *
 *    Worse, and also pinned by a test: a dart pressed while the floor is down
 *    is never announced AT ALL — by the time a write is legal the burst is
 *    over, so what goes out is the cruise that followed it. Since the local
 *    fish also reckons off the last published vector, nothing happens on
 *    screen either; it is consistent, not a desync. But "dart is how you save
 *    your life" (spec 2.4) does not survive a verb that silently does nothing
 *    for up to MIN_EMIT_GAP_MS - DART_MS after the key is pressed.
 *
 *    BOTH are reported rather than fixed here. The candidate fixes — arming
 *    the dart until the first legal write, or raising DART_MS to
 *    MIN_EMIT_GAP_MS — are game-design decisions about the game's single most
 *    important verb, not implementation details, and DART_MS /
 *    DART_COOLDOWN_MS / MIN_EMIT_GAP_MS are all POLICY constants so either is
 *    reachable later without a fork.
 *
 * =============================================================================
 * EAT: THE VERB IS WIRED, AND THE WORLD NOW CREDITS IT (open item 10, resolved)
 * =============================================================================
 *
 * `eatTarget`/`canClaimEat` are correct and App.tsx runs the fold's own
 * `canEat` before offering a bite, so nothing here lies. It used to lie by
 * omission, though: a swimmer marks every cell within BLOOM_VISIT_R (200 cu)
 * visited while it may only bite within EAT_R (90 cu), and the fold stamps
 * `lastVisit` at the end of a tick and judges claims at the start of the next
 * — so opening an UNLATCHED bloom needed 110 cu of closing inside one TICK_MS
 * against a top speed that covers 55. Measured against the real fold: a
 * swimmer swimming in from 600 cu away and claiming on the EAT_COOLDOWN_MS
 * cadence was credited NOTHING, at cruise and at dart alike, while a swimmer
 * whose FIRST presence vector already sat on the cell centre took the whole
 * six-bite bloom. The eat verb was reachable only by a swimmer who never swam.
 *
 * The fold's fix is the claimant-exemption rule: a claim ignores the
 * CLAIMANT'S own visits and honours everyone else's in full (bloom.ts's
 * header states it, and why the two alternatives both measured zero). The same
 * swim-in now takes the full bloom. Both radii are still CONSENSUS and
 * unchanged, so the relationship above is still real — see input.test.ts
 * section 8, which keeps a tripwire on it.
 *
 * What has NOT changed is that nothing on screen points at food beyond the
 * near field. That was never a consequence of the defect: `isBloomReady` is
 * true for very nearly every one of the 768 cells at session start ("the sea
 * starts full"), so a food map would either carpet the sea or invent a rule
 * the game does not have. The bite cue stays the one honestly knowable thing.
 *
 * =============================================================================
 * SPEECH RIDES ALONG
 * =============================================================================
 *
 * Spec 2.4: "A single message carries both your heading vector and your word,
 * so talking is never the reason you were caught." Saying something sets
 * `pendingSay` and changes NOTHING else — not the heading, not the speed, not
 * the position, and not whether a write happens. The word leaves on whatever
 * vector goes out next, and is cleared when it does. The price is that a word
 * waits at most MAX_EMIT_GAP_MS (the keep-alive ceiling guarantees a vector
 * that soon); the alternative — letting speech force a write — would make
 * talking a reason to write, which is the shape of the rule the spec forbids,
 * and would spend the shared per-space budget on it.
 */
import { shouldEmit } from '../lib/shoalEmit';
import { reckon } from '../lib/fixed';
import { cellIndex } from '../lib/bloom';
import {
  DART_COOLDOWN_MS, DART_MS, EAT_COOLDOWN_MS, HEADING_STEPS,
  SPEED_CRUISE, SPEED_DART,
} from '../lib/shoalConst';
import type { Vec } from '../lib/shoalTypes';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Everything the player's side of the game holds. Immutable: every `applyInput`
 * returns a new object, and a REFUSED input returns the very same one (which
 * is how a caller can tell a dart was rejected without a second predicate).
 */
export interface InputState {
  /**
   * The last vector actually published, or null before the first one. This is
   * both what `shouldEmit` compares against and what every position here is
   * reckoned from — see the module header on why it is the published vector
   * and not a local simulation.
   */
  readonly last: Vec | null;
  /** Ms of the last publish. Meaningless while `last` is null. */
  readonly lastEmitMs: number;
  /** The heading being held, in brads, or null when nothing is held. */
  readonly steer: number | null;
  /** Ms the most recent dart began, or -1 if this swimmer has never darted. */
  readonly dartStartMs: number;
  /** The heading frozen at the moment that dart began. */
  readonly dartHeading: number;
  /** A word waiting for a vector to ride out on, or null. */
  readonly pendingSay: string | null;
  /** Ms of the last eat claim this client sent, or -1. */
  readonly lastEatMs: number;
  /** Where this swimmer sits, and faces, before it has published anything. */
  readonly spawn: { readonly x: number; readonly y: number; readonly heading: number };
}

/** What a hand can do. Four verbs, four events. */
export type InputEvent =
  | { kind: 'steer'; heading: number }
  | { kind: 'release' }
  | { kind: 'dart' }
  | { kind: 'say'; text: string };

/** The writer `emitDue` is handed. Deliberately the same shape as
 *  `sendPresence(ctx, vec, say?)` with the context already bound. */
export type PresenceWrite = (vec: Vec, say?: string) => void;

/** A swimmer that has done nothing yet, sitting still at (x, y). */
export function createInput(x: number, y: number, heading: number = 0): InputState {
  return {
    last: null,
    lastEmitMs: 0,
    steer: null,
    dartStartMs: -1,
    dartHeading: heading,
    pendingSay: null,
    lastEatMs: -1,
    spawn: { x, y, heading },
  };
}

// ---------------------------------------------------------------------------
// Steer
// ---------------------------------------------------------------------------

/**
 * The heading a pointer offset names, in brads, always inside
 * `[0, HEADING_STEPS)`.
 *
 * `dx`/`dy` are a delta in ANY consistent coordinate frame whose y grows
 * downward — screen pixels and world centi-units both do, so a caller can hand
 * this either without flipping an axis. Magnitude is ignored; only direction
 * is read. A zero delta has no direction and returns 0.
 *
 * The wrap is not decoration: `Math.atan2` returns exactly `-pi` for `(-1, -0)`
 * (a genuinely reachable pointer position, one pixel left of the fish on a row
 * where the subtraction produced negative zero), which rounds to -128. Left
 * unwrapped that indexes `COS[-128]` — `undefined` — and every position derived
 * from it becomes `NaN`.
 */
export function headingTo(dx: number, dy: number): number {
  const b = Math.round((Math.atan2(dy, dx) / (Math.PI * 2)) * HEADING_STEPS);
  return ((b % HEADING_STEPS) + HEADING_STEPS) % HEADING_STEPS;
}

// ---------------------------------------------------------------------------
// Dart
// ---------------------------------------------------------------------------

/** True while the burst itself is running: `[dartStartMs, +DART_MS)`. */
export function isDarting(s: InputState, nowMs: number): boolean {
  return s.dartStartMs >= 0 && nowMs - s.dartStartMs < DART_MS;
}

/**
 * True when a dart is available. Measured from the last dart's PRESS, not from
 * the end of its burst, so the interval between two darts is exactly
 * DART_COOLDOWN_MS and a player can read the ring as "time until the next
 * dart" with nothing added on.
 */
export function canDart(s: InputState, nowMs: number): boolean {
  return s.dartStartMs < 0 || nowMs - s.dartStartMs >= DART_COOLDOWN_MS;
}

/**
 * How full the dart is, 0 (just spent) to 1 (ready). THE SECOND SCOREBOARD
 * (spec 2.4) — this is the number the ring around the player's own body is
 * drawn from, and `dartCharge(...) === 1` is exactly `canDart(...)`, asserted
 * at every instant across a whole recharge in input.test.ts. A ring that could
 * read full while the verb was refused would be a lie about the trade-off the
 * entire game turns on.
 *
 * The one float in this module, and it never reaches a `Vec`.
 */
export function dartCharge(s: InputState, nowMs: number): number {
  if (s.dartStartMs < 0) return 1;
  const f = (nowMs - s.dartStartMs) / DART_COOLDOWN_MS;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// ---------------------------------------------------------------------------
// Eat
// ---------------------------------------------------------------------------

/**
 * True when this client may send another eat claim. Mirrors the fold's own
 * EAT_COOLDOWN_MS (`canEat`, bloom.ts) so a refused claim is never MINED and
 * WRITTEN before the fold throws it away — the client is not the authority
 * here, it is declining to spend a write on a bite it can predict will not
 * credit.
 */
export function canClaimEat(s: InputState, nowMs: number): boolean {
  return s.lastEatMs < 0 || nowMs - s.lastEatMs >= EAT_COOLDOWN_MS;
}

/** Record a claim having been sent at `ms`. */
export function markEat(s: InputState, ms: number): InputState {
  return { ...s, lastEatMs: ms };
}

/**
 * Which bloom cell a bite would be claimed from: the one the swimmer is
 * standing in, named by the ENGINE's `cellIndex` so the client and the fold
 * can never disagree about which cell was meant.
 *
 * The nearest cell centre to any point is always its own cell's centre (the
 * grid is uniform), so there is no better target to pick. Note bloom.ts's
 * known corner dead zone: a swimmer at a cell's exact corner is 90.5 cu from
 * that centre, just past EAT_R (90), and cannot eat there. That is a permanent
 * CONSENSUS relationship between EAT_R and BLOOM_CELL, not something this
 * module may route around.
 */
export function eatTarget(s: InputState, nowMs: number): number {
  const p = positionAt(s, nowMs);
  return cellIndex(p.x, p.y);
}

// ---------------------------------------------------------------------------
// The intent
// ---------------------------------------------------------------------------

/** Where this swimmer is at `nowMs`, by the engine's own reckoning. */
export function positionAt(s: InputState, nowMs: number): { x: number; y: number } {
  if (s.last === null) return { x: s.spawn.x, y: s.spawn.y };
  return reckon(s.last, nowMs);
}

/** The heading this swimmer is on when it is not mid-burst. */
function heldHeading(s: InputState): number {
  if (s.steer !== null) return s.steer;
  return s.last !== null ? s.last.heading : s.spawn.heading;
}

/**
 * The vector this client WOULD write if it wrote right now — which is exactly
 * what `shouldEmit` documents its `intent` argument to be.
 *
 * Three fields and where each comes from:
 *  - position: `reckon` off the last published vector, so a new write never
 *    teleports anyone (and a STOP is authored from where the swimmer actually
 *    is, not from where its last vector was written — the difference is 240 cu
 *    in input.test.ts's release case);
 *  - heading: the burst's frozen heading while darting, otherwise whatever is
 *    held, otherwise the last heading published (a stopped fish keeps facing
 *    where it was going);
 *  - speed: one of the three the engine knows — SPEED_DART mid-burst,
 *    SPEED_CRUISE while a heading is held, 0 when nothing is.
 */
export function intentAt(s: InputState, nowMs: number): Vec {
  const p = positionAt(s, nowMs);
  const darting = isDarting(s, nowMs);
  return {
    x: p.x,
    y: p.y,
    heading: darting ? s.dartHeading : heldHeading(s),
    speed: darting ? SPEED_DART : s.steer !== null ? SPEED_CRUISE : 0,
    t: nowMs,
  };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Fold one input event into the state at `nowMs`.
 *
 * A refused event returns the SAME OBJECT, which is the whole of the refusal
 * protocol — a dart on cooldown, or an empty word, leaves nothing behind. That
 * matters more than it looks for the dart: if a refused press moved
 * `dartStartMs`, holding the key down would push the cooldown out forever.
 */
export function applyInput(s: InputState, e: InputEvent, nowMs: number): InputState {
  switch (e.kind) {
    case 'steer':
      return { ...s, steer: e.heading };
    case 'release':
      return s.steer === null ? s : { ...s, steer: null };
    case 'dart':
      if (!canDart(s, nowMs)) return s;
      return { ...s, dartStartMs: nowMs, dartHeading: heldHeading(s) };
    case 'say': {
      const text = e.text.trim();
      return text.length === 0 ? s : { ...s, pendingSay: text };
    }
  }
}

/** Record that `vec` was published: it becomes the vector everything is
 *  reckoned from, and any pending word left with it. */
export function markEmitted(s: InputState, vec: Vec): InputState {
  return { ...s, last: vec, lastEmitMs: vec.t, pendingSay: null };
}

/**
 * THE SEAM. Build this frame's intent, ask `shouldEmit`, and — only if it
 * agrees — hand the vector and any waiting word to `write`.
 *
 * Called once per frame. `write` is called at most once per call and never
 * without `shouldEmit`'s agreement, which is the entire reason this function
 * exists rather than the caller doing it inline: there is then exactly one
 * place in the shell where a vector can leave, and it is covered by a test
 * that counts writes over a minute of adversarial input.
 */
export function emitDue(s: InputState, nowMs: number, write: PresenceWrite): InputState {
  const intent = intentAt(s, nowMs);
  if (!shouldEmit(s.last, intent, s.lastEmitMs)) return s;
  write(intent, s.pendingSay ?? undefined);
  return markEmitted(s, intent);
}
