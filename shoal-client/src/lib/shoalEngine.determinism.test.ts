/**
 * Determinism and equilibrium. Run: npx tsx src/lib/shoalEngine.determinism.test.ts
 *
 * These are the release blockers. A recorded session must replay identically,
 * and the turtled-ball equilibrium must be demonstrably absent — including a
 * control run proving the test can actually detect it.
 */
import { foldShoal, rollEpoch } from './shoalEngine';
import { richSession, fingerprint } from './shoalFixtures';
import type { LogEntry, Presence, ShoalState, Checkpoint } from './shoalTypes';
import { cellCentre } from './bloom';
import {
  START_SIZE, MIN_SIZE, TICK_MS, HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, BITE_GROWTH,
  TENSION_NEUTRAL, TENSION_TRIGGER, HUSH_MS, MAX_TAKE, EPOCH_MS, CORE_R2,
  PRESENCE_TTL_MS, BLOOM_READY_MS,
} from './shoalConst';
import { epochOf, epochStartMs, epochWarmStartMs, epochFoldEndMs } from './epoch';
import { serialiseCheckpoint } from './checkpoint';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Deterministic pseudo-random, seeded — the wall-clock RNG is banned in this engine. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1_664_525 + 1_013_904_223) >>> 0; return s; };
}

/** Build a reproducible session of `n` swimmers milling about. */
function session(n: number, durationMs: number): LogEntry[] {
  const rnd = lcg(20260727);
  const out: LogEntry[] = [];
  for (let i = 0; i < n; i++) {
    const id = `f${String(i).padStart(2, '0')}`;
    for (let t = 0; t < durationMs; t += 5_000) {
      const p: Presence = {
        kind: 'presence', id, ms: t, hash: `${id}-${t}`,
        vec: {
          x: 1_000 + (rnd() % 800), y: 1_000 + (rnd() % 800),
          heading: rnd() % 256, speed: rnd() % 80, t,
        },
      };
      out.push(p);
    }
  }
  return out;
}

// --- Replay ----------------------------------------------------------------
{
  const log = session(12, 120_000);
  const a = foldShoal(log, 120_000);
  const b = foldShoal(log, 120_000);
  check('the same log folds to the same state twice', fingerprint(a) === fingerprint(b));

  // Task 3 (spec 3.9): every fold in this file now defaults to a tick origin
  // of epochStartMs(epochOf(untilMs)) instead of log[0].ms. None of the
  // untilMs values below (120_000 at most) are within EPOCH_MS (3_600_000) of
  // a boundary — they all land in epoch 0, whose start is ms 0, the same
  // origin as before — so every fingerprint in this file is unaffected by the
  // change. Asserted directly rather than left as unverified prose: epochOf
  // floors ms/EPOCH_MS, and 120_000 < EPOCH_MS, so epochOf(120_000) is 0 by
  // hand, not by reading the import.
  check('this file\'s untilMs values stay inside epoch 0, so the epoch-origin change does not move them',
    epochOf(120_000) === 0 && 120_000 < EPOCH_MS, { epochOf120k: epochOf(120_000), EPOCH_MS });
}
{
  // Delivery order differs between peers; the fold must not care.
  const log = session(12, 120_000);
  const shuffled = [...log];
  const rnd = lcg(99);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  check('a shuffled log folds to the same state',
    fingerprint(foldShoal(log, 120_000)) === fingerprint(foldShoal(shuffled, 120_000)));
}
{
  // No float leaked in: every size and position is an integer.
  const s = foldShoal(session(12, 120_000), 120_000);
  let allInt = true;
  for (const f of s.fish.values()) {
    if (!Number.isInteger(f.size) || !Number.isInteger(f.x) || !Number.isInteger(f.y)) allInt = false;
  }
  check('every folded value is an integer', allInt);
  check('tension is an integer', Number.isInteger(s.tension), s.tension);
}

