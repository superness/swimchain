/**
 * Chips & Dip balance constants — the single source of truth.
 *
 * Every number here derives from one measured figure: ~60 Argon2id-8MiB
 * attempts/sec/worker, giving ~234 crumbs/sec ≈ 843 chips/hour at one fryer
 * and no seasoning. Because payout is linear in work, that rate is constant
 * regardless of what crispness a player banks at. If the real measured rate
 * differs materially, this whole table rescales together — see chipsConst.test.ts,
 * which pins the relationships that must survive any retune.
 */

/** Argon2id params for the chip grind. Matches TESTNET_CONFIG, which is what
 *  reef runs live on mainnet (swimchain-react/src/lib/action-pow.ts:95). */
export const CHIP_POW = { memoryKib: 8192, iterations: 1, parallelism: 2, hashLength: 32 } as const;

export const CRUMBS_PER_CHIP = 1000;
/** A bank below this many leading zero bits is rejected outright. */
export const BANK_MIN_BITS = 8;
/** At or above this, payout goes superlinear. Lowered to 15 by `detector`. */
export const GOLDEN_BITS = 16;
export const GOLD_NUM = 5, GOLD_DEN = 2;
/** Guard against absurd claims overflowing the 2^53 integer range. */
export const MAX_BITS = 40;

/** Bowl decay, applied per whole elapsed hour as floor(crumbs * num / den). */
export const SOG_DEN = 100;
export const SOG_BASE_NUM = 97;          // ~23 h half-life
export const AIRTIGHT_BONUS = 2;         // added to the numerator when owned
export const SOG_MAX_HOURS = 720;        // 30 days — bounds fold work per gap

/** Raised 100k -> 1M for the pot-x-multi game (2026-07-27): a held-to-golden
 *  early chip is worth ~1-2M, and a starting bowl that clamps 95% of the
 *  player's first jackpot punishes exactly the gamble the game celebrates.
 *  Re-folds history in the growth direction only (clamps less than before). */
export const START_BOWL_CAP = 1_000_000;

export interface Upgrade {
  key: string;
  label: string;
  cost: number;              // crumbs
  bowlCap?: number;          // if set, replaces bowl_cap
  seasoningNum?: number;     // if set, replaces the seasoning multiplier
  seasoningDen?: number;
  fryers?: number;           // if set, replaces the worker count
  airtight?: boolean;
  goldenBits?: number;       // if set, replaces GOLDEN_BITS
  /** If set, replaces the double-dip modulus: a banked chip whose nonce is
   *  divisible by this pays DOUBLE. 4 = one chip in four, 2 = every other.
   *  Grind-resistance: cherry-picking a qualifying nonce costs `mod` times
   *  the chip's whole expected work for a 2x payout, so at mod 4 cheating is
   *  half as efficient as honest play and at mod 2 it is exactly break-even
   *  — there is never an incentive to hold out for a proccing nonce. */
  doubleDipMod?: number;
  /** If set, ADDS to the sog numerator (stacks with `airtight`'s +2). */
  sogBonus?: number;
}

/**
 * RETUNED 2026-07-27 against nine measured active-hours of real chain play
 * (631 banks, 4 tables): a fresh player earned ~385k/h, a maxed-out one
 * ~27M/h, and at those rates the old costs put Second Fryer — the unlock
 * that doubles the event rate — over an hour away from a newcomer while the
 * upper dip tiers sat 58 to 1,162 ACTIVE hours out. Costs cut ~3x early and
 * ~2x late; the ladder ORDER is unchanged. A cost cut re-scores history in
 * the growth direction only for every table that afforded its buys the
 * first time (checked by differential fold before shipping).
 */
