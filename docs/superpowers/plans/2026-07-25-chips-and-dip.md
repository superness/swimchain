# Chips & Dip — Implementation Plan (Phase 1a: browser client)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable browser client for Chips & Dip at swimchain.io/chips, where a chip is a verifiable Argon2id proof, the bowl decays, and the whole game state folds deterministically from one player's replies.

**Architecture:** A pure, synchronous, integer-only fold (`chipsEngine.ts`) over a player's own replies, exactly like `reef-client/src/lib/reefEngine.ts`. Chip verification (Argon2id) happens *outside* the fold and is handed in as a precomputed `Map<content_id, bits>`, which keeps the fold pure, fast, and testable. All platform access is behind one seam (`host.ts`) so Phase 1b can add a Tauri/sidecar implementation without touching game code.

**Tech Stack:** TypeScript, React 18, Vite 5, `hash-wasm` (Argon2id), `@swimchain/react` (PoW/sign/RPC helpers), `@swimchain/core`. Tests are plain `tsx` scripts with asserts — no test framework — matching `reef-client`.

**Spec:** `docs/superpowers/specs/2026-07-25-chips-and-dip-design.md`

## Global Constraints

- **Worktree:** `C:\github\swimchain-chips`, branch `feat/chips-and-dip`. All paths below are relative to it.
- **No floats in the fold.** Every value is an integer; every multiplier is an integer `num/den` pair applied with `Math.floor`. This is spec design principle 1 — a float anywhere in the fold is a correctness bug, not a style issue.
- **No wall clock in the fold.** All time math uses the authoring-ms embedded in each move body (`#<ms>~`). `Date.now()` must not appear in `chipsEngine.ts`.
- **The fold is pure and synchronous.** No `async`, no I/O, no RPC, no crypto. Verification results are passed in.
- **Chip PoW params are pinned:** Argon2id, `memoryKib: 8192`, `iterations: 1`, `parallelism: 2`, `hashLength: 32` — matching `TESTNET_CONFIG` in `swimchain-react/src/lib/action-pow.ts:95`, which is what reef uses live on mainnet.
- **Node version:** `>=18.0.0`. Package is `private: true`, `type: "module"`.
- **Never ship a localhost RPC fallback.** The production build must be grep-verified for baked endpoints before deploy (Task 11).
- **Commit after every task.** Conventional commits (`feat:`, `fix:`, `test:`, `docs:`).

---

## File Structure

| File | Responsibility |
|---|---|
| `chips-client/package.json` | Deps, scripts, test runner wiring |
| `chips-client/vite.config.ts` | `base: '/chips/'`, COOP/COEP headers for WASM, worker ES format |
| `chips-client/index.html` | Entry |
| `chips-client/src/lib/chipsConst.ts` | Every tunable constant. Single source of truth for balance. |
| `chips-client/src/lib/chipsPow.ts` | Chip preimage construction, `verifyChipBits`, `mineChip` |
| `chips-client/src/lib/chipsEngine.ts` | The pure fold: parse, order, bank, decay, buy, tiers |
| `chips-client/src/lib/chipsVerify.ts` | Memoized verification cache (impure; wraps `chipsPow`) |
| `chips-client/src/lib/host.ts` | **The only platform seam.** Read/submit/sponsor/requestContent. |
| `chips-client/src/lib/crunch.worker.ts` | Off-thread Argon2id grinder |
| `chips-client/src/lib/*.test.ts` | `tsx`-run assert scripts |
| `chips-client/src/App.tsx`, `Kitchen.tsx`, `Bowl.tsx`, `Boards.tsx` | UI |

---

### Task 1: Scaffold the client and lock the balance constants

**Files:**
- Create: `chips-client/package.json`, `chips-client/vite.config.ts`, `chips-client/tsconfig.json`, `chips-client/tsconfig.node.json`, `chips-client/index.html`
- Create: `chips-client/src/lib/chipsConst.ts`
- Test: `chips-client/src/lib/chipsConst.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every constant below, imported by all later tasks. Exact names matter.

- [ ] **Step 1: Write the failing coherence test**

The spec's cost curve is load-bearing for pacing and breaks silently if one constant is edited alone. This test pins the gating.

Create `chips-client/src/lib/chipsConst.test.ts`:

```ts
/**
 * Coherence of the balance constants. Run: npx tsx src/lib/chipsConst.test.ts
 * These are not arbitrary numbers — the purchase gating in the spec requires
 * each bowl tier to be affordable under the PRECEDING cap, or progression stalls.
 */
import {
  UPGRADES, START_BOWL_CAP, DIP_TIERS, GOLDEN_BITS, BANK_MIN_BITS, MAX_BITS,
  CRUMBS_PER_CHIP, SOG_MAX_HOURS,
} from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// Each bowl tier must be affordable under the cap in force before it.
{
  let cap = START_BOWL_CAP;
  for (const key of ['bowl1', 'bowl2', 'bowl3']) {
    const u = UPGRADES[key];
    check(`${key} affordable under preceding cap`, u.cost <= cap, { cost: u.cost, cap });
    cap = u.bowlCap!;
  }
}

// No upgrade may cost more than the largest reachable cap.
{
  const maxCap = UPGRADES['bowl3'].bowlCap!;
  for (const [key, u] of Object.entries(UPGRADES)) {
    check(`${key} cost within max cap`, u.cost <= maxCap, { cost: u.cost, maxCap });
  }
}

// Seasoning tiers must strictly increase in both cost and multiplier.
{
  const keys = ['season1', 'season2', 'season3', 'season4', 'season5'];
  for (let i = 1; i < keys.length; i++) {
    const a = UPGRADES[keys[i - 1]], b = UPGRADES[keys[i]];
    check(`${keys[i]} costs more than ${keys[i - 1]}`, b.cost > a.cost);
    const av = a.seasoningNum! / a.seasoningDen!, bv = b.seasoningNum! / b.seasoningDen!;
    check(`${keys[i]} multiplies more than ${keys[i - 1]}`, bv > av);
  }
}

// Dip thresholds strictly increase and start at zero.
{
  check('first dip tier is free', DIP_TIERS[0].minLifetime === 0);
  for (let i = 1; i < DIP_TIERS.length; i++) {
    check(`dip ${DIP_TIERS[i].key} threshold rises`, DIP_TIERS[i].minLifetime > DIP_TIERS[i - 1].minLifetime);
  }
}

// Sanity on the PoW bounds.
check('BANK_MIN_BITS below GOLDEN_BITS', BANK_MIN_BITS < GOLDEN_BITS);
check('GOLDEN_BITS below MAX_BITS', GOLDEN_BITS < MAX_BITS);
check('MAX_BITS keeps crumbs inside 2^53', CRUMBS_PER_CHIP * 2 ** (MAX_BITS - BANK_MIN_BITS) < Number.MAX_SAFE_INTEGER);
check('SOG_MAX_HOURS is 30 days', SOG_MAX_HOURS === 720);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsConst.test.ts
```
Expected: FAIL — `Cannot find module './chipsConst'`.

- [ ] **Step 3: Create the scaffold files**

`chips-client/package.json`:

```json
{
  "name": "@swimchain/chips-client",
  "version": "0.1.0",
  "description": "Chips & Dip — an idle game where a chip is a verifiable Argon2id proof and the bowl goes soggy if you hoard it.",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "tsx src/lib/chipsConst.test.ts"
  },
  "dependencies": {
    "@swimchain/core": "file:../swimchain-js",
    "@swimchain/react": "file:../swimchain-react",
    "hash-wasm": "^4.12.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "tsx": "^4.23.1",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

`chips-client/vite.config.ts` — copy `reef-client/vite.config.ts` exactly, changing only `base` to `'/chips/'` and `server.port` to `5185`. The COOP/COEP headers are required for the Argon2id WASM and must not be dropped.

`chips-client/tsconfig.json` and `tsconfig.node.json`: copy verbatim from `reef-client/`.

`chips-client/index.html`: copy `reef-client/index.html`, change `<title>` to `Chips &amp; Dip` and the script src to `/src/main.tsx`.

- [ ] **Step 4: Write `chipsConst.ts`**

```ts
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
```

- [ ] **Step 5: Install and run the test to verify it passes**

```bash
cd chips-client && npm install && npx tsx src/lib/chipsConst.test.ts
```
Expected: all `ok`, `ALL PASS`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): scaffold client and lock balance constants"
```

---

### Task 2: Chip proof — preimage, verification, mining

**Files:**
- Create: `chips-client/src/lib/chipsPow.ts`
- Test: `chips-client/src/lib/chipsPow.test.ts`
- Modify: `chips-client/package.json` (add to `test` script)

**Interfaces:**
- Consumes: `CHIP_POW`, `MAX_BITS` from `chipsConst.ts`.
- Produces:
  - `chipPreimage(authorIdHex: string, tableId: string, ms: number, nonce: bigint): Uint8Array`
  - `verifyChipBits(authorIdHex: string, tableId: string, ms: number, nonce: bigint): Promise<number>` — returns actual leading zero bits
  - `mineChip(authorIdHex, tableId, ms, opts): Promise<{nonce: bigint, bits: number}>`

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/chipsPow.test.ts`:

```ts
/**
 * Chip proof round-trip. Run: npx tsx src/lib/chipsPow.test.ts
 * Uses REAL Argon2id at the pinned params, so this takes a few seconds.
 */
import { chipPreimage, verifyChipBits, mineChip } from './chipsPow';

const AUTHOR = 'a'.repeat(64);
const TABLE = 'sha256:beef';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

async function main() {
  // Preimage binds every field — changing any one changes the bytes.
  const base = chipPreimage(AUTHOR, TABLE, 1000, 7n);
  check('preimage differs on nonce', !eq(base, chipPreimage(AUTHOR, TABLE, 1000, 8n)));
  check('preimage differs on ms', !eq(base, chipPreimage(AUTHOR, TABLE, 1001, 7n)));
  check('preimage differs on table', !eq(base, chipPreimage(AUTHOR, 'sha256:other', 1000, 7n)));
  check('preimage differs on author', !eq(base, chipPreimage('b'.repeat(64), TABLE, 1000, 7n)));

  // Verification is deterministic: same input, same bits, every time.
  const b1 = await verifyChipBits(AUTHOR, TABLE, 1000, 7n);
  const b2 = await verifyChipBits(AUTHOR, TABLE, 1000, 7n);
  check('verification is deterministic', b1 === b2, { b1, b2 });
  check('bits is a non-negative integer', Number.isInteger(b1) && b1 >= 0, b1);

  // Mining to a low target returns a nonce that verifies to at least that target.
  const mined = await mineChip(AUTHOR, TABLE, 2000, { targetBits: 6 });
  const actual = await verifyChipBits(AUTHOR, TABLE, 2000, mined.nonce);
  check('mined nonce meets its target', actual >= 6, { actual });
  check('mined bits match verification', mined.bits === actual, { mined: mined.bits, actual });

  // A chip mined for one author must NOT verify for another — non-transferable.
  const other = await verifyChipBits('b'.repeat(64), TABLE, 2000, mined.nonce);
  check('chip is author-bound', other < 6 || other !== actual, { other, actual });

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

function eq(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsPow.test.ts
```
Expected: FAIL — `Cannot find module './chipsPow'`.

