# Chips & Dip — Batched Banking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player dip chips continuously and get crumbs immediately, while moves reach the chain as background batches.

**Architecture:** The fold gains a batch form of the `bank` move and credits each chip in it exactly as a lone chip. The client queues moves, renders them as synthetic *pending* replies through the same `foldChips`, and drains the queue with one in-flight submission at a time. No parallel ledger exists, so there is nothing to reconcile when a batch confirms.

**Tech Stack:** TypeScript, React 18, Vite 5, `hash-wasm` (Argon2id), `@swimchain/react`. Tests are plain `tsx` scripts with asserts — no framework.

**Spec:** `docs/superpowers/specs/2026-07-25-chips-batched-banking-design.md`

## Global Constraints

- **Worktree:** `C:\github\swimchain-batch`, branch `docs/batched-banking-spec`. All paths relative to it.
- **The fold stays pure, synchronous, integer-only, wall-clock-free.** No `async`, no `Date.now()`, no floats, no crypto imports in `chipsEngine.ts`. Every multiplier is an integer `num`/`den` pair with `Math.floor`.
- **`MAX_BATCH = 24`, checked by counting BEFORE any hashing.** A security bound, not tidiness.
- **v1 single-form replies must fold forever.** Real chips are on mainnet — one table is at 612 lifetime crunch. Breaking that path silently zeroes real players.
- **Fold constants are permanent.** Changing one re-scores every table retroactively (see `docs/superpowers/specs/...design.md` §7.1). Do not "tune" a consensus constant.
- Work only inside `chips-client/`. `npx tsc -b`, `npm test`, `npm run build` clean before every commit.

## Rollout gate — read before write

Tasks 1-3 add the ability to **read** batches. Tasks 4-6 make the client **emit** them.

**These must not ship together.** A client emitting batches that another client cannot parse produces two different balances for the same history. Anyone with the page already open is running old code, so there is a real window even though the web client updates on reload.

**After Task 3: merge, deploy, and confirm the live bundle parses batches. Only then start Task 4.**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/proofKey.ts` | **new.** One definition of a chip's identity string. Dependency-free so the fold can import it without pulling in crypto. |
| `src/lib/chipsConst.ts` | `MAX_BATCH` |
| `src/lib/chipsEngine.ts` | grammar + fold: batch parsing, per-chip crediting, `rejected-oversize` |
| `src/lib/chipsVerify.ts` | per-proof verification keying; verifies every entry of every batch |
| `src/lib/chipsBody.ts` | `bankBatchBody` emitter (grammar inverse) |
| `src/lib/chipsQueue.ts` | **new.** Pure queue logic: enqueue, take-batch, ack, fail. No React, no network. |
| `src/App.tsx` | wires the queue, the optimistic fold, and the sender loop |
| `src/Kitchen.tsx`, `src/styles.css` | the dip → eat → crumbs animation |

---

### Task 1: Proof identity and the batch cap

**Files:**
- Create: `chips-client/src/lib/proofKey.ts`
- Modify: `chips-client/src/lib/chipsConst.ts`
- Test: `chips-client/src/lib/proofKey.test.ts`

**Interfaces:**
- Produces: `proofKey(tableId: string, authorId: string, ms: number, nonce: bigint): string`, `MAX_BATCH = 24`

A chip's identity appears in two places that must never disagree: the fold's dedupe set and the verification cache. One definition, in a file with no dependencies so `chipsEngine.ts` can import it and stay crypto-free.

- [ ] **Step 1: Write the failing test**

`chips-client/src/lib/proofKey.test.ts`:

```ts
/**
 * The proof key must DETERMINE the value it keys — it is the identity of one
 * Argon2id input. Run: npx tsx src/lib/proofKey.test.ts
 */
import { proofKey } from './proofKey';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const T = 'sha256:table', A = 'a'.repeat(64);

check('same inputs, same key', proofKey(T, A, 5, 7n) === proofKey(T, A, 5, 7n));
check('table matters', proofKey(T, A, 5, 7n) !== proofKey('sha256:other', A, 5, 7n));
check('author matters', proofKey(T, A, 5, 7n) !== proofKey(T, 'b'.repeat(64), 5, 7n));
check('ms matters', proofKey(T, A, 5, 7n) !== proofKey(T, A, 6, 7n));
check('nonce matters', proofKey(T, A, 5, 7n) !== proofKey(T, A, 5, 8n));

// Author casing must not split one identity into two cache entries.
check('author case-insensitive', proofKey(T, A.toUpperCase(), 5, 7n) === proofKey(T, A, 5, 7n));

// The separator must not let one field impersonate another.
check('no field-boundary collision',
  proofKey(T, A, 5, 7n) !== proofKey(T, `${A}:5`, 0, 7n));

check('MAX_BATCH is 24', MAX_BATCH === 24);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/proofKey.test.ts
```
Expected: FAIL — `Cannot find module './proofKey'`.

- [ ] **Step 3: Implement**

`chips-client/src/lib/proofKey.ts`:

```ts
/**
 * The identity of a single chip proof.
 *
 * This string stands for one exact Argon2id input — the same four values the
 * preimage binds (`chips-v1 ‖ author ‖ table ‖ ms ‖ nonce`). It is used by the
 * fold's dedupe set AND by the verification cache, which is why it lives in its
 * own dependency-free file: `chipsEngine.ts` must be able to import it without
 * dragging hash-wasm into the fold's import graph.
 *
 * Fields are fixed-shape (hex author, decimal ms, hex nonce) and none can
 * contain the separator, so plain joining is unambiguous here — unlike the
 * chip preimage itself, which length-prefixes because it takes free-form
 * strings.
 */
export function proofKey(tableId: string, authorId: string, ms: number, nonce: bigint): string {
  return `${tableId}|${authorId.toLowerCase()}|${ms}|${nonce.toString(16)}`;
}
```

Append to `chips-client/src/lib/chipsConst.ts`:

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd chips-client && npx tsx src/lib/proofKey.test.ts
```
Expected: all `ok`, `ALL PASS`.

- [ ] **Step 5: Add to the test script and commit**

Append ` && tsx src/lib/proofKey.test.ts` to `test` in `package.json`.

```bash
git add chips-client/
git commit -m "feat(chips): proof identity and the batch cap"
```

---

### Task 2: The consensus change — grammar, fold, and verification

