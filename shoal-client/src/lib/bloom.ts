/**
 * Blooms — food grows where the school isn't.
 *
 * The bloom map is a picture of where nobody has been. A cell unvisited for
 * BLOOM_READY_MS carries a bloom worth BLOOM_BITES; a fish passing within
 * BLOOM_VISIT_R resets it. Blooms are rivalrous on purpose: if one bloom fed
 * the whole school, a single tight blob could walk the map together, tension
 * would never rise, and the core tension of the game would stop existing.
 *
 * THE LOOKBACK IS BOUNDED BY THE FOLD, NOT BY THIS MODULE. isBloomReady still
 * reads whatever `lastVisit` holds, however old. A STAMP PRESENT in the map
 * can derive from a log entry as old as WARMUP_MS + PRESENCE_TTL_MS
 * (180_000) before the epoch's origin: the fold's log cursor admits entries
 * back to `warmStartMs - PRESENCE_TTL_MS` (shoalEngine.ts's foldShoal, spec
 * 3.9 point 3), because a presence vector authored that early can still be
 * live during the warm-up — and an exhausting bite applied during replay
 * stamps `lastVisit` with THAT ENTRY'S OWN (old) `ms`, not with the tick it
 * was replayed on (measured: `lastVisit(700)` landing at `origin - 167_500`).
 * A cell ABSENT from the reconstructed map is a different, unaffected claim:
 * it has had no visit for the entire warm-up, i.e. at least WARMUP_MS
 * (90_000), which still exceeds BLOOM_READY_MS(45_000), so "absent from
 * lastVisit" and "genuinely fallow" still coincide at every tick from the
 * origin onward and "the sea starts full" below remains a correct reading.
 * What changed is only how old a PRESENT stamp may be, never what an ABSENT
 * one proves. Do not add a window check to `isBloomReady`: the bound belongs
 * to the replay, and a second one there would be a consensus rule with no test
 * behind it. (`markVisits` DOES prune, but only stamps `isBloomReady` already
 * ignores — see its doc.)
 *
 * ===========================================================================
 * A CLAIM IGNORES THE CLAIMANT'S OWN VISITS
 * ===========================================================================
 *
 * This is the rule that makes the game's core loop reachable at all, and it is
 * CONSENSUS. Stated plainly: another fish trampling a bloom still kills it;
 * YOU trampling it by arriving does not.
 *
 * Without it nobody could ever eat. A fish stamps a cell visited at
 * BLOOM_VISIT_R (200 cu) but may only bite within EAT_R (90 cu), and the
 * fastest anything travels is SPEED_DART's 55 cu per TICK_MS. So any approach
 * path crosses the trample radius several ticks before it reaches the bite
 * radius, and the bloom is already dead when you arrive. Measured against this
 * fold before the rule: a swimmer cruising OR darting in from 600 cu away and
 * claiming on the EAT_COOLDOWN_MS cadence was credited ZERO bites, while one
 * whose first presence vector already sat on the cell centre took the full
 * BLOOM_BITES — the verb was reachable only by a swimmer who never swam.
 *
 * Two other fixes were tried against the real fold and BOTH measured 0 bites,
 * so neither is worth re-attempting: raising EAT_R to 200 (matching the two
 * radii), and exempting cells within EAT_R from `markVisits`. They fail for
 * the same reason — the trample is stamped by PROXIMITY and the claim is
 * judged ticks later, so the approach crosses the ring wherever the ring is.
 *
 * Why this rule and not a smaller BLOOM_VISIT_R:
 *  - It preserves the design intent exactly. The full 200-cu school shadow
 *    survives, so spec 2.2's "food grows in the open, safety is in the crowd,
 *    and they are never in the same place" still holds. Shrinking
 *    BLOOM_VISIT_R would have weakened that core tension instead.
 *  - It needs no exact-tick timing from the client, which the alternative of
 *    judging a claim against a pre-arrival snapshot would have.
 *  - It is what a player would intuit: your own arrival should not be the
 *    thing that stops you eating.
 *
 * THE EXEMPTION IS FOR CLAIMS ONLY. `isBloomReady` with `exceptId` omitted
 * considers EVERY visitor, the claimant included, and that is the form the
 * fallow/regrowth reset uses (shoalEngine.ts step 3). So a fish parked on a
 * cell it has emptied cannot farm it: the bloom regrows only once the cell has
 * lain fallow to EVERYONE — itself included — for BLOOM_READY_MS. The
 * exemption buys a swimmer the bloom it SWAM TO, never one it is sitting on.
 */