- [ ] **Step 3: Implement `chipsPow.ts`**

```ts
/**
 * The chip proof.
 *
 * A chip is an Argon2id hash over a preimage bound to the player and their
 * table; its CRISPNESS is the count of leading zero bits. Finding a d-bit chip
 * costs ~2^d attempts, while checking one costs exactly one hash — the PoW
 * asymmetry that lets every client re-verify every other player's chips.
 *
 * The preimage binds author_id and table_id specifically so a chip is
 * non-transferable: copying someone else's winning nonce proves nothing on
 * your own table.
 */
import { argon2id } from 'hash-wasm';
import { CHIP_POW, MAX_BITS } from './chipsConst';

const DOMAIN = 'chips-v1';
/** Fixed 16-byte salt. Argon2 requires >= 8; the domain separation lives in the
 *  password, so a constant salt is correct here and keeps verification pure. */
const SALT = new TextEncoder().encode('chips-v1-salt-16');

export function chipPreimage(
  authorIdHex: string,
  tableId: string,
  ms: number,
  nonce: bigint
): Uint8Array {
  const head = new TextEncoder().encode(`${DOMAIN}|${authorIdHex}|${tableId}|${ms}|`);
  const tail = new Uint8Array(8);
  new DataView(tail.buffer).setBigUint64(0, BigInt.asUintN(64, nonce), true); // little-endian
  const out = new Uint8Array(head.length + 8);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

/** Count leading zero BITS of a hash. */
export function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

async function chipHash(preimage: Uint8Array): Promise<Uint8Array> {
  const hash = await argon2id({
    password: preimage,
    salt: SALT,
    parallelism: CHIP_POW.parallelism,
    memorySize: CHIP_POW.memoryKib,
    iterations: CHIP_POW.iterations,
    hashLength: CHIP_POW.hashLength,
    outputType: 'binary',
  });
  return new Uint8Array(hash);
}

/** Actual crispness of a claimed chip. One Argon2id call. */
export async function verifyChipBits(
  authorIdHex: string,
  tableId: string,
  ms: number,
  nonce: bigint
): Promise<number> {
  const bits = leadingZeroBits(await chipHash(chipPreimage(authorIdHex, tableId, ms, nonce)));
  return Math.min(bits, MAX_BITS);
}

export interface MineOpts {
  targetBits: number;
  /** Called every attempt so the UI can show the chip crisping. */
  onProgress?: (attempts: number, bestBits: number) => void;
  /** Return true to stop early and keep the best chip so far. */
  shouldStop?: () => boolean;
}

/**
 * Grind until `targetBits` is reached or `shouldStop` fires. Returns the BEST
 * chip found, so an early stop still banks whatever crispness was achieved.
 */
export async function mineChip(
  authorIdHex: string,
  tableId: string,
  ms: number,
  opts: MineOpts
): Promise<{ nonce: bigint; bits: number }> {
  let nonce = 0n;
  let best = { nonce: 0n, bits: -1 };
  let attempts = 0;
  for (;;) {
    const bits = leadingZeroBits(await chipHash(chipPreimage(authorIdHex, tableId, ms, nonce)));
    attempts++;
    if (bits > best.bits) best = { nonce, bits: Math.min(bits, MAX_BITS) };
    opts.onProgress?.(attempts, best.bits);
    if (best.bits >= opts.targetBits) return best;
    if (opts.shouldStop?.()) return best;
    nonce++;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsPow.test.ts
```
Expected: all `ok`, `ALL PASS`. Takes a few seconds (real Argon2id).

- [ ] **Step 5: Add to the test script and commit**

Set `"test"` in `package.json` to `"tsx src/lib/chipsConst.test.ts && tsx src/lib/chipsPow.test.ts"`.

```bash
git add chips-client/
git commit -m "feat(chips): author-bound chip preimage, verification and mining"
```

---

### Task 3: The fold — parsing, ordering, and bank payout

**Files:**
- Create: `chips-client/src/lib/chipsEngine.ts`
- Test: `chips-client/src/lib/chipsEngine.bank.test.ts`

**Interfaces:**
- Consumes: all of `chipsConst.ts`.
- Produces:
  - `type ChipsReply = { author_id: string; body: string; block_height: number | null; content_id: string; created_at: number }`
  - `type ChipsHeader = { v: 1; kind: 'chips-table'; name: string; owner: string }` — `owner` is the table post's `author_id`; the fold skips replies from anyone else
  - `type ChipsState` (fields listed in the code below)
  - `foldChips(header: ChipsHeader, tableId: string, replies: ChipsReply[], verified: Map<string, number>): ChipsState`
  - `parseMove(body: string): ParsedMove | null`
  - `authoringMs(body: string): number | null`

**Body grammar** (fixed, do not change without updating every task):

```
bank <bits> <nonce_hex>#<ms>~
buy <upgrade-key>#<ms>~
```

