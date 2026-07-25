# Chips & Dip — Design

**Date:** 2026-07-25
**Status:** Approved
**What:** A bespoke local PC game client (`ChipsAndDip.exe`) for an idle/clicker game on its own
mainnet app-class space, where the score is proof-of-work actually performed and the bowl goes
soggy if you hoard it.

## Premise

Cookie Clicker, except the cookie is a chip, the chip is a hash, and the ledger is Swimchain.

You have a bowl, a fryer, and a dip. Your table is a post; every move is a reply. Nobody runs
the party. The number on the public board is not a number your client asserts — it is a sum of
Argon2id proofs any other player can re-check in milliseconds.

Where The Trench makes **hosting-as-work** literal (your node is your lantern), Chips & Dip makes
**proof-of-work** literal (your crunch is your chip). Different axis, same substrate — deliberately
not a Trench reskin.

## Success criteria

- A fresh Windows install reaches "playing, node running, sponsored, table set, first chip banked"
  with one download and no terminal.
- Every chip on the leaderboard is independently verifiable by any other client, with no trust in
  the reporting client and no node changes.
- Absence costs a soggy bowl and nothing permanent — the game never rewards attendance, only work.
- Reads as a game from the first frame, full-screen, not a web page in a frame (§7).

## 1. Game rules (v1)

**Table:** one per identity. A post carrying a display name. Your whole game state folds from
replies on it.

**A chip is a crunch.** A worker grinds Argon2id nonces (8 MiB, matching the protocol's memory-hard
params) over a preimage bound to the player:

```
chips-v1 ‖ author_id ‖ table_id ‖ authoring_ms ‖ nonce_le_u64
```

**Crispness** = leading zero bits of the resulting hash. Finding a `d`-bit chip costs ~`2^d`
attempts. Because the preimage binds `author_id` and `table_id`, a chip is non-transferable —
copying someone's good nonce proves nothing on your own table.

**Banking.** The click is the decision, not the hashing. The chip crisps on screen while the fryer
grinds; clicking banks it as one on-chain reply. Payout in *crumbs* (integer, 1 chip = 1000 crumbs):

```
base_crumbs(bits) = 1000 * 2^(bits - 8)          # bits < GOLDEN_BITS
base_crumbs(bits) = 1000 * 2^(bits - 8) * GOLD_NUM / GOLD_DEN   # bits >= GOLDEN_BITS
banked_crumbs     = base_crumbs * seasoning_num / seasoning_den  # integer division, last
```

`BANK_MIN_BITS = 8` (a bank below this is rejected). `GOLDEN_BITS = 16` and
`GOLD_NUM/GOLD_DEN = 5/2` in v1 — the superlinear band that makes patience pay.

**Why "when to bank" is a real decision.** Payout is linear in work (`2^d` attempts → `2^(d-8)`
chips), so no banking schedule conjures free chips — reward tracks work, by construction. Three
forces create the optimum:

1. **Kitchen overhead.** Every bank is an on-chain reply requiring the node's own ~8-bit action
   PoW — seconds of CPU that yield zero chips. Banking constantly burns the machine on overhead.
2. **Sogginess and the rim.** Banked crumbs decay, and crumbs past `bowl_cap` are lost.
3. **Golden chips.** Past `GOLDEN_BITS` the payout goes superlinear — one more minute at the fryer.

**Sogginess (decay).** The bowl decays; lifetime crunch does not. Decay applies lazily, integer-only,
iterated over whole elapsed hours between consecutive moves:

```
for each whole hour elapsed:  crumbs = crumbs * SOG_NUM / SOG_DEN     # integer division
```

The base rate is `97/100` per hour in v1 (~23 h half-life). Two things modify it, and their
**resolution order is fixed** so every client agrees:

1. The current dip tier sets the base numerator (`97` normally, `96` under Guacamole).
2. `airtight`, if owned, then adds `+2` to that numerator (→ `99` or `98`, ~69 h / ~34 h half-life).

