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

export const START_BOWL_CAP = 100_000;

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
  doubledip1: { key: 'doubledip1', label: 'Double Dip',      cost: 250_000,    doubleDipMod: 4 },
  doubledip2: { key: 'doubledip2', label: 'Deep Double Dip', cost: 10_000_000, doubleDipMod: 2 },
  detector: { key: 'detector', label: 'Golden Chip Detector', cost: 1_500_000, goldenBits: 15 },
  detector2: { key: 'detector2', label: 'Golden Chip Nose',   cost: 12_000_000, goldenBits: 14 },
};

/** Upgrades that must be bought in order. Buying out of order is rejected.
 *
 *  APPEND-ONLY, at the TAIL, forever: inserting a rung into the middle of an
 *  existing chain would make historical buys of the rung after it fold as
 *  `rejected-order` — re-scoring every table that bought it. Appending is
 *  safe (a tail rung validates only against the prefix, which is unchanged),
 *  and whole new chains are safe (their keys have no history). */
export const UPGRADE_CHAINS: string[][] = [
  ['season1', 'season2', 'season3', 'season4', 'season5', 'season6'],
  ['bowl1', 'bowl2', 'bowl3'],
  ['fryer2', 'fryer3', 'fryer4'],
  ['doubledip1', 'doubledip2'],
  ['detector', 'detector2'],
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
  { key: 'seven',   label: 'Seven-Layer',    minLifetime: 12_000 },
  { key: 'buffalo', label: 'Buffalo',        minLifetime: 30_000 },
  { key: 'fondue',  label: 'Fondue',         minLifetime: 80_000 },
  { key: 'abyss',   label: 'The Abyssal Dip', minLifetime: 200_000 },
];

/** Congeal gap threshold, in ms. */
export const CONGEAL_GAP_MS = 12 * 60 * 60 * 1000;

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
