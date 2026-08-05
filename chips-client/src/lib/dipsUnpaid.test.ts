/**
 * THE CLIENT NOTICES WHEN A DIP PAID NOTHING.
 *
 * The operator's idea, 2026-08-05, after a night in which "I dipped and got no
 * crumbs" was the single most common report and answering it took a chain
 * re-fold every single time: "if I ever dip a chip from the client side and
 * don't increase my crumb count we report it? or at least... cache it until I
 * press the button to report it."
 *
 * Cached, never auto-posted — a report costs a real action PoW and a chain
 * write, and a client that files one by itself on every hiccup spams the space
 * it is trying to debug.
 *
 * It does NOT watch the crumb counter. That number moves for buys, sogginess,
 * other dips in the same tick and the bowl cap clamping, so "it didn't go up"
 * is noisy enough to be useless — and a check that cries wolf gets ignored
 * exactly when it is right. It joins the two records that already exist and
 * must agree: the DIP RING (what the client showed at the tap) and the FOLD
 * (what the chain's replay says that move did), on `wireMs`.
 *
 * Run: npx tsx src/lib/dipsUnpaid.test.ts
 */
import { dipsUnpaid } from './debugSnapshot';
import type { ChipsState } from './chipsEngine';
import type { QueuedMove } from './chipsQueue';
import type { DipNote } from './dipRing';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const TABLE = 'sha256:' + 'b'.repeat(64);
const NOW = 1785900000000;

const dip = (wireMs: number | null, credited: number, over = {}): DipNote => ({
  route: 'dip', at: NOW - 5_000, index: 0, ms: NOW - 20_000, wireMs,
  cookedMs: 15_000, pot: 100_000, crackles: 3, raw: credited, amount: credited,
  doubled: false, bowlCap: 3_000_000, crumbsBefore: 500_000,
  room: 2_500_000, credited, spilled: 0, queuedId: 1, ...over,
} as DipNote);

const foldWith = (moves: { ms: number; outcome: string }[]): ChipsState =>
  ({ moves: moves.map((m, n) => ({ content_id: `c${n}`, ...m })) } as unknown as ChipsState);

const queuedDip = (ms: number): QueuedMove =>
  ({ tableId: TABLE, author: ME, kind: 'dip', id: 9, ms, amount: 1 } as QueuedMove);

/* ── 1. THE HAPPY PATH IS SILENT ───────────────────────────────────────── */
{
  const out = dipsUnpaid([dip(1000, 250_000)], foldWith([{ ms: 1000, outcome: 'dipped' }]), [], NOW);
  check('a dip the fold agrees with is not reported', out.length === 0, out);
}

/* ── 2. THE FOLD REFUSED SOMETHING THE CLIENT CREDITED ─────────────────── */
{
  const out = dipsUnpaid([dip(1000, 250_000)],
    foldWith([{ ms: 1000, outcome: 'rejected-duplicate' }]), [], NOW);
  check('a rejected dip is reported', out.length === 1, out);
  check('...with the fold\'s own reason', out[0]?.verdict === 'rejected-duplicate', out[0]);
  check('...and what the player was told it paid', out[0]?.credited === 250_000, out[0]);
}

/* ── 3. VANISHED — SUBMITTED, LOST, EXPIRED ────────────────────────────── */
{
  // Not in the fold, not in the queue: the shape of a move that was sent, never
  // landed, and had its credit deleted by the TTL. This is the one that cost
  // real crumbs on 2026-08-04.
  const out = dipsUnpaid([dip(1000, 250_000)], foldWith([]), [], NOW);
  check('a dip that left the queue without reaching the fold is reported',
    out.length === 1 && out[0].verdict === 'vanished', out);
}

/* ── 4. STILL IN FLIGHT IS NOT AN ANOMALY ──────────────────────────────── */
{
  const fresh = dipsUnpaid([dip(1000, 250_000, { at: NOW - 10_000 })], foldWith([]), [queuedDip(1000)], NOW);
  check('a dip still queued and still young is NOT reported', fresh.length === 0, fresh);

  const old = dipsUnpaid([dip(1000, 250_000, { at: NOW - 300_000 })], foldWith([]), [queuedDip(1000)], NOW);
  check('...but one queued for minutes is, as `stuck`',
    old.length === 1 && old[0].verdict === 'stuck', old);
  check('...reporting how long it has waited', typeof old[0]?.queuedForMs === 'number', old[0]);
}

/* ── 5. THINGS THAT PAY NOTHING ON PURPOSE ARE NOT ANOMALIES ───────────── */
{
  // A chip fed to a vendor forfeits its pot BY DESIGN — route 'jar', no dip
  // posted, nothing to join to. Reporting these would bury the real ones, and
  // I misread exactly this as destroyed crumbs earlier the same night.
  const fed = dipsUnpaid([dip(null, 0, { route: 'jar', credited: 0 })], foldWith([]), [], NOW);
  check('a chip fed to a vendor is not reported', fed.length === 0, fed);

  const boss = dipsUnpaid([dip(null, 0, { route: 'boss', credited: 0 })], foldWith([]), [], NOW);
  check('a chip fed to a boss is not reported', boss.length === 0, boss);

  // An honest full spill on a brim-full bowl: the client SAID it paid nothing.
  const spilled = dipsUnpaid([dip(1000, 0, { credited: 0, spilled: 250_000, room: 0 })], foldWith([]), [], NOW);
  check('an honest full spill is not reported', spilled.length === 0, spilled);
}

/* ── 6. SAFE BEFORE THE FIRST FOLD ─────────────────────────────────────── */
{
  check('no fold yet means nothing to disagree with',
    dipsUnpaid([dip(1000, 250_000)], null, [], NOW).length === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
