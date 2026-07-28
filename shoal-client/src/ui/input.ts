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
 * THE DART: A PRESS ARMS, A PUBLISH SPENDS
 * =============================================================================
 *
 * 1. **A dart has a start AND an end, and both are speed changes**, so both are
 *    changes of mind and both must reach the writer. Omitting the end would
 *    leave every other client reckoning this swimmer at SPEED_DART until the
 *    next keep-alive — up to MAX_EMIT_GAP_MS of phantom travel.
 *
 * 2. **A press cannot always be published when it happens, so it WAITS —
 *    unspent.** `applyInput` sets `dartArmedMs` and nothing else: no burst is
 *    stamped and no cooldown starts. `intentAt` reports SPEED_DART from that
 *    instant, which makes the armed dart a change of mind against the last
 *    published vector, so `shouldEmit` carries it at the first legal instant.
 *    `markEmitted` — the moment a vector at SPEED_DART actually reaches the
 *    writer — is the only place `dartStartMs` is set and therefore the only
 *    place a dart is spent.
 *
 *    THE DEFECT THIS REPLACES, because it should never be reintroduced: the
 *    press used to stamp `dartStartMs` and start the 11 s cooldown
 *    immediately. `shouldEmit`'s floor then refused for up to MIN_EMIT_GAP_MS,
 *    and with DART_MS at 900 the burst was over before a write was ever legal,
 *    so for any press landing in the first 2_100 ms of the floor NOTHING
 *    ANNOUNCING THE DART WAS EVER WRITTEN. The player paid the full cooldown
 *    and no other client saw a thing; on a swimmer steering at the floor that
 *    was ~70% of presses, and on one writing at the keep-alive ~26%. Spec 2.4
 *    calls the dart "how you save your life", and it did nothing at all at
 *    exactly the moment the hush fires.
 *
 *    The floor is NOT what was wrong and is untouched: it is the only thing
 *    standing between one client and the shared per-space mempool budget
 *    (shoalEmit.ts's header), and it can never get a change-of-mind exception
 *    because that exception is what a 60fps loop would exploit. Arming does not
 *    ask for one — it queues behind it. Nor can arming raise the write rate:
 *    `shouldEmit` decides WHEN a write may happen from (last, intent.t,
 *    lastEmitMs) alone and arming only changes WHAT the intent says, so a
 *    player firing the instant the floor opens reaches the same 21 writes a
 *    minute that per-frame steering already reaches. Both are measured against
 *    each other in input.test.ts §5b.
 *
 * 3. **DART_MS === MIN_EMIT_GAP_MS**, so the burst the world reckons is the
 *    burst this module claims. The wire cannot represent a shorter one — a
 *    start and an end are two writes and no two writes may be closer than the
 *    floor — so a 900 ms DART_MS was a duration no client could ever observe.
 *    Now the end of the burst becomes legal on the very frame it happens, and
 *    `isDarting` is true for exactly as long as the published vector reads
 *    SPEED_DART. The cost is stated in shoalConst.ts: 660 cu per dart, 1.94 *
 *    SHELTER_R, flagged for playtesting rather than papered over by retuning
 *    SPEED_DART.
 *
 * 4. **What is still missing**: nothing on screen acknowledges an ARMED dart,
 *    so a press can be silent for up to MIN_EMIT_GAP_MS before the fish moves.
 *    `isDartArmed` exists for a display that wants to say so; what it should
 *    look like is a question about the dart ring's visual language.
 *
 * 5. **The hush refunds it.** Spec 2.12's first hard rule — "T+0 Hush begins.
 *    Your action timer is REFUNDED" — lives in `refundOnHush` below, which the
 *    frame loop calls once a frame with the fold's own `hushStartMs`. It is
 *    what makes the telegraph a telegraph: without it a player who spent their
 *    dart a second before the hush had no escape for the whole commit window,
 *    through no decision of their own.
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
  /**
   * Ms of a press that has not yet reached the writer, or -1 when no dart is
   * waiting. THE ARMED STATE: the player has committed to a burst and it is
   * queued behind the emit floor. It costs nothing while it waits.
   */
  readonly dartArmedMs: number;
  /**
   * Ms the most recent dart was PUBLISHED — not pressed — or -1 if this
   * swimmer has never had one go out. This is what the cooldown is measured
   * from, and the only thing that spends a dart.
   */
  readonly dartStartMs: number;
  /** The heading frozen at the moment of the press. */
  readonly dartHeading: number;
  /** A word waiting for a vector to ride out on, or null. */
  readonly pendingSay: string | null;
  /** Ms of the last eat claim this client sent, or -1. */
  readonly lastEatMs: number;
  /**
   * The `hushStartMs` whose T+0 refund has already been taken, or -1.
   *
   * A hush's start is its identity — every hush has a distinct one, and the
   * fold hands the same value out for every frame of that hush — so this makes
   * `refundOnHush` idempotent per hush without either side counting frames.
   * See `refundOnHush`.
   */
  readonly refundedHushMs: number;
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
    dartArmedMs: -1,
    dartStartMs: -1,
    dartHeading: heading,
    pendingSay: null,
    lastEatMs: -1,
    refundedHushMs: -1,
    spawn: { x, y, heading },
  };
}

