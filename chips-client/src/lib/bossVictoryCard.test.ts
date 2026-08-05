/**
 * THE VICTORY CARD MUST NAME THE BOSS THAT DIED.
 *
 * Reported 2026-08-04 by the operator, twice, with total certainty: "I just
 * beat the chip from 1974 but it's just back to 0 dmg to it making me fight it
 * again" / "I definitely beat chip 1974 dude". The chain disagreed — the band
 * that fell at 01:52:35 UTC was band 1, THE TABLE (`deepest: 2`, and band 2 had
 * never been broken in nine bowls). Both were right: the SCREEN said "THE CHIP
 * FROM 1974 GIVES".
 *
 * The trap is ordering. The winning blow enqueues a `broke`; the optimistic
 * fold applies it immediately; `state.broken` advances; and the card — drawn
 * from `fightAt(state.broken, …)` — describes the band you have just ARRIVED
 * at, not the one you killed. The fresh 0/131B bar under that headline then
 * reads as the kill being taken back, which is precisely how it was reported.
 *
 * So the card cannot be a function of live state. This file pins the ordering
 * fact that makes that true; App.tsx freezes the fallen fight (`deepBrokeFight`)
 * at the winning blow and renders THAT for the celebration.
 *
 * Run: npx tsx src/lib/bossVictoryCard.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { fightAt } from './deepBoss';
import { flavourFor } from './bandFlavour';
import { bossHp, deepBandFloor, CRUMBS_PER_CHIP } from './chipsConst';

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

/* Deep enough that band 2 is also legal, so the fold really does walk on to it
   after band 1 gives — reproducing the operator's exact position. */
const LIFE = deepBandFloor(2) * 4;
const past0 = () => [reply(`dip ${LIFE * CRUMBS_PER_CHIP}`), reply('broke')];

/* ── 1. THE NAMES ARE THE ONES FROM THE REPORT ──────────────────────────── */
{
  check('band 1 is the table', flavourFor(1).boss === 'the table', flavourFor(1).boss);
  check('band 2 is the chip from 1974',
    flavourFor(2).boss === 'the chip from 1974', flavourFor(2).boss);
}

/* ── 2. THE WINNING BLOW ADVANCES THE BAND *BEFORE* ANYTHING IS DRAWN ───── */
{
  const before = fold(past0());
  const fightBefore = fightAt(before.broken, before.lifetimeChips, before.bossDamage, before.bossHpFrozen);
  check('you are fighting the table', fightBefore?.flavour.boss === 'the table', fightBefore?.flavour.boss);

  const hp = fightBefore!.hp;
  const after = fold([...past0(), reply(`broke ${hp}`)]);
  check('the blow fells it', after.broken === 2, after.broken);
  check('and the damage resets for what is under it', after.bossDamage === 0, after.bossDamage);

  /* THE BUG, STATED AS AN ASSERTION. Live state after the kill names the WRONG
     boss — so any card built from it lies. This is not a defect to fix in the
     engine (the fold is correct: you really are on band 2 now); it is the
     reason the card must be frozen. */
  const fightAfter = fightAt(after.broken, after.lifetimeChips, after.bossDamage, after.bossHpFrozen);
  check('live state now names the NEXT boss, not the dead one',
    fightAfter?.flavour.boss === 'the chip from 1974', fightAfter?.flavour.boss);
  check('...which is exactly the misreport: it is NOT what died',
    fightAfter?.flavour.boss !== fightBefore?.flavour.boss);

  /* THE FIX: the card is the frozen pre-kill fight, so it names the table. */
  const frozen = { ...fightBefore!, done: fightBefore!.hp, left: 0, frac: 1 };
  check('the frozen card names the boss that GAVE', frozen.flavour.boss === 'the table', frozen.flavour.boss);
  check('and it shows a FULL bar, not a fresh one', frozen.frac === 1 && frozen.left === 0, frozen);
  check('and it is not the next band', frozen.band === 1, frozen.band);
}

/* ── 3. A KILL MUST NOT VANISH WHEN THE NEXT BAND IS OUT OF REACH ───────── */
{
  // Deep enough for band 1 and no further: the classic case, since the floor
  // doubles every band. `fightAt` returns null for band 2 here, so a card drawn
  // from live state unmounts mid-celebration and the kill is never announced.
  const life = deepBandFloor(1);
  const shallow = () => [reply(`dip ${life * CRUMBS_PER_CHIP}`), reply('broke')];
  const before = fold(shallow());
  const fightBefore = fightAt(before.broken, before.lifetimeChips, before.bossDamage, before.bossHpFrozen);
  check('the table is fightable at its own floor', fightBefore !== null);

  const after = fold([...shallow(), reply(`broke ${bossHp(1)}`)]);
  check('it gives', after.broken === 2, after.broken);
  const fightAfter = fightAt(after.broken, after.lifetimeChips, after.bossDamage, after.bossHpFrozen);
  check('but there is NO live fight to draw the card from', fightAfter === null, fightAfter);

  const frozen = { ...fightBefore!, done: fightBefore!.hp, left: 0, frac: 1 };
  check('the frozen card still exists to announce the kill', frozen.flavour.boss === 'the table');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