Elapsed hours are capped at `SOG_MAX_HOURS = 720` (30 days) per gap, so an arbitrarily long absence
is bounded work to fold. The soggy number ticking on screen between moves is **display-only
projection**; state banks at the next move.

**Two numbers, deliberately split:**

| | Source | Decays | Purpose |
|---|---|---|---|
| **Bowl** (crumbs) | banked chips, after multipliers | yes | the spendable currency |
| **Lifetime crunch** | `sum of 2^(bits-8)` over verified banks, **un-multiplied** | never | the public record |

Crumbs and lifetime crunch are different units and must not be compared: 1 chip = 1000 crumbs,
while lifetime crunch counts whole chip-equivalents (an 8-bit bank adds exactly 1). Upgrade costs
below are in crumbs; dip thresholds are in lifetime crunch.

Lifetime crunch ignores Seasoning and every other upgrade, so the leaderboard is a pure record of
work done. Upgrades enrich your bowl, never your record. This split is also what keeps *presence*
from being a mechanic: a week away costs a soft bowl and nothing permanent.

**Upgrades** (bought from the bowl, so the game is spend-vs-hoard against staleness):

| Key | Effect | Cost curve (crumbs) |
|---|---|---|
| `seasoning` I–V | `seasoning_num/den` → 3/2, 2/1, 3/1, 4/1, 6/1 | 5k, 40k, 300k, 2M, 15M |
| `airtight` | +2 to the sog numerator (see resolution order above) | 25k |
| `bowl` I–III | `bowl_cap` → 250k, 5M, 100M | 10k, 150k, 2M |
| `fryer` II–IV | +1 parallel grinder worker each | 20k, 200k, 2M |
| `detector` | `GOLDEN_BITS` 16 → 15 | 500k |

Costs are fixed constants in the fold (not a formula) so every client agrees exactly.

**Dip is the ladder.** Unlocked by lifetime-crunch thresholds, never bought. Each tier re-skins the
whole scene. Most are pure spectacle; two carry a real quirk.

| Tier | Unlock (lifetime crunch) | Quirk |
|---|---|---|
| Plain Salsa | 0 | — |
| Guacamole | 1k | Browns: sog `96/100`, but chips pay `11/10` |
| French Onion | 10k | — |
| Queso | 100k | Congeals: first bank after a ≥12 h gap pays ×2 |
| Seven-Layer | 1M | Renders one visual layer per upgrade class owned |
| Buffalo | 10M | — |
| Fondue | 100M | — |
| The Abyssal Dip | 1B | Endgame skin; a wink at The Trench's seafloor |

Only the current tier's quirk applies (tiers do not stack).

**Explicitly cut from v1 (YAGNI):** trading, gifting, alliances, seasons/board wipes, multi-table
play, any chip that is not banked by its own author.

## 2. Protocol & determinism

- **Space:** new app-class space on mainnet, founded by the genesis identity (same motif as
  reef/chess/trench). Space id baked into client config. Standing auto-approve game-sponsor offer
  from the always-on sponsor bot → one-click first run.
- **Table = post.** Body: title line + JSON header `{v:1, kind:'chips-table', name}`.
- **Move = reply**, compact body inside the 466-byte action, each carrying the reef-style embedded
  authoring-ms (`#<ms>~`) for stable ordering of pending moves. Two verbs only:

```
bank <bits> <nonce_hex>
buy  <upgrade-key>
```

- **World state = pure client-side fold** (`chipsEngine.ts`, the reef/trench pattern). ALL time math
  uses embedded authoring-ms — never wall clock — so every client folds byte-identical state.
- **No floats anywhere in the fold** (design principle 1). Crumbs, multipliers and decay are integer
  numerator/denominator pairs with integer division applied in a fixed, documented order.
- **Chip verification.** Folding a `bank` recomputes exactly one `argon2id` over the canonical
  preimage and counts leading zeros. A bank claiming more bits than its nonce proves, or below
  `BANK_MIN_BITS`, folds as **rejected-but-present** — it still orders the stream, mirroring reef
  and the Trench. Unaffordable or duplicate `buy` likewise.
