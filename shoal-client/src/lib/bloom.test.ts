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
import type { VisitMap } from './shoalTypes';
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
  const lastVisit: VisitMap = new Map();
  // A fish at a cell centre marks that cell, UNDER ITS OWN ID.
  const c = cellCentre(100);
  markVisits(lastVisit, [at('a', c.x, c.y)], 10_000);
  check('a fish marks the cell it is in', lastVisit.get(100)?.get('a') === 10_000,
    [...(lastVisit.get(100) ?? [])]);
  check('...and the stamp is recorded against the visitor, not the cell alone',
    lastVisit.get(100)?.size === 1 && lastVisit.get(100)?.has('a') === true,
    [...(lastVisit.get(100) ?? [])]);

  // A fish marks nearby cells too, out to BLOOM_VISIT_R.
  check('a fish marks more than one cell', lastVisit.size > 1, lastVisit.size);

  // Two fish on the same cell are two entries, not one overwriting the other:
  // that is the whole point of the shape.
  markVisits(lastVisit, [at('b', c.x, c.y)], 10_000);
  check('a second fish is a second stamp on the same cell',
    lastVisit.get(100)?.size === 2 && lastVisit.get(100)?.get('b') === 10_000,
    [...(lastVisit.get(100) ?? [])]);

  // A fish far away marks nothing near cell 100... verified by an independent
  // count over the visit radius rather than by trusting markVisits twice.
  const far: VisitMap = new Map();
  markVisits(far, [at('a', 3_000, 2_500)], 10_000);
  check('a distant fish does not mark cell 100', !far.has(100), [...far.keys()].slice(0, 5));
}

// --- Readiness -------------------------------------------------------------
{
  const lastVisit: VisitMap = new Map([[7, new Map([['a', 1_000]])]]);
  // By hand: ready when now - lastVisit >= BLOOM_READY_MS.
  check('a just-visited cell is not ready', isBloomReady(lastVisit, 7, 1_000) === false);
  check('a cell one ms short is not ready', isBloomReady(lastVisit, 7, 1_000 + BLOOM_READY_MS - 1) === false);
  check('a cell exactly at readiness is ready', isBloomReady(lastVisit, 7, 1_000 + BLOOM_READY_MS) === true);
  // A never-visited cell is ready — the sea starts full.
  check('a never-visited cell is ready', isBloomReady(lastVisit, 999, 0) === true);
}

// --- A claim ignores the CLAIMANT's own visits, and nobody else's -----------
// The ruling in bloom.ts's header, at its smallest. Same cell, same instant,
// same single stamp — only the `exceptId` differs, so nothing else can explain
// the difference in answer.
{
  const cell = 7;
  const visitedAt = 1_000;
  const now = visitedAt + 1; // one ms later: nowhere near BLOOM_READY_MS(45_000)
  const onlyA: VisitMap = new Map([[cell, new Map([['a', visitedAt]])]]);
  check('the fixture really is inside the fallow window (so "ready" cannot be a timeout)',
    now - visitedAt < BLOOM_READY_MS, { age: now - visitedAt, BLOOM_READY_MS });

  check("a cell 'a' just trampled is READY to 'a' itself",
    isBloomReady(onlyA, cell, now, 'a') === true);
  check("...and NOT ready to 'b', who did not trample it",
    isBloomReady(onlyA, cell, now, 'b') === false);
  check('...and not ready with no claimant named at all (the regrowth form)',
    isBloomReady(onlyA, cell, now) === false);

  // The school shadow: one OTHER visitor is enough to deny the claimant, even
  // when the claimant has also been there.
  const both: VisitMap = new Map([[cell, new Map([['a', visitedAt], ['b', visitedAt]])]]);
  check("a cell 'a' AND 'b' trampled is denied to 'a'",
    isBloomReady(both, cell, now, 'a') === false);
  check('...and denied to b too — the exemption never covers more than one fish',
    isBloomReady(both, cell, now, 'b') === false);

  // The other fish's stamp ages out on exactly the same clock as anyone's.
  const aged: VisitMap = new Map([[cell, new Map([['a', visitedAt], ['b', visitedAt]])]]);
  check("...until b's stamp is BLOOM_READY_MS old, at which point a may eat",
    isBloomReady(aged, cell, visitedAt + BLOOM_READY_MS, 'a') === true);
}