// --- The turtle proof ------------------------------------------------------
{
  // Twenty fish pile into one spot and NEVER eat. Under hunger they must all
  // starve down toward the floor. If they hold their size, the permanent ball
  // is viable and the game has no engine.
  const log: LogEntry[] = [];
  for (let i = 0; i < 20; i++) {
    const id = `b${String(i).padStart(2, '0')}`;
    log.push({ kind: 'presence', id, ms: 0, hash: `${id}-0`,
      vec: { x: 1_000 + i, y: 1_000, heading: 0, speed: 0, t: 0 } });
    log.push({ kind: 'presence', id, ms: 40_000, hash: `${id}-1`,
      vec: { x: 1_000 + i, y: 1_000, heading: 0, speed: 0, t: 40_000 } });
  }
  const s = foldShoal(log, 80_000);

  // Independent expectation, computed by hand — deliberately NOT from the
  // live HUNGER_AMOUNT import. Task 8 Step 3 mutates HUNGER_AMOUNT to 0 in
  // shoalConst.ts to prove this test detects hunger being disabled. If
  // `expected` were derived from that same live import, the mutation would
  // cancel itself out here: `expected` would rise to 100 exactly as the
  // (now un-hungry) fish's actual size stays 100, and the comparison below
  // would keep passing even with the design's load-bearing rule gone. So the
  // arithmetic is pinned by hand to the real CONSENSUS numbers:
  //   80_000 / TICK_MS(250)               = 320 ticks
  //   320 / HUNGER_TICK_INTERVAL(4)       = 80 hunger-ticks
  //   80 hunger-ticks * HUNGER_AMOUNT(1)  = 80 lost
  //   max(MIN_SIZE(60), START_SIZE(100) - 80) = max(60, 20) = 60
  // The floor DOES bind (20 < 60) — the ball hits MIN_SIZE well before 80s
  // is up, not merely trending down from 100.
  const ticks = Math.floor(80_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const HAND_VERIFIED_HUNGER_AMOUNT = 1; // must equal the real HUNGER_AMOUNT; see comment above for why this is not the import
  const expected = Math.max(MIN_SIZE, START_SIZE - hungerTicks * HAND_VERIFIED_HUNGER_AMOUNT);

  let allStarved = true;
  for (const f of s.fish.values()) if (f.size !== expected) allStarved = false;
  check('an idle ball starves', allStarved, { expected, sizes: [...s.fish.values()].map((f) => f.size).slice(0, 4) });

  // Checked against the ACTUAL folded sizes, not against `expected` — this
  // way the check is a direct observation of the simulation (did anyone
  // really get smaller?) rather than a second comparison against the same
  // oracle used above, so it flips independently if hunger is neutered.
  let actuallyLostSize = true;
  for (const f of s.fish.values()) if (f.size >= START_SIZE) actuallyLostSize = false;
  check('the idle ball lost real size', actuallyLostSize,
    { sizes: [...s.fish.values()].map((f) => f.size).slice(0, 4), START_SIZE });

  // The ball must also be SAFE — that is the whole tension. Nobody is taken.
  check('a tight ball is never swept', s.lastTaken.length === 0, s.lastTaken);
}

// --- Control: the starve assertion is discriminating ------------------------
{
  // The starve check above is only meaningful if the expected value it
  // computes is actually reachable and actually different from "unchanged".
  // Assert the discriminating gap directly, so a constants change that
  // quietly made hunger a no-op fails HERE rather than passing silently.
  const ticks = Math.floor(80_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const loss = hungerTicks * HUNGER_AMOUNT;
  check('hunger over 80s is a nonzero loss', loss > 0, { loss, hungerTicks });
  check('that loss is large enough to be observable', loss >= 10, { loss });
  console.log('  note  Task 8 Step 3 mutates HUNGER_AMOUNT to 0 to confirm end to end');
}

// --- A session that actually drives the engine ------------------------------
//
// richSession() lives in shoalFixtures.ts (imported above) rather than being
// defined here: shoalEngine.incremental.test.ts needs the identical fixture,
// and it used to hold a hand-kept verbatim copy because importing from THIS
// file would execute (and then process.exit inside) the whole suite below as
// an import side effect. Its own doc comment explains the fixture's design.
const richLog = richSession();
const RICH_UNTIL_MS = 30_000;

// Hand arithmetic for the tension ramp. All 12 fish are stationary from t=0,
// so spreadPerMille is the SAME constant on every tick: 8 of the 12 fish
// (the outsiders) sit outside the core every tick, the cluster's 4 never do.
//   spreadPerMille = trunc(1000 * 8 / 12) = trunc(666.67) = 666
//   delta per tick  = 666 - TENSION_NEUTRAL(250) = 416
//   ticks to reach TENSION_TRIGGER(30000): ceil(30000 / 416) = 73
//   the trigger fires on the 73rd tick, i.e. at t = 72 * TICK_MS(250) = 18000
//   tension at that tick = 416 * 73 = 30368
//   the hush resolves HUSH_MS(8000) later: t = 18000 + 8000 = 26000
const spreadPerMilleHand = Math.trunc((1000 * 8) / 12);
const deltaHand = spreadPerMilleHand - TENSION_NEUTRAL;
const ticksToTrigger = Math.ceil(TENSION_TRIGGER / deltaHand);
const triggerAtMs = (ticksToTrigger - 1) * TICK_MS;
const tensionAtTrigger = deltaHand * ticksToTrigger;
const resolveAtMs = triggerAtMs + HUSH_MS;

{
  // Mid-fold, well before the trigger: tension is genuinely non-zero here —
  // unlike the old check above, which only ever observed a FINAL tension of
  // 0 and so passed trivially whether or not spreadPerMille's Math.trunc
  // was even present. k = 10000/TICK_MS + 1 ticks have run by t=10000 (the
  // tick at t=0 is the 1st), so tension = deltaHand * k.
  const checkpointMs = 10_000;
  const k = checkpointMs / TICK_MS + 1;
  const s = foldShoal(richLog, checkpointMs);
  check('tension mid-fold is a non-trivial, hand-derived integer',
    Number.isInteger(s.tension) && s.tension === deltaHand * k,
    { tension: s.tension, expected: deltaHand * k });
}
{
  // The trigger tick itself: the hush must start exactly here, not before
  // and not later.
  const s = foldShoal(richLog, triggerAtMs);
  check('tension reaches the hand-derived trigger value', s.tension === tensionAtTrigger, s.tension);
  check('the hush starts on the trigger tick', s.hushStartMs === triggerAtMs, s.hushStartMs);
}
{
  const s = foldShoal(richLog, RICH_UNTIL_MS);

  // Non-degeneracy first: the whole point of this fixture is that these are
  // NOT the inert defaults (-1, []) that session() left them at.
  check('a sweep actually resolved (not the inert default)',
    s.lastSweepMs >= 0 && s.lastTaken.length > 0, { lastSweepMs: s.lastSweepMs, lastTaken: s.lastTaken });
  check('the session credits at least one bite (not the inert default)',
    s.bitesTaken.size > 0, [...s.bitesTaken.entries()]);

  // Only once the session is confirmed non-degenerate do the precise,
  // hand-derived checks mean anything.
  check('the sweep resolves at the hand-derived tick', s.lastSweepMs === resolveAtMs, s.lastSweepMs);

  // All 8 outsiders are equally exposed (>=340cu from anyone, including each
  // other) and identical in size and time-outside (all present, stationary,
  // and outside the core from t=0 onward), so topContributor's ascending
  // scan over tied candidates keeps the first one it sees — the lowest id,
  // 'o0' — as preferred, and selectTaken's ordering (preferred first, then
  // descending size — tied — then ascending id) reduces to "the first
  // MAX_TAKE ids in ascending order."
  const expectedTaken = ['o0', 'o1', 'o2'].slice(0, MAX_TAKE);
  check('the sweep takes the hand-derived fish, not an arbitrary set',
    JSON.stringify(s.lastTaken) === JSON.stringify(expectedTaken), s.lastTaken);

  // The bloom: e0's single ms=0 bite must have credited (see richSession's
  // comment on why the fallow test passes and why the presence-before-eat
  // ordering is guaranteed).
  const eater = s.fish.get('e0')!;
  check('the eater carries a non-empty recentBites', eater.recentBites.length > 0, eater.recentBites);

  // NOT "size > START_SIZE" here: over a 30s fold, hunger claws back far
  // more than one BITE_GROWTH(12) ever added, so the eater ends up BELOW
  // START_SIZE despite having eaten — asserting otherwise would have been
  // exactly the "fit the expectation to whatever the code outputs" mistake
  // this plan warns against (an earlier draft of this check did exactly
  // that and failed here: actual was 83, not the assumed >100).
  //
  // The correct hand derivation: over [0, 30000] there are
  // floor(30000/TICK_MS(250)) + 1 = 121 fold ticks, so
  // floor(121 / HUNGER_TICK_INTERVAL(4)) = 30 hunger firings total. Exactly
  // ONE of those is ever exempted for e0: hunger only skips a fish within
  // HUNGER_TICK_INTERVAL*TICK_MS(1000)ms of its last bite, firings are
  // themselves spaced exactly 1000ms apart, so only the single firing
  // immediately after a bite can ever fall inside that window — the next
  // firing 1000ms later never does. e0 bit once, at ms=0, so 30 - 1 = 29
  // firings actually applied, each -HUNGER_AMOUNT(1).
  //   size = START_SIZE(100) + BITE_GROWTH(12) - 29 * HUNGER_AMOUNT(1) = 83
  const totalTicks = Math.floor(RICH_UNTIL_MS / TICK_MS) + 1;
  const totalHungerFirings = Math.floor(totalTicks / HUNGER_TICK_INTERVAL);
  const eaterExemptFirings = 1; // only the firing immediately after the bite; see comment above
  const eaterHungerLoss = (totalHungerFirings - eaterExemptFirings) * HUNGER_AMOUNT;
  const expectedEaterSize = START_SIZE + BITE_GROWTH - eaterHungerLoss;
  check('the eater ends the session at the hand-derived size (bite growth net of hunger)',
    eater.size === expectedEaterSize, { got: eater.size, expected: expectedEaterSize });
}
{
  // Growth from the bite IS real and immediate — check it before hunger has
  // had any chance to claw it back. Hunger fires at t = 750 + 1000k, so the
  // first firing at or after this fixture's t=0 lands at t=750; at t=500 none
  // has fired yet (the warm-up ticks before t=0 contain firings, but no fish
  // is alive during them — every entry in richLog is at ms=0), so the eater's
  // size is purely START_SIZE + BITE_GROWTH with nothing subtracted.
  const s = foldShoal(richLog, 500);
  check('the credited bite grows the eater before hunger claws anything back',
    s.fish.get('e0')!.size === START_SIZE + BITE_GROWTH, s.fish.get('e0')!.size);
}
// --- The input lock binds the PREFERRED TARGET, not just positions ----------
{
  // Spec 2.12 rule 2: "Resolution binds only on inputs timestamped at or
  // before the lock." Freezing positions is only half of it. The preferred
  // target comes from topContributor(bodies, outsideTicks), and outsideTicks
  // is an accumulator the fold rewrites on EVERY tick — including all sixteen
  // ticks of the dread window. A presence write authored after the lock can
  // therefore still reach the resolution through that map, and because
  // `preferred` jumps the queue in selectTaken it changes WHO IS TAKEN.
  //
  // Hand-derived timeline for richLog (all numbers re-derived above from the
  // constants, none read off the fold):
  //   hush starts   triggerAtMs                 = 18000
  //   input lock    18000 + LOCK_MS(4000)       = 22000
  //   resolution    18000 + HUSH_MS(8000)       = 26000  (= resolveAtMs)
  // 22250 is the first tick strictly after the lock (22250/TICK_MS = 89, so
  // it is a real tick), and it sits deep in the dread window.
  //
  // The post-lock writes move o0, o1 and o2 onto the cluster's coordinate,
  // which is the core centre — so from t=22250 those three read as INSIDE the
  // core and step 4 resets their outsideTicks to 0 on every later tick, while
  // o3..o7 keep accumulating. Their LOCKED positions are untouched, so all
  // eight are still exposed candidates at resolution.
  //
  // Correct (locked) answer: at t=22000 all eight outsiders are tied on
  // outside-ticks and tied on size (all present and stationary since t=0,
  // none has ever eaten), so topContributor keeps the first id it scans —
  // 'o0' — and selectTaken reduces to the first MAX_TAKE ids ascending:
  //   ['o0','o1','o2']
  // Live-accumulator (buggy) answer: at t=26000 o0/o1/o2 read 0 ticks and
  // o3..o7 read many, so preferred becomes the lowest of those, 'o3'; it
  // jumps the queue and the rest follow ascending:
  //   ['o3','o0','o1']
  // o2 is spared and o3 eaten purely on input the lock exists to exclude.
  const postLockMs = 22_250;
  const centre = cellCentre(367); // (1984, 1472) — the cluster's coordinate
  const swimIn: LogEntry[] = ['o0', 'o1', 'o2'].map((id) => ({
    kind: 'presence' as const, id, ms: postLockMs, hash: `${id}-swimin`,
    vec: { x: centre.x, y: centre.y, heading: 0, speed: 0, t: postLockMs },
  }));
  check('the post-lock writes land after the lock and before resolution',
    postLockMs > triggerAtMs + 4_000 && postLockMs < resolveAtMs && postLockMs % TICK_MS === 0,
    { postLockMs, lockAtMs: triggerAtMs + 4_000, resolveAtMs });

  const control = foldShoal(richLog, RICH_UNTIL_MS);
  const perturbed = foldShoal([...richLog, ...swimIn], RICH_UNTIL_MS);

  // Non-degeneracy: prove the post-lock writes actually landed, or the check
  // below would pass against a log the fold silently ignored.
  check('the post-lock writes really moved those fish',
    perturbed.fish.get('o0')!.x === centre.x && control.fish.get('o0')!.x !== centre.x,
    { perturbed: perturbed.fish.get('o0')!.x, control: control.fish.get('o0')!.x, centre: centre.x });

  check('a post-lock swim-in does not change who the sweep takes',
    JSON.stringify(perturbed.lastTaken) === JSON.stringify(['o0', 'o1', 'o2']),
    { got: perturbed.lastTaken, expected: ['o0', 'o1', 'o2'] });
  check('the post-lock fold takes the same fish as the untouched fold',
    JSON.stringify(perturbed.lastTaken) === JSON.stringify(control.lastTaken),
    { perturbed: perturbed.lastTaken, control: control.lastTaken });
}

{
  // The crucial one: shuffle the rich log and confirm the fold does not
  // care, now that the log actually exercises tension, the hush, the sweep
  // resolution and a bloom credit — not just presence dead-reckoning and
  // hunger, which is all session() above ever touched. If this diverges,
  // that is a real determinism bug in the fold and must be reported, not
  // papered over by loosening this check.
  const shuffled = [...richLog];
  const rnd = lcg(20260728);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const ordered = foldShoal(richLog, RICH_UNTIL_MS);
  const reshuffled = foldShoal(shuffled, RICH_UNTIL_MS);
  check('a shuffled RICH session folds to the same state as the ordered one',
    fingerprint(ordered) === fingerprint(reshuffled),
    { ordered: fingerprint(ordered), reshuffled: fingerprint(reshuffled) });
}

// --- The fingerprint must actually discriminate ------------------------------
{
  // Adding a field to the fingerprint is unfalsifiable decoration unless the
  // fingerprint provably changes when that field changes. Take a real folded
  // state, perturb exactly one field, and require the string to move. Deleting
  // any line from the fingerprint fails the matching check here.
  //
  // The checkpoint is t=24000: after the input lock (triggerAtMs 18000 +
  // LOCK_MS 4000 = 22000) and before resolution (18000 + HUSH_MS 8000 =
  // 26000), so the hush fields are populated rather than sitting at their
  // inert defaults of -1/null.
  const DREAD_MS = 24_000;
  const base = foldShoal(richLog, DREAD_MS);
  const baseline = fingerprint(base);

  check('the dread checkpoint is genuinely mid-hush with inputs already locked',
    base.hushStartMs === triggerAtMs && base.lockedPositions !== null
      && base.lockedPreferred === 'o0' && base.lastVisit.size > 0 && base.bloomSinceMs.size > 0,
    { hushStartMs: base.hushStartMs, triggerAtMs, locked: base.lockedPositions !== null,
      lockedPreferred: base.lockedPreferred, lastVisit: base.lastVisit.size,
      bloomSince: base.bloomSinceMs.size });

  const perturb = (field: string, mutate: (s: ReturnType<typeof foldShoal>) => void) => {
    const s = foldShoal(richLog, DREAD_MS);
    mutate(s);
    check(`the fingerprint notices a change to ${field}`, fingerprint(s) !== baseline, field);
  };
  perturb('lastVisit', (s) => { s.lastVisit.set(1, new Map([['zz', 1]])); });
  // ...and the INNER level too. `lastVisit` is a Map of Maps since the
  // claimant-exemption rule (bloom.ts), and a fingerprint that serialised only
  // the outer keys would pass the check above while missing a divergence in
  // WHO visited a cell — which is precisely what decides whether a claim
  // credits. Perturbing an existing cell rather than adding one keeps the
  // outer level byte-identical, so only the inner serialisation can catch it.
  perturb('lastVisit (a visitor added to an EXISTING cell)', (s) => {
    const cell = [...s.lastVisit.keys()].sort((a, b) => a - b)[0];
    s.lastVisit.get(cell)!.set('zz', 1);
  });
  perturb('bloomSinceMs', (s) => { s.bloomSinceMs.set(1, 1); });
  perturb('hushStartMs', (s) => { s.hushStartMs = 12_345; });
  perturb('lockedPositions', (s) => { s.lockedPositions!.set('zz', { x: 1, y: 2, size: 3 }); });
  perturb('lockedPreferred', (s) => { s.lockedPreferred = 'zz'; });
  perturb('departed', (s) => {
    s.departed.set('zz', { size: 1, lastScatterMs: -1, lastBiteMs: -1, recentBites: [] });
  });
  perturb('tension', (s) => { s.tension += 1; });
  perturb('bitesTaken', (s) => { s.bitesTaken.set(9_999, 1); });

  // And the mid-hush state must survive a shuffled delivery order too — the
  // ordered/shuffled comparison above only ever looked at t=30000, by which
  // point the hush has resolved and every hush field is back to its default.
  const shuffledDread = [...richLog];
  const rnd = lcg(20260729);
  for (let i = shuffledDread.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [shuffledDread[i], shuffledDread[j]] = [shuffledDread[j], shuffledDread[i]];
  }
  check('a shuffled log folds identically mid-hush, locked inputs and all',
    fingerprint(foldShoal(shuffledDread, DREAD_MS)) === baseline);
}

// --- outsideTicks and touchedIds: reachable, not decoration -----------------
//
// Task 1 of the-shoal-wild widens `fingerprint` to add `outsideTicks` and
// `touchedIds` (open item 8, docs/THE_SHOAL_OPEN_ITEMS.md). Widening it is
// unfalsifiable unless a REAL fold — via `foldShoal`, never a hand-mutated
// `ShoalState` — can produce a divergence confined to exactly one of the two
// new fields, with every field the OLD fingerprint covered staying identical.
// `oldFingerprint` below is that old fingerprint, verbatim, kept only to prove
// the two constructions below were genuinely invisible before this task.
function oldFingerprint(s: ShoalState): string {
  return JSON.stringify({
    fish: [...s.fish.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.x, v.y, [...v.recentBites].sort((a, b) => a - b)]),
    departed: [...s.departed.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.lastScatterMs, v.lastBiteMs, [...v.recentBites].sort((a, b) => a - b)]),
    tension: s.tension,
    lastTaken: [...s.lastTaken].sort(),
    lastSweepMs: s.lastSweepMs,
    bites: [...s.bitesTaken.entries()].sort(([a], [b]) => a - b),
    lastVisit: [...s.lastVisit.entries()]
      .sort(([a], [b]) => a - b)
      .map(([cell, by]) => [cell, [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1))]),
    bloomSince: [...s.bloomSinceMs.entries()].sort(([a], [b]) => a - b),
    hushStartMs: s.hushStartMs,
    lockedPositions: s.lockedPositions === null
      ? null
      : [...s.lockedPositions.entries()]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([k, p]) => [k, p.x, p.y, p.size]),
    lockedPreferred: s.lockedPreferred,
  });
}