> **This is ONE task with ONE commit, at the very end.** Its three parts (2a
> grammar, 2b fold, 2c verification + fixture migration) cannot be committed
> separately: changing `ParsedMove`'s shape breaks the fold's consumers, and the
> fold's new proof-key lookup is what forces every fixture's `verified` map to
> be re-keyed. Committing them apart would leave the tree red, against this
> plan's own Global Constraints.
>
> Work through 2a → 2b → 2c, running each part's tests as you go, and commit
> once at the end when `npx tsc -b`, `npm test` and `npm run build` are all
> clean. The equivalence property — a batch credits exactly what N lone chips
> would — is only checkable with all three in place, which is also why it is one
> review gate.

#### Task 2a: Parse the batch grammar

**Files:**
- Modify: `chips-client/src/lib/chipsEngine.ts` (`ParsedMove`, `parseMove`)
- Test: `chips-client/src/lib/chipsParse.test.ts`

**Interfaces:**
- Consumes: `MAX_BATCH` from `./chipsConst`
- Produces:
  - `interface ChipEntry { ms: number; bits: number; nonce: bigint }`
  - `type ParsedMove = { kind: 'bank'; chips: ChipEntry[]; ms: number } | { kind: 'buy'; key: string; ms: number } | { kind: 'oversize'; count: number; ms: number }`

A v1 reply parses into a **one-entry batch**, so the fold has exactly one bank path rather than two.

- [ ] **Step 1: Write the failing test**

`chips-client/src/lib/chipsParse.test.ts`:

```ts
/**
 * The batch grammar, and the v1 form that must outlive it.
 * Run: npx tsx src/lib/chipsParse.test.ts
 */
import { parseMove } from './chipsEngine';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) v1 single form still parses — as a one-entry batch, with the chip's ms
//    taken from the authoring-ms, which is what it has always meant.
{
  const p = parseMove('bank 12 ff#1000~');
  check('v1 parses', p?.kind === 'bank');
  if (p?.kind === 'bank') {
    check('v1 is one entry', p.chips.length === 1, p.chips.length);
    check('v1 bits', p.chips[0].bits === 12);
    check('v1 nonce', p.chips[0].nonce === 0xffn);
    check('v1 chip ms is the authoring ms', p.chips[0].ms === 1000);
  }
}

// 2) Batch form.
{
  const p = parseMove('bank 1000:12:ff,1001:9:a3#1002~');
  check('batch parses', p?.kind === 'bank');
  if (p?.kind === 'bank') {
    check('two entries', p.chips.length === 2, p.chips.length);
    check('entry 0', p.chips[0].ms === 1000 && p.chips[0].bits === 12 && p.chips[0].nonce === 0xffn);
    check('entry 1', p.chips[1].ms === 1001 && p.chips[1].bits === 9 && p.chips[1].nonce === 0xa3n);
    check('authoring ms is separate', p.ms === 1002);
  }
}

// 3) Exactly MAX_BATCH is allowed; one more is oversize and is NOT parsed
//    into entries — the fold must be able to reject it without hashing.
{
  const mk = (n: number) => 'bank ' + Array.from({ length: n }, (_, i) => `${2000 + i}:8:${(i + 1).toString(16)}`).join(',') + '#9~';
  const at = parseMove(mk(MAX_BATCH));
  check('MAX_BATCH entries parse', at?.kind === 'bank' && at.chips.length === MAX_BATCH);

  const over = parseMove(mk(MAX_BATCH + 1));
  check('over cap is oversize', over?.kind === 'oversize', over?.kind);
  if (over?.kind === 'oversize') check('oversize reports its count', over.count === MAX_BATCH + 1, over.count);
}

// 4) Malformed input yields null, never a partial batch.
{
  check('no authoring ms', parseMove('bank 1000:12:ff') === null);
  check('non-hex nonce', parseMove('bank 1000:12:zz#9~') === null);
  check('missing field', parseMove('bank 1000:12#9~') === null);
  check('trailing comma', parseMove('bank 1000:12:ff,#9~') === null);
  check('empty batch', parseMove('bank #9~') === null);
  check('bits over MAX_BITS', parseMove('bank 1000:99:ff#9~') === null);
}

// 5) buy is untouched.
{
  const p = parseMove('buy season1#9~');
  check('buy parses', p?.kind === 'buy' && p.key === 'season1');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsParse.test.ts
```
Expected: FAIL — `p.chips` is undefined (the current shape is `{bits, nonce}`).

- [ ] **Step 3: Implement**

In `chipsEngine.ts`, add `MAX_BATCH` to the `./chipsConst` import, then replace the `ParsedMove` type and `parseMove`:

```ts
/** One chip inside a bank move. A v1 reply carries exactly one. */
export interface ChipEntry {
  ms: number;
  bits: number;
  nonce: bigint;
}

export type ParsedMove =
  | { kind: 'bank'; chips: ChipEntry[]; ms: number }
  | { kind: 'buy'; key: string; ms: number }
  /** Declared more than MAX_BATCH entries. Carried as a distinct kind so the
   *  fold can reject it whole WITHOUT verifying anything — see chipsConst. */
  | { kind: 'oversize'; count: number; ms: number };

const ENTRY = /^(\d+):(\d+):([0-9a-fA-F]{1,16})$/;

export function parseMove(body: string): ParsedMove | null {
  const ms = authoringMs(body);
  if (ms === null) return null;
  const head = body.trim().replace(/#\d+~$/, '').trim();

  const bankM = /^bank\s+(\S+)$/.exec(head);
  if (bankM) {
    const arg = bankM[1];

    // v1: `bank <bits> <nonce>` — two space-separated fields, no colons. The
    // chip's ms IS the authoring ms, which is what it has always meant.
    const v1 = /^bank\s+(\d+)\s+([0-9a-fA-F]{1,16})$/.exec(head);
    if (v1) {
      const bits = Number(v1[1]);
      if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) return null;
      return { kind: 'bank', chips: [{ ms, bits, nonce: BigInt('0x' + v1[2]) }], ms };
    }

    // Batch. Count FIRST: an over-cap reply must cost a split and nothing more.
    const parts = arg.split(',');
    if (parts.length > MAX_BATCH) return { kind: 'oversize', count: parts.length, ms };

    const chips: ChipEntry[] = [];
    for (const part of parts) {
      const m = ENTRY.exec(part);
      if (!m) return null;
      const entryMs = Number(m[1]);
      const bits = Number(m[2]);
      if (!Number.isSafeInteger(entryMs) || entryMs <= 0) return null;
      if (!Number.isInteger(bits) || bits < 0 || bits > MAX_BITS) return null;
      chips.push({ ms: entryMs, bits, nonce: BigInt('0x' + m[3]) });
    }
    if (chips.length === 0) return null;
    return { kind: 'bank', chips, ms };
  }

  const buyM = /^buy\s+([a-z0-9]+)$/.exec(head);
  if (buyM) return { kind: 'buy', key: buyM[1], ms };

  return null;
}
```

