/**
 * Verifies the per-tide summary (`state.lastTide`) that powers the end-of-round
 * report: decay counts, per-owner territory/points deltas, and season crowns.
 * Run with: npx tsx src/lib/reefEngine.tide.test.ts
 *
 * The tide is driven by REEF ACTIVITY: every EPOCH_MOVES well-formed moves ticks
 * one epoch (decay → regen → scoring). We advance the tide with `filler` moves —
 * parseable-but-inert `tend 0 0` on empty water (rejected, but they still count
 * toward the epoch clock) — so a test can tick K epochs with 8·K moves.
 */
import { foldReef, EPOCH_MOVES, MAX_VITALITY, type ReefHeader } from './reefEngine';

const H: ReefHeader = { v: 1, kind: 'reef', founder: 'F', w: 12, h: 12, created: 0 };
const A = 'aaaa000000000000';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}
const reply = (author: string, body: string, block_height: number | null, content_id: string, created_at: number) =>
  ({ author_id: author, body, block_height, content_id, created_at });

// Inert well-formed moves that only advance the epoch clock (tend on empty water).
const fillers = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    reply('ffff' + (i % 3), `tend 0 0 x#${2000 + i}~f`, 10, `f_${String(i).padStart(4, '0')}`, 2000 + i)
  );
// A seeds (5,5) as move #1 (earliest created_at), then K·EPOCH_MOVES total moves → K ticks.
const foldTicks = (k: number) =>
  foldReef(H, [reply(A, 'grow 5 5', 10, 'c_seed', 1000), ...fillers(k * EPOCH_MOVES - 1)]);

// ── 1) one quiet tide: the seeded cell survives, decays by 1, banks its vitality
{
  const s = foldTicks(1);
  const t = s.lastTide!;
  check('quiet: a tide summary exists', !!t, t);
  check('quiet: epoch is 1', t.epoch === 1, t.epoch);
  check('quiet: nothing decayed reef-wide', t.decayedGlobal === 0, t.decayedGlobal);
  check('quiet: one survivor reef-wide', t.survivorsGlobal === 1, t.survivorsGlobal);
  const mine = t.byOwner.get(A)!;
  check('quiet: territory held 1 → 1', mine.territoryBefore === 1 && mine.territoryAfter === 1, mine);
  check('quiet: vitality 6 → 5 (one decay)', mine.vitalityBefore === MAX_VITALITY && mine.vitalityAfter === MAX_VITALITY - 1, mine);
  check('quiet: banked the surviving vitality (5)', mine.pointsBanked === MAX_VITALITY - 1, mine.pointsBanked);
  check('quiet: no season crowned', t.crownedSeason === null, t.crownedSeason);
}

// ── 2) decay claims coral: a lone untended cell dies on the 6th tide
{
  const s = foldTicks(MAX_VITALITY); // 6 ticks
  const t = s.lastTide!;
  check('decay: final tide is epoch 6', t.epoch === MAX_VITALITY, t.epoch);
  check('decay: the tide claimed 1 coral reef-wide', t.decayedGlobal === 1, t.decayedGlobal);
  check('decay: no survivors left', t.survivorsGlobal === 0, t.survivorsGlobal);
  const mine = t.byOwner.get(A)!;
  check('decay: territory 1 → 0', mine.territoryBefore === 1 && mine.territoryAfter === 0, mine);
  check('decay: banked 0 on the tide it died', mine.pointsBanked === 0, mine.pointsBanked);
  check('decay: cell truly gone from the grid', s.cells.size === 0, s.cells.size);
}

// ── 3) season crown surfaces in the tide that closes a season (epoch 5)
{
  const s = foldTicks(5); // 5 ticks → season 0 closes
  const t = s.lastTide!;
  check('crown: final tide is epoch 5', t.epoch === 5, t.epoch);
  check('crown: a season closed this tide', t.crownedSeason !== null, t.crownedSeason);
  check('crown: season index 0', t.crownedSeason?.index === 0, t.crownedSeason);
  check('crown: A is the champion', t.crownedSeason?.winner === A, t.crownedSeason);
  // banked 5+4+3+2+1 = 15 over the five tides, then the season resets the tally.
  check('crown: champion points == 15', t.crownedSeason?.points === 15, t.crownedSeason?.points);
  const mine = t.byOwner.get(A)!;
  check('crown: season tally reset to 0 after close', mine.seasonPointsAfter === 0, mine.seasonPointsAfter);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