{
  // outsideTicks is a TRAJECTORY accumulator: consecutive ticks a live fish
  // has spent outside the tension core, reset to 0 the instant it steps back
  // inside (shoalEngine.ts foldTick step 4). Two folds that agree on every
  // FINAL position can still disagree on it if they took different paths to
  // get there — and critically, `tension` (spreadPerMille, tension.ts) only
  // ever reads the COUNT of fish outside the core, never which ones, so the
  // count can stay fixed while the IDENTITY of who is outside changes,
  // hiding the whole thing from tension and therefore from every field the
  // old fingerprint read.
  //
  // Three fish: b, a, x. b sits at IN=(0,0) the entire session and never
  // moves. During an early window W1 (t=0..1750) exactly one of {a, x} sits
  // at OUT=(1000,0) and the other sits at IN alongside b; from t=2000 onward
  // BOTH logs move a to OUT and x to IN, identically, and hold that for the
  // rest of the session. So at every tick, in BOTH logs, exactly 1 of 3 fish
  // is outside the core — same count, same tension, every tick — but in log
  // P it is ALWAYS 'a' outside, while in log Q 'a' spends W1 inside (its
  // spot at OUT taken by 'x') before swapping to match P from t=2000 on.
  const IN = { x: 0, y: 0 };
  const OUT = { x: 1_000, y: 0 };
  // dist2(OUT, IN) = 1_000_000 > CORE_R2 (384_400): OUT reads outside the
  // core whenever the other two fish anchor the median at IN, which they do
  // throughout (b never moves, and whichever of a/x is "in" sits exactly on
  // b's own coordinate — median of {IN,IN,OUT} on each axis is IN).
  const outIsOutside = OUT.x * OUT.x > CORE_R2;

  const vecAt = (p: { x: number; y: number }, t: number) => ({ x: p.x, y: p.y, heading: 0, speed: 0, t });
  const entry = (id: string, ms: number, tag: string, p: { x: number; y: number }): Presence =>
    ({ kind: 'presence', id, ms, hash: `${id}-${tag}`, vec: vecAt(p, ms) });

  const M0 = 0;
  const M1 = 2_000;
  const CHECK_MS = 47_000; // >= M1 + BLOOM_READY_MS: see the lastVisit note below

  const logP: LogEntry[] = [
    entry('b', M0, '0', IN),
    entry('a', M0, '0', OUT), entry('x', M0, '0', IN),
    entry('a', M1, '1', OUT), entry('x', M1, '1', IN),
  ];
  const logQ: LogEntry[] = [
    entry('b', M0, '0', IN),
    entry('a', M0, '0', IN), entry('x', M0, '0', OUT),
    entry('a', M1, '1', OUT), entry('x', M1, '1', IN),
  ];

  const P = foldShoal(logP, CHECK_MS);
  const Q = foldShoal(logQ, CHECK_MS);

  // Hand-derived tick counts (TICK_MS=250). W1 ticks are t=0,250,...,1750:
  // (1750-0)/250 + 1 = 8. Post-swap ticks are t=2000,...,47000:
  // (47000-2000)/250 + 1 = 181. Total main-loop ticks: 8+181 = 189, which
  // must equal (CHECK_MS-M0)/TICK_MS+1 = 47000/250+1 = 189 — asserted below
  // rather than assumed.
  const w1Ticks = (M1 - TICK_MS - M0) / TICK_MS + 1;
  const postTicks = (CHECK_MS - M1) / TICK_MS + 1;
  const totalTicks = w1Ticks + postTicks;
  check('the hand-derived tick split matches the session span',
    totalTicks === (CHECK_MS - M0) / TICK_MS + 1, { w1Ticks, postTicks, totalTicks });
  check('CHECK_MS clears BLOOM_READY_MS past the W1/post-swap boundary, so W1-era visit stamps have aged out',
    CHECK_MS >= M1 + BLOOM_READY_MS, { CHECK_MS, M1, BLOOM_READY_MS });
  check('OUT really reads outside the core', outIsOutside);

  check('non-degeneracy: outsideTicks(a) really differs between the two folds',
    P.outsideTicks.get('a') !== Q.outsideTicks.get('a'),
    { P: P.outsideTicks.get('a'), Q: Q.outsideTicks.get('a') });
  check('P: a was outside every tick of the session, so outsideTicks(a) equals the full tick count',
    P.outsideTicks.get('a') === totalTicks, { got: P.outsideTicks.get('a'), totalTicks });
  check('Q: a was only outside from t=2000, so outsideTicks(a) is short by exactly W1\'s tick count',
    Q.outsideTicks.get('a') === totalTicks - w1Ticks,
    { got: Q.outsideTicks.get('a'), expected: totalTicks - w1Ticks });
  check('x stepped back inside at t=2000 and reset to 0, so it agrees across both folds (control)',
    P.outsideTicks.get('x') === 0 && Q.outsideTicks.get('x') === 0,
    { P: P.outsideTicks.get('x'), Q: Q.outsideTicks.get('x') });

  // Hand-derived tension: exactly 1 of 3 fish outside on every tick in BOTH
  // logs -> spreadPerMille = trunc(1000*1/3) = 333 every tick ->
  // delta = 333 - TENSION_NEUTRAL(250) = 83/tick, accumulating with the
  // floor never binding (always positive), for `totalTicks` ticks.
  const expectedTension = 83 * totalTicks; // 83*189 = 15_687
  check('hand-derived tension is identical in both folds and never reaches the hush trigger',
    P.tension === expectedTension && Q.tension === expectedTension && expectedTension < TENSION_TRIGGER,
    { P: P.tension, Q: Q.tension, expectedTension, TENSION_TRIGGER });

  check('non-degeneracy: lastVisit is not vacuously empty in either fold',
    P.lastVisit.size > 0 && Q.lastVisit.size > 0, { P: P.lastVisit.size, Q: Q.lastVisit.size });

  check('the widened fingerprint tells P and Q apart',
    fingerprint(P) !== fingerprint(Q));
  check('the OLD fingerprint — every field this project checked before this task — saw no difference at all',
    oldFingerprint(P) === oldFingerprint(Q));
}