import { dist2 } from './fixed';
import {
  BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS, BLOOM_VISIT_R, BLOOM_VISIT_R2,
  BLOOM_READY_MS, BLOOM_BITES, EAT_R2, EAT_COOLDOWN_MS,
} from './shoalConst';
import type { Body } from './shelter';
import type { VisitMap, ReadonlyVisitMap } from './shoalTypes';

/** Grid cell containing a point. Clamped, so out-of-world points stay in range. */
export function cellIndex(x: number, y: number): number {
  let col = Math.floor(x / BLOOM_CELL);
  let row = Math.floor(y / BLOOM_CELL);
  if (col < 0) col = 0; else if (col >= BLOOM_COLS) col = BLOOM_COLS - 1;
  if (row < 0) row = 0; else if (row >= BLOOM_ROWS) row = BLOOM_ROWS - 1;
  return row * BLOOM_COLS + col;
}

/** The centre point of a cell. */
export function cellCentre(cell: number): { x: number; y: number } {
  const col = cell % BLOOM_COLS;
  const row = Math.floor(cell / BLOOM_COLS);
  const half = BLOOM_CELL / 2;
  return { x: col * BLOOM_CELL + half, y: row * BLOOM_CELL + half };
}

/**
 * Record that `id` was at `cell` at `ms`. THE ONLY WRITE SITE for the two-level
 * shape, so nothing else has to know it is two levels.
 *
 * Last-write-wins per (cell, swimmer), which is all `isBloomReady` reads —
 * an older stamp from the same swimmer can never make a cell less ready than
 * its newest one.
 */
export function stampVisit(lastVisit: VisitMap, cell: number, id: string, ms: number): void {
  const by = lastVisit.get(cell);
  if (by === undefined) lastVisit.set(cell, new Map([[id, ms]]));
  else by.set(id, ms);
}

/**
 * Stamp every cell within BLOOM_VISIT_R of any fish as visited BY THAT FISH at
 * `nowMs`, then drop every stamp that has aged out.
 *
 * Mutates `lastVisit` in place — this is called once per fold tick.
 *
 * THE PRUNE IS A SIZE BOUND, NOT A GAME RULE, and it is deliberately exactly
 * the complement of what `isBloomReady` reads: a stamp matters iff
 * `nowMs - ms < BLOOM_READY_MS`, so dropping the rest changes no answer this
 * module can give — an aged-out stamp and an absent one both read "ready".
 * (Verified by mutation: removing the prune leaves every behavioural test
 * green and fails only the bound test.) It is not optional, though: the map is
 * keyed by (cell, SWIMMER), and without it one entry would survive for every
 * id that ever came within 200 cu of a cell — over an epoch that is not the
 * population of the sea, it is everyone who ever swam in it.
 *
 * Pruning AFTER marking rather than before is what makes the postcondition
 * clean: on return, every stamp in the map is strictly newer than
 * `nowMs - BLOOM_READY_MS`. (The two orders are otherwise equivalent, since
 * every stamp written here is stamped at `nowMs` itself and so can never be
 * the one pruned.)
 */
