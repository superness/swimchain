/**
 * THE DEEP JOBS — wing, committee, hermit, oracle. Dice injected.
 *
 * Each test pins the thing that makes the mechanic a MECHANIC rather than a
 * decoration: the wing must visibly move, an ignored vote must actually fail,
 * the hermit must really sometimes eat it, and the oracle's window must
 * really close.
 *
 * Run: npx tsx src/lib/crewJobs.deep.test.ts
 */
import {
  freshWing, wingTick, callWing, WING_CALL_COOLDOWN_S, WING_PAYS,
  freshVote, voteTick, lobby, motionBonus, MOTION_BONUS, VOTE_OPEN_S, MOTION_S,
  freshHermit, hermitTick, giveHermit, HERMIT_RETURNS, HERMIT_HOLD_S,
  freshOracle, oracleTick, PROPHECY_PAYS, PROPHECY_WINDOW_S,
  dipBonusFor, type WingState,
} from './crewJobs';
import { TICK_MS } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}
const never = () => 0.999999;
const always = () => 0;
const ticksFor = (s: number) => Math.max(1, Math.round((s * 1000) / TICK_MS));

// 1) THE WING lands, and when it hops it always lands SOMEWHERE ELSE — a hop
//    onto the same basket is invisible and reads as the mechanic being broken.
{
  const first = wingTick(freshWing(), 4, 1000, never);
  check('it lands on its first tick, cold dice or not', first.at !== null, first);
  let w: WingState = { at: 1, since: 0, readyAt: 0 };
  for (let i = 0; i < 30; i++) {
    const next = wingTick(w, 4, i, always);
    check(`hop ${i + 1} moved to a different basket`, next.at !== w.at, { from: w.at, to: next.at });
    check(`hop ${i + 1} stayed on the rack`, next.at !== null && next.at >= 0 && next.at < 4, next.at);
    w = next;
    if (i > 2) break;
  }
  check('cold dice: it stays put', wingTick({ at: 2, since: 0, readyAt: 0 }, 4, 9, never).at === 2);
  check('one fryer: nowhere to hop to', wingTick({ at: 0, since: 0, readyAt: 0 }, 1, 9, always).at === 0);
  check('a shrunken rack pulls it back in bounds', wingTick({ at: 3, since: 0, readyAt: 0 }, 2, 9, never).at === 1);
}

// 1b) A REASON (chipsConst `wingcall`, sold by the wing) — you call it onto a
//     basket instead of watching where it went. The jar is 300M, so the thing
//     it sells has to be CONTROL, and control means two properties the random
//     hop does not have: the wing goes where you said, and it STAYS there
//     long enough to matter. A call that the very next tick's dice could undo
//     would be an expensive way to buy nothing.
{
  const cold = { at: 0, since: 0, readyAt: 0 };

  const called = callWing(cold, 3, 4, 10_000);
  check('a call moves it to the basket you named', called.at === 3, called.at);
  check('a call re-keys the landing animation', called.since === 10_000, called.since);
  check('a call starts the cooldown', called.readyAt === 10_000 + WING_CALL_COOLDOWN_S * 1000, called.readyAt);

  // The cooldown is the price of control. Without it the wing is simply
  // wherever you last tapped, which is not a decision, it is a setting.
  const early = callWing(called, 1, 4, called.readyAt - 1);
  check('a second call is refused while cooling', early.at === 3, early.at);
  const late = callWing(called, 1, 4, called.readyAt);
  check('and allowed the moment it is ready', late.at === 1, late.at);

  // THE ONE THAT MAKES IT WORTH BUYING: hot dice, and it does not wander off
  // the basket you paid to put it on. `always` is the rng that hops every
  // single tick, so this fails loudly against the natural-hop rule as it
  // stands today.
  let held = callWing(cold, 2, 4, 1000);
  for (let t = 0; t < 12; t++) held = wingTick(held, 4, 1000 + t, always);
  check('it stays where it was called, hot dice and all', held.at === 2, held.at);
  check('and the cooldown survives the ticks', held.readyAt === 1000 + WING_CALL_COOLDOWN_S * 1000, held.readyAt);

  // Once the cooldown lapses it is a wild bird again — the jar buys aim, not
  // a leash.
  const freed = wingTick(held, 4, held.readyAt, always);
  check('after the cooldown it hops on its own again', freed.at !== 2, freed.at);

  // Calling it where it already is must not burn the cooldown: a misfire
  // that costs you 45 seconds of your 300M purchase is a trap.
  const same = callWing(called, 3, 4, called.readyAt + 5_000);
  check('calling it to where it already sits changes nothing', same.readyAt === called.readyAt, same.readyAt);
  // Nor may a call land off the rack.
  check('a call to a basket you do not own is refused', callWing(cold, 9, 4, 50_000).at === 0);
  check('a negative index is refused', callWing(cold, -1, 4, 50_000).at === 0);
}

