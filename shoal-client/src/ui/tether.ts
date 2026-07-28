/**
 * The tether, the hush and the scatter — the READINGS. No canvas, no clock.
 *
 * DISPLAY SIDE. Floats are used freely and deliberately; nothing here ever
 * feeds `foldShoal`/`foldTick`, and — like `render.ts` and unlike the rest of
 * `src/ui/` — this file reads no clock: every function is pure in its
 * arguments, which is what makes the whole of it testable in node with no
 * browser at all (`tether.test.ts`). The PAINT that consumes these readings
 * lives in `seaPaint.ts` and is verified by screenshot.
 *
 * =============================================================================
 * WHY THE TETHER IS NOT DECORATION (spec 2.10)
 * =============================================================================
 *
 * The decision must be made BEFORE the hush, or the panic moment is a coin
 * flip dressed as a choice. So exposure is permanently visible on your own
 * body: a tether to your nearest neighbours, short and taut and warm when
 * tucked in, long and thin and cold as you drift. The sweep then never asks
 * *guess*. It asks: **you already knew you were exposed — was one more bite
 * worth it?**
 *
 * One object collapses four legibility problems: what danger is (the tether
 * thinning), what the telegraph is (it goes red as the water hushes), what
 * shielding is (a big fish anchors several strands), and why you were
 * scattered (the replay).
 *
 * =============================================================================
 * IT READS THE ENGINE'S NUMBERS. THIS IS THE ONE RULE.
 * =============================================================================
 *
 * `readTether` calls `shelterOf` and `isExposed` from `src/lib/shelter.ts` —
 * the same two functions the sweep judges with — and derives everything it
 * draws from their answers. There is NO display-side approximation of
 * shelter anywhere in this file, and there must never be one: a tether that
 * disagreed with the sweep would be worse than no tether, because a player
 * would be reading a picture that told them they were safe while the shark
 * was already sorting them into the take list. It is `render.ts`'s rule about
 * position, applied to exposure.
 *
 * Two consequences worth stating, because both look like details and are not:
 *
 *  - **The strands ARE the shelter.** One strand per neighbour inside
 *    SHELTER_R, each carrying that neighbour's own `shelterWeight`, and the
 *    sum of the strand weights is `shelterOf` exactly (pinned over 300
 *    arrangements in the test). So "big fish anchor several tethers" is a
 *    fact about the picture rather than a metaphor about it.
 *  - **The drawn LENGTH is a function of shelter, not of distance to the
 *    nearest fish.** Spec 2.11 rejects any nearest-neighbour formulation of
 *    exposure — under one, a *pair* is nearly as safe as a school and takes
 *    all the food — so a tether whose length was the distance to its anchor
 *    would be drawing the wrong quantity, however natural it looks. What the
 *    length shows is SLACK: how far this swimmer has drifted out of the
 *    crowd's protection, on the crowd's own measure.
 *
 * =============================================================================
 * THE THREE MOMENTS
 * =============================================================================
 *
 *  - **Ambient.** Length and warmth track shelter continuously, on the
 *    player's own body only. This is the whole of the pre-commitment: by the
 *    time the hush arrives there is nothing left to learn.
 *
 *  - **The hush.** The water goes quiet — `pall`, the same for everyone,
 *    because it is the WATER that hushes and a telegraph nobody can see is
 *    not a telegraph. What is personal is the tether: an exposed swimmer's
 *    goes red and frays, a sheltered swimmer's holds short and steady. So the
 *    event is loud for everyone and the VERDICT is private, which is the only
 *    arrangement that neither cries wolf at a fish deep in the crowd nor
 *    leaves a newly-exposed one unwarned. A larger fish feels it coming
 *    first (`premonition`, spec 2.8), read off the public tension number.
 *
 *    **The input lock is felt** (spec 2.12). At T+LOCK the fold freezes the
 *    positions it will judge, and from that instant the tether is read off
 *    `lockedBodies` instead of the live sea: it stops responding to the
 *    player entirely and hangs where they were, a ghost of the arrangement
 *    that has already decided the outcome. Nothing they do afterwards moves
 *    it, because nothing they do afterwards counts.
 *
 *  - **The scatter.** `scatterReplay` freezes the frame for
 *    SCATTER_FREEZE_MS on the instant the sweep resolved, and the taken set
 *    is `state.lastTaken` — READ, never recomputed. Recomputing is not a
 *    style preference: on the harness's own session, re-deriving the taken
 *    set from the world one instant after the sweep names three DIFFERENT
 *    fish, because the three that were taken have just paid SCATTER_COST and
 *    a fresh `selectTaken` prefers the largest exposed fish. "The shark ate
 *    the wrong fish" is the most trust-destroying bug this game can have
 *    (sweep.ts's own header) and a replay that disagreed with the fold would
 *    be that bug with a picture attached.
 *
 * =============================================================================
 * THE FADE (spec 2.10)
 * =============================================================================
 *
 * "The tether fades with accumulated playtime and the hush carries it from
 * then on. Legibility beats mystique in the first ten minutes; mystique wins
 * afterwards." So `tetherFade` holds the tether whole through the first
 * TETHER_FADE_HOLD_MS and then fades it to nothing by TETHER_FADE_OFF_MS —
 * but only the AMBIENT tether. `tetherOpacity` returns 1 for the hush and for
 * the replay at any playtime, which is the second half of that sentence: what
 * a veteran loses is the permanent readout, not the warning.
 *
 * Hiding exposure permanently was never on the table, and not for kindness:
 * every client can compute it exactly, so the only thing permanent
 * concealment buys is that someone builds an overlay and beats the players
 * who didn't.
 */