> The v1 regex runs against `head`, not `arg`, because v1 has a space inside the argument and `\S+` would not capture it.

- [ ] **Step 4: Run it to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsParse.test.ts
```
Expected: all `ok`. `chipsEngine.ts` will not typecheck yet — the fold still reads `parsed.bits`. That is Task 3.

- [ ] **Step 5: Add to the test script — do NOT commit yet**

Append ` && tsx src/lib/chipsParse.test.ts` to `test`. Continue to 2b; the tree
is intentionally red until 2c and commits once there.

---

#### Task 2b: Fold a batch

**Files:**
- Modify: `chips-client/src/lib/chipsEngine.ts` (`Outcome`, `MoveResult`, the bank branch)
- Test: `chips-client/src/lib/chipsBatch.test.ts`

**Interfaces:**
- Consumes: `ChipEntry`, `ParsedMove` (Task 2); `proofKey` (Task 1)
- Produces: `foldChips(header, tableId, replies, verified)` where `verified` is now keyed by `proofKey(...)`; `Outcome` gains `'rejected-oversize'`; one `MoveResult` per chip.

**The equivalence rule:** a batch of N chips must credit *exactly* what N lone chips would. That is the property the tests pin, because it is what makes the change safe.

- [ ] **Step 1: Write the failing test**

`chips-client/src/lib/chipsBatch.test.ts`:

```ts
/**
 * Batch folding. The headline property: a batch credits exactly what the same
 * chips would as separate replies.
 * Run: npx tsx src/lib/chipsBatch.test.ts
 */
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';
import { MAX_BATCH, CRUMBS_PER_CHIP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const reply = (body: string, cid: string, at: number, height: number | null = 1): ChipsReply =>
  ({ author_id: A, body, block_height: height, content_id: cid, created_at: at });

/** Every chip verifies at exactly the bits it claims. */
const verifyAll = (chips: { ms: number; bits: number; nonce: bigint }[]) =>
  new Map(chips.map((c) => [proofKey(TABLE, A, c.ms, c.nonce), c.bits]));

// 1) EQUIVALENCE — one batch of 3 == three separate replies, same instant.
{
  const chips = [
    { ms: T0 + 1, bits: 10, nonce: 1n },
    { ms: T0 + 2, bits: 11, nonce: 2n },
    { ms: T0 + 3, bits: 9, nonce: 3n },
  ];
  const v = verifyAll(chips);

  const batched = foldChips(H, TABLE,
    [reply(`bank ${chips.map((c) => `${c.ms}:${c.bits}:${c.nonce.toString(16)}`).join(',')}#${T0}~`, 'b1', T0)], v);

  const singles = foldChips(H, TABLE,
    chips.map((c, i) => reply(`bank ${c.bits} ${c.nonce.toString(16)}#${c.ms}~`, `s${i}`, T0)), v);

  check('batch crumbs == singles crumbs', batched.crumbs === singles.crumbs, { batched: batched.crumbs, singles: singles.crumbs });
  check('batch lifetime == singles lifetime', batched.lifetimeChips === singles.lifetimeChips);
  check('batch crispest == singles crispest', batched.crispest === singles.crispest);
  check('one MoveResult per chip', batched.moves.length === 3, batched.moves.length);
  check('all banked', batched.moves.every((m) => m.outcome === 'banked'));
}

// 2) v1 REGRESSION — the form live players already have on chain.
{
  const c = { ms: T0, bits: 12, nonce: 0xabn };
  const s = foldChips(H, TABLE, [reply('bank 12 ab#' + T0 + '~', 'v1', T0)], verifyAll([c]));
  check('v1 still credits', s.crumbs === CRUMBS_PER_CHIP * 2 ** (12 - 8), s.crumbs);
  check('v1 lifetime', s.lifetimeChips === 2 ** (12 - 8));
}

// 3) OVERSIZE — rejected whole, and nothing is verified.
{
  const chips = Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ ms: T0 + i, bits: 10, nonce: BigInt(i + 1) }));
  const body = 'bank ' + chips.map((c) => `${c.ms}:${c.bits}:${c.nonce.toString(16)}`).join(',') + `#${T0}~`;
  // Deliberately supply a COMPLETE verification map: if the fold credited an
  // oversize reply it would succeed here, so passing proves the cap is enforced
  // rather than the reply merely failing for want of verification.
  const s = foldChips(H, TABLE, [reply(body, 'big', T0)], verifyAll(chips));
  check('oversize credits nothing', s.crumbs === 0, s.crumbs);
  check('oversize is one move', s.moves.length === 1, s.moves.length);
  check('oversize outcome', s.moves[0].outcome === 'rejected-oversize', s.moves[0].outcome);
}

// 4) PARTIAL VALIDITY — one bad entry rejects only itself.
{
  const good = { ms: T0 + 1, bits: 10, nonce: 1n };
  const liar = { ms: T0 + 2, bits: 20, nonce: 2n };   // claims 20, verifies at 9
  const body = `bank ${good.ms}:10:1,${liar.ms}:20:2#${T0}~`;
  const v = new Map([
    [proofKey(TABLE, A, good.ms, good.nonce), 10],
    [proofKey(TABLE, A, liar.ms, liar.nonce), 9],
  ]);
  const s = foldChips(H, TABLE, [reply(body, 'mix', T0)], v);
  check('good entry credited', s.crumbs === CRUMBS_PER_CHIP * 2 ** (10 - 8), s.crumbs);
  check('two moves recorded', s.moves.length === 2, s.moves.length);
  check('liar rejected alone', s.moves[1].outcome === 'rejected-bits', s.moves[1].outcome);
}

// 5) DEDUPE across a batch boundary — the same proof twice earns once.
{
  const c = { ms: T0 + 1, bits: 10, nonce: 1n };
  const v = verifyAll([c]);
  const b = `bank ${c.ms}:10:1#`;
  const s = foldChips(H, TABLE, [reply(b + T0 + '~', 'd1', T0), reply(b + (T0 + 1) + '~', 'd2', T0 + 1)], v);
  check('duplicate proof credits once', s.crumbs === CRUMBS_PER_CHIP * 2 ** (10 - 8), s.crumbs);
  check('second is rejected-duplicate', s.moves[1].outcome === 'rejected-duplicate', s.moves[1].outcome);
}

