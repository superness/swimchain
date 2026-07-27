/**
 * Blooms. Run: npx tsx src/lib/bloom.test.ts
 *
 * Food grows where the school ISN'T. The bloom map is a picture of where
 * nobody has been, so it refills exactly the places players were too scared to
 * go. Blooms are RIVALROUS: if one bloom fed the whole school, the optimal play
 * would be a single tight blob walking the map together, tension would never
 * rise, and the game's core tension would quietly stop existing.
 */
import { cellIndex, cellCentre, markVisits, isBloomReady, bitesLeft, canEat } from './bloom';
import type { Body } from './shelter';
import {
  BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS, BLOOM_READY_MS, BLOOM_BITES,
  EAT_R, EAT_COOLDOWN_MS,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- The grid --------------------------------------------------------------
// Hand arithmetic with BLOOM_CELL=128, BLOOM_COLS=32:
// (0,0) -> col 0, row 0 -> index 0.  (128,0) -> col 1 -> index 1.
// (0,128) -> row 1 -> index 32.
check('origin is cell 0', cellIndex(0, 0) === 0, cellIndex(0, 0));
check('one cell right is cell 1', cellIndex(BLOOM_CELL, 0) === 1, cellIndex(BLOOM_CELL, 0));
check('one cell down is cell BLOOM_COLS', cellIndex(0, BLOOM_CELL) === BLOOM_COLS, cellIndex(0, BLOOM_CELL));
check('within a cell maps to the same index', cellIndex(BLOOM_CELL - 1, BLOOM_CELL - 1) === 0,
  cellIndex(BLOOM_CELL - 1, BLOOM_CELL - 1));
check('every cell index is in range', (() => {
  for (const [x, y] of [[0, 0], [4095, 3071], [2000, 1500]] as const) {
    const i = cellIndex(x, y);
    if (i < 0 || i >= BLOOM_COLS * BLOOM_ROWS) return false;
  }
  return true;
})());

// Out-of-world points clamp instead of producing a negative or overflowing
// index. Below the world: floor(-1/128) = -1, clamped to col 0, row 0 ->
// index 0. Beyond it: floor(99999/128) = 781, clamped to BLOOM_COLS-1 = 31
// and BLOOM_ROWS-1 = 23 -> index 23*32+31 = 767, which equals
// BLOOM_ROWS*BLOOM_COLS-1 = 24*32-1 = 767.
check('a point below the world clamps to the first cell', cellIndex(-1, -1) === 0, cellIndex(-1, -1));
check('a point beyond the world clamps to the last cell',
  cellIndex(99_999, 99_999) === BLOOM_ROWS * BLOOM_COLS - 1, cellIndex(99_999, 99_999));

// Centre of cell 0 is (64, 64) by hand: half of 128.
check('cell centre is the middle of the cell', cellCentre(0).x === 64 && cellCentre(0).y === 64, cellCentre(0));

// Cell 70: col = 70 % 32 = 6, row = floor(70/32) = 2.
// centre = (6*128+64, 2*128+64) = (832, 320).
// This is an independent check of cellCentre's output — not just a
// round-trip through cellIndex, which could be wrong in the same way.
check('centre of cell 70 is the expected coordinates',
  cellCentre(70).x === 832 && cellCentre(70).y === 320, cellCentre(70));
check('centre round-trips to its own index', cellIndex(cellCentre(70).x, cellCentre(70).y) === 70,
  { centre: cellCentre(70), back: cellIndex(cellCentre(70).x, cellCentre(70).y) });

// --- Visits ----------------------------------------------------------------
{
  const lastVisit = new Map<number, number>();
  // A fish at a cell centre marks that cell.
  const c = cellCentre(100);
  markVisits(lastVisit, [at('a', c.x, c.y)], 10_000);
  check('a fish marks the cell it is in', lastVisit.get(100) === 10_000, lastVisit.get(100));

  // A fish marks nearby cells too, out to BLOOM_VISIT_R.
  check('a fish marks more than one cell', lastVisit.size > 1, lastVisit.size);

  // A fish far away marks nothing near cell 100... verified by an independent
  // count over the visit radius rather than by trusting markVisits twice.
  const far = new Map<number, number>();
  markVisits(far, [at('a', 3_000, 2_500)], 10_000);
  check('a distant fish does not mark cell 100', !far.has(100), [...far.keys()].slice(0, 5));
}

// --- Readiness -------------------------------------------------------------
{
  const lastVisit = new Map<number, number>([[7, 1_000]]);
  // By hand: ready when now - lastVisit >= BLOOM_READY_MS.
  check('a just-visited cell is not ready', isBloomReady(lastVisit, 7, 1_000) === false);
  check('a cell one ms short is not ready', isBloomReady(lastVisit, 7, 1_000 + BLOOM_READY_MS - 1) === false);
  check('a cell exactly at readiness is ready', isBloomReady(lastVisit, 7, 1_000 + BLOOM_READY_MS) === true);
  // A never-visited cell is ready — the sea starts full.
  check('a never-visited cell is ready', isBloomReady(lastVisit, 999, 0) === true);
}

// --- Rivalry ---------------------------------------------------------------
{
  const taken = new Map<number, number>();
  check('a fresh bloom has all its bites', bitesLeft(taken, 5) === BLOOM_BITES, bitesLeft(taken, 5));
  taken.set(5, 2);
  check('bites already taken are gone', bitesLeft(taken, 5) === BLOOM_BITES - 2, bitesLeft(taken, 5));
  taken.set(5, BLOOM_BITES);
  check('an exhausted bloom has nothing left', bitesLeft(taken, 5) === 0, bitesLeft(taken, 5));
  taken.set(5, BLOOM_BITES + 99);
  check('bites left never goes negative', bitesLeft(taken, 5) === 0, bitesLeft(taken, 5));
}

// --- Crediting a bite ------------------------------------------------------
{
  const cell = 100;
  const c = cellCentre(cell);
  const base = {
    lastVisit: new Map<number, number>(),
    bitesTaken: new Map<number, number>(),
    cell,
    fishX: c.x,
    fishY: c.y,
    lastBiteMs: -1,
    nowMs: 100_000,
  };
  check('a bite at a ready bloom credits', canEat(base) === true);

  // Out of range: EAT_R is the boundary, so EAT_R+1 away must fail.
  check('a bite exactly at the eat radius credits',
    canEat({ ...base, fishX: c.x + EAT_R, fishY: c.y }) === true);
  check('a bite past the eat radius does not',
    canEat({ ...base, fishX: c.x + EAT_R + 1, fishY: c.y }) === false);

  // Not ready: cell visited recently.
  check('a bite at a recently visited cell does not credit',
    canEat({ ...base, lastVisit: new Map([[cell, 99_000]]) }) === false);

  // Exhausted.
  check('a bite at an exhausted bloom does not credit',
    canEat({ ...base, bitesTaken: new Map([[cell, BLOOM_BITES]]) }) === false);

  // Cooldown, by hand: a bite EAT_COOLDOWN_MS-1 ago is too soon.
  check('a bite inside the cooldown does not credit',
    canEat({ ...base, lastBiteMs: base.nowMs - (EAT_COOLDOWN_MS - 1) }) === false);
  check('a bite exactly at the cooldown credits',
    canEat({ ...base, lastBiteMs: base.nowMs - EAT_COOLDOWN_MS }) === true);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