export const UPGRADES: Record<string, Upgrade> = {
  season1: { key: 'season1', label: 'Seasoning I',   cost: 10_000,     seasoningNum: 3, seasoningDen: 2 },
  season2: { key: 'season2', label: 'Seasoning II',  cost: 90_000,     seasoningNum: 2, seasoningDen: 1 },
  season3: { key: 'season3', label: 'Seasoning III', cost: 500_000,    seasoningNum: 3, seasoningDen: 1 },
  season4: { key: 'season4', label: 'Seasoning IV',  cost: 4_000_000,  seasoningNum: 4, seasoningDen: 1 },
  season5: { key: 'season5', label: 'Seasoning V',   cost: 25_000_000, seasoningNum: 6, seasoningDen: 1 },
  season6: { key: 'season6', label: 'Seasoning VI',  cost: 60_000_000, seasoningNum: 9, seasoningDen: 1 },
  airtight: { key: 'airtight', label: 'Airtight Bowl', cost: 30_000, airtight: true },
  cellar: { key: 'cellar', label: 'Cellar Shelf', cost: 2_000_000, sogBonus: 2 },
  bowl1: { key: 'bowl1', label: 'Bigger Bowl I',   cost: 25_000,     bowlCap: 3_000_000 },
  bowl2: { key: 'bowl2', label: 'Bigger Bowl II',  cost: 900_000,    bowlCap: 200_000_000 },
  bowl3: { key: 'bowl3', label: 'Bigger Bowl III', cost: 75_000_000, bowlCap: 5_000_000_000 },
  fryer2: { key: 'fryer2', label: 'Second Fryer', cost: 60_000,     fryers: 2 },
  fryer3: { key: 'fryer3', label: 'Third Fryer',  cost: 6_000_000,  fryers: 3 },
  fryer4: { key: 'fryer4', label: 'Fourth Fryer', cost: 50_000_000, fryers: 4 },
  /* RE-PRICED 300k -> 2M, 2026-07-28, operator decision, eyes open.
     The Sous Chef now sells at the queso angel (layer 3), where its
     neighbours are Cellar Shelf 2M, Seasoning IV 4M and Third Fryer 6M —
     300k was the price of a layer-1 jar and it no longer sits at layer 1.
     THIS RE-SCORES HISTORY: 9 purchases across 7 live mainnet tables were
     folded at the old price, and any of those made below 2M now fold
     `rejected-cost`, so those tables lose the jar and every balance after
     it changes. Counted against mainnet before the change, not assumed. */
  autodip: { key: 'autodip', label: 'Sous Chef', cost: 2_000_000 },
  /* APPENDED 2026-07-27. A new key is safe: no reply has ever named it, so
     no history re-folds (same precedent as cellar2). It takes the Sous
     Chef's old 300k slot at avo — same price, same shelf, different jar. */
  overcook: { key: 'overcook', label: 'Burner Knob', cost: 300_000 },
  doubledip1: { key: 'doubledip1', label: 'Double Dip',      cost: 250_000,    doubleDipMod: 4 },
  doubledip2: { key: 'doubledip2', label: 'Deep Double Dip', cost: 10_000_000, doubleDipMod: 2 },
  detector: { key: 'detector', label: 'Golden Chip Detector', cost: 1_500_000, goldenBits: 15 },
  detector2: { key: 'detector2', label: 'Golden Chip Nose',   cost: 12_000_000, goldenBits: 14 },

  /* ── THE DEEP TAIL (2026-07-27) ────────────────────────────────────────
     The game ran out of things to buy at Fondue (~54 active hours) while
     the Abyss sat ~100 hours out — the top of the live leaderboard owned
     every jar available to them and had ~68 hours of empty ladder left.
     These are APPENDED AT CHAIN TAILS ONLY (see UPGRADE_CHAINS below), so
     no historical buy re-scores, and they are sold by the three deep
     critters who previously sold nothing at all: the wing with no bird
     (Buffalo), the fondue oracle (Fondue), and the first chip (Abyss).   */
  season7: { key: 'season7', label: 'Hot Sauce VII',  cost: 200_000_000,   seasoningNum: 12, seasoningDen: 1 },
  season8: { key: 'season8', label: 'Seasoning VIII', cost: 600_000_000,   seasoningNum: 16, seasoningDen: 1 },
  /* ── THE RACK STOPS AT FOUR (operator, 2026-07-28) ─────────────────────
     `fryer5` (300M) and `fryer6` (1.2B) are REMOVED. A basket is a linear
     rate multiplier, but it is also linear ATTENTION — another pot to watch
     and pull — so five and six added more of the same decision in parallel
     rather than a new one, at superlinear screen cost (the rack is already
     two rows on a phone at four; the fifth wrapped and shoved the counter
     below the fold, which is how this surfaced).

     Removing a key is normally forbidden — a historical buy of a key that
     no longer exists folds `rejected-parse`. It is safe HERE, and only
     here, because the whole mainnet was scanned first: `fryer5` had been
     bought exactly ONCE (Corner Rail 684) and `fryer6` never. That one buy
     now folds as a refund — its 300M is never deducted — which is the right
     outcome for a jar being withdrawn. Do not read this as precedent; count
     the rows before ever doing it again.

     Their price points are kept, with jars that add a DECISION instead of
     another basket. Both are pure-ownership keys (no effect field), so the
     fold needs no change at all: it records that they were bought and the
     client does the rest. */
  wingcall: { key: 'wingcall', label: 'A Reason',     cost: 300_000_000 },
  longfry:  { key: 'longfry',  label: 'The Long Fry', cost: 1_200_000_000 },
  bowl4:   { key: 'bowl4',   label: 'The Trough',     cost: 800_000_000,   bowlCap: 100_000_000_000 },
  doubledip3: { key: 'doubledip3', label: 'Shameless Dip', cost: 400_000_000, doubleDipMod: 1 },
  detector3:  { key: 'detector3',  label: 'The Long Spoon', cost: 500_000_000, goldenBits: 13 },
  /** THE STARTER, made deliberate (operator 2026-07-27: "leave it -
   *  rebalance - emergent gameplay why not"). Airtight (+2) plus Cellar
   *  (+2) already pushes the sog numerator to 101/100 — crumbs GROW ~1%
   *  an hour while the tab is closed, which is this game's only offline
   *  progression and was discovered by accident. Rather than clamp it, it
   *  is now a build path with a top rung: +2 more takes you to 103/100. */
  cellar2: { key: 'cellar2', label: 'Old Crumbs', cost: 250_000_000, sogBonus: 2 },
};