// 6) DECAY is unchanged by grouping: one 2-chip reply an hour later decays the
//    same as two single replies at that same instant.
{
  const HOUR = 3_600_000;
  const first = { ms: T0, bits: 14, nonce: 9n };
  const later = [{ ms: T0 + HOUR, bits: 8, nonce: 10n }, { ms: T0 + HOUR + 1, bits: 8, nonce: 11n }];
  const v = verifyAll([first, ...later]);

  const batched = foldChips(H, TABLE, [
    reply(`bank 14 9#${T0}~`, 'x0', T0),
    reply(`bank ${later.map((c) => `${c.ms}:8:${c.nonce.toString(16)}`).join(',')}#${T0 + HOUR}~`, 'x1', T0 + HOUR),
  ], v);

  const singles = foldChips(H, TABLE, [
    reply(`bank 14 9#${T0}~`, 'y0', T0),
    reply(`bank 8 a#${T0 + HOUR}~`, 'y1', T0 + HOUR),
    reply(`bank 8 b#${T0 + HOUR + 1}~`, 'y2', T0 + HOUR),
  ], v);

  check('decay identical either way', batched.crumbs === singles.crumbs, { batched: batched.crumbs, singles: singles.crumbs });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsBatch.test.ts
```
Expected: FAIL — the fold still reads `parsed.bits`/`parsed.nonce`.

- [ ] **Step 3: Implement**

In `chipsEngine.ts`: import `proofKey` from `./proofKey`, add `'rejected-oversize'` to `Outcome`, and replace the whole `if (parsed.kind === 'bank') { … }` block plus the `applyBuy` dispatch with:

```ts
    if (parsed.kind === 'oversize') {
      // Rejected on the count alone — nothing here is verified, which is the
      // entire point of the cap.
      state.moves.push({ content_id: reply.content_id, ms: parsed.ms, outcome: 'rejected-oversize' });
      continue;
    }

    if (parsed.kind === 'bank') {
      for (const chip of parsed.chips) {
        const key = proofKey(tableId, reply.author_id, chip.ms, chip.nonce);
        const actual = verified.get(key);

        if (actual === undefined) {
          state.unverifiedBanks++;
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'rejected-unverified' });
        } else if (chip.bits < BANK_MIN_BITS || actual < chip.bits) {
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'rejected-bits', bits: chip.bits });
        } else if (seenProofs.has(key)) {
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'rejected-duplicate', bits: chip.bits });
        } else {
          seenProofs.add(key);
          const crumbs = payoutFor(state, chip.bits, at);
          state.crumbs = Math.min(state.crumbs + crumbs, state.bowlCap);
          state.lifetimeChips += 2 ** (chip.bits - BANK_MIN_BITS);
          if (chip.bits > state.crispest) state.crispest = chip.bits;
          state.dipIndex = dipIndexFor(state.lifetimeChips);
          if (confirmed) state.lastBankAt = at;
          state.moves.push({ content_id: reply.content_id, ms: chip.ms, outcome: 'banked', bits: chip.bits, crumbs });
        }
      }
      continue;
    }

    applyBuy(state, reply, parsed);
```

Rename the `_tableId` parameter of `foldChips` to `tableId` — it is used now.

> Chips are folded in the order they appear in the batch, so a batch is exactly equivalent to that sequence of single replies. Payout depends on live `dipIndex`/`seasoning`, so the order within a batch is consensus-relevant and must not be sorted.

- [ ] **Step 4: Run it to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsBatch.test.ts && npx tsc -b
```
Expected: all `ok`. Other fold tests will fail — they build `verified` maps keyed by `content_id`. Task 4 migrates them.

- [ ] **Step 5: Do NOT commit yet** — continue to 2c, which migrates the fixtures
and commits the whole consensus change together.

---

#### Task 2c: Re-key verification, and migrate the existing fold tests

**Files:**
- Modify: `chips-client/src/lib/chipsVerify.ts`
- Modify: `chips-client/src/lib/chipsEngine.bank.test.ts`, `.sog.test.ts`, `.buy.test.ts`, `.dip.test.ts`, `.determinism.test.ts`, `chipsVerify.test.ts`, `sogProjection.test.ts` (whichever build `verified` maps)

**Interfaces:**
- Consumes: `proofKey` (Task 1), `parseMove` returning `chips[]` (Task 2)
- Produces: `verifyReplies(tableId, owner, replies, onProgress?)` returning `Map<proofKey, bits>`; `verifyHashCount()` unchanged

- [ ] **Step 1: Update `chipsVerify.ts`**

Replace `cacheKey` with `proofKey`, and iterate every chip of every bank reply:

```ts
import { proofKey } from './proofKey';

// …inside verifyReplies, replacing the single-chip loop:
  const wanted: { reply: ChipsReply; chip: ChipEntry }[] = [];
  for (const r of replies) {
    if (r.author_id !== owner) continue;          // DoS control, still before any hashing
    const parsed = parseMove(r.body);
    if (parsed?.kind !== 'bank') continue;         // 'oversize' verifies nothing, by design
    for (const chip of parsed.chips) wanted.push({ reply: r, chip });
  }

  const out = new Map<string, number>();
  let done = 0;
  let dirty = false;

  for (const { reply, chip } of wanted) {
    const key = proofKey(tableId, reply.author_id, chip.ms, chip.nonce);
    let bits = memory.get(key);
    if (bits === undefined) {
      bits = await hashBits(reply.author_id, tableId, chip.ms, chip.nonce);
      hashCount++;
      memory.set(key, bits);
      dirty = true;
    }
    out.set(key, bits);
    onProgress?.(++done, wanted.length);
  }
```

Bump `STORE_KEY` to `chips.verified.v3` — v2 entries are keyed differently and must not be read as if they were v3.

- [ ] **Step 2: Migrate the fold tests' verification maps**

Every existing fold test builds `new Map([[content_id, bits]])`. Change each to key on the proof. Example, in `chipsEngine.bank.test.ts`:

```ts
import { proofKey } from './proofKey';

// was: new Map([['c1', 15]])
// now: key on the proof the body actually declares
const v = new Map([[proofKey(TABLE, A, 1_000_000, 1n), 15]]);
```