// 2) THE VOTE. The load-bearing claim: an IGNORED vote fails. If an unlobbied
//    motion could carry, the committee would be weather, not a decision.
{
  const called = voteTick(freshVote(), always);
  check('a vote calls itself', called.phase === 'open', called);
  check('and opens the floor for a while', called.ticks === ticksFor(VOTE_OPEN_S), called.ticks);

  // ignored to the close
  let v = called;
  for (let i = 0; i < called.ticks; i++) v = voteTick(v, always);
  check('an IGNORED motion fails even on hot dice', v.phase === 'failed', v);

  // lobbied, hot dice
  let l = lobby(called);
  check('lobbying registers', l.lobbied);
  check('lobbying an already-lobbied vote is a no-op', lobby(l) === l);
  for (let i = 0; i < called.ticks; i++) l = voteTick(l, always);
  check('a LOBBIED motion carries on hot dice', l.phase === 'carried', l);
  check('and runs for the full motion', l.ticks === ticksFor(MOTION_S), l.ticks);
  check('a carried motion fattens every tick', motionBonus(l) === 1 + MOTION_BONUS, motionBonus(l));

  // lobbied, cold dice — the beans want more time
  let c = lobby(called);
  for (let i = 0; i < called.ticks; i++) c = voteTick(c, never);
  check('lobbying is not a formality — it can still fail', c.phase === 'failed', c);

  check('an idle committee is worth nothing', motionBonus(freshVote()) === 1);
  check('an open floor is worth nothing yet', motionBonus(called) === 1);

  // the motion eventually expires back to idle
  let m = l;
  const motionTicks = m.ticks;   // capture: `m.ticks` shrinks as we step it
  for (let i = 0; i < motionTicks; i++) m = voteTick(m, never);
  check('a carried motion expires', m.phase === 'idle', m);
}

// 3) THE HERMIT. He must REALLY sometimes eat it — a trade that always pays
//    is not a gamble, it is a deposit.
{
  const offering = hermitTick(freshHermit(), always);
  check('he offers', offering.phase === 'offering', offering);
  check('an unanswered offer lapses', (() => {
    let h = offering;
    for (let i = 0; i < offering.ticks; i++) h = hermitTick(h, never);
    return h.phase === 'idle';
  })());

  const held = giveHermit(offering, 5_000);
  check('handing him a chip starts the hold', held.phase === 'holding' && held.held === 5_000, held);
  check('he takes nothing when not offering', giveHermit(freshHermit(), 5_000).phase === 'idle');
  check('he takes nothing worthless', giveHermit(offering, 0).phase === 'offering');
  check('the hold runs the full time', held.ticks === ticksFor(HERMIT_HOLD_S), held.ticks);

  const run = (h: typeof held, rng: () => number) => {
    let s = h;
    for (let i = 0; i < h.ticks; i++) s = hermitTick(s, rng);
    return s;
  };
  const back = run(held, never);   // never < HERMIT_EATS -> he returns it
  check('he brings it back fattened', back.phase === 'returned' && back.payout === 5_000 * HERMIT_RETURNS, back);
  const gone = run(held, always);  // always < HERMIT_EATS -> he eats it
  check('and he really does sometimes eat it', gone.phase === 'ate' && gone.payout === 0, gone);
  check('an eaten chip pays nothing at all', gone.held === 0);
}

// 4) THE ORACLE names a basket, and the window really closes.
{
  const said = oracleTick(freshOracle(), 3, always);
  check('the strings point somewhere real', said.at !== null && said.at! < 3, said);
  check('the window is the promised length', said.ticks === ticksFor(PROPHECY_WINDOW_S), said.ticks);
  let o = said;
  for (let i = 0; i < said.ticks; i++) o = oracleTick(o, 3, never);
  check('the prophecy expires', o.at === null, o);
  check('cold dice: no prophecy', oracleTick(freshOracle(), 3, never).at === null);
  check('a shrunken rack clears a stale prophecy', oracleTick({ at: 3, ticks: 5 }, 2, never).at === null);
}

// 5) THE STACK. A prophesied basket with a wing on it is the best moment in
//    the game and must actually pay like it.
{
  const wing = { at: 1, since: 0, readyAt: 0 };
  const oracle = { at: 1, ticks: 5 };
  check('a plain basket pays plain', dipBonusFor(0, freshWing(), freshOracle()) === 1);
  check('the wing alone pays its rate', dipBonusFor(1, wing, freshOracle()) === WING_PAYS);
  check('the oracle alone pays its rate', dipBonusFor(1, freshWing(), oracle) === PROPHECY_PAYS);
  check('they STACK', dipBonusFor(1, wing, oracle) === WING_PAYS * PROPHECY_PAYS, dipBonusFor(1, wing, oracle));
  check('and only on the basket they are watching', dipBonusFor(0, wing, oracle) === 1);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