import { dist2 } from '../lib/fixed';
import { hushPhase, type HushPhase } from '../lib/sweep';
import {
  shelterOf, isExposed, bodyShelterWeight, type Body, type SwimmerBody, type ShelterBody,
} from '../lib/shelter';
import {
  HUSH_MS, LOCK_MS, MIN_SIZE, SHELTER_R, SHELTER_R2, SHELTER_THRESHOLD, TENSION_TRIGGER,
} from '../lib/shoalConst';

// ---------------------------------------------------------------------------
// Constants — all POLICY, all display. Two clients running different values
// here see the same sea drawn differently and still agree on every position,
// every exposure and every sweep. The ONE number that is not free is
// SHELTER_THRESHOLD, which this module imports rather than restates.
// ---------------------------------------------------------------------------

/**
 * The shelter score at which the tether is fully taut. Two thresholds' worth
 * — six plain neighbours — so the tether keeps saying something useful ABOVE
 * the survival line as well as below it. If it bottomed out at
 * SHELTER_THRESHOLD, every safe swimmer would see an identical tether and the
 * difference between "just safe" and "buried in the crowd" would be invisible
 * at exactly the moment that difference is worth knowing.
 */
export const TETHER_TAUT_SHELTER = 2 * SHELTER_THRESHOLD; // 600

/** Drawn length in cu at full shelter: about two body radii. Short and taut. */
export const TETHER_MIN_CU = 60;
/**
 * ...and at no shelter at all. Deliberately LONGER than SHELTER_R (340): a
 * tether at full stretch reaches past the distance at which anyone could
 * still be holding it, which is the picture of the thing having come loose.
 */
export const TETHER_MAX_CU = 420;

/**
 * How long the tether stays whole, and when it is gone. Spec 2.10 puts the
 * changeover at "the first ten minutes"; the hold is the first four, so the
 * fade itself is a slow six-minute one a player never catches happening.
 *
 * Accumulated across sessions, not per session — it is a measure of how much
 * this player has learned, and learning does not reset when a window closes.
 * (What counts the milliseconds is the shell; this module only shapes them.)
 */