/**
 * SPEC 2.12'S FIRST HARD RULE: *"T+0 Hush begins. Your action timer is
 * REFUNDED."* Call it once a frame with the fold's own `state.hushStartMs`.
 *
 * Without it the game's central promise is false. The hush is a TELEGRAPH —
 * eight seconds of warning, of which the first `LOCK_MS` are yours to act in —
 * and the whole point of telegraphing is that the answer is always available.
 * A player who spent their dart one second before the hush began had a
 * `DART_COOLDOWN_MS` of 11_000 against a commit window that closes at `LOCK_MS`,
 * so they had NO escape for the entire window through no decision of their own.
 * The spec names that failure exactly: indistinguishable from randomness. It
 * existed here only as a line in `sweep.ts`'s timeline comment; nothing
 * implemented it.
 *
 * The refund is the dart and nothing else. The dart is the game's one
 * survival verb — spec 2.4 calls it "how you save your life" — while the eat
 * cooldown buys food, not escape, and refunding it would hand out free size at
 * a predictable instant every time the shark came, which is the shape of
 * exploit spec 3.9's checkpoint reasoning already rejects.
 *
 * IDEMPOTENT PER HUSH, and that is what stops the obvious abuse: the refund is
 * keyed on `hushStartMs`, so calling this every frame of a hush refunds ONCE.
 * A player therefore gets exactly one guaranteed dart per hush — not a dart
 * banked and re-banked for the ~8_000 ms the hush lasts, and not a way to
 * out-run the cooldown by holding the key down. Between hushes the ordinary
 * `DART_COOLDOWN_MS` is the only clock.
 *
 * PURE, AND NOT A CLOCK READ. It takes the hush's start rather than "the
 * current phase" so the rule is a function of the fold's own number and can be
 * driven at a fixed step in a test, like everything else in this module. It is
 * also why a dropped frame cannot lose the refund: the identity is the hush,
 * not the instant this client first noticed it.
 */