The nonce and ms must match what each fixture's body string contains. Where a fixture uses a sequence counter for nonces, thread the same value into the map.

- [ ] **Step 3: Run the whole suite**

```bash
cd chips-client && npm test && npx tsc -b
```
Expected: all suites pass. **If a fold test fails, fix the fixture — never the fold.** A test that now credits nothing usually means its map key does not match its body.

- [ ] **Step 4: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): batch banking in the fold — grammar, crediting, proof-keyed verification"
```

---

### Task 3: Emit a batch body

**Files:**
- Modify: `chips-client/src/lib/chipsBody.ts`
- Test: `chips-client/src/lib/chipsBody.test.ts`

**Interfaces:**
- Produces: `bankBatchBody(chips: ChipEntry[], authoringMs: number): string`. `bankBody` is retained unchanged for the v1 round-trip test.

- [ ] **Step 1: Add the round-trip test**

Append to `chips-client/src/lib/chipsBody.test.ts`:

```ts
import { bankBatchBody } from './chipsBody';
import { MAX_BATCH } from './chipsConst';

// A batch body must parse back to exactly the chips that went in — the grammar
// and its inverse cannot be allowed to drift.
{
  const chips = [
    { ms: 1_000_000, bits: BANK_MIN_BITS, nonce: 0n },
    { ms: 1_000_001, bits: MAX_BITS, nonce: 2n ** 64n - 1n },
    { ms: 1_000_002, bits: 12, nonce: 0xdeadbeefn },
  ];
  const p = parseMove(bankBatchBody(chips, 1_000_009));
  check('batch round-trips', p?.kind === 'bank');
  if (p?.kind === 'bank') {
    check('same length', p.chips.length === chips.length);
    check('same values', chips.every((c, i) =>
      p.chips[i].ms === c.ms && p.chips[i].bits === c.bits && p.chips[i].nonce === c.nonce));
  }
}

// The emitter must refuse to build what the fold would reject whole.
{
  const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ ms: 1_000_000 + i, bits: 8, nonce: BigInt(i) }));
  let threw = false;
  try { bankBatchBody(many, 1); } catch { threw = true; }
  check('refuses over MAX_BATCH', threw);

  let threwEmpty = false;
  try { bankBatchBody([], 1); } catch { threwEmpty = true; }
  check('refuses empty', threwEmpty);
}

// A full batch must stay inside the 1 KB inline-storage threshold.
{
  const full = Array.from({ length: MAX_BATCH }, (_, i) => ({ ms: 1_785_000_000_000 + i, bits: 20, nonce: 2n ** 64n - 1n }));
  const body = bankBatchBody(full, 1_785_000_000_099);
  check('full batch stays inline (<1024 bytes)', new TextEncoder().encode(body).length < 1024, new TextEncoder().encode(body).length);
}
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsBody.test.ts
```
Expected: FAIL — `bankBatchBody` is not exported.

- [ ] **Step 3: Implement**

Append to `chipsBody.ts`:

```ts
import { MAX_BATCH } from './chipsConst';

/**
 * The inverse of `parseMove`'s batch form.
 *
 * Asserts rather than trusts: a body the fold would reject whole is a silently
 * lost pile of mined proofs, and the caller has already spent the CPU.
 */
export function bankBatchBody(
  chips: { ms: number; bits: number; nonce: bigint }[],
  authoringMs: number
): string {
  if (chips.length === 0) throw new Error('bankBatchBody: empty batch');
  if (chips.length > MAX_BATCH) throw new Error(`bankBatchBody: ${chips.length} chips exceeds MAX_BATCH ${MAX_BATCH}`);
  if (!Number.isSafeInteger(authoringMs) || authoringMs <= 0) throw new Error('bankBatchBody: bad authoring ms');

  const parts = chips.map((c) => {
    if (!Number.isInteger(c.bits) || c.bits < BANK_MIN_BITS || c.bits > MAX_BITS) {
      throw new Error(`bankBatchBody: bits ${c.bits} outside [${BANK_MIN_BITS}, ${MAX_BITS}]`);
    }
    if (c.nonce < 0n || c.nonce > 0xffffffffffffffffn) throw new Error('bankBatchBody: nonce outside u64');
    if (!Number.isSafeInteger(c.ms) || c.ms <= 0) throw new Error('bankBatchBody: bad chip ms');
    return `${c.ms}:${c.bits}:${c.nonce.toString(16)}`;
  });

  return `bank ${parts.join(',')}#${authoringMs}~`;
}
```

- [ ] **Step 4: Run the whole suite**

```bash
cd chips-client && npm test && npx tsc -b && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): emit a batch body"
```

---

## ⛔ DEPLOY GATE — do not start Task 4 until this is done

Tasks 1-3 give every client the ability to **read** batches. Nothing emits them yet, so this is safe to ship on its own and must be shipped on its own.

- [ ] Open a PR for Tasks 1-3, get it merged.
- [ ] `bash scripts/deploy-web-clients.sh chips` from the repo root.
- [ ] Confirm the live bundle parses batches — fetch `https://swimchain.io/chips/assets/index-*.js` and grep for the batch entry pattern.
- [ ] Confirm existing tables still fold correctly in a browser: the live table at 612 lifetime crunch must still read 612.

Only then continue. **Emitting batches from a client while another client cannot parse them makes the two disagree about the same history permanently.**

---

### Task 4: The queue

**Files:**
- Create: `chips-client/src/lib/chipsQueue.ts`
- Test: `chips-client/src/lib/chipsQueue.test.ts`

**Interfaces:**
- Produces:
  - `type QueuedMove = { id: number; kind: 'bank'; chip: ChipEntry } | { id: number; kind: 'buy'; key: string }`
  - `enqueue(q: QueuedMove[], move: Omit<QueuedMove,'id'>, nextId: number): QueuedMove[]`
  - `takeBatch(q: QueuedMove[]): { moves: QueuedMove[]; kind: 'bank' | 'buy' } | null`
  - `ack(q: QueuedMove[], taken: QueuedMove[]): QueuedMove[]`
  - `loadQueue(): QueuedMove[]`, `saveQueue(q: QueuedMove[]): void`, `clearQueue(): void`

Pure logic, no React and no network, so the FIFO and batching rules are testable directly.

- [ ] **Step 1: Write the failing test**

`chips-client/src/lib/chipsQueue.test.ts`:

```ts
/** The queue's ordering rules. Run: npx tsx src/lib/chipsQueue.test.ts */
import { enqueue, takeBatch, ack, type QueuedMove } from './chipsQueue';
import { MAX_BATCH } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const chip = (n: number) => ({ ms: 1_000_000 + n, bits: 10, nonce: BigInt(n) });
const bankMove = (n: number) => ({ kind: 'bank' as const, chip: chip(n) });
const buyMove = (key: string) => ({ kind: 'buy' as const, key });

// 1) A lone chip goes out alone — an idle player waits for nothing.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  const t = takeBatch(q);
  check('single chip taken', t?.moves.length === 1, t?.moves.length);
  check('taken as a bank', t?.kind === 'bank');
}

// 2) Banks batch up to MAX_BATCH, never beyond.
{
  let q: QueuedMove[] = [];
  for (let i = 0; i < MAX_BATCH + 5; i++) q = enqueue(q, bankMove(i), i + 1);
  const t = takeBatch(q)!;
  check('batch capped at MAX_BATCH', t.moves.length === MAX_BATCH, t.moves.length);
  const rest = ack(q, t.moves);
  check('remainder stays queued', rest.length === 5, rest.length);
}

// 3) A buy is NEVER batched with banks, and never overtakes them. This is what
//    stops an upgrade folding as rejected-cost because its funding chips have
//    not landed yet.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  q = enqueue(q, buyMove('season1'), 2);
  q = enqueue(q, bankMove(2), 3);

  const first = takeBatch(q)!;
  check('banks before the buy go first', first.kind === 'bank' && first.moves.length === 1, first.moves.length);

  const afterBanks = ack(q, first.moves);
  const second = takeBatch(afterBanks)!;
  check('then the buy, alone', second.kind === 'buy' && second.moves.length === 1);

  const afterBuy = ack(afterBanks, second.moves);
  const third = takeBatch(afterBuy)!;
  check('then the later bank', third.kind === 'bank' && third.moves.length === 1);
}

// 4) Batching stops at the first buy — it must not reach past it for more banks.
{
  let q: QueuedMove[] = [];
  q = enqueue(q, bankMove(1), 1);
  q = enqueue(q, buyMove('season1'), 2);
  for (let i = 2; i < 6; i++) q = enqueue(q, bankMove(i), i + 1);
  const t = takeBatch(q)!;
  check('batch stops at the buy', t.moves.length === 1, t.moves.length);
}

// 5) ack removes exactly what was taken, order preserved.
{
  let q: QueuedMove[] = [];
  for (let i = 0; i < 5; i++) q = enqueue(q, bankMove(i), i + 1);
  const t = takeBatch(q)!;
  const rest = ack(q, t.moves.slice(0, 2));
  check('ack is by identity', rest.length === 3, rest.length);
  check('order preserved', rest[0].id === 3 && rest[2].id === 5);
}

// 6) Empty queue takes nothing.
check('empty takes null', takeBatch([]) === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd chips-client && npx tsx src/lib/chipsQueue.test.ts
```
Expected: FAIL — `Cannot find module './chipsQueue'`.

- [ ] **Step 3: Implement**

`chips-client/src/lib/chipsQueue.ts`:

```ts
/**
 * The pending-move queue.
 *
 * Ordering is the whole job. Moves reach the chain in queue order with ONE
 * submission in flight, because a buy that lands ahead of the chips funding it
 * folds as `rejected-cost` — the player's upgrade un-buys itself.
 *
 * Banks batch; buys never do. A buy is one reply, and there are a handful per
 * session, so batching them would widen a consensus-critical grammar for
 * nothing.
 *
 * Persisted, because every queued bank is a mined proof — CPU the player has
 * already spent and cannot get back.
 */
import { MAX_BATCH } from './chipsConst';
import type { ChipEntry } from './chipsEngine';

export type QueuedMove =
  | { id: number; kind: 'bank'; chip: ChipEntry }
  | { id: number; kind: 'buy'; key: string };

const STORE_KEY = 'chips.queue.v1';

export function enqueue(q: QueuedMove[], move: Omit<QueuedMove, 'id'>, nextId: number): QueuedMove[] {
  return [...q, { ...move, id: nextId } as QueuedMove];
}

/**
 * The head of the queue, as one submittable unit: either a run of banks (up to
 * MAX_BATCH, stopping at the first buy) or exactly one buy.
 */
export function takeBatch(q: QueuedMove[]): { moves: QueuedMove[]; kind: 'bank' | 'buy' } | null {
  if (q.length === 0) return null;
  if (q[0].kind === 'buy') return { moves: [q[0]], kind: 'buy' };

  const moves: QueuedMove[] = [];
  for (const m of q) {
    if (m.kind !== 'bank' || moves.length >= MAX_BATCH) break;
    moves.push(m);
  }
  return { moves, kind: 'bank' };
}

/** Drop exactly the moves that landed, by id. */
export function ack(q: QueuedMove[], taken: QueuedMove[]): QueuedMove[] {
  const gone = new Set(taken.map((m) => m.id));
  return q.filter((m) => !gone.has(m.id));
}

export function loadQueue(): QueuedMove[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as { id: number; kind: string; key?: string; chip?: { ms: number; bits: number; nonce: string } }[];
    const out: QueuedMove[] = [];
    for (const r of rows) {
      if (r.kind === 'buy' && typeof r.key === 'string') out.push({ id: r.id, kind: 'buy', key: r.key });
      else if (r.kind === 'bank' && r.chip) out.push({ id: r.id, kind: 'bank', chip: { ...r.chip, nonce: BigInt('0x' + r.chip.nonce) } });
    }
    return out;
  } catch {
    // A corrupt queue must never take the game down with it.
    return [];
  }
}

export function saveQueue(q: QueuedMove[]): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(q.map((m) =>
      m.kind === 'bank' ? { id: m.id, kind: 'bank', chip: { ...m.chip, nonce: m.chip.nonce.toString(16) } } : m)));
  } catch { /* quota or private mode — the in-memory queue still works */ }
}

export function clearQueue(): void {
  try { globalThis.localStorage?.removeItem(STORE_KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd chips-client && npx tsx src/lib/chipsQueue.test.ts && npm test
```

- [ ] **Step 5: Add to the test script and commit**

Append ` && tsx src/lib/chipsQueue.test.ts` to `test`.

```bash
git add chips-client/
git commit -m "feat(chips): the pending-move queue"
```

---

### Task 5: Wire the queue — optimistic fold and the sender loop

**Files:**
- Modify: `chips-client/src/App.tsx`
- Modify: `chips-client/src/lib/host.ts` (nothing structural — `submitMove` already takes a body string)