export const TETHER_FADE_HOLD_MS = 240_000; // 4 minutes
export const TETHER_FADE_OFF_MS = 600_000; // 10 minutes

/** Spec 2.10: "On scatter, the moment freezes for two seconds." */
export const SCATTER_FREEZE_MS = 2_000;

/**
 * The size scale the premonition is read on. The small end is MIN_SIZE — the
 * smallest a swimmer can be — and the large end is a well-fed veteran, well
 * inside the range `bodyRadiusCu` is documented to keep readable.
 */
export const SENSE_SIZE_SMALL = MIN_SIZE; // 60
export const SENSE_SIZE_LARGE = 400;
/**
 * Where each end starts to feel it, as per-mille of TENSION_TRIGGER. Stated
 * as a fraction of the trigger rather than as an absolute so the lead time
 * survives any future retuning of the trigger — though TENSION_TRIGGER is
 * CONSENSUS and will not be retuned.
 *
 * The gap is 220 per-mille = 6_600 tension. Measured on the harness's own
 * session that is a lead of several seconds, which is what spec 2.8's "a beat
 * earlier" has to buy to be a real power rather than a flavour note.
 */
export const SENSE_SMALL_PERMILLE = 940;
export const SENSE_LARGE_PERMILLE = 720;

/** How long the lock's flash lasts. Long enough to see, short enough to be a blow. */
export const LOCK_FLASH_MS = 420;
/** How long the pall takes to close in, in ms. Well inside the commit window. */
export const PALL_IN_MS = 1_200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Held by the crowd, or adrift. Exactly the engine's exposed/not. */
export type TetherMood = 'held' | 'adrift';

/** Which of the three moments a tether is being drawn in. */
export type TetherMoment = 'ambient' | 'hush' | 'scatter';

/** One strand: a neighbour who is actually sheltering this swimmer. */
export interface Strand {
  id: string;
  /** The anchor's position, in world cu. */
  x: number;
  y: number;
  /** Distance to it, in cu. */
  distCu: number;
  /** What this neighbour contributes to shelter — the engine's shelterWeight. */
  weight: number;
  /** 1 at the body, 0 at the edge of the shelter radius. How taut it looks. */
  taut: number;
}

/** Everything the paint needs about one swimmer's tether. */
export interface TetherRead {
  /** The swimmer this tether belongs to. */
  self: Body;
  /** `shelterOf(self, others)` — the engine's number, not a likeness of it. */
  shelter: number;
  /** `isExposed(self, others)` — likewise. */
  exposed: boolean;
  /** The same fact, named for the paint. */
  mood: TetherMood;
  /** Drawn length in cu: short when sheltered, long when adrift. */
  lengthCu: number;
  /** 0 cold and adrift, 1 warm and tucked in. */
  warmth: number;
  /** One per sheltering neighbour, nearest first. Their weights sum to `shelter`. */
  strands: Strand[];
  /**
   * The nearest OTHER swimmer, at any distance, or null if this fish is
   * alone. What a tether with no strands left trails toward — the only
   * honest thing to point at when nobody is holding you.
   */
  nearest: { id: string; x: number; y: number; distCu: number } | null;
}

/** The hush, read off the fold's `hushStartMs`. */
export interface HushRead {
  /** The engine's own phase. */
  phase: HushPhase;
  /** Ms since the hush began, or -1 when calm. */
  elapsedMs: number;
  /** 0..1 across the whole window. */
  progress: number;
  /** True from LOCK_MS on: nothing the player does counts any more. */
  locked: boolean;
  /** The water going quiet, 0..1. The same for every swimmer in the sea. */
  pall: number;
  /** 0 at the lock, approaching 1 at resolution. The four seconds of watching. */
  dread: number;
  /** 1 on the instant of the lock, decaying to 0 over LOCK_FLASH_MS. */
  lockFlash: number;
}