- **Verification cost & memoization.** One Argon2id at 8 MiB is ~15 ms — the PoW asymmetry means
  minutes to produce, milliseconds to check. Verified `(content_id → bits)` results memoize to disk,
  so each chip is verified once ever. A fresh install performs a one-time catch-up verification
  behind a diegetic progress state ("checking the chips"). Memoization is pure caching and does not
  affect fold output.
- **Fold isolation rule:** bowl, upgrades and lifetime crunch fold ONLY from replies on the player's
  own table post. Other tables are display input for the leaderboard, never balance input. This is
  what keeps every observer's fold byte-identical even when they host different subsets of tables.
- **Content-getting driver:** rendering the leaderboard issues `request_content` for other players'
  tables and their replies. Playing the game IS the hosting driver — per the standing design law
  that retention needs a driver, not a config flag.

## 3. Why this is fair without any handicap

Chips are Argon2id at 8 MiB — the protocol's own memory-hard function, whose minimum is commented
*"Minimum memory for ASIC resistance"* (`src/crypto/action_pow.rs:85`). Memory-hardness bounds the
hardware spread to memory bandwidth: no ASIC, no meaningful GPU farm, and a phone-class CPU is not
orders of magnitude behind a desktop. Therefore: **no device classes, no self-reported hashrate
normalization, no handicap.** Everyone crunches the same chip. Decay does the rest — the bowl
plateaus where crunching equals staling.

## 4. Client architecture

`chips-client/`, mirroring `trench-client/`:

```
chips-client/
  src-tauri/          # node sidecar, node_manager.rs, rpc_handoff.rs (reuse Trench's wiring)
  ui/
    src/
      lib/chipsEngine.ts        # pure deterministic fold
      lib/crunch.worker.ts      # N parallel Argon2id grinders, off-thread
      lib/chipsPow.ts           # preimage construction + verify (hash-wasm argon2id)
```

- Grinders are Web Workers; `fryer` upgrades raise the worker count. Grinding never runs on the
  main thread (reef learned this the hard way — see `reef-client/src/lib/pow.worker.ts`).
- Signing and PoW happen in-process; keys never leave the device. Submission is non-custodial via
  the local sidecar node's RPC.
- Ships as `ChipsAndDip.exe`.

## 5. Testing

- `chipsEngine` unit tests on the reef pattern: move ordering with equal timestamps, decay across
  hour boundaries and long gaps, `SOG_MAX_HOURS` clamping, rejected-but-present banks (over-claimed
  bits, sub-minimum bits, duplicate nonce), unaffordable buys, bowl-cap overflow, golden-band
  payout, dip-tier quirk boundaries (exactly-12 h queso gap).
- A determinism test folding a fixed synthetic reply stream twice and asserting byte-identical state.
- A round-trip test: grind a low-difficulty chip, fold it, assert the credited crumbs.

## 6. Build path

- **Phase 1 (this spec).** Single-table game, `bank`/`buy`, decay, upgrades, dip ladder, in-client
  leaderboard, `ChipsAndDip.exe`.
- **Phase 2.** Batched banking (multiple nonces per reply) to amortize kitchen overhead; seasons.
- **Phase 3 (needs a node change).** Expose the action's achieved PoW bits on the read path
  (`ReplyInfo` in `src/rpc/types.rs:660` currently carries no PoW fields). That would let a chip be
  proven by the action's own PoW instead of an in-body nonce, removing the duplicate grind entirely.
  Deliberately deferred — it blocks on a fleet-wide `sw` deploy, and v1 must need zero node changes.

## 7. Production bar

The established bar applies: full-screen, diegetic-first, reads as a game from the first frame.
The fryer, the bowl and the dip are the interface — no dashboard chrome, no web-page-in-a-frame.
Crispness is shown by the chip's appearance, not a progress bar with a number on it. Sogginess is
visible in the bowl before it is legible as a statistic.