`<ms>` is the authoring timestamp and is *also* the `ms` field of the chip preimage — one value, never duplicated.

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/chipsEngine.bank.test.ts`:

```ts
/**
 * Bank payout: linearity, the golden band, and rejection.
 * Run: npx tsx src/lib/chipsEngine.bank.test.ts
 * The fold is pure — verification results are passed in, so no crypto here.
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { CRUMBS_PER_CHIP, GOLDEN_BITS, GOLD_NUM, GOLD_DEN } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'Test Table', owner: A };
const TABLE = 'sha256:table';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/**
 * All banks at the same ms so decay never runs — payout is isolated.
 * The nonce MUST vary per chip: a repeated (ms, nonce) pair is the same proof
 * and folds as a duplicate, which is what test 5 below deliberately exercises.
 */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms = 1_000_000, nonceHex?: string) => ({
  author_id: A,
  body: `bank ${bits} ${nonceHex ?? (++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
const verifiedAll = (replies: ChipsReply[], bits: number) =>
  new Map(replies.map((r) => [r.content_id, bits]));

// 1) Linearity: one 14-bit chip == 64 eight-bit chips, before seasoning.
{
  const one = [bank(14, 'c1')];
  const s1 = foldChips(H, TABLE, one, verifiedAll(one, 14));

  const many: ChipsReply[] = [];
  for (let i = 0; i < 64; i++) many.push(bank(8, `c_${String(i).padStart(3, '0')}`));
  const s2 = foldChips(H, TABLE, many, verifiedAll(many, 8));

  check('one 14-bit == 64 8-bit chips', s1.crumbs === s2.crumbs, { one: s1.crumbs, many: s2.crumbs });
  check('14-bit pays 2^6 chips', s1.crumbs === CRUMBS_PER_CHIP * 64, s1.crumbs);
}

// 2) Golden band pays superlinear.
// Asserts on the RECORDED PAYOUT, not state.crumbs: these amounts exceed the
// starting bowl cap, and the rim would clip them and mask the actual result.
{
  const below = [bank(GOLDEN_BITS - 1, 'g1')];
  const at = [bank(GOLDEN_BITS, 'g2')];
  const sb = foldChips(H, TABLE, below, verifiedAll(below, GOLDEN_BITS - 1));
  const sa = foldChips(H, TABLE, at, verifiedAll(at, GOLDEN_BITS));
  const plain = CRUMBS_PER_CHIP * 2 ** (GOLDEN_BITS - 8);
  check('below golden is plain', sb.moves[0].crumbs === plain / 2, sb.moves[0].crumbs);
  check('at golden is boosted', sa.moves[0].crumbs === Math.floor((plain * GOLD_NUM) / GOLD_DEN), sa.moves[0].crumbs);
  check('golden beats plain per unit work',
    (sa.moves[0].crumbs ?? 0) > 2 * (sb.moves[0].crumbs ?? 0));
}

// 3) Over-claiming is rejected-but-present.
{
  const rs = [bank(20, 'x1')];
  const s = foldChips(H, TABLE, rs, new Map([['x1', 10]])); // actually only 10 bits
  check('over-claimed bank credits nothing', s.crumbs === 0, s.crumbs);
  check('over-claimed bank still ordered', s.moves.length === 1, s.moves.length);
  check('over-claimed outcome is rejected', s.moves[0].outcome === 'rejected-bits', s.moves[0].outcome);
}

// 4) Under-minimum is rejected.
{
  const rs = [bank(4, 'y1')];
  const s = foldChips(H, TABLE, rs, new Map([['y1', 4]]));
  check('sub-minimum bank rejected', s.crumbs === 0, s.crumbs);
  check('sub-minimum outcome', s.moves[0].outcome === 'rejected-bits', s.moves[0].outcome);
}

// 5) Duplicate nonce at the same ms is rejected (no replay of one proof).
{
  const rs = [bank(10, 'z1', 1_000_000, 'aa'), bank(10, 'z2', 1_000_000, 'aa')];
  const s = foldChips(H, TABLE, rs, verifiedAll(rs, 10));
  check('duplicate proof credited once', s.crumbs === CRUMBS_PER_CHIP * 4, s.crumbs);
  check('duplicate outcome', s.moves[1].outcome === 'rejected-duplicate', s.moves[1].outcome);
}

// 6) Lifetime crunch and crispest are tracked un-multiplied.
{
  const rs = [bank(12, 'l1'), bank(9, 'l2', 1_000_001)];
  const s = foldChips(H, TABLE, rs, new Map([['l1', 12], ['l2', 9]]));
  check('lifetime = 16 + 2 chips', s.lifetimeChips === 18, s.lifetimeChips);
  check('crispest is the max bits', s.crispest === 12, s.crispest);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.bank.test.ts
```
Expected: FAIL — `Cannot find module './chipsEngine'`.

- [ ] **Step 3: Implement the fold's core**

Create `chips-client/src/lib/chipsEngine.ts`:

```ts
/**
 * Chips & Dip — the deterministic fold.
 *
 * Your bowl, your upgrades and your lifetime crunch are a pure function of the
 * replies on YOUR OWN table post, in chain order. Other players' tables are
 * display input for the boards and never touch your balance — that fold
 * isolation is what makes every observer's state byte-identical even though
 * different clients host different subsets of tables.
 *
 * Determinism rules, all load-bearing:
 *   - integers only, every multiplier a num/den pair with Math.floor
 *   - no wall clock; elapsed time is the consensus-bounded action timestamp
 *     (created_at) of CONFIRMED replies only. The body's authoring-ms orders
 *     moves within a block and salts the chip preimage, but NEVER measures
 *     elapsed time — a player writes it themselves, so keying decay to it lets
 *     them switch decay off by future-dating a single move.
 *   - only the table owner's replies are folded; anyone can reply to a post
 *   - pure and synchronous; Argon2id verification is done by the caller and
 *     handed in as `verified`, which MUST contain an entry for every bank.
 */
import {
  BANK_MIN_BITS, CRUMBS_PER_CHIP, GOLDEN_BITS, GOLD_NUM, GOLD_DEN, MAX_BITS,
  SOG_BASE_NUM, SOG_DEN, AIRTIGHT_BONUS, SOG_MAX_HOURS, START_BOWL_CAP,
  UPGRADES, UPGRADE_CHAINS, DIP_TIERS, CONGEAL_GAP_MS,
} from './chipsConst';

export interface ChipsHeader {
  v: 1;
  kind: 'chips-table';
  name: string;
  /** The table post's author_id. Replies from anyone else are skipped entirely. */
  owner: string;
}

export interface ChipsReply {
  author_id: string;
  body: string;
  block_height: number | null;
  content_id: string;
  created_at: number;
}

export type Outcome =
  | 'banked' | 'rejected-bits' | 'rejected-duplicate' | 'rejected-unverified'
  | 'bought' | 'rejected-cost' | 'rejected-owned' | 'rejected-order' | 'rejected-parse';

export interface MoveResult {
  content_id: string;
  ms: number;
  outcome: Outcome;
  bits?: number;
  crumbs?: number;
  upgradeKey?: string;
}

export interface ChipsState {
  crumbs: number;
  lifetimeChips: number;
  crispest: number;
  owned: Set<string>;
  bowlCap: number;
  seasoningNum: number;
  seasoningDen: number;
  fryers: number;
  goldenBits: number;
  airtight: boolean;
  dipIndex: number;
  /** Action timestamp of the last CONFIRMED move. The decay clock. */
  lastConfirmedAt: number;
  /** Action timestamp of the last confirmed bank, for the congeal quirk. */
  lastBankAt: number;
  /** Banks with no entry in `verified` — the UI must gate on this being 0. */
  unverifiedBanks: number;
  moves: MoveResult[];
}

export type ParsedMove =
  | { kind: 'bank'; bits: number; nonce: bigint; ms: number }
  | { kind: 'buy'; key: string; ms: number };

/** The reef-style embedded authoring timestamp: `...#<ms>~` */
export function authoringMs(body: string): number | null {
  const m = /#(\d+)~\s*$/.exec(body.trim());
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

export function parseMove(body: string): ParsedMove | null {
  const ms = authoringMs(body);
  if (ms === null) return null;
  const head = body.trim().replace(/#\d+~$/, '').trim();

  const bankM = /^bank\s+(\d+)\s+([0-9a-fA-F]{1,16})$/.exec(head);
  if (bankM) {
    const bits = Number(bankM[1]);
    if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) return null;
    return { kind: 'bank', bits, nonce: BigInt('0x' + bankM[2]), ms };
  }

  const buyM = /^buy\s+([a-z0-9]+)$/.exec(head);
  if (buyM) return { kind: 'buy', key: buyM[1], ms };

  return null;
}

/** Confirmed first (by height), then authoring-ms, then content_id. Pending last. */
function orderReplies(replies: ChipsReply[]): ChipsReply[] {
  return [...replies].sort((a, b) => {
    const ah = a.block_height ?? Number.MAX_SAFE_INTEGER;
    const bh = b.block_height ?? Number.MAX_SAFE_INTEGER;
    if (ah !== bh) return ah - bh;
    // Fall back to 0, never created_at: the node stamps PENDING replies'
    // created_at at query time, so using it here would order unparsed replies
    // differently on every client and every refresh (the reef pending bug).
    const am = authoringMs(a.body) ?? 0;
    const bm = authoringMs(b.body) ?? 0;
    if (am !== bm) return am - bm;
    return a.content_id < b.content_id ? -1 : a.content_id > b.content_id ? 1 : 0;
  });
}

export function dipIndexFor(lifetimeChips: number): number {
  let idx = 0;
  for (let i = 0; i < DIP_TIERS.length; i++) {
    if (lifetimeChips >= DIP_TIERS[i].minLifetime) idx = i;
  }
  return idx;
}

/** Sog numerator: the dip tier sets the base, `airtight` then adds. Order fixed. */
function sogNum(state: ChipsState): number {
  const tier = DIP_TIERS[state.dipIndex];
  const base = tier.sogNum ?? SOG_BASE_NUM;
  return base + (state.airtight ? AIRTIGHT_BONUS : 0);
}

/**
 * Whole elapsed hours of decay between two action timestamps, clamped to
 * SOG_MAX_HOURS.
 *
 * Exported ONLY so the clamp is directly testable. It cannot be observed
 * through `crumbs` in any realistic fixture: at the base rate (97/100) integer
 * flooring zeroes a reachable bowl in ~379 hours, well inside the 720-hour
 * clamp, and even under `airtight` (99/100) the ~95-crumb survivor is the same
 * order as the accumulated floor error. The clamp is an arithmetic property,
 * so it gets an arithmetic test rather than a fixture that passes by luck.
 */
export function sogHoursFor(fromAt: number, toAt: number): number {
  if (toAt <= fromAt) return 0;
  return Math.min(Math.floor((toAt - fromAt) / 3_600_000), SOG_MAX_HOURS);
}

/** Decay the bowl over whole elapsed hours. Integer-only, bounded work. */
function applySog(state: ChipsState, fromMs: number, toMs: number): void {
  if (toMs <= fromMs || state.crumbs <= 0) return;
  const hours = sogHoursFor(fromMs, toMs);
  const num = sogNum(state);
  for (let i = 0; i < hours && state.crumbs > 0; i++) {
    state.crumbs = Math.floor((state.crumbs * num) / SOG_DEN);
  }
}

/** `at` is the ACTION timestamp (created_at), never the body's authoring-ms. */
function payoutFor(state: ChipsState, bits: number, at: number): number {
  let crumbs = CRUMBS_PER_CHIP * 2 ** (bits - BANK_MIN_BITS);
  if (bits >= state.goldenBits) crumbs = Math.floor((crumbs * GOLD_NUM) / GOLD_DEN);

  const tier = DIP_TIERS[state.dipIndex];
  if (tier.payNum && tier.payDen) crumbs = Math.floor((crumbs * tier.payNum) / tier.payDen);
  if (tier.congeal && state.lastBankAt > 0 && at - state.lastBankAt >= CONGEAL_GAP_MS) crumbs *= 2;

  return Math.floor((crumbs * state.seasoningNum) / state.seasoningDen);
}

function initialState(): ChipsState {
  return {
    crumbs: 0, lifetimeChips: 0, crispest: 0,
    owned: new Set(), bowlCap: START_BOWL_CAP,
    seasoningNum: 1, seasoningDen: 1, fryers: 1,
    goldenBits: GOLDEN_BITS, airtight: false,
    dipIndex: 0, lastConfirmedAt: 0, lastBankAt: 0,
    unverifiedBanks: 0, moves: [],
  };
}

/**
 * Fold a table's replies into game state.
 *
 * PRECONDITION: `verified` maps content_id -> actual leading zero bits for
 * EVERY bank reply. A missing entry folds as `rejected-unverified`, which is
 * deterministic but wrong — callers must complete verification first
 * (see chipsVerify.ts) or clients will disagree.
 */
export function foldChips(
  header: ChipsHeader,
  _tableId: string,
  replies: ChipsReply[],
  verified: Map<string, number>
): ChipsState {
  const state = initialState();
  const seenProofs = new Set<string>();

  for (const reply of orderReplies(replies)) {
    // OWNER ENFORCEMENT. Anyone may reply to a public post, so without this a
    // stranger drives your state for the price of one reply: floor your bowl
    // by advancing the clock, inflate your lifetime into a faster-decaying dip
    // tier, or spend your crumbs. Skipped BEFORE any clock advance or mutation.
    if (reply.author_id !== header.owner) continue;

    const parsed = parseMove(reply.body);
    if (!parsed) {
      state.moves.push({ content_id: reply.content_id, ms: 0, outcome: 'rejected-parse' });
      continue;
    }

    // THE DECAY CLOCK IS THE ACTION TIMESTAMP (created_at), NEVER parsed.ms.
    // created_at is consensus-bounded — verify_pow rejects actions >60s in the
    // future (src/crypto/action_pow.rs:554-572) — whereas the body's #<ms>~ is
    // free text a player could pin in the future forever to switch decay off.
    // Pending replies carry a query-time created_at, so they never advance it.
    const confirmed = reply.block_height !== null;
    if (confirmed) {
      if (state.lastConfirmedAt > 0) applySog(state, state.lastConfirmedAt, reply.created_at);
      state.lastConfirmedAt = Math.max(state.lastConfirmedAt, reply.created_at);
    }
    const at = confirmed ? reply.created_at : state.lastConfirmedAt;

    if (parsed.kind === 'bank') {
      // Author is part of the proof preimage, so it belongs in the identity key.
      const proofKey = `${reply.author_id}:${parsed.ms}:${parsed.nonce.toString(16)}`;
      const actual = verified.get(reply.content_id);

      if (actual === undefined) {
        state.unverifiedBanks++;
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-unverified' });
      } else if (parsed.bits < BANK_MIN_BITS || actual < parsed.bits) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-bits', bits: parsed.bits });
      } else if (seenProofs.has(proofKey)) {
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-duplicate', bits: parsed.bits });
      } else {
        seenProofs.add(proofKey);
        const crumbs = payoutFor(state, parsed.bits, at);
        state.crumbs = Math.min(state.crumbs + crumbs, state.bowlCap);
        state.lifetimeChips += 2 ** (parsed.bits - BANK_MIN_BITS);
        if (parsed.bits > state.crispest) state.crispest = parsed.bits;
        state.dipIndex = dipIndexFor(state.lifetimeChips);
        if (confirmed) state.lastBankAt = at;
        state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'banked', bits: parsed.bits, crumbs });
      }
      continue;
    }

    applyBuy(state, reply, parsed);
  }

  return state;
}

