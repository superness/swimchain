/**
 * The four verbs — steer, dart, eat, speak. Run: npx tsx src/ui/input.test.ts
 *
 * WHAT IS UNDER TEST. `input.ts` is the whole of the player's side of the
 * game: it turns a pointer and four keys into an **intent `Vec`**, and it is
 * the only place that decides when to hand that intent to a writer. It reads
 * no clock (every function takes `nowMs`), holds no DOM, and — the property
 * this file exists to pin — **cannot write anything itself**. §6 asserts that
 * structurally, by reading its own source.
 *
 * WHY A FRAME LOOP IS THE RIGHT SHAPE FOR HALF OF THESE. Three of the four
 * verbs are only meaningful across time: a dart has a start AND an end, speech
 * waits for a vector to ride on, and the whole point of the bridge is that a
 * 60fps input loop must not become a 60fps write loop. So several sections
 * below run a real frame loop at a fixed step and assert on the RECORDED
 * WRITES — their count, their timestamps, their speeds — rather than on a
 * single call's return value. Every expected timestamp is derived by hand in
 * the comment beside it from MIN_EMIT_GAP_MS / MAX_EMIT_GAP_MS / DART_MS /
 * DART_COOLDOWN_MS, never read back off the loop.
 *
 * NO CLOCK, NO RANDOMNESS anywhere in this file. Every `nowMs` is a literal or
 * an expression over the imported constants.
 *
 * DISPLAY SIDE. `src/ui/` may use floats; the values that must stay integers
 * are the ones that reach a `Vec`, and this file checks that they do.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createInput, applyInput, intentAt, emitDue, markEmitted,
  headingTo, isDarting, canDart, dartCharge, positionAt,
  canClaimEat, markEat, eatTarget,
  type InputState,
} from './input';
import { shouldEmit, MIN_EMIT_GAP_MS, MAX_EMIT_GAP_MS } from '../lib/shoalEmit';
import { reckon } from '../lib/fixed';
import { cellIndex } from '../lib/bloom';
import {
  BLOOM_VISIT_R, DART_COOLDOWN_MS, DART_MS, EAT_COOLDOWN_MS, EAT_R,
  HEADING_STEPS, SPEED_CRUISE, SPEED_DART, TICK_MS,
} from '../lib/shoalConst';
import type { Vec } from '../lib/shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** One recorded write. The `say` is captured separately from the vector on
 *  purpose — the whole speech rule is about which of the two is present. */
interface Wrote { vec: Vec; say: string | undefined }

/** Run a frame loop and return everything that reached the writer. */
function play(
  start: InputState,
  fromMs: number, toMs: number, stepMs: number,
  at: ReadonlyMap<number, (s: InputState, t: number) => InputState> = new Map(),
): { writes: Wrote[]; end: InputState } {
  const writes: Wrote[] = [];
  let s = start;
  for (let t = fromMs; t <= toMs; t += stepMs) {
    const ev = at.get(t);
    if (ev) s = ev(s, t);
    s = emitDue(s, t, (vec, say) => { writes.push({ vec, say }); });
  }
  return { writes, end: s };
}