/** Upgrades that must be bought in order. Buying out of order is rejected.
 *
 *  APPEND-ONLY, at the TAIL, forever: inserting a rung into the middle of an
 *  existing chain would make historical buys of the rung after it fold as
 *  `rejected-order` — re-scoring every table that bought it. Appending is
 *  safe (a tail rung validates only against the prefix, which is unchanged),
 *  and whole new chains are safe (their keys have no history). */
export const UPGRADE_CHAINS: string[][] = [
  ['season1', 'season2', 'season3', 'season4', 'season5', 'season6', 'season7', 'season8'],
  ['bowl1', 'bowl2', 'bowl3', 'bowl4'],
  // Truncated at four (2026-07-28). Removing TAIL rungs is the mirror of
  // appending them: the surviving rungs validate against an unchanged
  // prefix, so no historical fryer2/3/4 buy re-scores.
  ['fryer2', 'fryer3', 'fryer4'],
  ['doubledip1', 'doubledip2', 'doubledip3'],
  ['detector', 'detector2', 'detector3'],
  // `cellar` was previously unchained; making it the HEAD of a new chain is
  // safe (a head validates against an empty prefix, exactly as an unchained
  // key did), and `cellar2` is new so it has no history to re-score.
  ['cellar', 'cellar2'],
];

export interface DipTier {
  key: string;
  label: string;
  minLifetime: number;       // lifetime chips (un-multiplied)
  sogNum?: number;           // overrides SOG_BASE_NUM
  payNum?: number;           // extra payout multiplier
  payDen?: number;
  congeal?: boolean;         // first bank after a >=12 h gap pays x2
}

/**
 * RETUNED 2026-07-27, same measurement as UPGRADES above. Lifetime chips
 * accrue at exactly 1/512 per toss regardless of banking strategy (a b-bit
 * chip is 2^(b-8) chips per 2^(b+1) expected tosses), i.e. ~422/hour/fryer —
 * so the OLD thresholds put Queso ~10 active hours out, Seven-Layer ~58 and
 * the Abyss ~1,162, on a game with no offline progress. Compressed ~2x at
 * the first rung and ~10-15x at the top: the ladder now runs from a
 * 20-minute first breakthrough to a ~90-active-hour Abyss at four fryers.
 */
