/**
 * The quest line's rules under the LATCHED model — written against the two
 * failure modes the designer review caught live: (1) transient conditions
 * completing the tour during the connect wait (a stranger greeted at 5/5),
 * and (2) completed quests un-latching (dipping at 5/5 resurrecting 4/5).
 * Run: npx tsx src/lib/tutorial.test.ts
 */
import { TUTORIAL_STEPS, initialPointer, cheapestOpenCost } from './tutorial';
import type { ChipsState, MoveResult } from './chipsEngine';
import type { CookingChip } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const freshState = (over: Partial<ChipsState> = {}): ChipsState => ({
  crumbs: 0, lifetimeChips: 0, oldSalt: 0, tips: 0, broken: 0, deepest: 0, char: 0, bowls: 0, crispest: 0, owned: new Set(), bowlCap: 1_000_000,
  seasoningNum: 1, seasoningDen: 1, fryers: 1, goldenBits: 16, airtight: false,
  sogBonus: 0, doubleDipMod: 0, dipIndex: 0, lastConfirmedAt: 0, lastBankAt: 0,
  unverifiedBanks: 0, moves: [], ...over,
});
const chip = (pot: number, crackles = 0): CookingChip => ({ ms: 1, pot, crackles, cookedMs: 0 });
const dipped: MoveResult = { content_id: 'c', ms: 1, outcome: 'dipped', crumbs: 500 };

// 1) THE FIRST-RUN RACE (review finding #1): initialPointer consults DURABLE
//    state only. A fresh table whose live chip has already cooked and even
//    CRACKLED during the connect wait still starts the tour at step 0.
{
  const s = freshState();
  check('a stranger starts at quest 1 — no matter what the live basket did',
    initialPointer(s) === 0);
  // the live conditions being true is irrelevant to the starting pointer:
  check('(the crackle step WOULD pass live — proving the race was real)',
    TUTORIAL_STEPS[3].isDone(s, [chip(5000, 2)]));
}

// 2) Durable fast-forward: the pointer floor comes from chain state.
{
  check('has dipped -> the dog quest next', initialPointer(freshState({ moves: [dipped] })) === 2);
  check('has bought -> crackle quest next', initialPointer(freshState({ moves: [dipped], owned: new Set(['season1']) })) === 3);
  check('reached guacamole -> nothing to teach', initialPointer(freshState({ dipIndex: 1 })) === TUTORIAL_STEPS.length);
  const legacy: MoveResult = { content_id: 'c', ms: 1, outcome: 'banked', bits: 10, crumbs: 4000 };
  check('a legacy bank counts as having dipped', initialPointer(freshState({ moves: [legacy] })) === 2);
}

// 3) UN-LATCHING (review finding #2) is impossible by construction: the
//    component only ever advances a pointer. What the module must guarantee
//    is that each ACTIVE step's condition is its own — pin each one.
{
  check('watch passes at 3 ticks of pot', TUTORIAL_STEPS[0].isDone(freshState(), [chip(750)]));
  check('dip passes on a dipped move', TUTORIAL_STEPS[1].isDone(freshState({ moves: [dipped] }), [chip(0)]));
  check('buy passes on any owned jar', TUTORIAL_STEPS[2].isDone(freshState({ owned: new Set(['airtight']) }), [chip(0)]));
  check('crackle passes on a live crackle', TUTORIAL_STEPS[3].isDone(freshState(), [chip(0, 1)]));
  check('guac passes on the tier, not on chips', TUTORIAL_STEPS[4].isDone(freshState({ dipIndex: 1 }), []));
}

// 4) The affordability bridge (review finding #3): the buy quest's copy
//    and ring change with what the player can actually buy.
{
  const broke = freshState({ crumbs: 2000 });
  const flush = freshState({ crumbs: 50_000 });
  check('cheapest open jar is a real price', cheapestOpenCost(broke) === 10_000, cheapestOpenCost(broke));
  check('broke: the buy quest bridges the gap in copy',
    TUTORIAL_STEPS[2].text(broke, []).includes('Keep dipping'), TUTORIAL_STEPS[2].text(broke, []));
  check('broke: the ring waits instead of inviting', TUTORIAL_STEPS[2].ringMode(broke, []) === 'wait');
  check('flush: the ring invites', TUTORIAL_STEPS[2].ringMode(flush, []) === 'invite');
}

// 5) The distance is on the banner (review fix #3): guac shows live N/150.
{
  const s = freshState({ lifetimeChips: 27 });
  check('guac quest carries live progress', TUTORIAL_STEPS[4].text(s, []).includes('27/150'), TUTORIAL_STEPS[4].text(s, []));
}

// 6) Hold-vs-invite (the mixed-signal fix): the two "don't touch" quests
//    never show the touch-me treatment.
{
  const s = freshState();
  check('watch and crackle are hold-rings',
    TUTORIAL_STEPS[0].ringMode(s, []) === 'hold' && TUTORIAL_STEPS[3].ringMode(s, []) === 'hold');
  check('dip is an invite-ring', TUTORIAL_STEPS[1].ringMode(s, []) === 'invite');
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
