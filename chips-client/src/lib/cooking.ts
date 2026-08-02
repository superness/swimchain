/**
 * THE GAME (spec locked 2026-07-27, operator-approved verbatim):
 *
 *   "A chip cooks in the oil. Its value climbs while it cooks — tick, tick,
 *    tick, every few seconds, always. That's the pot: watching it is
 *    watching yourself get richer.
 *
 *    Once in a while the chip crackles — a big, rare, loud moment — and its
 *    multiplier jumps: x2, then x4, then x8... golden at the top. The whole
 *    pot it's been building gets multiplied. Crackles get rarer the more
 *    you've had, so a well-cooked chip is a gamble you can feel: dip now and
 *    take pot x multi, or hold for one more crackle while the pot keeps
 *    ticking either way. Nothing is ever frozen; holding is never dead time;
 *    dipping never feels like giving up — the pot you watched grow comes
 *    with you.
 *
 *    You dip it. It pays pot x multi. That's the game."
 *
 * DESIGNER-PACED, COOKIE-CLICKER HONEST. The clock below is a designed
 * clock, not a miner: ticks always come, crackle odds follow a tuned curve,
 * and the chain accepts the dip's declared value (`dip <amount>`) the way
 * Cookie Clicker accepts your save file. The Argon2id furnace is gone from
 * gameplay entirely — no WASM in the fryers, no CPU melt, no OOM. The only
 * proof left is the network's own per-post anti-spam PoW, background, one
 * per dip.
 *
 * BALANCE MATH — READ THIS BEFORE "FIXING" ANYTHING HERE.
 *
 * This note used to claim the value RATE was roughly FLAT across "dip early"
 * and "hold for golden", so holding was variance and never strictly better.
 * THAT IS FALSE, and it was false the whole time. Measured over 400h of
 * steady-state income per policy (scripts/longfrysim.ts — bank, start the
 * next chip from an empty pot, crumbs/sec):
 *
 *   dip at x8 (3)   800.0
 *   dip at x16 (4) 1599.8
 *   dip GOLDEN (5) 3198.8
 *   hold to x64 (6, with The Long Fry) 6389.1
 *
 * The rate DOUBLES per crackle level. Total time to k crackles grows ~2x per
 * level while the value there grows ~4x, so holding wins, always, at every
 * rung. Selling early is simply bad and it resets your multiplier.
 *
 * THIS IS THE GAME'S SECRET, NOT A BUG (operator, 2026-07-28: "holding is
 * literally the best move always. Selling it bad and resets your multi.
 * That's just the secret of the game"). It is DELIBERATE and must not be
 * "rebalanced" back toward flatness — a player working that out for
 * themselves is the reward. The only forces pushing the other way are the
 * ones already in the game: the bowl cap spills what you cannot hold, sog
 * eats what you sit on, and vendors want a chip in hand right now.
 *
 * The consequence for flowsim.ts: its model assumes multi drops out of the
 * expectation, so its crumbs/sec ~= tick rate. That makes its timings a
 * FLOOR — what a casual dip-on-every-crackle player sees — not a prediction
 * of an optimal one, who earns multiples of it. Read the targets that way.
 *
 * This module is PURE (no timers, no React, injected RNG) so every rule is
 * unit-testable and the interval driver (useCooking.ts) stays dumb.
 */

/** Pot gain per tick, before seasoning. */
export const TICK_CRUMBS = 250;
/** One tick every this many ms — the "tick, tick, tick, always". */
export const TICK_MS = 2500;
/** Crackle k (1-based) is expected after CRACKLE_BASE_S * 2^k seconds of
 *  cooking at that level: ~30s, ~60s, ~2m, ~4m, ~8m. */
export const CRACKLE_BASE_S = 15;
/** Crackles that make a chip GOLDEN: x2 each, so golden is x32. This is the
 *  angel's threshold and the Sous Chef's trigger, and it NEVER moves — see
 *  `isGolden` below. */
export const GOLDEN_CRACKLES = 5;
/** The default top of the ladder. Golden and terminal are the same number
 *  until The Long Fry is bought. */