/** Implemented in Task 5. */
function applyBuy(state: ChipsState, reply: ChipsReply, parsed: { kind: 'buy'; key: string; ms: number }): void {
  state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-parse', upgradeKey: parsed.key });
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.bank.test.ts
```
Expected: all `ok`, `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): deterministic fold with bank payout, golden band and rejection"
```

---

### Task 4: Sogginess — decay, the bowl rim, and long absences

**Files:**
- Modify: `chips-client/src/lib/chipsEngine.ts` (already has `applySog`; this task tests and hardens it)
- Test: `chips-client/src/lib/chipsEngine.sog.test.ts`

**Interfaces:**
- Consumes: `foldChips`, `ChipsState` from Task 3.
- Produces: no new exports — this task proves decay behaviour and fixes any bugs it exposes.

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/chipsEngine.sog.test.ts`:

```ts
/**
 * Sogginess: hour-boundary decay, the 30-day clamp, the bowl rim, and the
 * fixed dip-then-airtight resolution order.
 * Run: npx tsx src/lib/chipsEngine.sog.test.ts
 */
import { foldChips, sogHoursFor, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { SOG_BASE_NUM, SOG_DEN, SOG_MAX_HOURS, START_BOWL_CAP, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const HOUR = 3_600_000;
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Nonce varies per chip — a repeated (ms, nonce) pair folds as a duplicate. */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms: number): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
const vAll = (rs: ChipsReply[], bits: number) => new Map(rs.map((r) => [r.content_id, bits]));

// 1) Sub-hour gaps do not decay at all; whole hours do.
{
  const rs = [bank(14, 'a1', T0), bank(8, 'a2', T0 + HOUR - 1)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  check('59 minutes does not decay', s.crumbs === CRUMBS_PER_CHIP * 64 + CRUMBS_PER_CHIP, s.crumbs);
}
{
  const rs = [bank(14, 'b1', T0), bank(8, 'b2', T0 + HOUR)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  const afterOneHour = Math.floor((CRUMBS_PER_CHIP * 64 * SOG_BASE_NUM) / SOG_DEN);
  check('one hour decays once', s.crumbs === afterOneHour + CRUMBS_PER_CHIP, s.crumbs);
}

// 2) A very long gap folds in bounded time and decays the whole bowl away.
//
// NOTE ON WHAT THIS DOES *NOT* TEST. At the base rate (97/100) the
// SOG_MAX_HOURS clamp is not observable through `crumbs`: integer flooring
// drives any bowl under ~1e12 to zero within ~379 hours, well inside the
// 720-hour clamp, and applySog's `crumbs > 0` loop break already bounds the
// work. Deleting the clamp entirely would produce bit-identical output here.
// The clamp is tested for real in chipsEngine.buy.test.ts, where `airtight`
// (99/100) still leaves a positive remainder at 720 h that an unclamped fold
// would grind to zero. Do not add a clamp assertion to this block — it would
// pass under a broken clamp and give false confidence.
{
  const rs = [bank(20, 'c1', T0), bank(8, 'c2', T0 + 5000 * HOUR)];
  const started = Date.now();
  const s = foldChips(H, TABLE, rs, vAll(rs, 20));
  check('long gap folds fast', Date.now() - started < 500);
  // Exact, not `< 2000`: the whole first bank must decay to 0, leaving only
  // the second bank's payout. A too-slow decay would leave a remainder.
  check('long gap decays the bowl away', s.crumbs === CRUMBS_PER_CHIP, s.crumbs);
}

// 3) The rim: crumbs past bowl_cap are lost, not carried.
{
  const rs = [bank(20, 'd1', T0)];  // 2^12 chips = 4,096,000 crumbs >> START_BOWL_CAP
  const s = foldChips(H, TABLE, rs, vAll(rs, 20));
  check('bowl caps at START_BOWL_CAP', s.crumbs === START_BOWL_CAP, s.crumbs);
  check('lifetime is NOT capped', s.lifetimeChips === 4096, s.lifetimeChips);
}

// 4) Decay terminates at exactly zero rather than leaving a fractional
// remainder or going negative. Asserting the exact total proves the first
// bank's 1000 crumbs decayed to 0 — `>= 0` alone would pass under almost any
// arithmetic bug, since floor(positive * positive / positive) cannot go
// negative in the first place.
{
  const rs = [bank(8, 'e1', T0), bank(8, 'e2', T0 + 700 * HOUR)];
  const s = foldChips(H, TABLE, rs, vAll(rs, 8));
  check('decay terminates at exactly zero', s.crumbs === CRUMBS_PER_CHIP, s.crumbs);
}

// 7) THE CLAMP, tested arithmetically.
// The only real coverage of SOG_MAX_HOURS. It cannot be tested through
// `crumbs` -- see the note on sogHoursFor in chipsEngine.ts -- so it is tested
// where it actually lives: the hour computation itself.
{
  check('sub-hour gap is 0 hours', sogHoursFor(T0, T0 + HOUR - 1) === 0);
  check('exact hour is 1', sogHoursFor(T0, T0 + HOUR) === 1);
  check('partial hours truncate', sogHoursFor(T0, T0 + 3 * HOUR + 59 * 60_000) === 3);
  check('backwards time is 0, never negative', sogHoursFor(T0 + 5 * HOUR, T0) === 0);
  check('equal timestamps are 0', sogHoursFor(T0, T0) === 0);
  check('just under the clamp is unclamped', sogHoursFor(T0, T0 + 719 * HOUR) === 719);
  check('exactly at the clamp', sogHoursFor(T0, T0 + 720 * HOUR) === 720);
  // The assertion that fails if the clamp is deleted:
  check('far beyond the clamp is capped', sogHoursFor(T0, T0 + 5000 * HOUR) === SOG_MAX_HOURS,
    sogHoursFor(T0, T0 + 5000 * HOUR));
  check('a decade is still capped', sogHoursFor(T0, T0 + 87600 * HOUR) === SOG_MAX_HOURS);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it and observe which assertions fail**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.sog.test.ts
```
Expected: the rim assertion fails if `Math.min(..., bowlCap)` was applied before decay, and test 1 may reveal the `state.lastMs || ms` seeding bug on the very first move. Fix whatever fails — do not edit the test to match the code.

- [ ] **Step 3: Add the anti-exploit tests and fix whatever they expose**

The decay clock is the single most attackable surface in the fold, so pin it explicitly. Append to `chipsEngine.sog.test.ts`:

```ts
// 5) THE CLOCK IS created_at, NOT the body's authoring-ms.
// A player writes #<ms>~ themselves. If decay keyed off it, dating a move far
// in the future would pin the clock ahead of every later move and switch
// sogginess off permanently for ~256 hashes. created_at cannot be forged past
// +60s (verify_pow, src/crypto/action_pow.rs:554-572).
{
  const far = T0 + 400 * 24 * HOUR;   // body claims it is a year from now
  const rs: ChipsReply[] = [
    { author_id: A, body: `bank 14 a1#${far}~`, block_height: 1, content_id: 'f1', created_at: T0 },
    { author_id: A, body: `bank 8 a2#${far}~`,  block_height: 1, content_id: 'f2', created_at: T0 + HOUR },
  ];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  const expected = Math.floor((CRUMBS_PER_CHIP * 64 * SOG_BASE_NUM) / SOG_DEN) + CRUMBS_PER_CHIP;
  check('future-dated body ms does not stop decay', s.crumbs === expected, s.crumbs);
}

// 6) Pending replies do not advance the clock — their created_at is stamped at
// query time and is not consensus-stable (the reef pending-ordering bug).
{
  const rs: ChipsReply[] = [
    { author_id: A, body: `bank 14 b1#${T0}~`, block_height: 1,    content_id: 'p1', created_at: T0 },
    { author_id: A, body: `bank 8 b2#${T0}~`,  block_height: null, content_id: 'p2', created_at: T0 + 500 * HOUR },
  ];
  const s = foldChips(H, TABLE, rs, vAll(rs, 14));
  check('pending reply applies no decay', s.crumbs === CRUMBS_PER_CHIP * 64 + CRUMBS_PER_CHIP, s.crumbs);
}
```

Run the file. If any assertion fails, fix `chipsEngine.ts` — never the test.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.sog.test.ts
```
Expected: all `ok`, `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add chips-client/
git commit -m "test(chips): pin sogginess, the 30-day clamp and the bowl rim"
```

---

### Task 5: Upgrades — buying, affordability, ordering

**Files:**
- Modify: `chips-client/src/lib/chipsEngine.ts` (replace the `applyBuy` stub)
- Test: `chips-client/src/lib/chipsEngine.buy.test.ts`

**Interfaces:**
- Consumes: `UPGRADES`, `UPGRADE_CHAINS` from `chipsConst.ts`.
- Produces: `applyBuy` behaviour — mutates `ChipsState.owned`, `bowlCap`, `seasoningNum/Den`, `fryers`, `goldenBits`, `airtight`.

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/chipsEngine.buy.test.ts`:

```ts
/**
 * Upgrades: affordability, chain ordering, no double-buying, effects applied.
 * Run: npx tsx src/lib/chipsEngine.buy.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { UPGRADES, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/**
 * Moves MUST carry strictly increasing timestamps.
 *
 * `orderReplies` sorts replies that tie on (block_height, authoring-ms) by
 * content_id — so a fixture where every move shares one timestamp folds in
 * ID order, not array order, and a buy whose id sorts before its funding
 * bank ("b1" < "rich") is evaluated with an empty bowl. Stepping 1s per move
 * keeps sequencing honest while staying far under the one-hour decay tick, so
 * ordering costs no sogginess.
 */