**Interfaces:**
- Consumes: everything from Tasks 1-6
- Produces: no new exports; `onBank`/`onBuy` become non-blocking

**The load-bearing idea:** optimistic state is produced by the *same* `foldChips`, over confirmed replies plus synthetic pending ones. There is no second ledger.

- [ ] **Step 1: Build the synthetic replies and fold them**

Replace the single `foldChips` call in `refresh()` with one that appends the queue:

```ts
  /**
   * Queued moves as synthetic PENDING replies.
   *
   * `block_height: null` is what makes this correct rather than a hack: the
   * fold already credits pending replies without advancing the decay clock, so
   * a queued chip reads exactly as it will once it lands. Because the same fold
   * produces both, there is no second accounting path to drift and nothing to
   * reconcile when the batch confirms — the synthetic entry drops out and the
   * real one arrives.
   *
   * Bits are known locally (we mined them), so the verification map is seeded
   * directly; on confirmation the same proof is re-verified from the chain by
   * the normal path.
   */
  function withPending(
    confirmed: ChipsReply[],
    verified: Map<string, number>,
    queue: QueuedMove[],
    me: string,
    table: string
  ): { replies: ChipsReply[]; verified: Map<string, number> } {
    if (queue.length === 0) return { replies: confirmed, verified };
    const v = new Map(verified);
    const extra: ChipsReply[] = [];
    let seq = 0;

    for (const m of queue) {
      // Synthetic ids never collide with a chain content_id (`sha256:…`).
      const cid = `pending:${m.id}`;
      const at = Date.now();
      if (m.kind === 'bank') {
        v.set(proofKey(table, me, m.chip.ms, m.chip.nonce), m.chip.bits);
        extra.push({ author_id: me, body: bankBatchBody([m.chip], at + seq++), block_height: null, content_id: cid, created_at: at });
      } else {
        extra.push({ author_id: me, body: buyBody(m.key, at + seq++), block_height: null, content_id: cid, created_at: at });
      }
    }
    return { replies: [...confirmed, ...extra], verified: v };
  }
```

- [ ] **Step 2: Make banking and buying non-blocking**

`onBank` no longer awaits the network:

```ts
  function onBank(index: number): void {
    if (!host || !me || !tableId) return;
    const chip = bank(index);        // still destructive; still the only reference
    if (!chip) return;
    launchDip(index, chip);          // the animation is the feedback now
    setQueue((q) => enqueue(q, { kind: 'bank', chip: { ms: chip.ms, bits: chip.bits, nonce: chip.nonce } }, nextId.current++));
  }
```

`onBuy` likewise enqueues instead of awaiting. **Remove the `busy` gate from both** — that gate is the wait we are deleting. Keep `busy` only for onboarding.

- [ ] **Step 3: The sender loop**

```ts
  /**
   * One flight at a time, strict FIFO, take whatever is queued.
   *
   * Batch size self-clocks: an idle player's chip goes out alone; a busy
   * kitchen accumulates during each ~5.4s action PoW and the next batch grows
   * to match. No timing constants to pick or retune.
   *
   * A failing head BLOCKS the queue on purpose — it must not be overtaken.
   */
  const sending = useRef(false);
  const backoff = useRef(0);

  useEffect(() => {
    if (sending.current || !host || !me || !tableId || queue.length === 0) return;
    let cancelled = false;

    (async () => {
      sending.current = true;
      const take = takeBatch(queue);
      if (!take) { sending.current = false; return; }
      try {
        const at = Date.now();
        const body = take.kind === 'bank'
          ? bankBatchBody(take.moves.map((m) => (m as { chip: ChipEntry }).chip), at)
          : buyBody((take.moves[0] as { key: string }).key, at);
        await host.submitMove(me, tableId, body);
        if (cancelled) return;
        backoff.current = 0;
        setQueue((q) => ack(q, take.moves));
        await refresh();
      } catch {
        // Keep it queued and try again. Capped so a long offline spell does not
        // decay into one attempt an hour.
        backoff.current = Math.min(backoff.current === 0 ? 2000 : backoff.current * 2, 60_000);
        setTimeout(() => { if (!cancelled) setQueueTick((t) => t + 1); }, backoff.current);
      } finally {
        sending.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [queue, queueTick, host, me, tableId]);
```

Add `const [queueTick, setQueueTick] = useState(0)` — the backoff retry needs a way to re-run the effect without the queue changing.

- [ ] **Step 4: Declare the queue state, and use `withPending` in `refresh`**

```ts
  const [queue, setQueue] = useState<QueuedMove[]>(loadQueue);
  const [queueTick, setQueueTick] = useState(0);
  // Ids only need to be unique within a session; the queue is acked by id.
  const nextId = useRef(1);

  // Every queue change is written straight through: each queued bank is a
  // mined proof, i.e. CPU the player has already spent and cannot get back.
  useEffect(() => { saveQueue(queue); }, [queue]);
```

and in `refresh()`, fold the confirmed replies together with the queue:

```ts
    const confirmed = await host.loadTable(tableId);
    const verified = await verifyReplies(tableId, me.publicKeyHex, confirmed, onVerifyProgress);
    const merged = withPending(confirmed, verified, queue, me.publicKeyHex, tableId);
    setState(foldChips(header, tableId, merged.replies, merged.verified));
```

`refresh` therefore depends on `queue`; keep it a `useCallback` with `queue` in its deps so a newly
queued move shows up immediately.

- [ ] **Step 5: Verify in a browser**

```bash
cd chips-client && npm run dev
```

Confirm, and report each explicitly:
- dipping a chip credits crumbs immediately and the fryer keeps running — no block
- dipping several in quick succession queues them, and the next batch carries more than one
- buying an upgrade does not block
- reloading mid-flight preserves the queue and it drains afterwards
- `npx tsc -b`, `npm test`, `npm run build` clean

- [ ] **Step 6: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): queue moves, fold them optimistically, send in the background"
```

---

### Task 6: The chip gets eaten

**Files:**
- Modify: `chips-client/src/Kitchen.tsx` (`DipFlight`), `chips-client/src/styles.css`

**Interfaces:**
- Consumes: the existing `DipFlightState` and `launchDip`

The chip currently sinks into the dip and vanishes, which is a strange fate for a chip. It should be eaten, and the crumbs should be the visible consequence.

- [ ] **Step 1: Extend the keyframes**

Replace `@keyframes dip-flight` in `styles.css` with the five beats, and add a crumb burst:

```css
/* fryer -> dip -> up -> eaten -> crumbs. ~1.25s, and deliberately decoupled
   from the ~5.4s action PoW: this is feedback, not a progress bar. */