export const MAX_CRACKLES = GOLDEN_CRACKLES;
/**
 * THE LONG FRY (chipsConst `longfry`, 1.2B, sold by the first chip) — one
 * more crackle past golden, to x64.
 *
 * MEASURED, not reasoned (scripts/longfrysim.ts, 400h of steady-state income
 * per policy — bank, start the next chip from an empty pot, crumbs/sec):
 *
 *   dip at x8   800.0 -> 800.0    0.0%     the jar is worth NOTHING
 *   dip at x16 1599.8 -> 1599.8   0.0%     to a player who does not
 *   dip GOLDEN 3198.8 -> 3198.8   0.0%     change how they play
 *   hold to the ceiling  3198.8 -> 6389.1  +99.7%
 *
 * That shape is the point: it pays nothing passively and doubles you if you
 * use it. You have to keep holding a chip that already looks finished.
 *
 * IT DOES NOT RESCUE OVERCOOK. An earlier draft of this comment claimed the
 * extra rung finally gave haste something to compound into. It does not —
 * measured at -18.9% (burn below golden, then ride to the ceiling) in the
 * same sim. The header note above stands unamended: there is no (haste,
 * drain) pair that wins, at either ceiling.
 *
 * GOLDEN DOES NOT MOVE WITH IT. Raising `isGolden` alongside this would mean
 * a player who bought a 1.2B "upgrade" suddenly needs six crackles to feed
 * the queso angel — an upgrade that is really a nerf. The ceiling is passed
 * per-tick through `TickMods.ceiling`; `isGolden` takes no ceiling at all,
 * on purpose, so the mistake cannot be made from a call site.
 */
export const LONG_FRY_CRACKLES = GOLDEN_CRACKLES + 1;

/**
 * OVERCOOK — burn a fryer's pot to make its crackles come sooner.
 *
 * DELIBERATELY EV-NEGATIVE, and it cannot be otherwise. Value is
 * `potRate x total_time x 2^k`; haste shrinks `total_time` in exact
 * proportion to how much sooner the multiplier lands, and MAX_CRACKLES makes
 * the multiplier terminal — so speed has nothing to compound into. Measured
 * over this very curve in scripts/overcooksim.ts and overcooksim2.ts: pure
 * haste scores 100.0% of base at every dip target, and any drain scores
 * strictly less. There is no (haste, drain) pair that wins.
 *
 * It is a TOOL, not income: it manufactures a golden chip on demand for the
 * queso angel, who takes nothing else. A chip fed to a vendor forfeits its
 * whole pot anyway (App.tsx onFeed), so burning one you have already
 * committed to her costs nothing real. Do not "fix" the numbers below.
 */
export const OVERCOOK_HASTE = 1 / 3;
export const OVERCOOK_DRAIN = 0.03;

export interface CookingChip {
  /** Identity for React keys and the on-chain authoring ms. */
  ms: number;
  /** Accumulated pot, in crumbs, already seasoned. */
  pot: number;
  /** Number of crackles so far; multiplier is 2^crackles. */
  crackles: number;
  /** Total ms this chip has been cooking (drives nothing but feel/debug). */
  cookedMs: number;
}

export const multiOf = (chip: Pick<CookingChip, 'crackles'>): number => 2 ** chip.crackles;
/** Goldenness is a property of the CHIP, never of what its owner has bought:
 *  no ceiling parameter here, deliberately, so The Long Fry can never move
 *  the angel's threshold from a call site. */
export const isGolden = (chip: Pick<CookingChip, 'crackles'>): boolean => chip.crackles >= GOLDEN_CRACKLES;
/** Floored: every amount this feeds — dip, porcelain broke — crosses a wire
 *  grammar that is integers-only (chipsBody.ts), and a fractional worth there
 *  is not rejected loudly, it is silently never submitted (chipsSender.ts's
 *  `submittable`). tickChip already keeps pots integral; the floor here makes
 *  the seam safe even for a fractional pot persisted by a pre-fix session. */
export const worthOf = (chip: Pick<CookingChip, 'pot' | 'crackles'>): number => Math.floor(chip.pot * multiOf(chip));

export function freshChip(ms: number): CookingChip {
  return { ms, pot: 0, crackles: 0, cookedMs: 0 };
}

export interface TickResult {
  chip: CookingChip;
  /** The tick's pot gain (for the +N flourish). */
  gained: number;
  /** True when THIS tick crackled — the loud moment. */
  crackled: boolean;
  /** A crackle LANDED and was eaten (cheese rat): the multi did not move.
   *  Mutually exclusive with `crackled`. */
  crackleEaten: boolean;
  /** The tick's gain went to whoever latched the fryer, not the pot. */
  diverted: boolean;
  /** Crumbs the overcook burned off this tick (0 when not lit). */
  burned: number;
}

/**
 * Per-tick interference from the crew (lib/crewJobs.ts drives these):
 * the cheese rat latches a fryer and siphons its ticks; the queso angel
 * blesses one with a guaranteed crackle. All optional, all default-off —
 * a bare tickChip call behaves exactly as it did before the crew existed.
 */
