/**
 * The wild shoal, as a READING — where the wild fish are on screen, which way
 * they are facing, and how solidly they are here.
 *
 * DISPLAY SIDE, and pure in its arguments: no canvas, no clock, no DOM. Like
 * `tether.ts` and `render.ts` this is the testable half of a painted thing —
 * `wildPaint.ts` draws what this returns and is verified by screenshot;
 * everything with a number in it lives here and is verified in node
 * (`wildView.test.ts`).
 *
 * Every value below is a pure function of `(seed, atMs, hushStartMs,
 * lastSweepMs)` plus, for FACING ONLY, the local player's position. All four
 * of the first are consensus, so two clients in the same water draw the same
 * shoal; the fifth affects nothing but which way a fish is pointed. See
 * "Heading is free" below for why that distinction is the whole design.
 *
 * =============================================================================
 * 1. THE RESOLVE-TICK POP, AND HOW IT IS FIXED
 * =============================================================================
 *
 * `wildAt` bolts the shoal at the hush and returns the empty array from
 * `hushStartMs + WILD_BOLT_MS` (2_000 ms) onward. That is right, and it is the
 * moment the whole feature exists for.
 *
 * What is NOT right is what happens six seconds later. `foldTick` resolves the
 * sweep at `hushStartMs + HUSH_MS` and sets `state.hushStartMs = -1` in the
 * same statement it sets `lastSweepMs`. From the very next read, `wildAt` sees
 * no hush at all and hands back thirty-six fish at full strength — so the
 * ocean refills on the exact frame the shark strikes, which is dramatically the
 * worst frame available. Nothing in the state after that reset says a bolt ever
 * happened; `lastSweepMs` is the only value a return can be keyed off.
 *
 * So `wildClock` re-derives the hush the sweep came out of — `hushStartMs =
 * lastSweepMs - HUSH_MS`, exact by construction because `isResolveTick` fires
 * on the first tick at or after `HUSH_MS` and `TICK_MS` (250) divides `HUSH_MS`
 * (8_000) — and turns it into two things `wildAt` already understands:
 *
 *  - **Replaying inside the hush.** While the scatter freeze is drawing an
 *    instant BEFORE the sweep (`App.tsx` paints the replay at the locked
 *    arrangement's own time, four seconds before the resolve), the clock hands
 *    back that same hush. The shoal is correctly absent from the frozen
 *    diagram instead of blinking back into it.
 *
 *  - **The return.** For `WILD_RETURN_MS` after the sweep the shoal comes back
 *    the way it left: `wildAt` is called with the ORIGINAL hush start and a
 *    `nowMs` that runs BACKWARD through the bolt, from just under `WILD_BOLT_MS`
 *    down to 0. That is not an approximation of a return — it is the bolt
 *    played in reverse, along the identical outward rays, because the rays are
 *    frozen at `hushTick` and the hush start is the real one. The fish
 *    therefore re-enter at exactly the 839 cu they vanished at: there is no
 *    discontinuity in POSITION anywhere, only a six-second gap in time.
 *
 * WHY THIS IS NOT A PAINT-SIDE LIE. `wildShelterBodies` uses the same clock, so
 * a returning fish shelters you from exactly where it is drawn — 839 cu out at
 * the resolve (no shelter at all, it is twice `SHELTER_R` away) rising to full
 * as it settles home. The picture and the tether cannot disagree, because they
 * are two reads of one function. The alternative — fading the paint while the
 * shelter read snapped back to full — would have been a tether saying "held"
 * over an ocean that looked empty, which is the one thing `tether.ts`'s header
 * forbids outright.
 *
 * =============================================================================
 * 2. WHY THIS FILE CALLS `wildAt` RATHER THAN `shelterBodiesOf`
 * =============================================================================
 *
 * `shoalEngine.shelterBodiesOf(state, seed, atMs)` is the documented join
 * between the two populations and this file would rather have used it. It
 * cannot, for one specific reason: it passes `atMs` as BOTH clocks —
 * `wildAt(seed, floor(atMs / TICK_MS), state.hushStartMs, atMs)` — so the
 * motion clock and the hush clock are welded together. The return needs them
 * apart: the motion clock must keep running forward (the schools drift on) while
 * the hush clock walks backward through the bolt. Nor can it be faked by
 * substituting `state.hushStartMs`, because `wildAt` derives the outward rays
 * from `floor(hushStartMs / TICK_MS)` — moving the hush start would rotate every
 * fish's escape ray as it flew, and the shoal would spiral home instead of
 * retracing its own flight.
 *
 * `wildViewAt`/`wildShelterBodies` are therefore direct `wildAt` callers, and
 * `wildView.test.ts` pins them against `shelterBodiesOf` in the calm case — the
 * one case where the two clocks agree — so the divergence stays exactly as wide
 * as it is documented to be and no wider.
 *
 * =============================================================================
 * 3. HEADING IS FREE; POSITION IS NOT
 * =============================================================================
 *
 * `wild.ts` is emphatic that a wild fish must not see players: position is a
 * pure function of consensus values, so determinism holds by construction, and
 * spec 3.8 exists because stepping them on live presence would diverge.
 *
 * `WildFish.heading`, however, is returned by `wildAt` and consumed by NOTHING.
 * `wildBodyOf` drops it; `shelterOf` reads `x`, `y`, `size` and `id` and no
 * fold path touches it at all. So turning a wild fish to face away from a
 * player nearby changes not one coordinate, not one shelter sum, not one
 * strand: every consensus read stays bit-identical. That is the whole licence,
 * and it stops exactly there — `facing` below is a float in radians that only
 * a canvas rotation ever sees, and `wildShelterBodies` does not compute it.
 *
 * What it buys: a school you swim into visibly turns its shoulder to you
 * instead of milling through you like weather. The concession stated plainly:
 * they still do not MOVE out of your way, and a player who sprints through a
 * school will notice they are not displaced.
 */
