/**
 * THE CONFIRMATION MUST NAME WHAT THE TIP TAKES.
 *
 * 2026-08-04: twelve tips on one table, three inside ninety minutes, surprised
 * by the reset every time, once "i did not tip". The mechanic is right; the
 * confirmation was not. See tipLedger.ts's header for the three losses the old
 * ledger never mentioned and the one number it stated wrongly.
 *
 * The load-bearing test is section 4: it TIPS A REAL FOLDED STATE and diffs
 * what moved, so the receipt is pinned to `foldChips`'s own tip verb rather
 * than to my reading of it. Add a reset to the fold and this fails until
 * someone decides, out loud, whether the player is told about it.
 *
 * Run: npx tsx src/lib/tipLedger.test.ts
 */
import { foldChips, saltFor, type ChipsHeader, type ChipsReply, type ChipsState } from './chipsEngine';
import { tipReceipt, tipCommitReady, TIP_ARM_DEAD_MS } from './tipLedger';
import { UPGRADES, CRUMBS_PER_CHIP, bossHp, deepBandFloor } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const HEADER = { v: 1, kind: 'chips-table', name: 't', owner: ME } as ChipsHeader;
let n = 0;
const reply = (body: string): ChipsReply => ({
  content_id: `c${++n}`, author_id: ME, body: `${body}#${1700000000000 + n * 1000}~`,
  created_at: 1700000000000 + n * 1000, block_height: 1,
} as ChipsReply);
const fold = (rs: ChipsReply[]) => foldChips(HEADER, 'T', rs, new Map());

/* A run with something in every bucket the tip clears: crumbs, jars, lifetime,
   bands broken, and a fight half-way through the next one. Deep enough that
   band 2 is legal, so `bossDamage` can be non-zero while bands are already
   down — which is the exact shape of the state the operator kept losing. */
const LIFE = deepBandFloor(2) * 4;
function richRun(): ChipsReply[] {
  return [
    reply(`dip ${LIFE * CRUMBS_PER_CHIP}`),
    reply('buy season1'),
    reply('buy airtight'),
    reply('broke'),                          // porcelain -> broken 1, +1 char
    reply(`broke ${bossHp(1)}`),             // the table gives -> broken 2, +2 char
    reply('broke 1000'),                     // a blow on band 2, not a kill
  ];
}
/* The same run, plus THE CRACK — bought with the char the porcelain minted. */
function crackRun(): ChipsReply[] {
  return [...richRun(), reply('spend crack 1')];
}

/* ── 1. THE THREE THE OLD LEDGER NEVER SAID ─────────────────────────────── */
{
  const s = fold(richRun());
  check('the fixture really has bands broken', s.broken >= 2, s.broken);
  check('the fixture really is mid-fight', s.bossDamage > 0, s.bossDamage);
  check('the fixture really has lifetime', s.lifetimeChips > 0, s.lifetimeChips);

  const r = tipReceipt(s, s.crumbs, undefined, 'Queso');
  check('the receipt names the bands broken', r.bandsBroken === s.broken, r.bandsBroken);
  check('the receipt names the damage on the live fight', r.bossDamage === s.bossDamage, r.bossDamage);
  check('the receipt names the lifetime', r.lifetimeChips === s.lifetimeChips, r.lifetimeChips);
  check('the receipt names the salt it pays', r.saltGained === saltFor(s.lifetimeChips), r.saltGained);
  check('and the salt afterwards', r.saltAfter === s.oldSalt + r.saltGained, r.saltAfter);
}

/* ── 2. THE JAR COUNT REACTS TO THE PICKER ──────────────────────────────── */
/* The old ledger said "all N jars you have bought" four lines above a picker
   that chose one to save, and never changed when it was used. Every one of the
   twelve tips on chain carries a keep, so this line was wrong every time. */
{
  const withCrack = fold(crackRun());
  const jars = withCrack.owned.size;
  check('the fixture owns jars', jars >= 2, jars);
  check('and owns THE CRACK', withCrack.charOwned.has('crack'), [...withCrack.charOwned]);

  const none = tipReceipt(withCrack, 0, undefined, 'Queso');
  check('keeping nothing loses every jar', none.jarsLost === jars, none.jarsLost);
  check('and names no survivor', none.keptLabel === null, none.keptLabel);

  const one = tipReceipt(withCrack, 0, 'season1', 'Queso');
  check('keeping one loses one fewer', one.jarsLost === jars - 1, one.jarsLost);
  check('and names the survivor', one.keptLabel === UPGRADES.season1.label, one.keptLabel);
}

/* ── 3. THE RECEIPT CANNOT PROMISE A KEEP THE FOLD WILL DROP ────────────── */
/* The fold honours a keep only when the jar is asked for AND `crack` is owned
   AND the jar is owned. A receipt that used a laxer test would advertise a
   survivor that the chain then eats — a NEW way to be surprised by a tip. */
{
  const noCrack = fold(richRun());
  check('this fixture has no crack', !noCrack.charOwned.has('crack'));
  const r = tipReceipt(noCrack, 0, 'season1', 'Queso');
  check('without the ability nothing is kept', r.keptLabel === null, r.keptLabel);
  check('...and every jar is counted lost', r.jarsLost === noCrack.owned.size, r.jarsLost);

  const withCrack = fold(crackRun());
  const unowned = tipReceipt(withCrack, 0, 'bowl3', 'Queso');
  check('a jar you do not own is not kept', unowned.keptLabel === null, unowned.keptLabel);
  check('...and does not shrink the loss', unowned.jarsLost === withCrack.owned.size, unowned.jarsLost);
}