let seq = 0;
const nextMs = () => T0 + ++seq * 1000;

/** Nonce varies per chip — a repeated (ms, nonce) pair folds as a duplicate. */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms = nextMs()): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});
const buy = (key: string, cid: string, ms = nextMs()): ChipsReply => ({
  author_id: A, body: `buy ${key}#${ms}~`, block_height: 1, content_id: cid, created_at: ms,
});

// Bank 15 bits = 2^7 chips = 128,000 crumbs, capped to START_BOWL_CAP 100,000.
const rich = () => bank(15, 'rich');

// 1) An affordable buy deducts and applies.
{
  const rs = [rich(), buy('season1', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('season1 owned', s.owned.has('season1'));
  check('season1 deducted', s.crumbs === 100_000 - UPGRADES.season1.cost, s.crumbs);
  check('seasoning applied', s.seasoningNum === 3 && s.seasoningDen === 2, [s.seasoningNum, s.seasoningDen]);
  check('outcome bought', s.moves[1].outcome === 'bought', s.moves[1].outcome);
}

// 2) Seasoning multiplies chips banked AFTER the purchase, not before.
{
  const rs = [rich(), buy('season1', 'b1'), bank(8, 'after')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15], ['after', 8]]));
  const expected = 100_000 - UPGRADES.season1.cost + Math.floor((CRUMBS_PER_CHIP * 3) / 2);
  check('post-purchase chip is multiplied', s.crumbs === expected, s.crumbs);
}