import { WILD_BOLT_MS, WILD_SPEED_BOLT, wildAt, type WildFish } from '../lib/wild';
import { wildBodyOf, type WildBody } from '../lib/shelter';
import { HEADING_STEPS, HUSH_MS, TICK_MS } from '../lib/shoalConst';
import { smoothstep } from './paintKit';

// ---------------------------------------------------------------------------
// Constants — all POLICY, all display. Two clients running different values
// here see the same sea drawn slightly differently and still agree on every
// position the fold ever judged.
// ---------------------------------------------------------------------------

/**
 * How long the shoal takes to come back after a sweep.
 *
 * Longer than `SCATTER_FREEZE_MS` (2_000) on purpose: the two seconds of
 * frozen diagram are spent in an empty ocean, and the water is still visibly
 * bare when the picture unfreezes. Six seconds is also slow enough to read as
 * fish deciding it is safe rather than as a fade-in — the peak inward speed,
 * with the smoothstep below, is 1.5 * 839 / 6 = 210 cu/s, between
 * SPEED_CRUISE (60) and SPEED_DART (220).
 */
export const WILD_RETURN_MS = 6_000;

/**
 * How much of the return is spent fading up from nothing. The fish are 839 cu
 * out at the start of it, which is off the edge of most windows, but not all —
 * the visible half-span is 1_200 cu — and a school popping into existence at
 * the frame edge would be a second, smaller version of the bug this file
 * exists to fix.
 */
export const WILD_RETURN_FADE = 0.35;

/**
 * How close a player has to be before a wild fish turns away, in cu. A little
 * over one `SHELTER_R` (340), so the fish that are actually sheltering you are
 * exactly the ones that react — which is what makes the bolt's removal of them
 * land as the removal of something that had been acknowledging you.
 */
export const WILD_SHY_R = 380;

/** How much of the way toward "directly away" a fish turns at point-blank range. */
export const WILD_SHY_TURN = 0.8;

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * Which hush, if any, the wild shoal is living in at a display instant.
 *
 * `hushStartMs`/`nowMs` are handed to `wildAt` verbatim; `returning` is 0
 * outside a return and climbs 0 -> 1 across one, for the paint's fade.
 */