.dip-flight { animation: dip-flight 1.25s cubic-bezier(.34,.02,.52,1) forwards; }

@keyframes dip-flight {
  0%   { transform: translate(var(--fx0), var(--fy0)) scale(1) rotate(0deg); opacity: 1; }
  22%  { transform: translate(var(--fmx), var(--fmy)) scale(1.06) rotate(-14deg); opacity: 1; }   /* lift */
  42%  { transform: translate(var(--fx1), calc(var(--fy1) + 18px)) scale(.86) rotate(6deg); opacity: 1; }  /* in the dip */
  61%  { transform: translate(var(--fx1), calc(var(--fy1) - 30px)) scale(1.12) rotate(-4deg); opacity: 1; } /* out, loaded */
  76%  { transform: translate(var(--fx1), calc(var(--fy1) - 46px)) scale(1.3) rotate(2deg); opacity: 1; }   /* toward the eater */
  80%  { transform: translate(var(--fx1), calc(var(--fy1) - 46px)) scale(1.34); opacity: 1; }               /* crunch */
  100% { transform: translate(var(--fx1), calc(var(--fy1) - 40px)) scale(.2); opacity: 0; }
}

/* The dip surface reacting as the chip goes in. */
.dip-ripple {
  position: fixed; z-index: 29; pointer-events: none;
  left: 0; top: 0; width: var(--fs); height: var(--fs);
  transform: translate(var(--fx1), var(--fy1));
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(255,220,160,.5);
  animation: dip-ripple 1.25s ease-out forwards;
}
@keyframes dip-ripple {
  0%, 33% { box-shadow: 0 0 0 0 rgba(255,220,160,0); }
  46%     { box-shadow: 0 0 0 14px rgba(255,220,160,.28); }
  70%     { box-shadow: 0 0 0 30px rgba(255,220,160,0); }
  100%    { box-shadow: 0 0 0 30px rgba(255,220,160,0); }
}

/* Crumbs, thrown from the crunch toward the counter. */
.dip-crumb {
  position: fixed; z-index: 31; pointer-events: none;
  width: 5px; height: 5px; border-radius: 40% 60% 55% 45%;
  background: hsl(34 70% 52%);
  animation: dip-crumb .5s cubic-bezier(.2,.6,.4,1) forwards;
  animation-delay: .78s;
  opacity: 0;
}
@keyframes dip-crumb {
  0%   { transform: translate(var(--cx0), var(--cy0)) scale(1); opacity: 1; }
  100% { transform: translate(var(--cx1), var(--cy1)) scale(.3); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .dip-flight { animation-duration: .3s; }
  .dip-ripple, .dip-crumb { display: none; }
}
```

- [ ] **Step 2: Render the ripple and crumbs**

Add `cx1`/`cy1` (the crumb counter's centre) to `DipFlightState`, and in `launchDip` measure it
alongside the basket and bowl:

```ts
  const counter = document.querySelector('.bowl-crumbs') ?? bowl;
  const cRect = counter.getBoundingClientRect();
  // …in the setFlight call:
  cx1: cRect.left + cRect.width / 2,
  cy1: cRect.top + cRect.height / 2,
```

Extend the flight's lifetime from 900 ms to 1400 ms so the element is not removed mid-crunch:

```ts
  window.setTimeout(() => setFlight((f) => (f && f.key === chip.ms ? null : f)), 1400);
```

Then render the ripple and crumbs beside the chip in `DipFlight`:

```tsx
const CRUMBS = 7;

// Deterministic scatter: keyed on the chip's ms so a re-render cannot reshuffle
// crumbs mid-flight. Same reason the chip's own silhouette is seeded.
function crumbJitter(seed: number, i: number): { dx: number; dy: number } {
  const n = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453;
  const f = n - Math.floor(n);
  const a = f * Math.PI * 2;
  return { dx: Math.cos(a) * 26, dy: Math.sin(a) * 18 };
}

// …inside DipFlight's returned fragment, after the chip element:
<div className="dip-ripple" aria-hidden="true" style={{
  '--fx1': `${flight.x1}px`, '--fy1': `${flight.y1}px`, '--fs': `${flight.size}px`,
} as React.CSSProperties} />

{Array.from({ length: CRUMBS }, (_, i) => {
  const j = crumbJitter(flight.ms, i);
  return (
    <div
      key={i}
      className="dip-crumb"
      aria-hidden="true"
      style={{
        '--cx0': `${flight.x1 + flight.size / 2}px`,
        '--cy0': `${flight.y1 - 46 + flight.size / 2}px`,
        '--cx1': `${flight.cx1 + j.dx}px`,
        '--cy1': `${flight.cy1 + j.dy}px`,
        animationDelay: `${0.78 + i * 0.012}s`,
      } as React.CSSProperties}
    />
  );
})}
```

`DipFlight` must return a fragment now rather than a single element, and each of the three pieces
stays `position: fixed` / `pointer-events: none` so none of them can move the fryer.

- [ ] **Step 3: Verify in a browser**

Confirm and report: the chip dips, comes back up, breaks, and crumbs travel to the counter; nothing shifts the fryer; no console errors; reduced-motion still works.

- [ ] **Step 4: Commit**

```bash
git add chips-client/
git commit -m "feat(chips): the chip gets eaten, and the crumbs are the payoff"
```

---

## Self-review notes

- **Spec coverage:** §1 grammar → Tasks 2, 3; §2 fold rules → Task 2; §3 verification → Task 2; §4 client → Tasks 4, 5; §5 animation → Task 6; §6 balance amendment → no code (a constant is deleted, not added); §7/§7.1 security → `MAX_BATCH` enforcement in Tasks 1-2 and the deploy gate; §8 testing → every listed fixture appears in Tasks 2, 3, 4.
- **Known gap, deliberate:** the spec's client-side verification work budget is *not* implemented. It is policy, not consensus, and the boards' existing 6-table rotation plus the persistent cache bound the current scale. Revisit when the space grows.
- **Type consistency:** `ChipEntry`, `ParsedMove`, `QueuedMove`, `proofKey`, `MAX_BATCH`, `bankBatchBody`, `takeBatch`/`ack`/`enqueue` are each defined once and referenced by those exact names throughout.