{
  // touchedIds. Unlike outsideTicks, a NATURALLY-touched id (one that lived
  // in `fish` at some point this fold) is always recoverable from fish or
  // departed: touchedIds.add(id) runs in the exact same branch that puts an
  // id into `fish` (shoalEngine.ts foldTick step 1), and the only way out of
  // `fish` is eviction into `departed` (never anywhere else) — so a
  // naturally-touched id always still shows up in fish or departed, and a
  // divergence there is already visible in the OLD fingerprint.
  //
  // The one case that breaks that equivalence is a CHECKPOINT-SEEDED
  // `departed` row for an id the log never touches: it sits in `departed`
  // (visible to the old fingerprint) but is absent from `touchedIds`, and
  // `rollEpoch` prunes exactly that difference — `{id in departed : id not
  // in touchedIds}` — at the next epoch boundary (shoalEngine.ts's
  // `rollEpoch` doc, spec 3.9 point 6). So: seed BOTH folds with an identical
  // departed row for 'ghost'. Log A additionally gives 'ghost' one presence
  // write, timed to the exact admit floor (the oldest ms `foldShoal`'s log
  // cursor still admits) so it lives for exactly one tick — the fold's very
  // first, before hunger's first firing (tickCount 0->1, and hunger only
  // fires on tickCount % 4 === 0) — and is evicted the very next tick,
  // banking the identical size/lastBiteMs/lastScatterMs/recentBites the seed
  // already gave it. Log B never mentions 'ghost' at all. Both folds end
  // with byte-identical `departed`, and different `touchedIds`.
  const EPOCH = 1;
  const warmStartMs = epochWarmStartMs(EPOCH);
  const originMs = epochStartMs(EPOCH);
  const ghostMs = warmStartMs - PRESENCE_TTL_MS;
  check('the admit-floor arithmetic used below matches the constants it is derived from',
    warmStartMs === originMs - 90_000 && ghostMs === warmStartMs - 90_000,
    { warmStartMs, originMs, ghostMs });

  const seed: Checkpoint = { epoch: EPOCH - 1, sizes: [['ghost', 500]], recent: [] };
  const ghostEntry: Presence = {
    kind: 'presence', id: 'ghost', ms: ghostMs, hash: 'ghost-touch',
    vec: { x: 0, y: 0, heading: 0, speed: 0, t: ghostMs },
  };
  const logTouched: LogEntry[] = [ghostEntry];
  const logUntouched: LogEntry[] = [];

  const CHECK_MS = originMs; // the earliest legal untilMs for this epoch
  const touchedState = foldShoal(logTouched, CHECK_MS, { epoch: EPOCH, seed });
  const untouchedState = foldShoal(logUntouched, CHECK_MS, { epoch: EPOCH, seed });

  check('non-degeneracy: touchedIds really differs (ghost touched in one fold, not the other)',
    touchedState.touchedIds.has('ghost') && !untouchedState.touchedIds.has('ghost'));
  check('both folds carry the identical seeded departed row for ghost',
    JSON.stringify([...touchedState.departed.entries()]) === JSON.stringify([...untouchedState.departed.entries()])
      && touchedState.departed.get('ghost')?.size === 500,
    { touched: touchedState.departed.get('ghost'), untouched: untouchedState.departed.get('ghost') });
  check('non-degeneracy: neither fold ever has a live fish (this checks departed/touchedIds in isolation)',
    touchedState.fish.size === 0 && untouchedState.fish.size === 0);

  check('the widened fingerprint tells the touched fold apart from the untouched one',
    fingerprint(touchedState) !== fingerprint(untouchedState));
  check('the OLD fingerprint saw no difference between them at all',
    oldFingerprint(touchedState) === oldFingerprint(untouchedState));

  // The player-visible consequence: roll both folds to the epoch boundary
  // and confirm the PUBLISHED CHECKPOINTS actually differ. This is not an
  // abstract field — it is two honest clients broadcasting different
  // histories for what the OLD fingerprint said was the same world.
  const endMs = epochFoldEndMs(EPOCH);
  const touchedFull = foldShoal(logTouched, endMs, { epoch: EPOCH, seed });
  const untouchedFull = foldShoal(logUntouched, endMs, { epoch: EPOCH, seed });
  const cpTouched = rollEpoch(touchedFull);
  const cpUntouched = rollEpoch(untouchedFull);
  check('rollEpoch keeps ghost in the touched fold\'s checkpoint',
    cpTouched.sizes.some(([id]) => id === 'ghost'), cpTouched.sizes);
  check('rollEpoch prunes ghost from the untouched fold\'s checkpoint',
    !cpUntouched.sizes.some(([id]) => id === 'ghost'), cpUntouched.sizes);
  check('two honest clients publish DIFFERENT checkpoints for what the OLD fingerprint called the same world',
    serialiseCheckpoint(cpTouched) !== serialiseCheckpoint(cpUntouched));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