export function markVisits(
  lastVisit: VisitMap,
  bodies: readonly Body[],
  nowMs: number,
): void {
  const reach = Math.ceil(BLOOM_VISIT_R / BLOOM_CELL);
  for (const b of bodies) {
    const col = Math.floor(b.x / BLOOM_CELL);
    const row = Math.floor(b.y / BLOOM_CELL);
    for (let dr = -reach; dr <= reach; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= BLOOM_COLS || r < 0 || r >= BLOOM_ROWS) continue;
        const cell = r * BLOOM_COLS + c;
        const centre = cellCentre(cell);
        if (dist2(b.x, b.y, centre.x, centre.y) <= BLOOM_VISIT_R2) {
          stampVisit(lastVisit, cell, b.id, nowMs);
        }
      }
    }
  }
  for (const [cell, by] of lastVisit) {
    for (const [id, ms] of by) {
      if (nowMs - ms >= BLOOM_READY_MS) by.delete(id);
    }
    // A cell whose every visitor has aged out is indistinguishable from one
    // nobody has ever been to, so it must not survive as an empty shell — the
    // bound is on ENTRIES and on CELLS.
    if (by.size === 0) lastVisit.delete(cell);
  }
}

/**
 * True when a cell has been left alone long enough to bloom.
 *
 * `exceptId`, when given, is the CLAIMANT: its own visits are ignored, so a
 * swimmer's approach cannot be the thing that denies it the bloom it swam to.
 * Everyone else's visits still count in full — that is the school shadow, and
 * it is the half of this rule that keeps blooms rivalrous. Omit `exceptId` and
 * every visitor counts; that is the form the fallow/regrowth reset uses. See
 * this module's header for the ruling and why the alternatives fail.
 *
 * Order-independent by construction: the answer is an AND over the cell's
 * visitors, so a Map's iteration order cannot leak into it.
 */
export function isBloomReady(
  lastVisit: ReadonlyVisitMap,
  cell: number,
  nowMs: number,
  exceptId?: string,
): boolean {
  const by = lastVisit.get(cell);
  if (by === undefined) return true; // never visited: the sea starts full
  for (const [id, seen] of by) {
    if (id === exceptId) continue;
    if (nowMs - seen < BLOOM_READY_MS) return false;
  }
  return true;
}

/** Bites remaining in a cell's current bloom. Never negative. */
export function bitesLeft(bitesTaken: ReadonlyMap<number, number>, cell: number): number {
  const used = bitesTaken.get(cell) ?? 0;
  const left = BLOOM_BITES - used;
  return left < 0 ? 0 : left;
}

/** Everything a bite must satisfy to be credited. */
export interface EatCheck {
  lastVisit: ReadonlyVisitMap;
  bitesTaken: ReadonlyMap<number, number>;
  cell: number;
  /**
   * The claimant. Its own visits are ignored by the fallow test — see this
   * module's header. Carried here rather than derived because the fold judges
   * a claim against the CLAIMANT's dead-reckoned position, and the same
   * identity has to name both.
   */
  id: string;
  fishX: number;
  fishY: number;
  /** Ms of this fish's last credited bite, or -1. */
  lastBiteMs: number;
  nowMs: number;
}

/**
 * True when a claimed bite credits.
 *
 * Known corner dead zone: a fish standing at a cell's exact low corner is
 * 64^2 + 64^2 = 8192 squared-cu from that cell's centre (half the cell in
 * each axis) — greater than EAT_R2 (8100). So that point is inside the cell
 * per `cellIndex` but cannot eat from it, even with the bloom ready and
 * uncontested. This is one quantized point in 256 per cell (QUANT=8 over a
 * 128 cell -> 16x16 grid) and an 8 cu move onto the centre fixes it. It is
 * known and accepted: EAT_R and BLOOM_CELL are both permanent CONSENSUS
 * constants, so this relationship cannot be tuned away later without a hard
 * fork — anyone touching either constant should know it exists.
 */
export function canEat(a: EatCheck): boolean {
  if (!isBloomReady(a.lastVisit, a.cell, a.nowMs, a.id)) return false;
  if (bitesLeft(a.bitesTaken, a.cell) <= 0) return false;
  const centre = cellCentre(a.cell);
  if (dist2(a.fishX, a.fishY, centre.x, centre.y) > EAT_R2) return false;
  if (a.lastBiteMs >= 0 && a.nowMs - a.lastBiteMs < EAT_COOLDOWN_MS) return false;
  return true;
}