/* ── 4. PINNED TO THE FOLD: EVERY LOSS IS EITHER NAMED OR WAIVED ────────── */
/* Tip a real state and diff it. Anything the fold takes away must appear on
   the receipt, or be listed below with the reason it does not need to. */
{
  const before = fold(crackRun());
  const after = fold([...crackRun(), reply('tip season1')]);
  check('the tip actually landed', after.tips === before.tips + 1, [before.tips, after.tips]);
  const receipt = tipReceipt(before, before.crumbs, 'season1', 'Queso');

  /** Everything the tip took: numbers reduced, Sets shrunk, flags dropped. */
  const shrank: string[] = [];
  for (const k of Object.keys(before) as (keyof ChipsState)[]) {
    const b = before[k]; const a = after[k];
    if (typeof b === 'number' && typeof a === 'number' && a < b) shrank.push(k);
    else if (b instanceof Set && a instanceof Set && a.size < b.size) shrank.push(k);
    else if (b === true && a === false) shrank.push(k);
  }
  check('the diff found the losses at all', shrank.length >= 5, shrank);

  /* State field -> the RECEIPT FIELD that names it. Checked against the real
     receipt object below, so deleting a field from `TipReceipt` fails here as
     well as at `tsc` — which is the point: the old ledger's sin was omission. */
  const NAMED: Record<string, keyof typeof receipt> = {
    crumbs: 'crumbs',
    lifetimeChips: 'lifetimeChips',
    broken: 'bandsBroken',
    bossDamage: 'bossDamage',
    owned: 'jarsLost',
    dipIndex: 'depthLabel',
  };
  /* Not named, each with the reason it does not need to be. A field arriving
     in `shrank` without an entry in either table is exactly what this section
     exists to catch — a new reset in the tip verb that nobody is told about. */
  const WAIVED: Record<string, string> = {
    bossHpFrozen: 'the fight’s target, not a possession — bossDamage is the loss that is felt',
    crispest: 'a within-bowl personal best; no rule reads it and nothing spends it',
    bowlCap: 'an effect OF the jars; the jar line already covers it',
    seasoningNum: 'an effect OF the jars',
    seasoningDen: 'an effect OF the jars (a denominator — it only moves with seasoningNum)',
    fryers: 'an effect OF the jars',
    goldenBits: 'an effect OF the jars',
    airtight: 'an effect OF the jars',
    sogBonus: 'an effect OF the jars',
    doubleDipMod: 'an effect OF the jars',
    declined: 'refused jars becoming buyable again is a GAIN, not a loss',
  };

  for (const k of shrank) {
    const field = NAMED[k];
    if (field !== undefined) {
      check(`the fold takes '${k}' and receipt.${String(field)} says so`,
        field in receipt && receipt[field] !== undefined, { field, receipt });
    } else {
      check(`the fold takes '${k}' — waived, with a reason`,
        WAIVED[k] !== undefined, { field: k, took: shrank });
    }
  }

  /* The three the old ledger never mentioned. Assert the CLASSIFICATION, so
     nobody quietly demotes one to a waiver and calls it a cleanup. */
  for (const k of ['broken', 'lifetimeChips', 'owned']) {
    check(`'${k}' is NAMED, never waived`, NAMED[k] !== undefined && WAIVED[k] === undefined);
    check(`...and the fold really does take '${k}'`, shrank.includes(k), shrank);
  }
}

/* ── 5. THE KEPT JAR SURVIVES THE REAL TIP, AS ADVERTISED ───────────────── */
{
  const base = crackRun();
  const before = fold(base);
  const r = tipReceipt(before, before.crumbs, 'season1', 'Queso');
  const after = fold([...base, reply('tip season1')]);
  check('the receipt promised a survivor', r.keptLabel === UPGRADES.season1.label, r.keptLabel);
  check('and the chain kept exactly it', after.owned.has('season1') && after.owned.size === 1,
    [...after.owned]);
  check('the receipt’s jarsLost matches what actually went',
    r.jarsLost === before.owned.size - after.owned.size, [r.jarsLost, before.owned.size, after.owned.size]);
  check('and the salt it promised is the salt paid',
    r.saltAfter === after.oldSalt, [r.saltAfter, after.oldSalt]);
}

/* ── 6. THE DEAD BEAT ───────────────────────────────────────────────────── */
/* Two taps is what a tap-stream produces by accident, and the twelve tips were
   two taps. The commit refuses to fire until the receipt has been on screen
   long enough to read — long enough that a double-tap cannot outlast it. */
{
  check('nothing armed never fires', !tipCommitReady(null, 1_000_000));
  check('the instant it arms it is inert', !tipCommitReady(1_000_000, 1_000_000));

  /* A fast double-tap. 300ms is a slow one — the OS threshold is ~250-300ms —
     and it must still be refused. */
  check('a 300ms double-tap is refused', !tipCommitReady(1_000_000, 1_000_300));
  check('one millisecond short is still refused',
    !tipCommitReady(1_000_000, 1_000_000 + TIP_ARM_DEAD_MS - 1));
  check('the dead beat outlasts any double-tap', TIP_ARM_DEAD_MS > 300, TIP_ARM_DEAD_MS);

  check('a read receipt commits', tipCommitReady(1_000_000, 1_000_000 + TIP_ARM_DEAD_MS));
  check('and stays committable after', tipCommitReady(1_000_000, 1_000_000 + 10_000));

  /* Not a nag: a person who has read six numbers has already waited it out. */
  check('the beat is under a second', TIP_ARM_DEAD_MS <= 1000, TIP_ARM_DEAD_MS);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
