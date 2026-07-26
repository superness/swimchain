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
}

export const UPGRADES: Record<string, Upgrade> = {
  season1: { key: 'season1', label: 'Seasoning I',   cost: 30_000,     seasoningNum: 3, seasoningDen: 2 },
  season2: { key: 'season2', label: 'Seasoning II',  cost: 200_000,    seasoningNum: 2, seasoningDen: 1 },
  season3: { key: 'season3', label: 'Seasoning III', cost: 1_200_000,  seasoningNum: 3, seasoningDen: 1 },
  season4: { key: 'season4', label: 'Seasoning IV',  cost: 8_000_000,  seasoningNum: 4, seasoningDen: 1 },
  season5: { key: 'season5', label: 'Seasoning V',   cost: 50_000_000, seasoningNum: 6, seasoningDen: 1 },
  airtight: { key: 'airtight', label: 'Airtight Bowl', cost: 70_000, airtight: true },
  bowl1: { key: 'bowl1', label: 'Bigger Bowl I',   cost: 60_000,      bowlCap: 3_000_000 },
  bowl2: { key: 'bowl2', label: 'Bigger Bowl II',  cost: 2_000_000,   bowlCap: 200_000_000 },
  bowl3: { key: 'bowl3', label: 'Bigger Bowl III', cost: 150_000_000, bowlCap: 5_000_000_000 },
  fryer2: { key: 'fryer2', label: 'Second Fryer', cost: 400_000,     fryers: 2 },
  fryer3: { key: 'fryer3', label: 'Third Fryer',  cost: 12_000_000,  fryers: 3 },
  fryer4: { key: 'fryer4', label: 'Fourth Fryer', cost: 100_000_000, fryers: 4 },
  detector: { key: 'detector', label: 'Golden Chip Detector', cost: 3_000_000, goldenBits: 15 },
};

/** Upgrades that must be bought in order. Buying out of order is rejected. */
export const UPGRADE_CHAINS: string[][] = [
  ['season1', 'season2', 'season3', 'season4', 'season5'],
  ['bowl1', 'bowl2', 'bowl3'],
  ['fryer2', 'fryer3', 'fryer4'],
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

export const DIP_TIERS: DipTier[] = [
  { key: 'salsa',   label: 'Plain Salsa',    minLifetime: 0 },
  { key: 'guac',    label: 'Guacamole',      minLifetime: 300,       sogNum: 96, payNum: 11, payDen: 10 },
  { key: 'onion',   label: 'French Onion',   minLifetime: 3_000 },
  { key: 'queso',   label: 'Queso',          minLifetime: 25_000,    congeal: true },
  { key: 'seven',   label: 'Seven-Layer',    minLifetime: 150_000 },
  { key: 'buffalo', label: 'Buffalo',        minLifetime: 500_000 },
  { key: 'fondue',  label: 'Fondue',         minLifetime: 1_200_000 },
  { key: 'abyss',   label: 'The Abyssal Dip', minLifetime: 3_000_000 },
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