// --- The prune keeps the map bounded, and changes no answer -----------------
// markVisits drops every stamp that has aged past BLOOM_READY_MS. It is a size
// bound, not a rule: an aged-out stamp and an absent one both read "ready", so
// this can only ever remove entries isBloomReady was already ignoring.
{
  const c = cellCentre(100);
  const lastVisit: VisitMap = new Map();
  markVisits(lastVisit, [at('a', c.x, c.y)], 0);
  const cellsAfterA = lastVisit.size;
  check("'a' really did stamp cell 100 at ms 0", lastVisit.get(100)?.get('a') === 0);

  // 'b' passes the same place one ms BEFORE a's stamp would age out. Both
  // stamps must survive: a's age is exactly BLOOM_READY_MS - 1.
  markVisits(lastVisit, [at('b', c.x, c.y)], BLOOM_READY_MS - 1);
  check("one ms early, 'a's stamp survives alongside 'b's",
    lastVisit.get(100)?.size === 2 && lastVisit.get(100)?.get('a') === 0,
    [...(lastVisit.get(100) ?? [])]);

  // One more ms and a's stamp is exactly BLOOM_READY_MS old — the same
  // threshold isBloomReady uses — so it goes, and b's (age 1) stays.
  markVisits(lastVisit, [at('b', c.x, c.y)], BLOOM_READY_MS);
  check("at exactly BLOOM_READY_MS, 'a's stamp is pruned and 'b's is not",
    lastVisit.get(100)?.size === 1 && lastVisit.get(100)?.has('a') === false
      && lastVisit.get(100)?.get('b') === BLOOM_READY_MS,
    [...(lastVisit.get(100) ?? [])]);

  // A cell nobody has been near for BLOOM_READY_MS leaves the map entirely,
  // rather than surviving as an empty shell: the bound is on cells too. 'z' is
  // far away, so no cell it marks overlaps the ones above.
  markVisits(lastVisit, [at('z', 3_000, 2_500)], BLOOM_READY_MS * 2);
  check('every cell from the earlier passes is gone once nobody has been near for the window',
    !lastVisit.has(100) && lastVisit.size > 0 && lastVisit.size < cellsAfterA + 1,
    { size: lastVisit.size, cellsAfterA });

  // And the postcondition, stated as an invariant over whatever is left: after
  // markVisits(now), no stamp is BLOOM_READY_MS or older, and no cell is empty.
  const now = BLOOM_READY_MS * 2;
  let oldest = 0;
  let emptyCells = 0;
  for (const [, by] of lastVisit) {
    if (by.size === 0) emptyCells++;
    for (const [, ms] of by) oldest = Math.max(oldest, now - ms);
  }
  check('after markVisits every surviving stamp is inside the fallow window, and no cell is empty',
    oldest < BLOOM_READY_MS && emptyCells === 0, { oldest, emptyCells, BLOOM_READY_MS });
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
    lastVisit: new Map() as VisitMap,
    bitesTaken: new Map<number, number>(),
    cell,
    id: 'a',
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

  // Not ready: cell visited recently BY SOMEONE ELSE. 99_000 is 1_000 ms
  // before base.nowMs, far inside BLOOM_READY_MS(45_000).
  check('a bite at a cell another fish visited recently does not credit',
    canEat({ ...base, lastVisit: new Map([[cell, new Map([['b', 99_000]])]]) }) === false);
  // ...but the claimant's OWN visit at the same instant does not deny it. Same
  // map, same time, only the visitor's id differs.
  check("a bite at a cell only the claimant visited recently DOES credit",
    canEat({ ...base, lastVisit: new Map([[cell, new Map([['a', 99_000]])]]) }) === true);

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