export interface WildClock {
  /** What to pass `wildAt` as its hush start: -1 for none. */
  readonly hushStartMs: number;
  /** What to pass `wildAt` as its hush clock. */
  readonly nowMs: number;
  /** 0 normally; 0..1 through a post-sweep return. */
  readonly returning: number;
  /** True while the fish are travelling along their outward rays, either way. */
  readonly fleeing: boolean;
  /** True while that travel is INWARD — the return, not the bolt. */
  readonly inbound: boolean;
}

const CALM: WildClock = {
  hushStartMs: -1, nowMs: 0, returning: 0, fleeing: false, inbound: false,
};

/**
 * The wild shoal's clock at a display instant.
 *
 * `hushStartMs` and `lastSweepMs` are `ShoalState`'s own fields, with their own
 * -1 sentinels. `atMs` is the instant being DRAWN, which during a scatter
 * replay is deliberately in the past — see the replay case below.
 */
export function wildClock(
  atMs: number, hushStartMs: number, lastSweepMs: number,
): WildClock {
  // A live hush always wins: whatever else happened, the shoal is bolting now.
  if (hushStartMs >= 0) {
    return {
      hushStartMs,
      nowMs: atMs,
      returning: 0,
      fleeing: atMs > hushStartMs,
      inbound: false,
    };
  }
  if (lastSweepMs < 0) return CALM;
  // The hush this sweep came out of. Exact: `isResolveTick` fires on the first
  // tick at or after HUSH_MS, and TICK_MS (250) divides HUSH_MS (8_000).
  const hushWas = lastSweepMs - HUSH_MS;
  const since = atMs - lastSweepMs;
  if (since < 0) {
    // Drawing an instant BEFORE the resolve — the scatter replay, which paints
    // the locked arrangement from four seconds earlier. The shoal was already
    // gone then and must stay gone, or it blinks into the frozen diagram.
    if (atMs < hushWas) return CALM;
    return { hushStartMs: hushWas, nowMs: atMs, returning: 0, fleeing: true, inbound: false };
  }
  if (since >= WILD_RETURN_MS) return CALM;
  // The return: the bolt, backward. `nowMs` walks from just under the bolt's
  // own duration back to its start, so `wildAt`'s flee distance shrinks along
  // the identical outward rays (frozen at the real hush's tick) instead of
  // being re-derived from anything.
  const back = (WILD_BOLT_MS - 1) * (1 - smoothstep(0, WILD_RETURN_MS, since));
  return {
    hushStartMs: hushWas,
    nowMs: hushWas + back,
    returning: since / WILD_RETURN_MS,
    // `wildAt` only displaces a fish once the truncated flee distance reaches
    // 1 cu; below that it is home and pointed the way it is swimming.
    fleeing: Math.trunc((WILD_SPEED_BOLT * back) / 1000) > 0,
    inbound: true,
  };
}

/**
 * How far through the bolt the shoal is, 0..1 — what the paint draws its
 * streaks and its wash off.
 *
 * Zero unless fish are actually leaving: a RETURN is not a bolt, however
 * similar the geometry, and drawing outbound streaks on a shoal coming home
 * would say precisely the wrong thing on the frame after a kill.
 */
export function boltProgress(clock: WildClock): number {
  if (clock.hushStartMs < 0 || clock.inbound) return 0;
  const elapsed = clock.nowMs - clock.hushStartMs;
  if (elapsed <= 0) return 0;
  return elapsed >= WILD_BOLT_MS ? 1 : elapsed / WILD_BOLT_MS;
}

// ---------------------------------------------------------------------------
// The shelter half — tick-exact, the same grid the fold works on
// ---------------------------------------------------------------------------

/**
 * The wild shoal as bodies `shelterOf`/`isExposed` may judge.
 *
 * TICK-QUANTIZED, deliberately, and NOT interpolated like `wildViewAt` below:
 * this is the same reading `shelterBodiesOf` makes, so a shelter score does not
 * shimmer between two clients rendering at different points inside one tick.
 * The paint reconciles the up-to-one-tick difference by handing the drawn
 * positions to the tether as its anchor map, exactly as it already does for
 * swimmers (whose bodies are tick positions and whose drawing is smoothed).
 */