export interface TickMods {
  /** Rat latched here: the gain goes to his hoard, the pot stays put. */
  divertPot?: boolean;
  /** Rat latched here: a crackle that lands is EATEN — reported, not kept. */
  eatCrackle?: boolean;
  /** Angel's blessing: this tick crackles, no dice. Eaten if the rat is
   *  ALSO here — he eats ANY crackle, even hers (the app's targeting avoids
   *  wasting a blessing on a latched fryer; the rule stays absolute). */
  forceCrackle?: boolean;
  /** This fryer is overcooking: crackles come sooner, the pot bleeds. */
  overcook?: boolean;
  /** THE MAGMA (char ability). Overcook keeps its haste and stops draining.
   *
   *  Reading A of "overcook feeds the multiplier instead of draining the pot",
   *  chosen because it was MEASURED (scripts/magmasim.ts). The other reading —
   *  the burn buys crackle probability, pot still bleeding — is a trap: it
   *  costs 12-56% at every session length, because the drain is what makes
   *  overcook bad and it pays for a speedup reading A gives free.
   *
   *  Its profile is the reason it can be the last thing you buy without
   *  breaking anything. MEASURED THROUGH THIS FUNCTION, not a model of it
   *  (scripts/magmareal.mjs — the standalone magmasim.ts said +169% at x64/10min
   *  and the real path says +135.5%; same shape, and the real one is the one
   *  that ships):
   *                 x32       x64
   *      10 min   +61.6%   +135.5%
   *      30 min    +4.0%    +30.4%
   *     120 min    +0.0%     +0.1%
   *  It is not a multiplier, it is a TIME COMPRESSOR — enormous when you have
   *  twenty minutes, exactly nothing when you have two hours, because the
   *  crackle ladder is terminal and parking already wins by then. It cannot
   *  inflate the endgame and it cannot be farmed. */
  magma?: boolean;
  /** Top of the crackle ladder. Defaults to MAX_CRACKLES; The Long Fry
   *  raises it to LONG_FRY_CRACKLES. Per-tick rather than a module constant
   *  because it is a property of the PLAYER (what they own), not of the
   *  engine — and reading it from a global would make the rule untestable
   *  in both states at once. */
  ceiling?: number;
}

/**
 * Advance one chip by one tick. `seasoning` is the current seasoningNum/Den
 * ratio applied to the tick; `crackleHaste` scales crackle WAITS down
 * (detector upgrades: 1 = normal, 0.75 = crackles come 25% sooner).
 * `rng()` in [0,1) — injected, so tests own the dice.
 */
export function tickChip(
  chip: CookingChip,
  seasoning: number,
  crackleHaste: number,
  rng: () => number,
  mods: TickMods = {}
): TickResult {
  const gained = Math.max(1, Math.floor(TICK_CRUMBS * seasoning));
  const diverted = mods.divertPot === true;
  const lit = mods.overcook === true;
  const grown = chip.pot + (diverted ? 0 : gained);
  // The burn takes its cut AFTER the tick lands, so a lit fryer still shows
  // the pot moving — it just keeps less of it. It rounds UP — a burn is never
  // free — because the pot must stay a WHOLE number of crumbs: a fractional
  // pot walks into the queue as a fractional dip amount, dipBody refuses it
  // (the wire grammar is integers, correctly), and the sender then filters
  // the move out of every send FOREVER with nothing shown to the player. A
  // real 281,793-crumb dip was lost exactly this way on 2026-08-01 (report
  // 4a713fe4-27612: pot 17612.07666292773 after a 242.5s overcook).
  // THE MAGMA stops the burn without touching the haste below.
  const burned = lit && mods.magma !== true ? Math.min(grown, Math.ceil(grown * OVERCOOK_DRAIN)) : 0;
  const next: CookingChip = {
    ...chip,
    // Math.floor self-heals a legacy fractional pot (persisted by a pre-fix
    // session) on its next tick; on an integral pot it is a no-op.
    pot: Math.max(0, Math.floor(grown - burned)),
    cookedMs: chip.cookedMs + TICK_MS,
  };
  let crackled = false;
  let crackleEaten = false;
  if (next.crackles < (mods.ceiling ?? MAX_CRACKLES)) {
    // P(crackle this tick) = tick / expected wait at this level. Memoryless,
    // so the drought CAN run long — that's the gamble — but the pot ticked
    // the whole way, so a drought is never a frozen screen.
    const haste = Math.max(0.05, crackleHaste) * (lit ? OVERCOOK_HASTE : 1);
    const expectedWaitS = CRACKLE_BASE_S * 2 ** (next.crackles + 1) * haste;
    const p = TICK_MS / 1000 / expectedWaitS;
    if (mods.forceCrackle === true || rng() < p) {
      if (mods.eatCrackle === true) {
        crackleEaten = true;
      } else {
        next.crackles += 1;
        crackled = true;
      }
    }
  }
  return { chip: next, gained, crackled, crackleEaten, diverted, burned };
}

