/**
 * Deciding when to write a swim vector (plan 2b, task 5). Run:
 * npx tsx src/lib/shoalEmit.test.ts
 *
 * No wall-clock reads anywhere in this file — every timestamp is a literal
 * ms value, fed straight into `shouldEmit(last, intent, nowMs, lastEmitMs)`.
 * No `Date.now()`, no `Math.random()` (global constraints).
 *
 * Every expected number below is computed BY HAND in the comment next to
 * it, never by calling a helper from shoalEmit.ts and comparing the
 * function to itself.
 */
import { shouldEmit, MIN_EMIT_GAP_MS, MAX_EMIT_GAP_MS, HEADING_CHANGE_THRESHOLD_BRADS } from './shoalEmit';
import { PRESENCE_TTL_MS, SPEED_CRUISE, SPEED_DART } from './shoalConst';
import type { Vec } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function vec(over: Partial<Vec> = {}): Vec {
  return { x: 100, y: 100, heading: 0, speed: SPEED_CRUISE, t: 0, ...over };
}

function main() {
  // --- Structural coherence --------------------------------------------------
  check('the floor is strictly below the keep-alive ceiling (or the "soon after" window is empty)',
    MIN_EMIT_GAP_MS < MAX_EMIT_GAP_MS, { MIN_EMIT_GAP_MS, MAX_EMIT_GAP_MS });

  // --- No prior vector: always emit -------------------------------------------
  {
    const intent = vec({ heading: 0, speed: SPEED_CRUISE, t: 5_000 });
    check('no prior vector always emits', shouldEmit(null, intent, 5_000, 0) === true);
  }

  // --- Identical intent inside the floor: never emit --------------------------
  {
    const last = vec({ heading: 10, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: 10, speed: SPEED_CRUISE, t: 1_500 });
    // gap = 1_500 - 0 = 1_500 < MIN_EMIT_GAP_MS(3_000)
    check('identical intent inside the floor does not emit', shouldEmit(last, intent, 1_500, 0) === false);
  }

  // --- The floor is ABSOLUTE: it blocks even a genuine change of mind --------
  // This is the load-bearing case for mutation 1 (removing the floor): a
  // real, unambiguous stop, arriving before MIN_EMIT_GAP_MS has elapsed,
  // must still wait. If the floor only gated "nothing changed", this case
  // would emit — and the burst test below would blow the rate cap.
  {
    const last = vec({ heading: 10, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: 10, speed: 0, t: 1_500 }); // a real stop
    // gap = 1_500 < MIN_EMIT_GAP_MS(3_000) -> the floor blocks it regardless
    check('a genuine change of mind still waits out the floor (no exception)',
      shouldEmit(last, intent, 1_500, 0) === false);
  }

  // --- Heading change beyond the threshold: emit soon after the last ---------
  {
    const last = vec({ heading: 0, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: HEADING_CHANGE_THRESHOLD_BRADS, speed: SPEED_CRUISE, t: 3_200 });
    // gap = 3_200: MIN(3_000) <= 3_200 < MAX(8_000).
    // heading delta = |8 - 0| = 8 >= HEADING_CHANGE_THRESHOLD_BRADS(8) -> a turn.
    check('a heading change at the threshold emits soon after the last write (not waiting for the keep-alive)',
      shouldEmit(last, intent, 3_200, 0) === true);
  }
  {
    const last = vec({ heading: 0, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: HEADING_CHANGE_THRESHOLD_BRADS - 1, speed: SPEED_CRUISE, t: 3_200 });
    // delta = 7 < threshold(8): jitter, not a change of mind. gap is inside
    // [MIN, MAX) so there is no keep-alive obligation yet either.
    check('a heading change below the threshold is jitter, not a change of mind',
      shouldEmit(last, intent, 3_200, 0) === false);
  }
  {
    // Circular wraparound: 254 -> 2 is a SMALL turn the short way around the
    // 256-brad wheel, not a big one the naive |a-b| way.
    // |254-2| = 252; the short way is HEADING_STEPS(256) - 252 = 4 < 8.
    const last = vec({ heading: 254, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: 2, speed: SPEED_CRUISE, t: 3_200 });
    check('heading delta wraps correctly across the 0/255 boundary (small turn, no false positive)',
      shouldEmit(last, intent, 3_200, 0) === false);
  }
  {
    // |254-244| = 10; the short way is min(10, 256-10=246) = 10 >= 8: a real turn.
    const last = vec({ heading: 254, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: 244, speed: SPEED_CRUISE, t: 3_200 });
    check('a real turn is still detected near the wrap boundary',
      shouldEmit(last, intent, 3_200, 0) === true);
  }

  // --- Stop: emit promptly, not delayed to the keep-alive ---------------------
  {
    const last = vec({ heading: 5, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: 5, speed: 0, t: 3_000 });
    // gap = 3_000 >= MIN(3_000), < MAX(8_000); speed 60 -> 0 differs.
    check('a stop emits promptly once the floor clears (not waiting for the keep-alive)',
      shouldEmit(last, intent, 3_000, 0) === true);
  }

  // --- Dart: same mechanism as stop, no extra signal needed -------------------
  // Derivation #3 from the task: can shouldEmit(last, intent, nowMs,
  // lastEmitMs) tell a dart from a plain heading change? Yes — a dart is
  // fully expressed as a SPEED change already carried inside `intent`
  // (Vec's speed field), exactly like a stop. No separate "intent kind" tag
  // is required for the given signature to be sufficient.
  {
    const last = vec({ heading: 5, speed: SPEED_CRUISE, t: 0 });
    const intent = vec({ heading: 5, speed: SPEED_DART, t: 3_000 });
    check('a dart is detected purely from the speed field carried in the Vec, no extra signal needed',
      shouldEmit(last, intent, 3_000, 0) === true);
  }

  // --- Keep-alive: nothing changed, but MAX_EMIT_GAP_MS has elapsed ----------
  {
    const last = vec({ heading: 5, speed: SPEED_CRUISE, t: 0 });
    const stillNothing = vec({ heading: 5, speed: SPEED_CRUISE, t: MAX_EMIT_GAP_MS - 1 });
    check('nothing changed, one ms short of the keep-alive: still silent',
      shouldEmit(last, stillNothing, MAX_EMIT_GAP_MS - 1, 0) === false);

    const stillNothing2 = vec({ heading: 5, speed: SPEED_CRUISE, t: MAX_EMIT_GAP_MS });
    check('nothing changed, keep-alive interval reached: emits anyway',
      shouldEmit(last, stillNothing2, MAX_EMIT_GAP_MS, 0) === true);
  }

  // --- Derivation #1: the keep-alive must survive a missed write with margin
  // against PRESENCE_TTL_MS ----------------------------------------------------
  //
  // A steady (unchanging) swimmer's keep-alives are spaced MAX_EMIT_GAP_MS
  // apart. If exactly ONE of them fails to reach a given peer (a dropped
  // gossip message, or a momentary RPC hiccup — gossip latency is ordinarily
  // "seconds", so an occasional miss is not exceptional), that peer's copy
  // of this swimmer is still anchored to the OLDER vector, expiring at
  // oldVec.t + PRESENCE_TTL_MS. The NEXT keep-alive is authored at most
  // 2 * MAX_EMIT_GAP_MS after that older vector, and still has to be
  // gossiped and folded before that deadline. So the real constraint is a
  // RELATIONSHIP between the two constants, not a bare number:
  //
  //   2 * MAX_EMIT_GAP_MS + <gossip latency, "seconds">  <  PRESENCE_TTL_MS
  //
  // Asserted against the imported PRESENCE_TTL_MS so this breaks loudly if
  // either constant ever moves, rather than silently going unsafe:
  //   2 * 8_000 = 16_000  <  90_000, leaving 74_000 ms (~74 s, 5.6x) of
  // headroom — comfortably enough to absorb "seconds" of gossip latency,
  // several times over, even after already surviving one full missed write.
  check('surviving one missed keep-alive still leaves comfortable TTL margin',
    2 * MAX_EMIT_GAP_MS < PRESENCE_TTL_MS,
    { twiceMax: 2 * MAX_EMIT_GAP_MS, PRESENCE_TTL_MS });

  // --- Derivation #2: MIN_EMIT_GAP_MS against BOTH hard limits ---------------
  //
  // Per-client: MIN_EMIT_GAP_MS bounds a single client to at most
  //   60_000 / MIN_EMIT_GAP_MS + 1  writes in any 60 s window (the +1 is the
  // window's own first write — confirmed directly by the burst loop below).
  //   60_000 / 3_000 + 1 = 20 + 1 = 21
  const RPC_WRITE_CAP_PER_MIN = 120; // src/rpc/rate_limiter.rs:70, verified in plan 1
  check('MIN_EMIT_GAP_MS keeps a single client comfortably under the RPC write cap',
    60_000 / MIN_EMIT_GAP_MS + 1 <= RPC_WRITE_CAP_PER_MIN,
    { perMinute: 60_000 / MIN_EMIT_GAP_MS + 1, RPC_WRITE_CAP_PER_MIN });

  // Per-space: MAX_ACTIONS_PER_SPACE(2_000, src/blocks/builder.rs:92) is the
  // mempool ceiling for one space; blocks harden roughly every
  // TARGET_BLOCK_INTERVAL (600 s = 600_000 ms, src/blocks/leader.rs:16), so
  // a space's pending count is, roughly, whatever accumulates over one such
  // window. THIS is the tighter constraint, not the RPC cap: a single
  // client's own 5.7x headroom under 120/min says nothing about what
  // happens when up to 25 swimmers (the design's own stated shoal size,
  // docs/superpowers/specs/2026-07-27-the-shoal-design.md:344) write at
  // once.
  const MAX_ACTIONS_PER_SPACE = 2_000; // src/blocks/builder.rs:92
  const BLOCK_WINDOW_MS = 600_000; // src/blocks/leader.rs:16, TARGET_BLOCK_INTERVAL=600s
  const SHOAL_SIZE = 25;

  // A full shoal, ALL idling (nothing but keep-alives) for one whole block
  // window: 25 * (600_000 / 8_000) = 25 * 75 = 1_875 <= 2_000 — fits, with
  // 125 slots (~6%) of margin left for eat-claims sharing the same budget.
  check('a full shoal of idle keep-alives fits the per-space budget',
    SHOAL_SIZE * (BLOCK_WINDOW_MS / MAX_EMIT_GAP_MS) <= MAX_ACTIONS_PER_SPACE,
    { idleTotal: SHOAL_SIZE * (BLOCK_WINDOW_MS / MAX_EMIT_GAP_MS), MAX_ACTIONS_PER_SPACE });

  // A full shoal, ALL simultaneously and continuously turning at the floor
  // for the WHOLE window, would NOT fit:
  //   25 * (600_000 / 3_000) = 25 * 200 = 5_000 > 2_000.
  // This is not a bug to route around — it is the documented, deliberate
  // behaviour ("Eviction is a feature",
  // docs/superpowers/specs/2026-07-27-the-shoal-design.md:350-352): past
  // capacity the mempool sheds the lowest-PoW pending action first, so
  // movement degrades before speech is lost. Recorded as a relationship, not
  // routed around — nobody should "fix" MIN_EMIT_GAP_MS down to make this
  // pass, since that would defeat the floor's entire purpose.
  check('an all-25-at-the-floor shoal deliberately exceeds the budget (eviction is the intended relief valve, not a bug)',
    SHOAL_SIZE * (BLOCK_WINDOW_MS / MIN_EMIT_GAP_MS) > MAX_ACTIONS_PER_SPACE,
    { allFloorTotal: SHOAL_SIZE * (BLOCK_WINDOW_MS / MIN_EMIT_GAP_MS), MAX_ACTIONS_PER_SPACE });

  // --- The burst test: a 60fps-ish frame loop must never spam the rate cap ---
  //
  // Simulates a player holding a turn: every frame the "true" heading
  // jitters between two values exactly HEADING_CHANGE_THRESHOLD_BRADS apart
  // — the worst case for a naive "does intent differ from the last EMITTED
  // vector" check, since every single comparison would see a "real" change.
  // Speed never changes, so only the heading path is exercised.
  //
  // Frame step FRAME_MS = 24 ms (~41 fps — "a frame loop", not a literal
  // claim about exactly 60 fps; the precise rate is not load-bearing, only
  // "much faster than the write budget" is). Chosen so that
  // MIN_EMIT_GAP_MS(3_000) / FRAME_MS(24) = 125 divides EXACTLY (no
  // rounding) and is ODD, which matters below.
  //
  // The loop covers exactly one minute: 60_000 / 24 = 2_500 frame steps
  // exactly, driven over frame indices i = 0..2_500 inclusive (2_501
  // shouldEmit calls), t_i = 24 * i, from t=0 to t=60_000.
  //
  // Hand-derivation of the expected emit count WITH the real floor:
  //  - i=0: `last` is null -> always emits. last <- heading(0)=0, lastEmit=0.
  //  - The next frame where gap = 24*i - lastEmit can reach
  //    MIN_EMIT_GAP_MS(3_000) is i = 3_000 / 24 = 125 exactly (24*125 =
  //    3_000 exactly, so there is no floor-imposed overshoot in this
  //    scenario at all). At i=125 the toggle (i%2) has flipped relative to
  //    i=0 (125 is odd), so heading(125)=8 differs from what is parked in
  //    `last` (0) by exactly HEADING_CHANGE_THRESHOLD_BRADS(8), which is
  //    >= the threshold -> change of mind confirmed -> emits.
  //    last <- heading(125)=8, lastEmit = 3_000.
  //  - Because 125 is ODD, adding it to any index always flips parity, so
  //    EVERY subsequent floor-cleared checkpoint (i = 125, 250, 375, ...)
  //    again finds a different toggle state than whatever was last emitted,
  //    and again emits — the pattern repeats identically to the end.
  //  - So emits land at every i that is a multiple of 125, from 0 to 2_500:
  //    i = 0, 125, 250, ..., 2_500 -> count = 2_500 / 125 + 1 = 21.
  //  - Every frame strictly between two such checkpoints has gap < 3_000, so
  //    shouldEmit returns false on the floor check alone, before even
  //    looking at the heading — the keep-alive branch (gap >=
  //    MAX_EMIT_GAP_MS = 8_000) never fires in this scenario, because a
  //    change-driven emit always lands first, every 3_000 ms.
  //
  // 21 writes in 60 s from one client matches the per-client derivation
  // above (60_000/3_000 + 1 = 21) exactly, and is well under the RPC cap.
  {
    const FRAME_MS = 24;
    const TOTAL_FRAMES = 2_500; // 60_000 / 24, exact
    let last: Vec | null = null;
    let lastEmitMs = 0;
    let emitCount = 0;
    for (let i = 0; i <= TOTAL_FRAMES; i++) {
      const t = i * FRAME_MS;
      const heading = (i % 2) * HEADING_CHANGE_THRESHOLD_BRADS; // toggles 0 / 8
      const intent = vec({ heading, speed: SPEED_CRUISE, t });
      if (shouldEmit(last, intent, t, lastEmitMs)) {
        emitCount++;
        last = intent;
        lastEmitMs = t;
      }
    }
    check('a minute of jittery per-frame input emits exactly the hand-derived 21 times',
      emitCount === 21, { emitCount });
    check('that rate is well under the RPC write cap (120/min)',
      emitCount <= RPC_WRITE_CAP_PER_MIN, { emitCount, RPC_WRITE_CAP_PER_MIN });
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
