/**
 * The rule this pins: HOSTING IS NEVER GATED, FOLDING ALWAYS IS.
 *
 * Measured on a Pixel 2026-08-02 — a first load folded six foreign tables
 * through the single Argon2id verify worker before the player's own table got
 * there, for a boards panel that is closed by default. Every check below fails
 * against the code as it was that night.
 *
 * Run: npx tsx src/lib/boardsPass.test.ts
 */
import { planBoardsPass } from './boardsPass';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const TABLES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// 1) THE BUG ITSELF. Before the player's own table has folded, not one foreign
//    Argon2id hash may be queued — that is the whole fix.
{
  const p = planBoardsPass(TABLES, false, 0, 6);
  check('folds NOTHING before the player-s own table is ready', p.fold.length === 0, p.fold);
}

// 2) THE OVER-CORRECTION. Gating the whole pass would have been the easy fix and
//    the wrong one: this browser would stop hosting anyone until its own game
//    started, which is exactly when a new player has nothing cached to host FROM.
{
  const p = planBoardsPass(TABLES, false, 0, 6);
  check('hosts EVERY table anyway while gated', p.host.length === TABLES.length, p.host.length);
  check('hosting is uncapped — not the fold window', p.host.length > 6);
}

// 3) THE SUBTLE ONE. A gated pass must not burn the window it never folded, or
//    those tables are skipped for good and the boards show permanent holes.
{
  const p = planBoardsPass(TABLES, false, 0, 6);
  check('a gated pass does NOT advance the cursor', p.nextCursor === 0, p.nextCursor);
  const resumed = planBoardsPass(TABLES, true, p.nextCursor, 6);
  check('so the first real pass still starts at the top', resumed.fold[0] === 'a', resumed.fold);
}

// 4) ONCE OPEN, IT BEHAVES AS BEFORE — the fix must not change what folding does.
{
  const p = planBoardsPass(TABLES, true, 0, 6);
  check('folds the window when ready', p.fold.join(',') === 'a,b,c,d,e,f', p.fold);
  check('and advances the cursor past it', p.nextCursor === 6, p.nextCursor);
}

// 5) THE WINDOW ROTATES AND WRAPS, so every table is reached over several passes.
{
  const p = planBoardsPass(TABLES, true, 6, 6);
  check('wraps around the end of the board', p.fold.join(',') === 'g,h,a,b,c,d', p.fold);
}

// 6) FEWER TABLES THAN THE WINDOW never folds the same table twice in one pass —
//    a duplicate would double-count that table into the board totals.
{
  const p = planBoardsPass(['x', 'y'], true, 0, 6);
  check('never folds a table twice in one pass', new Set(p.fold).size === p.fold.length, p.fold);
  check('and folds only what exists', p.fold.length === 2, p.fold);
}

// 7) AN EMPTY BOARD IS NOT A CRASH — a brand-new node lists no tables at all,
//    which is the exact state a first-ever load starts in.
{
  const p = planBoardsPass([], true, 0, 6);
  check('an empty board plans nothing and does not throw',
    p.host.length === 0 && p.fold.length === 0 && p.nextCursor === 0);
}

// 8) A NEGATIVE OR STALE CURSOR still indexes inside the board.
{
  const p = planBoardsPass(TABLES, true, -3, 2);
  check('a negative cursor still lands in range', p.fold.every((t) => TABLES.includes(t)), p.fold);
}

console.log(failures === 0 ? '\nboardsPass: all checks passed' : `\nboardsPass: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