// 3) Unaffordable buy is rejected-but-present and changes nothing.
// Uses `airtight`, which belongs to NO chain in UPGRADE_CHAINS. A chained key
// here (e.g. season5) would fold as 'rejected-order' before affordability was
// ever consulted, since the check precedence is owned -> order -> cost.
{
  const rs = [buy('airtight', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map());
  check('unaffordable rejected', s.moves[0].outcome === 'rejected-cost', s.moves[0].outcome);
  check('unaffordable owns nothing', s.owned.size === 0);
}

// 4) Out-of-chain-order buy is rejected (season2 before season1).
{
  const rs = [rich(), buy('season2', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('out-of-order rejected', s.moves[1].outcome === 'rejected-order', s.moves[1].outcome);
}

// 5) Buying the same upgrade twice is rejected the second time.
{
  const rs = [rich(), buy('season1', 'b1'), buy('season1', 'b2')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('double-buy rejected', s.moves[2].outcome === 'rejected-owned', s.moves[2].outcome);
  check('double-buy charged once', s.crumbs === 100_000 - UPGRADES.season1.cost, s.crumbs);
}

// 6) Unknown key is rejected.
{
  const rs = [rich(), buy('nosuch', 'b1')];
  const s = foldChips(H, TABLE, rs, new Map([['rich', 15]]));
  check('unknown upgrade rejected', s.moves[1].outcome === 'rejected-parse', s.moves[1].outcome);
}

// NOTE: there is deliberately no clamp test here. SOG_MAX_HOURS cannot be
// observed through `crumbs` in ANY realistic fixture: at 97/100 integer
// flooring zeroes a reachable bowl in ~379 hours, and even with `airtight`
// (99/100) the ~95-crumb survivor after 720 hours is the same order as the
// accumulated floor error, so the result is luck rather than a proof. The
// clamp is an arithmetic property and is tested arithmetically, against the
// exported `sogHoursFor`, in chipsEngine.sog.test.ts. Do not re-add a
// fixture-based clamp test here.

```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.buy.test.ts
```
Expected: FAIL — every buy currently folds as `rejected-parse` from the Task 3 stub.

- [ ] **Step 3: Replace the `applyBuy` stub**

```ts
/**
 * Check precedence is FIXED at: unknown key -> already owned -> chain order ->
 * affordability. Order precedes cost deliberately: "you skipped a tier" is the
 * more fundamental error, and a player who is both broke and out of order is
 * better told the thing that will still be true once they have the crumbs.
 * The tests depend on this order — changing it flips expected outcomes.
 */
function applyBuy(
  state: ChipsState,
  reply: ChipsReply,
  parsed: { kind: 'buy'; key: string; ms: number }
): void {
  const push = (outcome: Outcome) =>
    state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome, upgradeKey: parsed.key });

  const upgrade = UPGRADES[parsed.key];
  if (!upgrade) return push('rejected-parse');
  if (state.owned.has(parsed.key)) return push('rejected-owned');

  // Chained upgrades must be bought in order.
  const chain = UPGRADE_CHAINS.find((c) => c.includes(parsed.key));
  if (chain) {
    const idx = chain.indexOf(parsed.key);
    for (let i = 0; i < idx; i++) {
      if (!state.owned.has(chain[i])) return push('rejected-order');
    }
  }

  if (state.crumbs < upgrade.cost) return push('rejected-cost');

  state.crumbs -= upgrade.cost;
  state.owned.add(parsed.key);
  if (upgrade.bowlCap !== undefined) state.bowlCap = upgrade.bowlCap;
  if (upgrade.seasoningNum !== undefined && upgrade.seasoningDen !== undefined) {
    state.seasoningNum = upgrade.seasoningNum;
    state.seasoningDen = upgrade.seasoningDen;
  }
  if (upgrade.fryers !== undefined) state.fryers = upgrade.fryers;
  if (upgrade.goldenBits !== undefined) state.goldenBits = upgrade.goldenBits;
  if (upgrade.airtight) state.airtight = true;

  push('bought');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.buy.test.ts
```
Expected: all `ok`, `ALL PASS`.

- [ ] **Step 5: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): upgrade purchases with affordability and chain ordering"
```

---

### Task 6: Dip tiers, quirks, and the determinism guarantee

**Files:**
- Test: `chips-client/src/lib/chipsEngine.dip.test.ts`
- Test: `chips-client/src/lib/chipsEngine.determinism.test.ts`
- Modify: `chips-client/src/lib/chipsEngine.ts` only if a test exposes a bug

**Interfaces:**
- Consumes: `dipIndexFor`, `foldChips`.
- Produces: proof that tier quirks and fold determinism hold.

- [ ] **Step 1: Write the dip test**

Create `chips-client/src/lib/chipsEngine.dip.test.ts`:

```ts
/**
 * Dip tiers: threshold boundaries, guacamole browning, queso congealing,
 * and the fixed dip-then-airtight sog resolution order.
 * Run: npx tsx src/lib/chipsEngine.dip.test.ts
 */
import { foldChips, dipIndexFor, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { DIP_TIERS, CONGEAL_GAP_MS, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/**
 * The nonce must be PURE HEX. parseMove's nonce pattern is [0-9a-fA-F]{1,16},
 * so interpolating a content_id like 'q1' produces "ffq1", which fails to
 * parse — every such reply folds as rejected-parse, lifetime never moves, and
 * the tier under test is never reached. A sequence counter keeps it hex and
 * distinct (a repeated (ms, nonce) pair would fold as a duplicate).
 */
let nonceSeq = 0;
const bank = (bits: number, cid: string, ms: number): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${ms}~`,
  block_height: 1, content_id: cid, created_at: ms,
});

// 1) Tier boundaries are inclusive at the threshold.
{
  const guac = DIP_TIERS[1];
  check('below threshold is salsa', dipIndexFor(guac.minLifetime - 1) === 0);
  check('exactly at threshold is guac', dipIndexFor(guac.minLifetime) === 1);
}

// 2) Queso congeal: the first bank after >= 12 h pays double; a shorter gap does not.
{
  const qi = DIP_TIERS.findIndex((t) => t.congeal);
  const need = DIP_TIERS[qi].minLifetime;
  // Reach the queso tier with one big chip, then bank after a long gap.
  const bits = Math.ceil(Math.log2(need)) + 8;
  const rs = [bank(bits, 'q1', T0), bank(8, 'q2', T0 + CONGEAL_GAP_MS)];
  const s = foldChips(H, TABLE, rs, new Map([['q1', bits], ['q2', 8]]));
  const banked = s.moves.find((m) => m.content_id === 'q2');
  check('congeal doubles the returning chip', (banked?.crumbs ?? 0) >= CRUMBS_PER_CHIP * 2, banked);
}

// 3) Guacamole browns: its sog numerator is lower than the base.
{
  check('guac sets a faster sog', DIP_TIERS[1].sogNum === 96);
  check('guac pays more per chip', DIP_TIERS[1].payNum === 11 && DIP_TIERS[1].payDen === 10);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Write the determinism test**

Create `chips-client/src/lib/chipsEngine.determinism.test.ts`:

```ts
/**
 * The fold must be a pure function: identical inputs -> identical state, and
 * INPUT ORDER MUST NOT MATTER (ordering is internal to the fold). If this ever
 * fails, clients hosting different subsets will disagree about the same table.
 * Run: npx tsx src/lib/chipsEngine.determinism.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const replies: ChipsReply[] = [
  { author_id: A, body: `bank 15 aa#${T0}~`,        block_height: 1, content_id: 'c1', created_at: T0 },
  { author_id: A, body: `buy season1#${T0 + 1000}~`, block_height: 1, content_id: 'c2', created_at: T0 + 1000 },
  { author_id: A, body: `bank 10 bb#${T0 + 2000}~`, block_height: 2, content_id: 'c3', created_at: T0 + 2000 },
  { author_id: A, body: `bank 12 cc#${T0 + 9_000_000}~`, block_height: 2, content_id: 'c4', created_at: T0 + 9_000_000 },
  { author_id: A, body: `buy bowl1#${T0 + 9_001_000}~`, block_height: null, content_id: 'c5', created_at: T0 + 9_001_000 },
];
const verified = new Map([['c1', 15], ['c3', 10], ['c4', 12]]);

const snap = (s: ReturnType<typeof foldChips>) =>
  JSON.stringify({
    crumbs: s.crumbs, lifetimeChips: s.lifetimeChips, crispest: s.crispest,
    owned: [...s.owned].sort(), bowlCap: s.bowlCap, dipIndex: s.dipIndex,
    seasoning: [s.seasoningNum, s.seasoningDen], fryers: s.fryers,
    moves: s.moves.map((m) => [m.content_id, m.outcome, m.crumbs ?? 0]),
  });

const a = snap(foldChips(H, TABLE, replies, verified));
const b = snap(foldChips(H, TABLE, replies, verified));
check('same input folds identically', a === b);

const shuffled = [replies[3], replies[0], replies[4], replies[2], replies[1]];
const c = snap(foldChips(H, TABLE, shuffled, verified));
check('input order does not affect state', a === c, { a, c });

// A client missing a verification must not silently credit the chip.
const partial = snap(foldChips(H, TABLE, replies, new Map([['c1', 15]])));
check('unverified banks do not credit', partial !== a);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run both tests**

```bash
cd chips-client && npx tsx src/lib/chipsEngine.dip.test.ts && npx tsx src/lib/chipsEngine.determinism.test.ts
```
Expected: FAIL initially if ordering or tier evaluation has a bug. Fix `chipsEngine.ts` until both pass — never edit a test to match buggy behaviour.

- [ ] **Step 4: Wire every test into the test script**

In `chips-client/package.json`:

```json
"test": "tsx src/lib/chipsConst.test.ts && tsx src/lib/chipsPow.test.ts && tsx src/lib/chipsEngine.bank.test.ts && tsx src/lib/chipsEngine.sog.test.ts && tsx src/lib/chipsEngine.buy.test.ts && tsx src/lib/chipsEngine.dip.test.ts && tsx src/lib/chipsEngine.determinism.test.ts"
```

- [ ] **Step 5: Run the whole suite and commit**

```bash
cd chips-client && npm test
git add chips-client/
git commit -m "test(chips): dip tier quirks and fold determinism under reordering"
```

---

### Task 7: Memoized verification

**Files:**
- Create: `chips-client/src/lib/chipsVerify.ts`
- Test: `chips-client/src/lib/chipsVerify.test.ts`

**Interfaces:**
- Consumes: `verifyChipBits` from `chipsPow.ts`, `parseMove` from `chipsEngine.ts`.
- Produces: `verifyReplies(tableId: string, owner: string, replies: ChipsReply[], onProgress?: (done: number, total: number) => void): Promise<Map<string, number>>`, `clearVerifyCache(): void`, and `verifyHashCount(): number`.

**`owner` is a security parameter, not a convenience.** The fold skips non-owner replies, but the verifier runs *before* the fold — so without the same filter here, a stranger posting spam `bank` replies to your table forces your browser to burn one Argon2id-8 MiB hash per spam reply. This is the second half of the owner-enforcement fix; the two must agree.

- [ ] **Step 1: Write the failing test**

Create `chips-client/src/lib/chipsVerify.test.ts`:

```ts
/**
 * Verification memoization. Each chip is verified once EVER; the cache is pure
 * memoization and must never change what the fold produces.
 * Run: npx tsx src/lib/chipsVerify.test.ts
 */
import { verifyReplies, clearVerifyCache, verifyHashCount } from './chipsVerify';
import type { ChipsReply } from './chipsEngine';

const TABLE = 'sha256:table';
const A = 'a'.repeat(64);
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const replies: ChipsReply[] = [
  { author_id: A, body: `bank 8 01#${T0}~`,  block_height: 1, content_id: 'v1', created_at: T0 },
  { author_id: A, body: `buy season1#${T0}~`, block_height: 1, content_id: 'v2', created_at: T0 },
];

async function main() {
  clearVerifyCache();

  // Hash-count deltas, NOT elapsed time. A timing assertion cannot prove a
  // cache works — on fast hardware, or under Windows' ~15ms Date.now() tick, a
  // broken cache that re-hashes every call still measures as "fast".
  const before = verifyHashCount();
  const m1 = await verifyReplies(TABLE, A, replies);
  const coldHashes = verifyHashCount() - before;

  check('only bank moves are verified', m1.size === 1 && m1.has('v1'), [...m1.keys()]);
  check('bits are an integer', Number.isInteger(m1.get('v1')));
  check('cold pass hashes exactly the one bank', coldHashes === 1, coldHashes);

  const beforeWarm = verifyHashCount();
  const m2 = await verifyReplies(TABLE, A, replies);
  const warmHashes = verifyHashCount() - beforeWarm;

  check('second pass returns the same bits', m2.get('v1') === m1.get('v1'));
  check('second pass performs NO hashes at all', warmHashes === 0, warmHashes);

  let seen = 0;
  await verifyReplies(TABLE, A, replies, (done) => { seen = Math.max(seen, done); });
  check('progress is reported', seen >= 1, seen);

  // A stranger's bank reply must never be hashed. The fold skips non-owner
  // replies, but this runs BEFORE the fold — without the same filter here,
  // spam replies cost the victim one Argon2id-8MiB hash each.
  clearVerifyCache();
  const spam: ChipsReply[] = [
    ...replies,
    { author_id: 'b'.repeat(64), body: `bank 8 02#${T0}~`, block_height: 1, content_id: 'spam1', created_at: T0 },
  ];
  const beforeSpam = verifyHashCount();
  const m3 = await verifyReplies(TABLE, A, spam);
  const spamHashes = verifyHashCount() - beforeSpam;
  check('foreign bank is not verified', !m3.has('spam1'), [...m3.keys()]);
  check('owner bank still verified', m3.has('v1'));
  // The DoS property: the filter must run BEFORE hashing. Asserting only on
  // the returned map would also pass an implementation that hashed everything
  // and stripped foreign entries afterwards — which costs the victim exactly
  // the CPU the filter exists to save.
  check('foreign bank is never hashed (filtered before hashing)', spamHashes === 1, spamHashes);

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsVerify.test.ts
```
Expected: FAIL — `Cannot find module './chipsVerify'`.

- [ ] **Step 3: Implement `chipsVerify.ts`**

```ts
/**
 * Memoized chip verification.
 *
 * The fold is pure and synchronous, so Argon2id verification happens here and
 * is handed in as a completed map. Each chip is verified once ever and the
 * result persists to localStorage, so a returning player re-checks nothing and
 * a fresh install pays a one-time catch-up cost.
 *
 * Memoization is PURE CACHING: a cached result is by definition the same value
 * the hash would produce again, so it can never change fold output.
 */
import { verifyChipBits } from './chipsPow';
import { parseMove, type ChipsReply } from './chipsEngine';

const STORE_KEY = 'chips.verified.v1';
const memory = new Map<string, number>();
let loaded = false;

/**
 * Count of REAL Argon2id hashes performed (i.e. cache misses), monotonic for
 * the process lifetime.
 *
 * This exists because a TIMING assertion cannot prove a cache works: on fast
 * hardware, or under Windows' coarse Date.now() tick, a completely broken
 * cache still looks fast. Tests take deltas around a call and assert the exact
 * number of hashes, which is deterministic and environment-independent. It is
 * also what proves the owner filter runs BEFORE hashing rather than merely
 * stripping foreign entries from the result.
 */
let hashCount = 0;
export function verifyHashCount(): number {
  return hashCount;
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, number>)) memory.set(k, v);
  } catch { /* no storage (node/test) — memory cache only */ }
}

function persist(): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch { /* quota or no storage — cache stays in memory */ }
}

export function clearVerifyCache(): void {
  memory.clear();
  loaded = false;
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}

/**
 * Verify every bank reply, returning content_id -> actual leading zero bits.
 * The result is complete for all bank moves, which is `foldChips`'s precondition.
 */
export async function verifyReplies(
  tableId: string,
  owner: string,
  replies: ChipsReply[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, number>> {
  load();
  const banks = replies
    // Same owner filter the fold applies. Without it a stranger's spam replies
    // cost this browser one Argon2id-8MiB hash each — a free DoS on a victim.
    .filter((r) => r.author_id === owner)
    .map((r) => ({ reply: r, parsed: parseMove(r.body) }))
    .filter((x): x is { reply: ChipsReply; parsed: Extract<ReturnType<typeof parseMove>, { kind: 'bank' }> } =>
      x.parsed?.kind === 'bank');

  const out = new Map<string, number>();
  let done = 0;
  let dirty = false;

  for (const { reply, parsed } of banks) {
    let bits = memory.get(reply.content_id);
    if (bits === undefined) {
      bits = await verifyChipBits(reply.author_id, tableId, parsed.ms, parsed.nonce);
      hashCount++;
      memory.set(reply.content_id, bits);
      dirty = true;
    }
    out.set(reply.content_id, bits);
    onProgress?.(++done, banks.length);
  }

  if (dirty) persist();
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsVerify.test.ts
```
Expected: all `ok`, `ALL PASS`.

- [ ] **Step 5: Add to the test script and commit**

Append ` && tsx src/lib/chipsVerify.test.ts` to the `test` script.

```bash
git add chips-client/
git commit -m "feat(chips): memoized chip verification with persistent cache"
```

---

### Task 8: The host seam and the browser implementation

**Files:**
- Create: `chips-client/src/lib/host.ts`
- Modify: `chips-client/vite.config.ts` (no change needed if Task 1 copied reef's)

**Interfaces:**
- Consumes: `@swimchain/react` — `ActionType`, `createChallenge`, `computePow`, `getConfig`, `getDifficulty`, `solutionToRpcParams`, `hexToBytes`, `ensureSponsored`, `signAction`, `contentHashForPost`, `contentHashForReply`, `SwimchainRpc`, `Identity`. Confirm each against `reef-client/src/lib/reefEngine.ts:50-70` before writing.
- Produces:
  - `interface ChipsHost { rpc: SwimchainRpc; spaceId: string; sponsor(id: Identity): Promise<void>; createTable(id, name): Promise<string>; submitMove(id, tableId, body): Promise<string>; loadTable(tableId): Promise<ChipsReply[]>; listTables(): Promise<TableSummary[]>; requestContent(contentId): Promise<void> }`
  - `createBrowserHost(): ChipsHost`
  - `bankBody(bits: number, nonce: bigint, ms: number): string` and `buyBody(key: string, ms: number): string`

- [ ] **Step 1: Read the reference implementation first**

Read `reef-client/src/lib/reefEngine.ts` lines 880-1010. The submit recipe (challenge → mine → `solutionToRpcParams` → `contentHashForReply` → `signAction` → `rpc.submitReply`) must be copied exactly; it is the only sequence known to work against a live node. Note reef passes the **raw body** to `createChallenge`, not `parentId:body`.

- [ ] **Step 2: Implement `host.ts`**

```ts
/**
 * The ONLY platform seam.
 *
 * Game code never talks to a node directly — it goes through ChipsHost. The
 * browser implementation relays through the gateway (the reef/chess path); the
 * Phase 1b desktop build adds a sidecar implementation of this same interface
 * and changes nothing else. If any other file learns which target it is on,
 * this boundary has leaked.
 */
import {
  ActionType, createChallenge, computePow, getConfig, getDifficulty,
  solutionToRpcParams, hexToBytes, ensureSponsored, signAction,
  contentHashForPost, contentHashForReply,
  type SwimchainRpc, type Identity,
} from '@swimchain/react';
import type { ChipsReply } from './chipsEngine';

/** Baked at build time. A localhost fallback must NEVER ship — see Task 11. */
const RPC_URL = (import.meta.env?.VITE_CHIPS_RPC as string | undefined)?.trim() || '';
const CHIPS_SPACE = (import.meta.env?.VITE_CHIPS_SPACE as string | undefined)?.trim() || '';
const GAME_SPONSOR = (import.meta.env?.VITE_GAME_SPONSOR as string | undefined)?.trim() || '';
/** Mainnet runs the same 8 MiB params reef uses; see the spec's Global Constraints. */
const POW_TESTNET_PARAMS = true;

export interface TableSummary {
  tableId: string;
  authorId: string;
  name: string;
}

export interface ChipsHost {
  rpc: SwimchainRpc;
  spaceId: string;
  sponsor(id: Identity): Promise<void>;
  createTable(id: Identity, name: string): Promise<string>;
  submitMove(id: Identity, tableId: string, body: string): Promise<string>;
  loadTable(tableId: string): Promise<ChipsReply[]>;
  listTables(): Promise<TableSummary[]>;
  requestContent(contentId: string): Promise<void>;
}

export function bankBody(bits: number, nonce: bigint, ms: number): string {
  return `bank ${bits} ${nonce.toString(16)}#${ms}~`;
}

export function buyBody(key: string, ms: number): string {
  return `buy ${key}#${ms}~`;
}

async function submitMinedReply(
  rpc: SwimchainRpc, id: Identity, parentId: string, body: string
): Promise<string> {
  const challenge = await createChallenge(
    ActionType.Reply,
    new TextEncoder().encode(body),
    hexToBytes(id.publicKeyHex),
    getDifficulty(ActionType.Reply, POW_TESTNET_PARAMS)
  );
  const solution = await computePow(challenge, getConfig(POW_TESTNET_PARAMS));
  const p = solutionToRpcParams(solution);
  const contentHash = await contentHashForReply(body);
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });
  const res = await rpc.submitReply({
    parentId, body, authorId: id.publicKeyHex,
    powNonce: Number(p.pow_nonce), powDifficulty: p.pow_difficulty,
    powNonceSpace: p.pow_nonce_space, powHash: p.pow_hash,
    signature, timestamp: p.timestamp,
  });
  return res.content_id;
}

export function createBrowserHost(rpc: SwimchainRpc): ChipsHost {
  return {
    rpc,
    spaceId: CHIPS_SPACE,

    sponsor: (id) =>
      ensureSponsored(rpc, id, {
        preferredSponsorHex: GAME_SPONSOR,
        strictPreferred: true,
        requiredSpaceId: CHIPS_SPACE,
      }),

    async createTable(id, name) {
      const title = name;
      const body = JSON.stringify({ v: 1, kind: 'chips-table', name });
      const challenge = await createChallenge(
        ActionType.Post,
        new TextEncoder().encode(body),
        hexToBytes(id.publicKeyHex),
        getDifficulty(ActionType.Post, POW_TESTNET_PARAMS)
      );
      const solution = await computePow(challenge, getConfig(POW_TESTNET_PARAMS));
      const p = solutionToRpcParams(solution);
      const contentHash = await contentHashForPost(title, body);
      const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });
      const res = await rpc.submitPost({
        spaceId: CHIPS_SPACE, title, body, authorId: id.publicKeyHex,
        powNonce: Number(p.pow_nonce), powDifficulty: p.pow_difficulty,
        powNonceSpace: p.pow_nonce_space, powHash: p.pow_hash,
        signature, timestamp: p.timestamp,
      });
      return res.content_id;
    },

    submitMove: (id, tableId, body) => submitMinedReply(rpc, id, tableId, body),

    async loadTable(tableId) {
      const res = await rpc.getReplies({ contentId: tableId, depthLimit: 1, limit: 5000 });
      return res.replies.map((r) => ({
        author_id: r.author_id, body: r.body,
        block_height: r.block_height ?? null,
        content_id: r.content_id, created_at: r.created_at,
      }));
    },

    async listTables() {
      const res = await rpc.listSpaceContent({ spaceId: CHIPS_SPACE, limit: 500 });
      const out: TableSummary[] = [];
      for (const c of res.content ?? []) {
        try {
          const header = JSON.parse(c.body ?? '{}');
          if (header?.kind === 'chips-table') {
            out.push({ tableId: c.content_id, authorId: c.author_id, name: String(header.name ?? 'Untitled') });
          }
        } catch { /* not a table post — skip */ }
      }
      return out;
    },

    // Rendering the boards is what keeps other players' tables hosted.
    // Content-getting needs a driver; this is it.
    async requestContent(contentId) {
      await rpc.requestContent({ contentId });
    },
  };
}

export { RPC_URL, CHIPS_SPACE, GAME_SPONSOR };
```

- [ ] **Step 3: Verify the RPC method names against the real client**

```bash
cd chips-client && grep -n "getReplies\|listSpaceContent\|requestContent\|submitPost\|submitReply" ../swimchain-js/src/*.ts | head -20
```
Fix any name or parameter mismatch in `host.ts` to match the actual `SwimchainRpc` surface. Do not guess — the build will not catch a wrong RPC *parameter* name.

- [ ] **Step 4: Typecheck**

```bash
cd chips-client && npx tsc -b
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): host seam with browser gateway implementation"
```

---

### Task 9: The grinder worker

**Files:**
- Create: `chips-client/src/lib/crunch.worker.ts`
- Create: `chips-client/src/lib/useFryers.ts`

**Interfaces:**
- Consumes: `mineChip` from `chipsPow.ts`, `CHIP_POW` from `chipsConst.ts`.
- Produces: `useFryers(count: number, authorIdHex: string, tableId: string): { chips: FryerChip[]; bank(index: number): {nonce: bigint; bits: number; ms: number} | null; }` where `FryerChip = { ms: number; bits: number; attempts: number }`.

- [ ] **Step 1: Write the worker**

Grinding must never touch the main thread — reef learned this the hard way (`reef-client/src/lib/pow.worker.ts` exists precisely because a main-thread grind froze the tab so hard the modal could not paint).

```ts
/**
 * A fryer. Grinds chip nonces off-thread and streams crispness back so the UI
 * can show the chip crisping in real time.
 *
 * Each fryer owns one chip at a time, identified by its authoring-ms. It grinds
 * until told to stop; the main thread decides when to bank, which is the whole
 * game decision.
 */
import { chipPreimage, leadingZeroBits } from './chipsPow';
import { CHIP_POW, MAX_BITS } from './chipsConst';
import { argon2id } from 'hash-wasm';

type StartMsg = { type: 'start'; authorIdHex: string; tableId: string; ms: number };
type StopMsg = { type: 'stop' };
type Req = StartMsg | StopMsg;

const SALT = new TextEncoder().encode('chips-v1-salt-16');
let running = false;

async function grind(msg: StartMsg) {
  running = true;
  let nonce = 0n;
  let best = { nonce: 0n, bits: -1 };
  let attempts = 0;

  while (running) {
    const hash = await argon2id({
      password: chipPreimage(msg.authorIdHex, msg.tableId, msg.ms, nonce),
      salt: SALT,
      parallelism: CHIP_POW.parallelism,
      memorySize: CHIP_POW.memoryKib,
      iterations: CHIP_POW.iterations,
      hashLength: CHIP_POW.hashLength,
      outputType: 'binary',
    });
    attempts++;
    const bits = Math.min(leadingZeroBits(new Uint8Array(hash)), MAX_BITS);
    if (bits > best.bits) {
      best = { nonce, bits };
      (self as unknown as Worker).postMessage({
        type: 'crisper', ms: msg.ms, bits, nonce: nonce.toString(16), attempts,
      });
    } else if (attempts % 16 === 0) {
      (self as unknown as Worker).postMessage({ type: 'progress', ms: msg.ms, attempts, bits: best.bits });
    }
    nonce++;
  }
}

self.onmessage = (e: MessageEvent<Req>) => {
  if (e.data.type === 'stop') { running = false; return; }
  if (e.data.type === 'start') { void grind(e.data); }
};
```

- [ ] **Step 2: Write the `useFryers` hook**

```ts
/**
 * Runs `count` fryers, one Web Worker each, and exposes the current chip in
 * every basket. `fryers` comes from the fold (the `fryer` upgrades), so buying
 * a fryer really does add a grinder.
 */
import { useEffect, useRef, useState } from 'react';

export interface FryerChip { ms: number; bits: number; nonce: bigint; attempts: number }

export function useFryers(count: number, authorIdHex: string, tableId: string) {
  const workers = useRef<Worker[]>([]);
  const [chips, setChips] = useState<FryerChip[]>([]);

  useEffect(() => {
    if (!authorIdHex || !tableId) return;
    const made: Worker[] = [];
    const seed = Date.now();

    for (let i = 0; i < count; i++) {
      const w = new Worker(new URL('./crunch.worker.ts', import.meta.url), { type: 'module' });
      // Distinct ms per fryer so two baskets never grind the same preimage.
      const ms = seed + i;
      w.onmessage = (e: MessageEvent<{ type: string; ms: number; bits: number; nonce?: string; attempts: number }>) => {
        const d = e.data;
        setChips((prev) => {
          const next = [...prev];
          next[i] = {
            ms: d.ms,
            bits: d.bits,
            nonce: d.nonce !== undefined ? BigInt('0x' + d.nonce) : (next[i]?.nonce ?? 0n),
            attempts: d.attempts,
          };
          return next;
        });
      };
      w.postMessage({ type: 'start', authorIdHex, tableId, ms });
      made.push(w);
    }
    workers.current = made;

    return () => { for (const w of made) { w.postMessage({ type: 'stop' }); w.terminate(); } };
  }, [count, authorIdHex, tableId]);

  /** Take the chip out of fryer `index`; returns null if nothing bankable yet. */
  function take(index: number): FryerChip | null {
    const chip = chips[index];
    if (!chip || chip.bits < 8) return null;
    return chip;
  }

  return { chips, take };
}
```

- [ ] **Step 3: Typecheck**

```bash
cd chips-client && npx tsc -b
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): off-thread fryer workers with live crispness"
```

---

### Task 10: UI — the kitchen, the bowl, the boards

**Files:**
- Create: `chips-client/src/main.tsx`, `chips-client/src/App.tsx`, `chips-client/src/Kitchen.tsx`, `chips-client/src/Bowl.tsx`, `chips-client/src/Boards.tsx`, `chips-client/src/styles.css`

**Interfaces:**
- Consumes: `foldChips`, `verifyReplies`, `createBrowserHost`, `bankBody`, `buyBody`, `useFryers`, `UPGRADES`, `DIP_TIERS`.
- Produces: the running app.

**Production bar (non-negotiable, from spec §7):** full-screen, diegetic-first, reads as a game from the first frame. Crispness is shown by how the chip *looks*, not a labelled progress bar. Sogginess is visible in the bowl before it is legible as a number. No dashboard chrome.

- [ ] **Step 1: Build the shell and state wiring in `App.tsx`**

Required behaviour, in order:
1. Load or create an identity (reuse reef's identity handling — read `reef-client/src/App.tsx` for the pattern).
2. `host.sponsor(id)` with a diegetic progress state ("getting you a seat at the table").
3. Find this identity's table via `host.listTables()`; if absent, `host.createTable(id, name)`.
4. `host.loadTable(tableId)` → `verifyReplies(...)` with a "checking the chips" progress state → `foldChips(...)`.
5. Poll `loadTable` every 15 s; re-verify (cached, so cheap) and re-fold.

- [ ] **Step 2: Build `Kitchen.tsx`**

Renders `state.fryers` baskets from `useFryers`. Each basket shows its chip crisping — colour/texture driven by `bits`, not a number. Clicking a basket banks it:

```tsx
async function bankChip(index: number) {
  // bank() is DESTRUCTIVE: it retires the basket and restarts that fryer
  // immediately, so `chip` is the only remaining reference to this proof.
  // A second click returns null until the new chip crisps.
  const chip = bank(index);
  if (!chip) return;                      // not yet at BANK_MIN_BITS, or already banked
  setBanking(true);
  try {
    await host.submitMove(id, tableId, bankBody(chip.bits, chip.nonce, chip.ms));
    await refresh();
  } catch (err) {
    // The proof stays valid indefinitely — the fold never compares the body's
    // authoring-ms against created_at — so a failed submit (offline, sponsor
    // rejection) must be retried with THIS SAME object, not re-mined. Dropping
    // it here silently discards work the player already paid for in CPU.
    setPendingRetry({ index, chip });
    throw err;
  } finally {
    setBanking(false);
  }
}
```

Render `chips.map(...)` directly — never `Array.from({length: state.fryers})` indexed
into `chips`, because effects flush after render, so for one render `chips.length`
still reflects the previous fryer count. And do not put `bank` in a `useEffect` or
`useCallback` dependency array: it is a fresh function identity every render.

Show the golden band as an in-world cue (the chip visibly turns golden at `state.goldenBits`), never as a tooltip explaining the multiplier.

- [ ] **Step 3: Build `Bowl.tsx`**

Shows `state.crumbs` as a physical pile against `state.bowlCap`, and the current dip (`DIP_TIERS[state.dipIndex]`) as the visual bed. Projects sogginess between moves for display only:

```ts
// DISPLAY ONLY. The fold banks decay at the next move; this never feeds state.
function projectedCrumbs(state: ChipsState, nowMs: number): number {
  let crumbs = state.crumbs;
  const hours = Math.min(Math.floor((nowMs - state.lastMs) / 3_600_000), SOG_MAX_HOURS);
  const num = (DIP_TIERS[state.dipIndex].sogNum ?? SOG_BASE_NUM) + (state.airtight ? AIRTIGHT_BONUS : 0);
  for (let i = 0; i < hours && crumbs > 0; i++) crumbs = Math.floor((crumbs * num) / SOG_DEN);
  return crumbs;
}
```

The upgrade shelf lists affordable `UPGRADES` and buys via `host.submitMove(id, tableId, buyBody(key, Date.now()))`.

- [ ] **Step 4: Build `Boards.tsx`**

Two boards, from folding every table returned by `host.listTables()`:

```ts
// Rendering the boards IS the hosting driver — this is what keeps other
// players' tables alive on this node. Not a config flag; the loop itself.
for (const t of tables) {
  await host.requestContent(t.tableId);
  const replies = await host.loadTable(t.tableId);
  const verified = await verifyReplies(t.tableId, t.authorId, replies);
  const s = foldChips(header, t.tableId, replies, verified);
  rows.push({ name: t.name, total: s.lifetimeChips, crispest: s.crispest });
}
```

Render **Total Crunch** (sorted by `total`) and **Crispest Chip** (sorted by `crispest`) as two separate boards, labelled as marathon and sprint so the platform asymmetry is honest rather than hidden.

- [ ] **Step 5: Run the dev server and verify by eye**

```bash
cd chips-client && npm run dev
```
Open the printed URL. Confirm: a chip visibly crisps, clicking banks it, the bowl fills, an upgrade can be bought, and both boards render. Take a screenshot for the PR.

- [ ] **Step 6: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): kitchen, bowl and the two boards"
```

