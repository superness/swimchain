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
 * BALANCE MATH (the reason the curve is shaped this way): with crackle k
 * expected at T_k = CRACKLE_BASE * 2^k seconds of cooking, total expected
 * time to k crackles is ~CRACKLE_BASE * 2^(k+1), and the dip value there is
 * potRate * T_total * 2^k — so the VALUE RATE is roughly FLAT across "dip
 * early" and "hold for golden". Holding is a real gamble (variance), never a
 * strictly better strategy, and never a worse one: exactly the feel the spec
 * demands. Crumbs/sec therefore ~= tick rate, which is what flowsim.ts
 * grades against the session targets.
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
/** Crackles per chip: x2 each, so the top is x32 — GOLDEN, terminal. */
export const MAX_CRACKLES = 5;

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
export const isGolden = (chip: Pick<CookingChip, 'crackles'>): boolean => chip.crackles >= MAX_CRACKLES;
export const worthOf = (chip: Pick<CookingChip, 'pot' | 'crackles'>): number => chip.pot * multiOf(chip);

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
  const next: CookingChip = {
    ...chip,
    pot: chip.pot + (diverted ? 0 : gained),
    cookedMs: chip.cookedMs + TICK_MS,
  };
  let crackled = false;
  let crackleEaten = false;
  if (next.crackles < MAX_CRACKLES) {
    // P(crackle this tick) = tick / expected wait at this level. Memoryless,
    // so the drought CAN run long — that's the gamble — but the pot ticked
    // the whole way, so a drought is never a frozen screen.
    const expectedWaitS = CRACKLE_BASE_S * 2 ** (next.crackles + 1) * Math.max(0.05, crackleHaste);
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
  return { chip: next, gained, crackled, crackleEaten, diverted };
}

export interface DipResult {
  /** What the dip pays: pot x multi, doubled if the double-dip procced. */
  amount: number;
  /** The double-dip upgrade fired — "nobody is watching. dip it again." */
  doubled: boolean;
  multi: number;
}

/**
 * Cash a chip. `doubleDipMod` is the owned upgrade's modulus (0 = none,
 * 4 = one dip in four doubles, 2 = every other) — same catalog field the
 * old game used, remapped to its plain meaning: a chance the dip pays twice.
 */
export function dipChip(
  chip: CookingChip,
  doubleDipMod: number,
  rng: () => number
): DipResult {
  const multi = multiOf(chip);
  const base = worthOf(chip);
  const doubled = doubleDipMod > 0 && rng() < 1 / doubleDipMod;
  return { amount: base * (doubled ? 2 : 1), doubled, multi };
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