export const DIP_TIERS: DipTier[] = [
  { key: 'salsa',   label: 'Plain Salsa',    minLifetime: 0 },
  { key: 'guac',    label: 'Guacamole',      minLifetime: 150,      sogNum: 96, payNum: 11, payDen: 10 },
  { key: 'onion',   label: 'French Onion',   minLifetime: 1_000 },
  { key: 'queso',   label: 'Queso',          minLifetime: 4_000,    congeal: true },
  /* Upper tiers rescaled again for the pot-x-multi engine (2026-07-27):
     lifetime now paces on crumbs/1000, which seasoning inflates 6x late-game
     — the first pass left the Abyss a 24h ride, and a trophy that cheap is
     no trophy (flowsim pins a FLOOR on it now, not just a ceiling). */
  { key: 'seven',   label: 'Seven-Layer',    minLifetime: 40_000 },
  { key: 'buffalo', label: 'Buffalo',        minLifetime: 120_000 },
  { key: 'fondue',  label: 'Fondue',         minLifetime: 350_000 },
  { key: 'abyss',   label: 'The Abyssal Dip', minLifetime: 1_000_000 },
];

/* ── THE DESCENT ───────────────────────────────────────────────────────────
   Below the last dip tier the bowl runs out and the world starts. These are
   CONSENSUS numbers — the fold reads them to decide whether a `broke` is
   allowed and what char it pays — so they sit here with the rest of the
   catalog rather than beside the band NAMES, which are display and live in
   lib/tunnelDepth.ts. Design: docs/superpowers/specs/
   2026-07-28-chips-the-descent-design.md */

/** How many strata there are below the dip. Band i (0-based) is tunnel
 *  ordinal DIP_TIERS.length + i. */
export const DEEP_BAND_COUNT = 6;

/**
 * Lifetime chips needed, IN ONE RUN, to stand at the foot of band `i` and
 * break it. Each band spans twice the lifetime of the one above, matching the
 * tunnel's existing doubling — the visual and the rule cannot drift because
 * there is one formula.
 *
 * Lifetime resets on a tip, so these are per-run figures reached from one
 * fryer, with only salt carried across. Measured pacing (and why it is fine)
 * is in the design doc.
 */
export function deepBandFloor(i: number): number {
  const last = DIP_TIERS[DIP_TIERS.length - 1].minLifetime;
  return last * 2 ** (i + 1);
}

/**
 * CHAR, per band, the FIRST time it is ever broken. Rising with depth: the
 * lava should be worth more than the porcelain.
 *
 * Once-per-band forever (operator's ruling), so this table is the entire char
 * supply in the game — 32 grains, and no amount of replaying can mint a
 * thirty-third. That is what keeps ability pricing stable permanently.
 */
export const CHAR_PER_BAND = [1, 2, 3, 5, 8, 13] as const;

/** Every grain there will ever be. */
export const CHAR_TOTAL = CHAR_PER_BAND.reduce((a, b) => a + b, 0);

/** Congeal gap threshold, in ms. */
export const CONGEAL_GAP_MS = 12 * 60 * 60 * 1000;

/* ── THE BOTTOM OF THE BOWL ──────────────────────────────────────────────
   You strike porcelain in the Queso — long before the deep shelves exist —
   and can tip the whole bowl back over, keeping OLD SALT.

   THIS IS THE CONSENSUS FLOOR, NOT THE OFFER. A tip below it folds
   `rejected-shallow`, so a fresh table cannot farm the ceremony; that rule
   is on the chain and CANNOT MOVE (raising it re-scores every tip already
   taken — priced against mainnet 2026-07-27, two real tables). Where the
   game actually PUTS the twist in front of you is policy and lives in
   lib/bowlGate.ts (`REVEAL_FLOOR`, 10,000 — about 4.9 active hours, still
   inside the Queso and still long before the deep shelves).              */
export const TIP_FLOOR = 4_000;
/** Salt for a run that tips exactly at the floor. sqrt-scaled above it
    (chipsEngine.saltFor), so a Queso tip pays 10 and the Abyss pays ~158 —
    15x the salt for 250x the grind, which is what keeps looping early a
    live choice instead of a trap. */
export const SALT_PER_TIP = 10;

/**
 * Most chips one reply may bank.
 *
 * A SECURITY BOUND, checked by counting entries before any hashing: without it
 * a single hostile reply declaring 10,000 entries would force every observer
 * into 10,000 Argon2id-8MiB hashes to fold that table — and the boards fold
 * other people's tables.
 *
 * Arbitrary-but-practical: the 1 KB inline-storage threshold fits ~29 entries,
 * rounded down for headroom. NOT an optimised value — and not safe to re-tune,
 * because raising it would newly credit previously-rejected replies and
 * lowering it would un-credit counted chips, re-scoring every table.
 */
export const MAX_BATCH = 24;