function main() {
  // =========================================================================
  // 1. A pointer maps to a heading — every octant, hand-derived
  // =========================================================================
  //
  // `headingTo(dx, dy)` = round(atan2(dy, dx) / 2pi * HEADING_STEPS), wrapped
  // into [0, HEADING_STEPS). Screen y and world y BOTH grow downward (the
  // world is 0..WORLD_H top to bottom and `reckon` adds SIN[heading] to y), so
  // no axis flip is needed anywhere and brads increase CLOCKWISE on screen.
  //
  // By hand, from atan2 alone:
  //   ( 1,  0) -> 0        -> 0/2pi   * 256 =   0
  //   ( 1,  1) -> pi/4     -> 1/8     * 256 =  32
  //   ( 0,  1) -> pi/2     -> 1/4     * 256 =  64
  //   (-1,  1) -> 3pi/4    -> 3/8     * 256 =  96
  //   (-1,  0) -> pi       -> 1/2     * 256 = 128
  //   (-1, -1) -> -3pi/4   -> -96     -> +256 = 160
  //   ( 0, -1) -> -pi/2    -> -64     -> +256 = 192
  //   ( 1, -1) -> -pi/4    -> -32     -> +256 = 224
  {
    const octants: Array<[number, number, number]> = [
      [1, 0, 0], [1, 1, 32], [0, 1, 64], [-1, 1, 96],
      [-1, 0, 128], [-1, -1, 160], [0, -1, 192], [1, -1, 224],
    ];
    for (const [dx, dy, want] of octants) {
      check(`pointer (${dx}, ${dy}) is heading ${want}`, headingTo(dx, dy) === want,
        { got: headingTo(dx, dy) });
    }
    // Magnitude is irrelevant — only the direction.
    check('a distant pointer gives the same heading as a near one',
      headingTo(940, 940) === 32 && headingTo(3, 3) === 32,
      { far: headingTo(940, 940), near: headingTo(3, 3) });
  }

  // The wrap has one genuinely dangerous input: atan2 returns exactly -pi for
  // (-1, -0), which rounds to -128 and MUST come back as +128, not -128.
  check('the negative-zero boundary wraps into range, not out of it',
    headingTo(-1, -0) === 128, { got: headingTo(-1, -0) });
  // A degenerate delta (pointer exactly on the fish) has no direction; 0 is
  // the documented answer and, more importantly, it must be IN RANGE.
  check('a zero delta is in range', headingTo(0, 0) === 0, { got: headingTo(0, 0) });

  // Every direction on a fine sweep lands on an integer inside [0, 256).
  {
    let bad = 0;
    for (let i = 0; i < 720; i++) {
      const rad = (i / 720) * Math.PI * 2;
      const h = headingTo(Math.cos(rad), Math.sin(rad));
      if (!Number.isInteger(h) || h < 0 || h >= HEADING_STEPS) bad++;
    }
    check('720 directions all land on an integer inside [0, HEADING_STEPS)', bad === 0, { bad });
  }

  // The headings must mean to the ENGINE what they mean here, or the fish
  // swims somewhere other than the pointer. Checked through `reckon` itself.
  //
  // By hand, heading 32 at SPEED_DART for 1000 ms from (1000, 1000):
  //   COS[32] = SIN[32] = round(cos(pi/4) * 4096) = round(2896.31) = 2896
  //   dx = trunc(220 * 2896 * 1000 / (4096 * 1000)) = trunc(155.55) = 155
  //   x = 1000 + 155 = 1155 -> quantize -> floor(1155/8)*8 = 144*8 = 1152
  {
    const p = reckon({ x: 1000, y: 1000, heading: headingTo(1, 1), speed: SPEED_DART, t: 0 }, 1000);
    check('the engine moves a heading-32 vector down and right (hand-derived 1152, 1152)',
      p.x === 1152 && p.y === 1152, p);
  }
  //
  // The origin below is (2000, 1504) rather than a round (2000, 1500) because
  // `reckon` QUANTIZES its answer to the 8 cu lattice: 1500 is not a multiple
  // of 8, so a vector with dy = 0 comes back at 1496 and reads as "moved up".
  // That is the engine behaving correctly and the first draft of this check
  // being wrong; 2000/8 = 250 and 1504/8 = 188 are both exact.
  {
    const signs: Array<[number, number, number, number]> = [
      [1, 0, 1, 0], [1, 1, 1, 1], [0, 1, 0, 1], [-1, 1, -1, 1],
      [-1, 0, -1, 0], [-1, -1, -1, -1], [0, -1, 0, -1], [1, -1, 1, -1],
    ];
    let wrong = 0;
    for (const [dx, dy, sx, sy] of signs) {
      const v: Vec = { x: 2000, y: 1504, heading: headingTo(dx, dy), speed: SPEED_DART, t: 0 };
      const p = reckon(v, 2000);
      if (Math.sign(p.x - 2000) !== sx || Math.sign(p.y - 1504) !== sy) wrong++;
    }
    check('every octant moves the engine in the octant the pointer named', wrong === 0, { wrong });
  }

  // =========================================================================
  // 2. Dart — refused on cooldown, permitted after
  // =========================================================================
  //
  // Every bound below is written against DART_COOLDOWN_MS / DART_MS, never
  // against 11_000 / 900, so retuning the policy constants cannot leave this
  // section asserting a number the game no longer uses.
  {
    check('spec 2.4 "a ~10-12 s cooldown" holds for the constant the code uses',
      DART_COOLDOWN_MS >= 10_000 && DART_COOLDOWN_MS <= 12_000, { DART_COOLDOWN_MS });
    check('the burst is shorter than the cooldown', DART_MS < DART_COOLDOWN_MS,
      { DART_MS, DART_COOLDOWN_MS });

    const fresh = createInput(1000, 1000, 0);
    check('a swimmer who has never darted may dart', canDart(fresh, 0) === true);
    check('...and reads as fully charged', dartCharge(fresh, 0) === 1, { got: dartCharge(fresh, 0) });
    check('...and is not darting', isDarting(fresh, 0) === false);

    const T0 = 4_000;
    const darted = applyInput(fresh, { kind: 'dart' }, T0);
    check('the dart is accepted and stamped at the press', darted.dartStartMs === T0,
      { got: darted.dartStartMs });

    // The burst itself: [T0, T0 + DART_MS).
    check('the burst is running at the press', isDarting(darted, T0) === true);
    check('the burst is still running one ms before it ends',
      isDarting(darted, T0 + DART_MS - 1) === true);
    check('the burst is over exactly DART_MS after the press',
      isDarting(darted, T0 + DART_MS) === false);

    // The cooldown: refused right up to the boundary, permitted ON it.
    check('a dart one ms into the cooldown is refused',
      canDart(darted, T0 + 1) === false);
    check('a dart one ms before the cooldown expires is refused',
      canDart(darted, T0 + DART_COOLDOWN_MS - 1) === false);
    check('a dart exactly DART_COOLDOWN_MS after the last one is permitted',
      canDart(darted, T0 + DART_COOLDOWN_MS) === true);

    // A refused press must change NOTHING — not the start time, not the
    // heading, not the state object. If it moved dartStartMs, holding the key
    // down would push the cooldown out forever.
    const refused = applyInput(darted, { kind: 'dart' }, T0 + DART_COOLDOWN_MS - 1);
    check('a refused dart leaves the state untouched', refused === darted);
    check('...so holding the key down cannot extend the cooldown',
      refused.dartStartMs === T0, { got: refused.dartStartMs });

    // And the second dart, once permitted, restarts the clock.
    const again = applyInput(darted, { kind: 'dart' }, T0 + DART_COOLDOWN_MS);
    check('a permitted dart restarts the cooldown from its own press',
      again.dartStartMs === T0 + DART_COOLDOWN_MS && canDart(again, T0 + DART_COOLDOWN_MS + 1) === false,
      { got: again.dartStartMs });

    // The charge — the second scoreboard. Linear from 0 at the press to 1 at
    // the cooldown, clamped both ends.
    check('charge is 0 at the press', dartCharge(darted, T0) === 0, { got: dartCharge(darted, T0) });
    check('charge is exactly half at half the cooldown (hand-derived 0.5)',
      dartCharge(darted, T0 + DART_COOLDOWN_MS / 2) === 0.5,
      { got: dartCharge(darted, T0 + DART_COOLDOWN_MS / 2) });
    check('charge reaches 1 exactly when the dart is permitted again',
      dartCharge(darted, T0 + DART_COOLDOWN_MS) === 1,
      { got: dartCharge(darted, T0 + DART_COOLDOWN_MS) });
    check('charge never exceeds 1 afterwards',
      dartCharge(darted, T0 + DART_COOLDOWN_MS * 3) === 1,
      { got: dartCharge(darted, T0 + DART_COOLDOWN_MS * 3) });
    // Monotone, so the ring only ever fills.
    {
      let dips = 0;
      let prev = -1;
      for (let t = T0; t <= T0 + DART_COOLDOWN_MS + 500; t += 25) {
        const c = dartCharge(darted, t);
        if (c < prev) dips++;
        prev = c;
      }
      check('charge is monotone over the whole recharge', dips === 0, { dips });
    }
    // The display must agree with the rule, or the ring lies about a verb the
    // spec calls the second scoreboard.
    {
      let disagree = 0;
      for (let t = T0; t <= T0 + DART_COOLDOWN_MS + 2_000; t += 17) {
        if ((dartCharge(darted, t) === 1) !== canDart(darted, t)) disagree++;
      }
      check('a full ring means exactly "you may dart", at every instant',
        disagree === 0, { disagree });
    }

    // The burst speed itself is the dart speed and the heading is frozen at
    // the press, so a dart is a commitment rather than a steerable mode.
    {
      const held = applyInput(createInput(1000, 1000, 0), { kind: 'steer', heading: 64 }, 0);
      const d = applyInput(held, { kind: 'dart' }, 100);
      const during = intentAt(d, 500);
      check('a dart intends the dart speed', during.speed === SPEED_DART, during);
      check('...on the heading held at the press', during.heading === 64, during);
      const turned = applyInput(d, { kind: 'steer', heading: 192 }, 600);
      check('...and steering mid-burst does not swing the burst',
        intentAt(turned, 700).heading === 64, intentAt(turned, 700));
      check('...but the new heading takes over once the burst ends',
        intentAt(turned, 100 + DART_MS).heading === 192, intentAt(turned, 100 + DART_MS));
    }
  }

  // =========================================================================
  // 3. Speech rides along with the next vector — it never issues a write
  // =========================================================================
  //
  // Spec 2.4: "A single message carries both your heading vector and your
  // word, so talking is never the reason you were caught." The operational
  // reading, and the only one a test can pin: SPEAKING MUST NOT PRODUCE A
  // WRITE OF ITS OWN, and it must not perturb the vector.
  //
  // The scenario, hand-derived from MIN_EMIT_GAP_MS(3_000) and
  // MAX_EMIT_GAP_MS(8_000). A swimmer holds one heading and never changes it:
  //   t = 0      first vector ever -> `last` is null -> always emitted
  //   t = 100    the player speaks
  //   t = 8_000  gap = 8_000 - 0 >= MAX_EMIT_GAP_MS -> the keep-alive fires
  //   t = 16_000 gap = 8_000 again -> the next keep-alive
  // Nothing else can emit: heading and speed never change, so between the
  // floor and the ceiling `isChangeOfMind` is false at every frame.
  {
    const s0 = applyInput(createInput(1000, 1000, 0), { kind: 'steer', heading: 0 }, 0);
    const { writes } = play(s0, 0, 20_000, 20, new Map([
      [100, (s: InputState, t: number) => applyInput(s, { kind: 'say', text: 'over here' }, t)],
    ]));

    check('holding one heading for 20 s writes exactly the hand-derived three times',
      writes.length === 3, { times: writes.map((w) => w.vec.t) });
    check('...at t = 0, 8000 and 16000',
      writes.map((w) => w.vec.t).join(',') === '0,8000,16000',
      { times: writes.map((w) => w.vec.t) });

    // THE LOAD-BEARING ASSERTION. From the instant the word is spoken until
    // the next vector this swimmer was going to write anyway, nothing reaches
    // the writer at all.
    //
    // The bound is `>= 100`, INCLUSIVE of the frame the word was spoken on,
    // and that is not fussiness: an implementation that forces a write when a
    // word is pending emits on exactly that frame, so a strict `> 100` window
    // is empty under the bug and the assertion proves nothing. (It was written
    // strict first; mutation 2 was caught by the write COUNT while this check
    // sailed through, which is how the off-by-one-frame was found.)
    const between = writes.filter((w) => w.vec.t >= 100 && w.vec.t < 8_000);
    check('speaking issues no write of its own', between.length === 0,
      { between: between.map((w) => w.vec.t) });

    // Stated a second way, immune to any choice of window: the SAME session
    // with and without the word produces the same writes at the same instants.
    // Talking changes nothing about when this swimmer is heard from.
    {
      const silent = play(s0, 0, 20_000, 20).writes;
      check('a session with a word written into it writes at exactly the same instants as a silent one',
        silent.map((w) => w.vec.t).join(',') === writes.map((w) => w.vec.t).join(','),
        { silent: silent.map((w) => w.vec.t), spoken: writes.map((w) => w.vec.t) });
      check('...and the same vectors, field for field',
        JSON.stringify(silent.map((w) => w.vec)) === JSON.stringify(writes.map((w) => w.vec)));
    }

    check('the word rides along on the next vector', writes[1].say === 'over here',
      { say: writes[1].say });
    check('...and that vector is an ordinary one, not a special one',
      writes[1].vec.speed === SPEED_CRUISE && writes[1].vec.heading === 0, writes[1].vec);
    check('the first vector, written before the word, carries nothing',
      writes[0].say === undefined, { say: writes[0].say });
    check('the word is not repeated on the vector after it',
      writes[2].say === undefined, { say: writes[2].say });

    // And the vector itself is untouched by talking — the sharpest statement
    // of "talking is never the reason you were caught": your position, your
    // heading and your speed are bit-identical whether or not you spoke.
    const quiet = applyInput(createInput(1000, 1000, 0), { kind: 'steer', heading: 0 }, 0);
    const talky = applyInput(quiet, { kind: 'say', text: 'behind you' }, 100);
    check('speaking changes no field of the intent vector',
      JSON.stringify(intentAt(quiet, 4_321)) === JSON.stringify(intentAt(talky, 4_321)),
      { quiet: intentAt(quiet, 4_321), talky: intentAt(talky, 4_321) });

    // An empty word is not a word.
    const blank = applyInput(quiet, { kind: 'say', text: '   ' }, 100);
    check('whitespace is not speech', blank === quiet);

    // The price of the rule, stated as an assertion rather than a comment:
    // the word waits at most one keep-alive.
    check('a word waits no longer than the keep-alive ceiling',
      writes[1].vec.t - 100 < MAX_EMIT_GAP_MS, { waited: writes[1].vec.t - 100 });
  }

  // =========================================================================
  // 4. Releasing produces a stop intent, not a stale heading
  // =========================================================================
  //
  // Hand-derived. The swimmer holds heading 64 (straight down) at
  // SPEED_CRUISE from (1000, 1000) at t = 0, and lets go at t = 4_000.
  //   COS[64] = round(cos(pi/2) * 4096) = round(2.5e-13) = 0
  //   SIN[64] = round(sin(pi/2) * 4096) = 4096
  //   dy = trunc(60 * 4096 * 4000 / (4096 * 1000)) = trunc(240) = 240
  //   y  = 1000 + 240 = 1240   (1240/8 = 155 exactly, so quantize is a no-op)
  //   x  = 1000                (unchanged; 1000/8 = 125 exactly)
  {
    const held = applyInput(createInput(1000, 1000, 0), { kind: 'steer', heading: 64 }, 0);
    const first = intentAt(held, 0);
    const moving = markEmitted(held, first);
    check('the held intent cruises', first.speed === SPEED_CRUISE && first.heading === 64, first);

    const let_go = applyInput(moving, { kind: 'release' }, 4_000);
    const stop = intentAt(let_go, 4_000);

    check('releasing intends a stop', stop.speed === 0, stop);
    // THE DISCRIMINATING PART. A stop that republished the last vector's own
    // x/y would snap every other client's picture of this swimmer 240 cu back
    // up the water. The stop must be authored from where the swimmer ACTUALLY
    // IS at the instant of release — `reckon`'s answer, not the stale origin.
    check('the stop is authored from where the swimmer now is (hand-derived 1000, 1240)',
      stop.x === 1000 && stop.y === 1240, stop);
    check('...which is not where its last vector was written',
      stop.y !== moving.last!.y, { stopY: stop.y, lastY: moving.last!.y });
    check('the stop carries the instant it happened', stop.t === 4_000, stop);
    // The heading is deliberately RETAINED: a fish that has stopped still
    // faces where it was going. Only the speed says "stopped".
    check('a stopped swimmer keeps facing where it was going', stop.heading === 64, stop);
    // And it is a change of mind, so it goes out at the first legal instant.
    check('the stop is worth writing', shouldEmit(moving.last, stop, moving.lastEmitMs) === true);

    // Position is an integer on the quantisation grid, as every Vec must be.
    check('the stop position is integral', Number.isInteger(stop.x) && Number.isInteger(stop.y), stop);

    // Releasing and then holding again resumes cruising on the new heading.
    const again = applyInput(let_go, { kind: 'steer', heading: 192 }, 5_000);
    const back = intentAt(again, 5_000);
    check('holding again resumes cruising on the new heading',
      back.speed === SPEED_CRUISE && back.heading === 192, back);
  }

  // =========================================================================
  // 5. A dart has a START and an END, and both reach the writer
  // =========================================================================
  //
  // Omitting the end leaves every other client dead-reckoning this swimmer at
  // SPEED_DART long after the burst stopped. Both edges are speed changes, so
  // both are changes of mind — but the SECOND one lands inside the emit floor
  // and is therefore DELAYED, which is the part worth measuring rather than
  // assuming.
  //
  // Hand-derived, frames every 20 ms, heading 0 held throughout, dart at 5_000:
  //   t = 0     `last` is null                      -> write #1, SPEED_CRUISE
  //   t = 5_000 speed CRUISE -> DART, gap 5_000
  //             (>= MIN_EMIT_GAP_MS, < MAX_EMIT_GAP_MS, change of mind)
  //                                                 -> write #2, SPEED_DART
  //   t = 5_900 burst ends (5_000 + DART_MS), speed DART -> CRUISE,
  //             but gap = 900 < MIN_EMIT_GAP_MS     -> REFUSED
  //   t = 8_000 gap = 3_000 = MIN_EMIT_GAP_MS, still a change of mind
  //                                                 -> write #3, SPEED_CRUISE
  {
    const s0 = applyInput(createInput(1000, 1000, 0), { kind: 'steer', heading: 0 }, 0);
    const { writes } = play(s0, 0, 15_000, 20, new Map([
      [5_000, (s: InputState, t: number) => applyInput(s, { kind: 'dart' }, t)],
    ]));

    check('a dart produces exactly two writes on top of the opening one',
      writes.length === 3, { times: writes.map((w) => w.vec.t) });
    check('...at the hand-derived t = 0, 5000, 8000',
      writes.map((w) => w.vec.t).join(',') === '0,5000,8000',
      { times: writes.map((w) => w.vec.t) });
    check('the opening vector cruises', writes[0].vec.speed === SPEED_CRUISE, writes[0].vec);
    check('the dart START is written at the dart speed',
      writes[1].vec.speed === SPEED_DART, writes[1].vec);
    check('the dart END is written, and it is back to cruising',
      writes[2].vec.speed === SPEED_CRUISE, writes[2].vec);

    // THE MEASUREMENT. The end cannot be published when it happens, because
    // MIN_EMIT_GAP_MS is absolute (shoalEmit.ts's own header: no change-of-mind
    // exception). The delay is exactly the difference of the two constants.
    const endedAt = 5_000 + DART_MS;
    check('the dart end is delayed by exactly MIN_EMIT_GAP_MS - DART_MS (hand-derived 2100 ms)',
      writes[2].vec.t - endedAt === MIN_EMIT_GAP_MS - DART_MS,
      { late: writes[2].vec.t - endedAt, expected: MIN_EMIT_GAP_MS - DART_MS });

    // ...and what that delay COSTS, in the game's own units. Everyone,
    // including this client, reckons the swimmer at SPEED_DART for the whole
    // gap, so the burst the WORLD sees lasts MIN_EMIT_GAP_MS, not DART_MS.
    // Hand-derived from the vector written at t = 5_000
    // ({x: 1296, y: 1000, heading: 0, speed: 220}):
    //   at t = 5_900: dx = trunc(220*4096*900/4096000)  = trunc(198) = 198
    //                 x  = 1296 + 198 = 1494 -> floor(1494/8)*8 = 186*8 = 1488
    //   at t = 8_000: dx = trunc(220*4096*3000/4096000) = trunc(660) = 660
    //                 x  = 1296 + 660 = 1956 -> floor(1956/8)*8 = 244*8 = 1952
    check('the dart-start vector is authored from the hand-derived (1296, 1000)',
      writes[1].vec.x === 1296 && writes[1].vec.y === 1000, writes[1].vec);
    {
      const atEnd = reckon(writes[1].vec, endedAt);
      check('the swimmer is at the hand-derived 1488 when the burst ends',
        atEnd.x === 1488, atEnd);
      check('but the end vector is authored 464 cu further on (hand-derived)',
        writes[2].vec.x === 1952 && writes[2].vec.x - atEnd.x === 464,
        { end: writes[2].vec.x, atEnd: atEnd.x });
    }

    // The end is a real vector, not a repeat: nobody may be left reckoning at
    // dart speed once it lands.
    check('no write after the burst still claims the dart speed',
      writes.slice(2).every((w) => w.vec.speed !== SPEED_DART),
      writes.slice(2).map((w) => w.vec.speed));
  }

  // A dart pressed while the floor is down is still a dart — it just cannot be
  // announced yet. This is the worst case for "dart is how you save your life"
  // and it is asserted rather than left implicit.
  {
    const s0 = applyInput(createInput(1000, 1000, 0), { kind: 'steer', heading: 0 }, 0);
    // Turn hard at t = 3_000 (a change of mind, emitted), then dart 500 ms
    // later, while only 500 of the 3_000 ms floor has elapsed.
    const { writes } = play(s0, 0, 12_000, 20, new Map<number, (s: InputState, t: number) => InputState>([
      [3_000, (s, t) => applyInput(s, { kind: 'steer', heading: 64 }, t)],
      [3_500, (s, t) => applyInput(s, { kind: 'dart' }, t)],
    ]));
    // Hand-derived, and worse than "delayed" — the dart is SWALLOWED WHOLE:
    //   t = 0      opening write, heading 0, SPEED_CRUISE
    //   t = 3_000  the turn. gap = MIN_EMIT_GAP_MS and headingDelta(0, 64) = 64,
    //              well past the change-of-mind threshold -> written
    //   t = 3_500  the dart. The floor has 2_500 ms left to run, so nothing can
    //              be written while the burst is on
    //   t = 4_400  the burst ends (3_500 + DART_MS), still inside the floor
    //   t = 6_000  a write is finally legal — but the intent is now
    //              byte-identical to what was written at 3_000 (heading 64,
    //              SPEED_CRUISE), so there is nothing to say
    //   t = 11_000 the keep-alive, 3_000 + MAX_EMIT_GAP_MS
    // So no vector this swimmer ever publishes mentions the dart, and the
    // player's own fish never moves any faster either (it reckons off the same
    // published vector). Consistent, and completely inert.
    check('a dart pressed inside the floor is never announced at all',
      writes.every((w) => w.vec.speed !== SPEED_DART),
      { speeds: writes.map((w) => `${w.vec.t}:${w.vec.speed}`) });
    check('...and no extra write happens either: 0, 3000, then the keep-alive at 11000',
      writes.map((w) => w.vec.t).join(',') === '0,3000,11000',
      { times: writes.map((w) => w.vec.t) });
  }

  // =========================================================================
  // 6. Input cannot write. Structurally, and by rate.
  // =========================================================================
  {
    const src = readFileSync(fileURLToPath(new URL('./input.ts', import.meta.url)), 'utf8');
    // The module may reach the DECISION (shoalEmit) but never the WRITER
    // (shoalSend) or the transport (shoalRpc). A per-frame emitter is what the
    // whole bridge exists to prevent, and the cheapest guarantee that this
    // module is not one is that it holds no way to send anything.
    check('input.ts does not import the writer', !/from\s+'[^']*shoalSend'/.test(src));
    check('input.ts does not import the transport', !/from\s+'[^']*shoalRpc'/.test(src));
    check('input.ts never calls fetch', !/\bfetch\s*\(/.test(src));
    check('input.ts never reads a clock',
      !/Date\.now|performance\.now|new Date\b/.test(src));
    check('input.ts never rolls dice', !/Math\.random/.test(src));
    // ...and it does hold the gate, so the rule lives in one place.
    check('input.ts does go through shouldEmit', /from\s+'[^']*shoalEmit'/.test(src));
  }

  // A minute of the worst input a hand can produce: the pointer swung to a new
  // heading on EVERY frame. The write rate must stay on the bridge's floor.
  //
  // Hand-derived from MIN_EMIT_GAP_MS: with a change of mind always pending,
  // a write can happen only every 3_000 ms, so a 60_000 ms run starting with
  // the free opening write yields 60_000 / 3_000 + 1 = 21.
  //
  // The frame step is 24 ms because 3_000 / 24 = 125 and 60_000 / 24 = 2_500
  // are both exact, so a frame lands ON every 3_000 ms boundary and the count
  // is the clean 21 rather than a step-dependent one (at 16 ms the earliest
  // legal frame is 3_008 and the same rule yields 20 — correct, but a number
  // about the frame grid rather than about the floor).
  {
    const STEP = 24;
    const events = new Map<number, (s: InputState, t: number) => InputState>();
    for (let t = 0; t <= 60_000; t += STEP) {
      // 125 brads of turn per 3_000 ms — far past HEADING_CHANGE_THRESHOLD_BRADS
      // either way round the wheel, so every boundary is a real change of mind.
      const heading = (t / STEP) % HEADING_STEPS;
      events.set(t, (s) => applyInput(s, { kind: 'steer', heading }, t));
    }
    const { writes } = play(createInput(1000, 1000, 0), 0, 60_000, STEP, events);
    check('a minute of per-frame steering writes exactly the hand-derived 21 times',
      writes.length === 21, { count: writes.length });
    let tooClose = 0;
    for (let i = 1; i < writes.length; i++) {
      if (writes[i].vec.t - writes[i - 1].vec.t < MIN_EMIT_GAP_MS) tooClose++;
    }
    check('no two writes are closer together than the floor', tooClose === 0, { tooClose });
  }

  // Silence must still keep presence alive: with NO input at all, the writes
  // are the keep-alives and nothing else.
  {
    const { writes } = play(createInput(1000, 1000, 0), 0, 40_000, 50);
    const gaps: number[] = [];
    for (let i = 1; i < writes.length; i++) gaps.push(writes[i].vec.t - writes[i - 1].vec.t);
    check('a motionless swimmer still writes, on the keep-alive ceiling',
      gaps.length > 0 && gaps.every((g) => g === MAX_EMIT_GAP_MS), { gaps });
    check('...and every one of those vectors is a stopped one',
      writes.every((w) => w.vec.speed === 0), writes.map((w) => w.vec.speed));
  }

  // =========================================================================
  // 7. Eat — a claim needs a target and obeys its own cooldown
  // =========================================================================
  {
    const fresh = createInput(1000, 1000, 0);
    check('a swimmer who has never eaten may claim', canClaimEat(fresh, 0) === true);

    const ate = markEat(fresh, 10_000);
    check('a second claim inside EAT_COOLDOWN_MS is refused',
      canClaimEat(ate, 10_000 + EAT_COOLDOWN_MS - 1) === false);
    check('a claim exactly EAT_COOLDOWN_MS later is permitted',
      canClaimEat(ate, 10_000 + EAT_COOLDOWN_MS) === true);

    // The target is the cell the swimmer is standing in, taken from the
    // engine's own `cellIndex` so the client and the fold name the same cell.
    // Hand-derived: BLOOM_CELL = 128, BLOOM_COLS = 32.
    //   col = floor(1000/128) = 7, row = floor(1000/128) = 7
    //   cell = 7 * 32 + 7 = 231
    check('the eat target is the cell underneath (hand-derived 231)',
      eatTarget(fresh, 0) === 231, { got: eatTarget(fresh, 0) });
    check('...which is the engine\'s own cellIndex of the reckoned position',
      eatTarget(fresh, 0) === cellIndex(positionAt(fresh, 0).x, positionAt(fresh, 0).y));

    // And it tracks the swimmer as it moves, rather than freezing at the last
    // write. Hand-derived: heading 0 at SPEED_CRUISE for 10_000 ms is
    // dx = trunc(60 * 4096 * 10000 / 4096000) = 600 -> x = 1600, y = 1000
    //   col = floor(1600/128) = 12, row = 7 -> cell = 7 * 32 + 12 = 236
    {
      const held = applyInput(fresh, { kind: 'steer', heading: 0 }, 0);
      const moving = markEmitted(held, intentAt(held, 0));
      const p = positionAt(moving, 10_000);
      check('the position advances by dead reckoning (hand-derived 1600, 1000)',
        p.x === 1600 && p.y === 1000, p);
      check('...so the eat target follows the swimmer (hand-derived 236)',
        eatTarget(moving, 10_000) === 236, { got: eatTarget(moving, 10_000) });
    }
  }

  // =========================================================================
  // 8. THE EAT GAP — a tripwire on an engine relationship, not a rule of this
  //    module. Open item 10 in docs/THE_SHOAL_OPEN_ITEMS.md, RESOLVED by the
  //    claimant-exemption rule in bloom.ts; this check is what keeps the
  //    resolution honest.
  // =========================================================================
  //
  // A swimmer marks every cell within BLOOM_VISIT_R (200 cu) of itself as
  // visited, but may only take a bite within EAT_R (90 cu) of the cell's
  // centre. The fold stamps `lastVisit` at the END of each tick and judges
  // claims at the START of the next, so closing that ring from outside to
  // inside without ever being stamped in between would take 110 cu in TICK_MS.
  // The fastest anything in this game moves is SPEED_DART, which covers
  // 220 * 250 / 1000 = 55 cu in a tick. It is not close: the gap needs twice
  // the top speed in the game.
  //
  // That arithmetic is WHY the fold exempts a claimant from its own visits
  // (bloom.ts's header): without the exemption, measured against the real
  // fold, a swimmer swimming in from 600 cu away was credited ZERO bites at
  // dart AND cruise speed, and the eat verb was reachable only by a swimmer
  // whose first presence vector already sat inside EAT_R. With it, the same
  // swimmer takes the whole six-bite bloom — pinned in
  // shoalEngine.test.ts ("a swimmer that swims in at ... speed takes the whole
  // bloom").
  //
  // The check is kept, and still asserts the arithmetic rather than its
  // desirability, because the exemption is only LOAD-BEARING while the gap is
  // wider than a tick's travel. It fails the day someone moves one of the
  // constants, which is the day to re-examine whether the rule is still
  // earning its place — not a day to discover the relationship by accident.
  {
    const gapCu = BLOOM_VISIT_R - EAT_R;
    const reachCu = (SPEED_DART * TICK_MS) / 1000;
    check('the eat gap still exceeds a full tick at top speed, so the claimant exemption is still load-bearing (hand-derived 110 > 55)',
      gapCu === 110 && reachCu === 55 && gapCu > reachCu, { gapCu, reachCu });
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
