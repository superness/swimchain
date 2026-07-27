/**
 * Blooms — food grows where the school isn't.
 *
 * The bloom map is a picture of where nobody has been. A cell unvisited for
 * BLOOM_READY_MS carries a bloom worth BLOOM_BITES; a fish passing within
 * BLOOM_VISIT_R resets it. Blooms are rivalrous on purpose: if one bloom fed
 * the whole school, a single tight blob could walk the map together, tension
 * would never rise, and the core tension of the game would stop existing.
 *
 * NOT YET IMPLEMENTED: a bounded lookback. BLOOM_WINDOW_MS exists and is
 * sized to sit below PRESENCE_TTL_MS so that a client joining mid-session
 * could rebuild this map from data still live, but nothing in this module or
 * in the fold enforces it — isBloomReady looks back over the whole of
 * lastVisit, however old. Whether to enforce it, and what a joining client is
 * owed if it cannot, is an open design decision; do not implement it here
 * without settling that.
 */
import { dist2 } from './fixed';
import {
  BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS, BLOOM_VISIT_R, BLOOM_VISIT_R2,
  BLOOM_READY_MS, BLOOM_BITES, EAT_R2, EAT_COOLDOWN_MS,
} from './shoalConst';
import type { Body } from './shelter';

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
 * Stamp every cell within BLOOM_VISIT_R of any fish as visited at `nowMs`.
 * Mutates `lastVisit` in place — this is called once per fold tick.
 */
export function markVisits(
  lastVisit: Map<number, number>,
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
          lastVisit.set(cell, nowMs);
        }
      }
    }
  }
}

/** True when a cell has been left alone long enough to bloom. */
export function isBloomReady(
  lastVisit: ReadonlyMap<number, number>,
  cell: number,
  nowMs: number,
): boolean {
  const seen = lastVisit.get(cell);
  if (seen === undefined) return true; // never visited: the sea starts full
  return nowMs - seen >= BLOOM_READY_MS;
}

/** Bites remaining in a cell's current bloom. Never negative. */
export function bitesLeft(bitesTaken: ReadonlyMap<number, number>, cell: number): number {
  const used = bitesTaken.get(cell) ?? 0;
  const left = BLOOM_BITES - used;
  return left < 0 ? 0 : left;
}

/** Everything a bite must satisfy to be credited. */
export interface EatCheck {
  lastVisit: ReadonlyMap<number, number>;
  bitesTaken: ReadonlyMap<number, number>;
  cell: number;
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
  if (!isBloomReady(a.lastVisit, a.cell, a.nowMs)) return false;
  if (bitesLeft(a.bitesTaken, a.cell) <= 0) return false;
  const centre = cellCentre(a.cell);
  if (dist2(a.fishX, a.fishY, centre.x, centre.y) > EAT_R2) return false;
  if (a.lastBiteMs >= 0 && a.nowMs - a.lastBiteMs < EAT_COOLDOWN_MS) return false;
  return true;
}