---

### Task 11: Build-time env verification and deploy

**Files:**
- Create: `chips-client/.env.production`
- Modify: `scripts/deploy-web-clients.sh` (add `chips-client`)

**Interfaces:**
- Consumes: `VITE_CHIPS_RPC`, `VITE_CHIPS_SPACE`, `VITE_GAME_SPONSOR` from `host.ts`.
- Produces: a verified production bundle.

**This task exists because shipping a Vite bundle with a localhost fallback baked in has burned this project before.** The grep step is mandatory, not advisory.

- [ ] **Step 1: Create the space and record its id**

Found the app-class space on mainnet from the genesis identity, then put the real values in `chips-client/.env.production`:

```
VITE_CHIPS_RPC=https://swimchain.io/rpc
VITE_CHIPS_SPACE=sp1…            # the real bech32 space id
VITE_GAME_SPONSOR=…              # the mainnet game-sponsor pubkey hex
```

- [ ] **Step 2: Build**

```bash
cd chips-client && npm run build
```

- [ ] **Step 3: Verify the bundle — MANDATORY**

```bash
cd chips-client
grep -o "localhost:[0-9]*" dist/assets/*.js | sort -u          # MUST be empty
grep -o "swimchain\.io/rpc" dist/assets/*.js | head -1         # MUST match
grep -o "sp1[a-z0-9]\{10,\}" dist/assets/*.js | sort -u        # MUST be the real space id
grep -o "0530df507ad2[0-9a-f]*" dist/assets/*.js | head -1      # MUST match the sponsor
grep -c "__chips\|setFryers" dist/assets/*.js                   # MUST be 0 (no dev surface)
```
If a `localhost:PORT` string appears, the build is not shippable. Fix the env and rebuild.

