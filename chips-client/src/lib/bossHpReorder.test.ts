/**
 * A BEATEN BOSS MUST STAY BEATEN WHEN A PENDING DIP CONFIRMS.
 *
 * Operator, 2026-08-04, diagnosing it himself from the symptom: "if it changed
 * its mind about 'first hit lifetime chips' then it could 'reset'... so a bug
 * around *beat the boss* -> *reset lifetime check*". He was right.
 *
 * `bossHpFrozen` is frozen at the fight's FIRST BLOW from `lifetimeChips` as of
 * that point in the fold — but "as of that point" depends on reply ORDER, and
 * order is not stable across confirmation:
 *
 *     const ah = a.r.block_height ?? Number.MAX_SAFE_INTEGER;   // orderReplies
 *
 * A pending reply has no block_height, so it sorts LAST — after the blow. When
 * it confirms it gets a real height and jumps to BEFORE the blow. Same moves,
 * different lifetime at the freeze, different bar. Damage that felled the band
 * optimistically no longer reaches the confirmed bar, so the band un-breaks and
 * the fight restarts at 0 — with a LARGER bar than the player was just shown.
 *
 * This is the same family as the growing-lifetime bug that `bossHpFrozen` was
 * introduced to fix (see bossHealth.test.ts). Freezing the bar stopped it
 * moving DURING a fight; it did not stop the freeze POINT from moving.
 *
 * Run: npx tsx src/lib/bossHpReorder.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { deepBandFloor, CRUMBS_PER_CHIP } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const HEADER = { v: 1, kind: 'chips-table', name: 't', owner: ME } as ChipsHeader;
const fold = (rs: ChipsReply[]) => foldChips(HEADER, 'T', rs, new Map());

const T0 = 1700000000000;
/** A reply that IS in a block. */
const confirmed = (body: string, ms: number, h: number, cid: string): ChipsReply => ({
  content_id: cid, author_id: ME, body: `${body}#${ms}~`, created_at: ms, block_height: h,
} as ChipsReply);
/** The SAME move while still in flight: no block_height. */
const pending = (body: string, ms: number, cid: string): ChipsReply => ({
  content_id: cid, author_id: ME, body: `${body}#${ms}~`, created_at: ms, block_height: null,
} as ChipsReply);

/* Deep enough that band 1 is legal with room to spare. */
const LIFE = deepBandFloor(1) * 3;

/* The run: get past the porcelain, then fight the table. The LAST dip is the
   one whose confirmation state we vary — everything else is identical. */
const base = (): ChipsReply[] => [
  confirmed(`dip ${LIFE * CRUMBS_PER_CHIP}`, T0 + 1000, 10, 'c1'),
  confirmed('broke', T0 + 2000, 11, 'c2'),                    // band 0 falls
];
const LATE_DIP_MS = T0 + 3000;   // authored BEFORE the blow
const BLOW_MS     = T0 + 4000;

/* Size the blow to the bar the player was SHOWN — i.e. the optimistic one. */
function barWhenPending(): number {
  const st = fold([...base(), pending(`dip ${LIFE * CRUMBS_PER_CHIP}`, LATE_DIP_MS, 'p1'),
                   confirmed('broke 1', BLOW_MS, 12, 'c3')]);
  return st.bossHpFrozen || 0;
}

/* ── 1. THE BAR THE PLAYER SEES vs THE BAR THAT GETS SCORED ────────────── */
{
  const dipBody = `dip ${LIFE * CRUMBS_PER_CHIP}`;
  const asPending = fold([...base(), pending(dipBody, LATE_DIP_MS, 'p1'), confirmed('broke 1', BLOW_MS, 12, 'c3')]);
  const asConfirmed = fold([...base(), confirmed(dipBody, LATE_DIP_MS, 12, 'p1'), confirmed('broke 1', BLOW_MS, 13, 'c3')]);

  check('the same dip, pending vs confirmed, freezes THE SAME bar',
    asPending.bossHpFrozen === asConfirmed.bossHpFrozen,
    { pending: asPending.bossHpFrozen, confirmed: asConfirmed.bossHpFrozen });
}

/* ── 2. THE KILL IS TAKEN BACK ─────────────────────────────────────────── */
{
  const shownBar = barWhenPending();
  check('there is a bar to fight', shownBar > 0, shownBar);

  const dipBody = `dip ${LIFE * CRUMBS_PER_CHIP}`;
  // A blow that EXACTLY fells the bar the player was shown.
  const killer = `broke ${shownBar}`;

  const optimistic = fold([...base(), pending(dipBody, LATE_DIP_MS, 'p1'), confirmed(killer, BLOW_MS, 12, 'c3')]);
  check('ON SCREEN: the band gives', optimistic.broken === 2, optimistic.broken);
  check('...and the fight is over', optimistic.bossDamage === 0, optimistic.bossDamage);

  // Nothing changed but that dip landing in a block.
  const settled = fold([...base(), confirmed(dipBody, LATE_DIP_MS, 12, 'p1'), confirmed(killer, BLOW_MS, 13, 'c3')]);

  /* THE DEFECT, CLOSED. Before the fix these three read the other way: the
     band un-broke, damage restarted, and the bar came back larger than the one
     the player had just emptied. */
  check('AFTER IT CONFIRMS: the band is STILL BROKEN',
    settled.broken === 2, { broken: settled.broken });
  check('...the kill is not taken back', settled.bossDamage === 0, settled.bossDamage);
  check('...and the bar never moved', settled.bossHpFrozen === optimistic.bossHpFrozen,
    { optimistic: optimistic.bossHpFrozen, settled: settled.bossHpFrozen });
}

console.log(failures === 0
  ? '\nALL PASS — the reorder no longer moves the bar'
  : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