export function refundOnHush(s: InputState, hushStartMs: number): InputState {
  if (hushStartMs < 0) return s; // no hush running
  if (s.refundedHushMs === hushStartMs) return s; // this one is already paid
  // -1 is "has never darted", which is exactly what a refund means: `canDart`
  // is true and `dartCharge` reads 1, the invariant the ring is drawn from.
  return { ...s, dartStartMs: -1, refundedHushMs: hushStartMs };
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

/**
 * True while a press is waiting for a vector to leave on — pressed, committed
 * to, and not yet announced to anybody.
 *
 * NOT the same as `isDarting`, deliberately. An armed dart has not happened
 * yet: the swimmer is still reckoned off its last published vector, at whatever
 * speed that vector says, on this client and on every other. Reporting it as a
 * burst would be the display disagreeing with the fold, which is the one thing
 * render.ts forbids outright.
 *
 * Exported for a display that wants to acknowledge the press before the water
 * carries it. NOTHING DRAWS IT TODAY, so a press is currently silent for up to
 * MIN_EMIT_GAP_MS — the same latency steering already has ("a turn takes effect
 * when it is WRITTEN", above), but on a verb pressed in a panic. A cue is
 * wanted; what it should look like is a question about the dart ring's visual
 * language (seaPaint.ts's three states) rather than about this module.
 */
export function isDartArmed(s: InputState): boolean {
  return s.dartArmedMs >= 0;
}

/**
 * True while the burst itself is running: `[dartStartMs, +DART_MS)`, measured
 * from the instant the burst was PUBLISHED.
 *
 * This is exactly the window in which the last vector this client published
 * reads SPEED_DART, and it is exact rather than approximate because DART_MS ===
 * MIN_EMIT_GAP_MS: the end of the burst is a speed change that becomes legal on
 * the very frame it happens, so the ring stops flaring on the same frame the
 * world stops reckoning a burst.
 */
export function isDarting(s: InputState, nowMs: number): boolean {
  return s.dartStartMs >= 0 && nowMs - s.dartStartMs < DART_MS;
}

/**
 * True when a dart is available. Measured from the last dart's PUBLISH, not
 * from its press and not from the end of its burst.
 *
 * ARMING IS FREE, so this deliberately ignores `dartArmedMs`: a press that has
 * not gone out yet has cost nothing, the ring still reads full, and pressing
 * again simply re-aims the dart that is already waiting. That is what keeps
 * `dartCharge(...) === 1` and `canDart(...)` the same statement at every
 * instant — the invariant the whole second scoreboard rests on.
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
  // An ARMED dart is part of the intent from the instant it is pressed, and
  // that is the whole mechanism: the intent says SPEED_DART, so it is a change
  // of mind against the last published vector, so `shouldEmit` carries it at
  // the first legal instant instead of the floor quietly eating it.
  const darting = s.dartArmedMs >= 0 || isDarting(s, nowMs);
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
 * matters more than it looks for the dart: if a refused press moved the
 * cooldown's own reference instant, holding the key down would push the
 * cooldown out forever. It cannot now, because the only thing that moves that
 * instant is a publish, and a publish is not something a key can force.
 */
export function applyInput(s: InputState, e: InputEvent, nowMs: number): InputState {
  switch (e.kind) {
    case 'steer':
      return { ...s, steer: e.heading };
    case 'release':
      return s.steer === null ? s : { ...s, steer: null };
    case 'dart':
      // A PRESS ARMS. It does not stamp the burst and it does not start the
      // cooldown — `markEmitted` does both, and only once the burst has
      // actually been published. Pressing again while one is already armed
      // re-aims it rather than queueing a second: there is one pending dart or
      // none.
      if (!canDart(s, nowMs)) return s;
      return { ...s, dartArmedMs: nowMs, dartHeading: heldHeading(s) };
    case 'say': {
      const text = e.text.trim();
      return text.length === 0 ? s : { ...s, pendingSay: text };
    }
  }
}

/**
 * Record that `vec` was published: it becomes the vector everything is
 * reckoned from, any pending word left with it — and an armed dart is SPENT,
 * here and nowhere else.
 *
 * The commit is conditioned on `vec.speed === SPEED_DART` rather than on the
 * arm alone, which is the literal statement of the rule: the cooldown is
 * charged when a vector announcing the burst reaches the writer. A publish that
 * somehow did not carry the burst would leave the dart armed and free, which is
 * the safe direction to fail in — the player keeps a dart they were not heard
 * to spend, and it goes out on the next vector.
 *
 * The burst therefore runs from the PUBLISH instant, `vec.t`, not from the
 * press: the world starts reckoning SPEED_DART when it receives the vector, and
 * `isDarting` has to mean the same window or the ring on the player's own body
 * is describing a different fish from the one everyone else can see.
 */
export function markEmitted(s: InputState, vec: Vec): InputState {
  const spends = s.dartArmedMs >= 0 && vec.speed === SPEED_DART;
  return {
    ...s,
    ...(spends ? { dartArmedMs: -1, dartStartMs: vec.t } : {}),
    last: vec,
    lastEmitMs: vec.t,
    pendingSay: null,
  };
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