export function wildShelterBodies(
  seed: number, atMs: number, clock: WildClock,
): WildBody[] {
  const tick = Math.floor(atMs / TICK_MS);
  return wildAt(seed, tick, clock.hushStartMs, clock.nowMs).map(wildBodyOf);
}

// ---------------------------------------------------------------------------
// The display half
// ---------------------------------------------------------------------------

/** One wild fish, ready to draw. */
export interface WildView {
  readonly id: string;
  /** World position in cu — a float, smoothed between two fold ticks. */
  readonly x: number;
  readonly y: number;
  /** Which way it is pointed, in radians. Display only; see the header. */
  readonly facing: number;
  /** The engine's own size. Cosmetic here: wild shelter weight is flat. */
  readonly size: number;
  /** 0..1 — how solidly it is here. Below 1 only while returning. */
  readonly presence: number;
}

/** A heading in brads (0..255) as radians. */
function bradsToRad(brads: number): number {
  return (brads / HEADING_STEPS) * Math.PI * 2;
}

/**
 * The shortest way round from `a` to `b`, in radians, in (-pi, pi]. Blending
 * two angles by the naive average sends a fish the long way round whenever the
 * pair straddles the wrap, which reads as a fish spinning on the spot.
 */
export function angleDelta(a: number, b: number): number {
  const TAU = Math.PI * 2;
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * How strongly a fish this far from the player turns away from it, 0..1.
 * Zero at and beyond WILD_SHY_R, WILD_SHY_TURN on top of it, smooth between —
 * so a fish drifting past the edge of your notice does not snap round.
 */
export function shyness(distCu: number): number {
  return WILD_SHY_TURN * (1 - smoothstep(0, WILD_SHY_R, distCu));
}

/**
 * The wild shoal to draw at a display instant.
 *
 * `atMs` is a float display time; the shoal's motion is interpolated between
 * the fold ticks either side of it, which is what `wild.ts`'s own header
 * prescribes ("interpolate between `wildAt(seed, k, ...)` and `wildAt(seed,
 * k+1, ...)` — the arrays are the same length in the same order"). It never
 * invents a fractional tick index, and could not: the argument is an integer
 * multiplier inside `wildAt`.
 *
 * `player` is the local swimmer's drawn position, or null. It reaches nothing
 * but `facing`.
 */
export function wildViewAt(
  seed: number,
  atMs: number,
  clock: WildClock,
  player: { readonly x: number; readonly y: number } | null,
): WildView[] {
  const tick = Math.floor(atMs / TICK_MS);
  const frac = (atMs - tick * TICK_MS) / TICK_MS;
  const here: WildFish[] = wildAt(seed, tick, clock.hushStartMs, clock.nowMs);
  if (here.length === 0) return [];
  const next: WildFish[] = wildAt(seed, tick + 1, clock.hushStartMs, clock.nowMs);

  // Below WILD_RETURN_FADE of the way home they are still fading up. Keyed on
  // `inbound`, NOT on `returning > 0`: at the resolve tick itself `returning`
  // is exactly 0, and a fish that is 839 cu out must fade in from nothing
  // there of all frames.
  const presence = clock.inbound
    ? smoothstep(0, WILD_RETURN_FADE, clock.returning)
    : 1;

  const out: WildView[] = [];
  for (let i = 0; i < here.length; i++) {
    const a = here[i];
    const b = next[i] ?? a;
    const x = a.x + (b.x - a.x) * frac;
    const y = a.y + (b.y - a.y) * frac;
    // A bolting fish points along its outward ray; a returning one is flying
    // back down the same ray, so it points the other way along it.
    let facing = bradsToRad(a.heading) + (clock.inbound && clock.fleeing ? Math.PI : 0);
    if (player !== null && !clock.fleeing) {
      const dx = x - player.x;
      const dy = y - player.y;
      const d = Math.hypot(dx, dy);
      const w = shyness(d);
      // At zero distance there is no "away" to face, and a fish exactly on the
      // player is already as turned-away as it can meaningfully be drawn.
      if (w > 0 && d > 0.001) {
        facing += angleDelta(facing, Math.atan2(dy, dx)) * w;
      }
    }
    out.push({ id: a.id, x, y, facing, size: a.size, presence });
  }
  return out;
}
