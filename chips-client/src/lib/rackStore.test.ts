/**
 * The rack's job is to survive a reload and to refuse everything else.
 *
 * A restored pot is CREDIT — it becomes crumbs the moment it is dipped — so
 * every check here is about the store declining to hand one over when it
 * cannot prove whose it is. Wrong-table and wrong-author are the two that
 * would mint value from nothing; the rest are corruption, which must fail
 * closed rather than take the shop down with it.
 *
 * Run: npx tsx src/lib/rackStore.test.ts
 */
import { readRack, writeRack, clearRack, RACK_V, type RackStore } from './rackStore';
import type { CookingChip } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const mem = (): RackStore & { raw: Map<string, string> } => {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (k) => raw.get(k) ?? null,
    setItem: (k, v) => { raw.set(k, v); },
    removeItem: (k) => { raw.delete(k); },
  };
};
const T = 'sha256:table', A = 'a'.repeat(64);
const rack: CookingChip[] = [
  { ms: 1, pot: 128_125, crackles: 5, cookedMs: 60_000 },
  { ms: 2, pot: 0, crackles: 0, cookedMs: 0 },
];

/* ── the round trip ───────────────────────────────────────────────────── */
{
  const s = mem();
  writeRack(s, T, A, rack);
  const back = readRack(s, T, A);
  check('a rack comes back', back !== null && back.length === 2, back);
  check('with its pot intact', back?.[0].pot === 128_125, back?.[0]);
  check('and its crackles — the multiplier is the whole point',
    back?.[0].crackles === 5, back?.[0].crackles);
  check('and its cooked time', back?.[0].cookedMs === 60_000);
  check('an empty store is simply null', readRack(mem(), T, A) === null);
  clearRack(s);
  check('clearing works', readRack(s, T, A) === null);
}

/* ── IT MUST NOT MINT VALUE. The two that matter. ─────────────────────── */
{
  const s = mem();
  writeRack(s, T, A, rack);
  check('another TABLE does not get your pots', readRack(s, 'sha256:other', A) === null);
  check('another IDENTITY does not get them either', readRack(s, T, 'b'.repeat(64)) === null);
  // Case is not identity: a pubkey rendered upper-case is the same player.
  check('but the same identity in a different case is still you',
    readRack(s, T, A.toUpperCase()) !== null);
}

/* ── corruption fails CLOSED, and never throws ────────────────────────── */
{
  for (const [name, raw] of [
    ['not json', '{{{'],
    ['wrong version', JSON.stringify({ v: RACK_V + 1, tableId: T, author: A, chips: rack })],
    ['chips not an array', JSON.stringify({ v: RACK_V, tableId: T, author: A, chips: 'nope' })],
    ['a chip missing its pot', JSON.stringify({ v: RACK_V, tableId: T, author: A, chips: [{ ms: 1, crackles: 1, cookedMs: 0 }] })],
    ['a NEGATIVE pot', JSON.stringify({ v: RACK_V, tableId: T, author: A, chips: [{ ms: 1, pot: -5, crackles: 1, cookedMs: 0 }] })],
    ['fractional crackles', JSON.stringify({ v: RACK_V, tableId: T, author: A, chips: [{ ms: 1, pot: 5, crackles: 1.5, cookedMs: 0 }] })],
    ['NaN pot', JSON.stringify({ v: RACK_V, tableId: T, author: A, chips: [{ ms: 1, pot: null, crackles: 1, cookedMs: 0 }] })],
    ['no author', JSON.stringify({ v: RACK_V, tableId: T, chips: rack })],
  ] as [string, string][]) {
    const s = mem();
    s.setItem('chips.rack.v1', raw);
    let threw = false;
    let got: CookingChip[] | null = null;
    try { got = readRack(s, T, A); } catch { threw = true; }
    check(`${name}: no throw`, !threw);
    check(`${name}: no rack`, got === null, got);
  }
}

/* ── a store that is hostile in itself must not take the shop down ────── */
{
  const boom: RackStore = {
    getItem() { throw new Error('private mode'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('nope'); },
  };
  let threw = false;
  try { readRack(boom, T, A); writeRack(boom, T, A, rack); clearRack(boom); } catch { threw = true; }
  check('a throwing store is survivable — the rack is a convenience', !threw);
}

/* ── NOT offline progress ─────────────────────────────────────────────── */
{
  // Restored exactly as left: the store must not "helpfully" advance a pot
  // for time spent away. The game has no offline progress and this file must
  // not quietly introduce some.
  const s = mem();
  writeRack(s, T, A, rack);
  const back = readRack(s, T, A);
  check('nothing accrues while away — the pot is exactly as left',
    back?.[0].pot === rack[0].pot && back?.[0].cookedMs === rack[0].cookedMs);
  check('and nothing is lost either', back?.length === rack.length);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