/**
 * The two fields of `ShoalState` a replay may read.
 *
 * Narrow ON PURPOSE. A replay reports the sweep's own verdict and has no
 * business holding anything it could recompute one from — see the module
 * header on what a recomputation actually produces.
 */
export interface SweepEcho {
  readonly lastSweepMs: number;
  readonly lastTaken: readonly string[];
}

/** The frozen moment after a scatter. */
export interface ScatterReplay {
  /** The instant the sweep resolved. Draw the WHOLE frame at this time. */
  atMs: number;
  /** Who the engine took. Copied from `lastTaken`; never derived. */
  taken: readonly string[];
  /** 0..1 through the freeze. */
  progress: number;
  /** Every fish in the frozen frame, taken or not. */
  bodies: readonly Body[];
}

/** The one field of `ShoalState` the locked reading needs. */
export interface LockEcho {
  readonly lockedPositions: ReadonlyMap<string, { x: number; y: number; size: number }> | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// ---------------------------------------------------------------------------
// The tether, from the engine's shelter
// ---------------------------------------------------------------------------

/**
 * How tucked in this swimmer is, 0 (nothing holding them) to 1 (fully taut).
 * The one place the shelter score becomes a fraction; length, colour and
 * every other drawn quantity are shaped from this.
 */
export function tetherWarmth(shelter: number): number {
  return clamp01(shelter / TETHER_TAUT_SHELTER);
}

/**
 * Drawn tether length in cu. Strictly decreasing in shelter up to
 * TETHER_TAUT_SHELTER and flat above it — more shelter, shorter tether, which
 * is the whole readable claim.
 *
 * This is `TETHER_MIN_CU + span * (1 - tetherWarmth(shelter))` with the
 * MULTIPLICATION DONE BEFORE THE DIVISION, and that is not fussiness: a
 * shelter score is a sum of `shelterWeight`s, so the values that actually
 * occur are near-multiples of SHELTER_BASE, and `1 - 500/600` evaluates to
 * 0.16666666666666663 — enough to turn an exact 120 into 119.99999999999999.
 * Written this way, `360 * (600 - 500) / 600` is exactly 60 and every hand
 * derivation in the test file lands on the integer it was derived to.
 */
export function tetherLengthCu(shelter: number): number {
  const s = shelter < 0 ? 0 : shelter > TETHER_TAUT_SHELTER ? TETHER_TAUT_SHELTER : shelter;
  return TETHER_MIN_CU
    + ((TETHER_MAX_CU - TETHER_MIN_CU) * (TETHER_TAUT_SHELTER - s)) / TETHER_TAUT_SHELTER;
}

/**
 * The visual state, at exactly the engine's threshold.
 *
 * This is `isExposed`'s comparison re-expressed on a shelter score the caller
 * already has, against the SAME imported constant — not a second opinion
 * about where the line is. `tether.test.ts` pins the two against each other
 * over 400 random arrangements as well as on the boundary itself, because a
 * paint that drew the line anywhere else would be lying about the verdict.
 */
export function tetherMood(shelter: number): TetherMood {
  return shelter < SHELTER_THRESHOLD ? 'adrift' : 'held';
}

/**
 * One strand per neighbour actually sheltering `self`, nearest first.
 *
 * The membership test is the engine's — `dist2 <= SHELTER_R2`, the identical
 * comparison `shelterOf` makes — and the weight is the engine's
 * `bodyShelterWeight`, so the strand weights sum to `shelterOf(self, others)`
 * exactly. Not capped: a shoal is fifteen to twenty-five fish, so this is at
 * most a couple of dozen short lines, and capping it would break the one
 * property that makes the picture trustworthy.
 *
 * `bodyShelterWeight` rather than `shelterWeight` because `others` may hold
 * wild fish, which are worth a flat WILD_SHELTER_WEIGHT (half a person). Using
 * the person weight here would draw a strand heavier than the shelter it
 * actually bought, and the sum would stop being `shelterOf` — which is the one
 * property that makes the picture trustworthy.
 */
export function strandsOf(self: Body, others: readonly ShelterBody[]): Strand[] {
  const out: Strand[] = [];
  for (const o of others) {
    if (o.id === self.id) continue;
    const d2 = dist2(self.x, self.y, o.x, o.y);
    if (d2 > SHELTER_R2) continue;
    const distCu = Math.sqrt(d2);
    out.push({
      id: o.id,
      x: o.x,
      y: o.y,
      distCu,
      weight: bodyShelterWeight(o),
      taut: 1 - clamp01(distCu / SHELTER_R),
    });
  }
  out.sort((a, b) => a.distCu - b.distCu || (a.id < b.id ? -1 : 1));
  return out;
}

/** The nearest other swimmer at any distance, or null when nobody is there. */
function nearestOf(self: Body, others: readonly ShelterBody[]): TetherRead['nearest'] {
  let best: TetherRead['nearest'] = null;
  let bestD2 = Infinity;
  for (const o of others) {
    if (o.id === self.id) continue;
    const d2 = dist2(self.x, self.y, o.x, o.y);
    if (d2 < bestD2 || (d2 === bestD2 && best !== null && o.id < best.id)) {
      bestD2 = d2;
      best = { id: o.id, x: o.x, y: o.y, distCu: Math.sqrt(d2) };
    }
  }
  return best;
}

/**
 * Everything the paint needs about one swimmer's tether, all of it derived
 * from the engine's own `shelterOf`/`isExposed` — but NOT, in general, over
 * the same body list the sweep would judge.
 *
 * When `others` is built from `shelterBodiesOf` it holds the wild shoal too,
 * and `sweep.ts:63` filters wild fish from both candidacy and cover before it
 * ever judges anyone. So a tether fed wild-inclusive `others` reads FELT
 * safety — cover that includes scenery — while the sweep judges people only.
 * That gap is intended, not a bug to close: it is the false sense of safety
 * spec 2.6 sells (a school around you that is partly wild fish feels exactly
 * as safe right up until the hush), and it self-corrects at the bolt, two
 * full seconds before the input lock and long before any verdict —
 * `WILD_BOLT_MS` (2_000) < `LOCK_MS` (4_000), see wild.ts. A caller wanting
 * the tether to read exactly what the sweep would judge must pass it a
 * people-only body list (`bodiesOf`, not `shelterBodiesOf`); this function
 * has no opinion on which list it is handed.
 *
 * `others` may include `self`; both engine functions skip a body with the
 * caller's own id, and so do the two loops here.
 */
export function readTether(self: Body, others: readonly ShelterBody[]): TetherRead {
  const shelter = shelterOf(self, others);
  return {
    self,
    shelter,
    exposed: isExposed(self, others),
    mood: tetherMood(shelter),
    lengthCu: tetherLengthCu(shelter),
    warmth: tetherWarmth(shelter),
    strands: strandsOf(self, others),
    nearest: nearestOf(self, others),
  };
}

// ---------------------------------------------------------------------------
// The fade
// ---------------------------------------------------------------------------

/** How much of the ambient tether this much accumulated playtime leaves. */
export function tetherFade(playedMs: number): number {
  if (playedMs <= TETHER_FADE_HOLD_MS) return 1;
  if (playedMs >= TETHER_FADE_OFF_MS) return 0;
  return 1 - (playedMs - TETHER_FADE_HOLD_MS) / (TETHER_FADE_OFF_MS - TETHER_FADE_HOLD_MS);
}

/**
 * How strongly to draw the tether in this moment. The fade applies to the
 * AMBIENT readout only — spec 2.10's "the hush carries it from then on".
 */
export function tetherOpacity(playedMs: number, moment: TetherMoment): number {
  return moment === 'ambient' ? tetherFade(playedMs) : 1;
}

// ---------------------------------------------------------------------------
// Size senses (spec 2.8)
// ---------------------------------------------------------------------------

/** The tension at which a swimmer of this size begins to feel the hush coming. */
export function senseThreshold(size: number): number {
  const f = clamp01((size - SENSE_SIZE_SMALL) / (SENSE_SIZE_LARGE - SENSE_SIZE_SMALL));
  const permille = SENSE_SMALL_PERMILLE + (SENSE_LARGE_PERMILLE - SENSE_SMALL_PERMILLE) * f;
  return (TENSION_TRIGGER * permille) / 1000;
}

/**
 * How strongly this swimmer senses a hush that has not begun yet, 0..1.
 *
 * Read off `state.tension`, which every client already folds identically —
 * so this is a SENSE, not a secret, and a big fish's advantage is that it
 * notices sooner, not that it is told something others are not. It reaches 1
 * exactly at TENSION_TRIGGER, which is the tick the hush itself begins on.
 */
export function premonition(tension: number, size: number): number {
  const th = senseThreshold(size);
  if (tension <= th) return 0;
  return clamp01((tension - th) / (TENSION_TRIGGER - th));
}

// ---------------------------------------------------------------------------
// The hush
// ---------------------------------------------------------------------------

/**
 * Read the hush at a display instant. `hushStartMs` is the fold's own field
 * and the phase comes straight from the engine's `hushPhase`, so the picture
 * and the sweep cannot disagree about which window is open.
 */
export function hushRead(hushStartMs: number, atMs: number): HushRead {
  const phase = hushPhase(hushStartMs, atMs);
  if (phase === 'calm') {
    return { phase, elapsedMs: -1, progress: 0, locked: false, pall: 0, dread: 0, lockFlash: 0 };
  }
  const elapsedMs = atMs - hushStartMs;
  const locked = elapsedMs >= LOCK_MS;
  const sinceLock = elapsedMs - LOCK_MS;
  return {
    phase,
    elapsedMs,
    progress: elapsedMs / HUSH_MS,
    locked,
    pall: clamp01(elapsedMs / PALL_IN_MS),
    dread: locked ? clamp01(sinceLock / (HUSH_MS - LOCK_MS)) : 0,
    lockFlash: locked ? clamp01(1 - sinceLock / LOCK_FLASH_MS) : 0,
  };
}

/**
 * The arrangement the sweep has frozen, or null before the lock.
 *
 * Sorted by id, which is exactly how `foldTick` hands the same map to
 * `selectTaken` — so a caller can put this through `selectTaken` and get the
 * verdict the fold is going to reach, which is what makes the dread window
 * honest rather than theatrical.
 */
export function lockedBodies(state: LockEcho): SwimmerBody[] | null {
  const locked = state.lockedPositions;
  if (locked === null) return null;
  return [...locked.entries()]
    .map(([id, p]) => ({ id, x: p.x, y: p.y, size: p.size }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------
// The scatter
// ---------------------------------------------------------------------------

/**
 * The frozen replay, or null when there is nothing to replay.
 *
 * `taken` is `echo.lastTaken` — the fold's own record — copied and never
 * re-derived. See the module header for what re-deriving it produces on the
 * harness's own session; in one line, three different fish.
 *
 * `bodies` is handed in rather than taken from the state, because the frame
 * worth showing is the one the sweep JUDGED (`lockedBodies`), not the one
 * that exists after it has already shrunk the fish it took.
 */
export function scatterReplay(
  echo: SweepEcho, nowMs: number, bodies: readonly Body[],
): ScatterReplay | null {
  const at = echo.lastSweepMs;
  if (at < 0) return null;
  const since = nowMs - at;
  if (since < 0 || since >= SCATTER_FREEZE_MS) return null;
  return {
    atMs: at,
    taken: [...echo.lastTaken],
    progress: since / SCATTER_FREEZE_MS,
    bodies,
  };
}