export interface DipResult {
  /** What the dip pays: pot x multi, doubled if the double-dip procced. */
  amount: number;
  /** The double-dip upgrade fired — "nobody is watching. dip it again." */
  doubled: boolean;
  multi: number;
}

/** Double-dip procs are 10x rarer than the catalog modulus reads (operator,
 *  2026-07-27): mod 4 pays twice one dip in 40, mod 2 one in 20. This lives
 *  HERE, not in chipsConst — the catalog's `doubleDipMod` also feeds the
 *  FOLD's legacy `bank` rule (nonce % mod), which is permanent; the live
 *  dip's odds are client policy and free to move. */
export const DOUBLE_DIP_RARITY = 10;

/**
 * Cash a chip. `doubleDipMod` is the owned upgrade's modulus (0 = none) —
 * same catalog field the old game used, remapped: a chance the dip pays
 * twice, at 1 / (mod x DOUBLE_DIP_RARITY).
 */
export function dipChip(
  chip: CookingChip,
  doubleDipMod: number,
  rng: () => number
): DipResult {
  const multi = multiOf(chip);
  const base = worthOf(chip);
  const doubled = doubleDipMod > 0 && rng() < 1 / (doubleDipMod * DOUBLE_DIP_RARITY);
  return { amount: base * (doubled ? 2 : 1), doubled, multi };
}

/**
 * Dip a chip AND STAMP IT WITH THE MOMENT IT WAS DIPPED.
 *
 * The returned `ms` is the wire/ordering identity and comes from `alloc`, not
 * from the chip. That distinction is the whole point of this function: until a
 * move is sealed into a block, `orderReplies` falls back to the body's
 * authoring-ms, so that number IS the fold's ordering key. A chip carries the
 * ms it was CAST ON, and reusing it replays the dip as though it happened back
 * then — before every upgrade bought while the chip cooked. The longer the
 * cook, the further back it lands and the bigger the pot, so the most valuable
 * dips are exactly the ones that fold into a stale, smaller bowl cap and are
 * clamped to nothing.
 *
 * Measured on mainnet table 5425dfcd (2026-08-02): dips of 5,857,616 and
 * 1,376,288 credited ZERO against a 3,000,000 cap the player had already
 * raised to 200,000,000. `broke`, `spend`, `burn` and the crew payouts have
 * always taken a fresh allocMs() at the moment of the action; the basket dip
 * was the one path still handing over the chip's birthday.
 *
 * `chipMs` keeps the birth ms so the debug ring can still report a cook
 * duration (see dipRing's `at - ms`), and so nothing that joins a dip back to
 * the chip it came from has to re-derive it.
 */
export function dipFor(
  chip: CookingChip,
  doubleDipMod: number,
  rng: () => number,
  alloc: () => number
): DipResult & { ms: number; chipMs: number; pot: number; cookedMs: number } {
  const res = dipChip(chip, doubleDipMod, rng);
  // pot and cookedMs come along because the caller is about to replace the
  // basket and this is the last moment they exist. See lib/dipRing.ts.
  return { ...res, ms: alloc(), chipMs: chip.ms, pot: chip.pot, cookedMs: chip.cookedMs };
}

/**
 * Strictly increasing ms values that TRACK THE WALL CLOCK — dip identity on
 * the wire AND the fold's within-block ordering key. The old +1-per-call
 * allocator (inherited from the miner era, where it was deliberately
 * decoupled from real time) stamped every dip of a session with page-LOAD
 * time, so inside one block every dip sorted before every buy regardless of
 * when the player actually acted — a session's Bigger Bowl purchase folded
 * AFTER dips made following it, and the pre-upgrade cap silently ate them.
 * Found live 2026-07-27: five confirmed dips worth 1.94M folding to 275k on
 * the designer-review table. max(now, last+1) keeps ms real-time ordered
 * against buy bodies (which use Date.now()) while still never repeating.
 */
export function createMsAllocator(seed: number = Date.now()): () => number {
  let last = Math.max(1, Math.floor(seed));
  return function allocate(): number {
    last = Math.max(last + 1, Date.now());
    return last;
  };
}