**On `127.0.0.1` — deliberately NOT a gate, and the reasoning matters.** An earlier
version of this list required it to be absent. It never can be: `swimchain-react`'s
`LOCAL_TESTNET` constant (`rpc.ts`) is referenced by `useRpc`'s fallback expression, so
the string is bundled by every client that imports the library. The **live production
reef bundle contains it today** (verified by fetching
`swimchain.io/reef/assets/index-*.js`), so gating on it would fail a build that is
already shipping.

Grepping cannot prove reachability, so the guarantee is structural instead, and chips is
stricter than reef here:

- `main.tsx` passes an explicit `{endpoint: RPC_URL}` whenever the endpoint is baked, so
  `useRpc`'s fallback is never selected. Reef passes `undefined` and *does* fall through
  to `LOCAL_TESTNET` when unconfigured.
- `assertConfigured()` (`host.ts`) **throws** on an empty `VITE_CHIPS_RPC` or
  `VITE_CHIPS_SPACE`, so a misconfigured build refuses to run rather than quietly
  dialling a local node — which is the failure this gate exists to prevent.

A gate that fails on a string every shipping client contains trains people to wave the
gate through. Keep the `localhost:PORT` check strict and rely on the throw for the rest.

- [ ] **Step 4: Read the deploy skill and deploy**

Invoke the `deploy-web-clients` skill and follow it — it encodes the verification workflow this project requires. Add `chips-client` to `scripts/deploy-web-clients.sh` alongside `reef-client` and `chess-client`, serving at `/chips/`.

- [ ] **Step 5: Verify live**

Load `https://swimchain.io/chips`, complete first-run sponsorship in a fresh private window, bank one chip, confirm it appears on the board after the next poll.

- [ ] **Step 6: Commit**

```bash
git add chips-client/.env.production scripts/deploy-web-clients.sh
git commit -m "feat(chips): production env and deploy wiring for /chips"
```

---

## Out of scope for this plan

**Phase 1b (the Tauri desktop shell, `ChipsAndDip.exe`)** gets its own plan. It adds a sidecar implementation of `ChipsHost` plus the shell wiring copied from `trench-client/src-tauri/`, and changes no game code. Write that plan after Phase 1a is live and the balance constants have survived contact with real players.

## Self-review notes

- **Spec coverage:** §1 rules → Tasks 3-6; §2 protocol/determinism → Tasks 3, 6, 7; §3 fairness → constants in Task 1 (no handicap code exists by design); §4 architecture/two boards → Tasks 8, 10; §5 testing → all five spec-named tests are present (ordering and determinism in Task 6, decay and clamp in Task 4, rejected-but-present in Tasks 3 and 5, cost-curve coherence in Task 1, payout linearity in Task 3); §6 build path → Tasks 10-11 plus the out-of-scope note; §7 production bar → Task 10 preamble.
- **Known gap, deliberate:** the spec's "one-time catch-up verification behind a diegetic progress state" is specified in Task 7 (`onProgress`) and consumed in Task 10 step 1, but its visual treatment is left to the implementer within the §7 bar.
- **Type consistency:** `ChipsState`, `ChipsReply`, `ChipsHeader`, `MoveResult`, `Outcome`, `ParsedMove`, `ChipsHost`, `FryerChip` are each defined once and referenced by those exact names throughout.
