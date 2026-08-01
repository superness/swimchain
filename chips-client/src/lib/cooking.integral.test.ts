/**
 * A chip's pot — and therefore every amount the client declares on the chain —
 * is a whole number of crumbs. Regression for the 2026-08-01 stranded dip:
 * the overcook burn (`grown * OVERCOOK_DRAIN`) made the pot fractional, the
 * fractional worth reached the queue as a dip amount, `dipBody` refused it
 * (correctly — the wire grammar is integers), and `submittable` then filtered
 * the entry out of every send forever, with no error and no notice. A real
 * player's 281,793-crumb dip (report 4a713fe4-27612, part 3/3: pot
 * 17612.07666292773 after overcooking, crackles 4) was earned, displayed as a
 * flourish, and never paid.
 *
 * Three layers, each pinned here:
 *   1. tickChip never emits a fractional pot (the burn rounds UP — a burn is
 *      never free — and a legacy fractional pot self-heals on its next tick);
 *   2. worthOf floors, so even a fractional pot already sitting on a persisted
 *      rack yields an integral, submittable amount;
 *   3. loadQueue REPAIRS a persisted fractional dip/broke amount by flooring
 *      it, instead of dropping the row (dropping is how the real dip above
 *      became unrecoverable: the row was purged on the next reload).
 *
 * Run: npx tsx src/lib/cooking.integral.test.ts
 */
import { freshChip, tickChip, worthOf, TICK_CRUMBS } from './cooking';
import { loadQueue, saveQueue, clearQueue, type QueuedMove } from './chipsQueue';
import { planSend } from './chipsSender';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const never = () => 1; // rng that never crackles

// ---------------------------------------------------------------------------
// 1) The burn keeps the pot integral.
{
  const lit = tickChip(freshChip(1), 1, 1, never, { overcook: true });
  check('a lit tick leaves an integral pot', Number.isSafeInteger(lit.chip.pot), lit.chip.pot);
  check('a lit tick reports an integral burn', Number.isSafeInteger(lit.burned), lit.burned);
  check('a lit tick still burns something', lit.burned >= 1, lit.burned);
  check('the books balance: pot + burned = gain', lit.chip.pot + lit.burned === TICK_CRUMBS,
    { pot: lit.chip.pot, burned: lit.burned });

  // Long soak: many lit ticks in a row never drift off the integers. This is
  // the real player's shape — the stranded chip cooked 242.5s lit.
  let chip = freshChip(1);
  for (let i = 0; i < 200; i++) chip = tickChip(chip, 2, 1, never, { overcook: true }).chip;
  check('200 lit ticks stay integral', Number.isSafeInteger(chip.pot), chip.pot);
}

// 2) A legacy fractional pot (persisted rack from before this fix) self-heals
//    on its next tick, lit or not.
{
  const legacy = { ...freshChip(1), pot: 17612.07666292773 };
  const cold = tickChip(legacy, 1, 1, never);
  check('an unlit tick heals a legacy fractional pot', Number.isSafeInteger(cold.chip.pot), cold.chip.pot);
  const lit = tickChip(legacy, 1, 1, never, { overcook: true });
  check('a lit tick heals a legacy fractional pot', Number.isSafeInteger(lit.chip.pot), lit.chip.pot);
}

// 3) worthOf floors: the seam every dip/broke amount crosses. Exact values
//    from the stranded dip — pot 17612.07666292773 at crackles 4 must submit
//    as 281793, not 281793.2266068437.
{
  const w = worthOf({ pot: 17612.07666292773, crackles: 4 });
  check('worthOf floors the stranded chip to 281793', w === 281793, w);
  check('worthOf leaves integral pots exact', worthOf({ pot: 4500, crackles: 2 }) === 18000);
}

// 4) The exact stranded queue row, end to end: persisted with the fractional
//    amount, it must load floored and PLAN — planSend must produce the dip
//    body the fold can credit, not silently filter the row out.
type GlobalWithStorage = Omit<typeof globalThis, 'localStorage'> & { localStorage?: Storage };
function installFakeStorage(): () => void {
  const data = new Map<string, string>();
  const fake: Storage = {
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
  const g = globalThis as GlobalWithStorage;
  const hadOwn = Object.prototype.hasOwnProperty.call(g, 'localStorage');
  const prev = g.localStorage;
  g.localStorage = fake;
  return () => {
    if (hadOwn) g.localStorage = prev;
    else delete g.localStorage;
  };
}

const TABLE = 'sha256:99bc765fd4341b938d5e39f810a059a419e9e3e396ca62a519525fb56a19e967';
const ME = '4a713fe44cffa01ed0b683ee5ca6b2de2523131ca22cfe75b710fc0343c49df6';

const uninstall = installFakeStorage();
try {
  clearQueue();
  // Written raw, not via saveQueue: this is the on-disk shape a pre-fix
  // session actually left behind.
  globalThis.localStorage!.setItem('chips.queue.v1', JSON.stringify([
    { id: 17, tableId: TABLE, author: ME, kind: 'dip', amount: 281793.2266068437, ms: 1785545512542 },
    { id: 18, tableId: TABLE, author: ME, kind: 'broke', paid: 1234.5678, ms: 1785545512543 },
  ]));
  const q = loadQueue();
  check('the stranded dip row survives the load', q.some((m) => m.id === 17), q.map((m) => m.id));
  const dip = q.find((m) => m.id === 17);
  check('its amount is floored on load', dip?.kind === 'dip' && dip.amount === 281793,
    dip && 'amount' in dip ? dip.amount : dip);
  const broke = q.find((m) => m.id === 18);
  check('a fractional broke paid is floored on load', broke?.kind === 'broke' && broke.paid === 1234,
    broke && 'paid' in broke ? broke.paid : broke);

  const plan = planSend([q.find((m) => m.id === 17) as QueuedMove], TABLE, ME, Date.now());
  check('the repaired dip is PLANNED, not filtered', plan !== null);
  check('and its body is the one the fold can credit',
    plan?.body === 'dip 281793#1785545512542~', plan?.body);

  // Round-trip: a repaired row must persist repaired.
  saveQueue(q);
  const q2 = loadQueue();
  const dip2 = q2.find((m) => m.id === 17);
  check('the repair survives a save/load round trip', dip2?.kind === 'dip' && dip2.amount === 281793);

  // Truly corrupt rows are still dropped, not "repaired" into something
  // submittable: NaN/Infinity amounts have no honest floor.
  globalThis.localStorage!.setItem('chips.queue.v1', JSON.stringify([
    { id: 19, tableId: TABLE, author: ME, kind: 'dip', amount: null, ms: 1785545512544 },
    { id: 20, tableId: TABLE, author: ME, kind: 'dip', amount: -5.5, ms: 1785545512545 },
  ]));
  const q3 = loadQueue();
  check('a null amount is still dropped', !q3.some((m) => m.id === 19), q3.map((m) => m.id));
  check('a negative amount is still dropped', !q3.some((m) => m.id === 20), q3.map((m) => m.id));
} finally {
  clearQueue();
  uninstall();
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
