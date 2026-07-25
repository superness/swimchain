# Chips & Dip — Design

**Date:** 2026-07-25
**Status:** Approved
**What:** An idle/clicker game on its own mainnet app-class space, where the score is proof-of-work
actually performed and the bowl goes soggy if you hoard it. Ships as a browser client
(swimchain.io/chips, the reef/chess path) and as a desktop client (`ChipsAndDip.exe`, the Trench
path) from one shared engine and UI.

## Premise

Cookie Clicker, except the cookie is a chip, the chip is a hash, and the ledger is Swimchain.

You have a bowl, a fryer, and a dip. Your table is a post; every move is a reply. Nobody runs
the party. The number on the public board is not a number your client asserts — it is a sum of
Argon2id proofs any other player can re-check in milliseconds.

Where The Trench makes **hosting-as-work** literal (your node is your lantern), Chips & Dip makes
**proof-of-work** literal (your crunch is your chip). Different axis, same substrate — deliberately
not a Trench reskin.

## Success criteria

- A first-time browser visitor reaches "sponsored, table set, first chip banked" without installing
  anything; a fresh Windows install reaches the same state plus a running node, with one download
  and no terminal.
- The engine and UI are byte-for-byte the same on both targets; only `host.ts` differs.
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
chips), so no banking schedule conjures free chips — reward tracks work, by construction. Note also
that an unbanked chip does **not** sog: decay applies only to crumbs in the bowl. So the pressure to
bank cannot come from decay, and it must not come from an invented fee. It comes from compounding:

1. **Compounding is the primary pressure.** A chip in the fryer earns nothing. Banked, it buys
   Seasoning — and Seasoning multiplies *every chip you ever bank afterwards*. Sitting on an
   ungrown pile is strictly worse than converting it into a higher rate, which is the engine of the
   genre and costs nothing artificial. The whole strategy of the game is how early you convert
   throughput into rate.
2. **Golden chips pull the other way.** Past `GOLDEN_BITS` payout goes superlinear, so the fryer
   always has a reason to keep you standing there. Compounding says bank now; gold says one more
   minute. That opposition *is* the game.
3. **Kitchen overhead is a tax on junk, nothing more.** Every bank is an on-chain reply needing the
   node's mandatory ~8-bit action PoW: a flat ~256 attempts. Against an 8-bit chip that is a 100%
   tax; against a 16-bit chip it is 0.4%. It is a progressive penalty on spam-banking trash and it
   correctly disappears where the game wants you. It is **not** a designed cost and nothing may be
   added on top of it.
4. **The rim.** Crumbs past `bowl_cap` are lost, so an un-spent bowl eventually wastes income —
   a late-game backstop, not the main pressure.

**Sogginess (decay).** The bowl decays; lifetime crunch does not. Decay applies lazily, integer-only,
iterated over whole elapsed hours between consecutive **confirmed** moves, measured by the action
timestamp (`created_at`):

```
hours = min(floor((created_at - lastConfirmedAt) / 3_600_000), SOG_MAX_HOURS)
for each hour:  crumbs = crumbs * SOG_NUM / SOG_DEN     # integer division
```

**The decay clock MUST be the action timestamp, never the authoring-ms.** These are different fields
and the distinction is load-bearing:

- `#<ms>~` in the body is **free text the player writes.** Keying decay to it makes decay opt-out:
  dating your first move far in the future costs ~256 hashes and permanently pins the clock ahead of
  every later move, so gaps are always zero and the bowl never sogs. Bounding the jump doesn't help —
  a player controlling the timestamp can just reuse one value forever.
- `created_at` is the **action timestamp, and consensus bounds it.** `verify_pow`
  (`src/crypto/action_pow.rs:554-572`) rejects any action more than `CHALLENGE_FUTURE_TOLERANCE_SECS`
  (60 s) ahead or `CHALLENGE_VALIDITY_SECS` (600 s) behind the validating node's clock, and it is
  wired into every RPC submit path (`src/rpc/methods.rs:341,446,5983,6343`). A player cannot
  future-date a move by more than a minute.

Authoring-ms still breaks ordering ties *within* a block and still salts the chip preimage; it just
never measures elapsed time.

Block height was considered and rejected as the clock: Swimchain targets 10-minute blocks
(`TARGET_BLOCK_INTERVAL = 600`, `src/blocks/leader.rs:16`) but forms them faster on an active
network, so a fixed blocks-per-tick constant would make decay speed track unrelated network traffic —
the same coupling reef deliberately moved away from.

**Pending moves do not advance the clock.** A reply with `block_height === null` is in the mempool,
where `created_at` is stamped at query time and is not consensus-stable (this is the reef pending-
ordering bug). A pending move folds for its payout but applies no decay and does not move
`lastConfirmedAt`. Decay for that interval banks when the move confirms.

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

**Reference throughput** (the basis for every constant below): ~60 Argon2id-8 MiB attempts/sec per
worker, inferred from reef's "difficulty-8 is several seconds of CPU". Because payout is linear in
work, income is a constant **~234 crumbs/sec ≈ 843 chips/hour** at one fryer and no Seasoning,
regardless of what crispness you bank at. All pacing below derives from that figure; if the real
measured rate differs materially, the whole table rescales with it.

| Key | Effect | Cost (crumbs) |
|---|---|---|
| `seasoning` I–V | `seasoning_num/den` → 3/2, 2/1, 3/1, 4/1, 6/1 | 30k, 200k, 1.2M, 8M, 50M |
| `airtight` | +2 to the sog numerator (see resolution order above) | 70k |
| `bowl` I–III | `bowl_cap` → 3M, 200M, 5B (starting cap 100k) | 60k, 2M, 150M |
| `fryer` II–IV | +1 parallel grinder worker each | 400k, 12M, 100M |
| `detector` | `GOLDEN_BITS` 16 → 15 | 3M |

Costs are fixed constants in the fold (not a formula) so every client agrees exactly. The curve is
gated so each `bowl` tier is affordable under the *previous* cap, and the first Seasoning lands
~2 minutes in — compounding has to start early or it isn't the pressure the loop rests on.

**Dip is the ladder.** Unlocked by lifetime-crunch thresholds, never bought. Each tier re-skins the
whole scene. Most are pure spectacle; two carry a real quirk.

| Tier | Unlock (lifetime chips) | ~Time at 1 fryer | Quirk |
|---|---|---|---|
| Plain Salsa | 0 | — | — |
| Guacamole | 300 | 20 min | Browns: sog `96/100`, but chips pay `11/10` |
| French Onion | 3k | 3.5 h | — |
| Queso | 25k | ~30 h | Congeals: first bank after a ≥12 h gap pays ×2 |
| Seven-Layer | 150k | ~7 days | Renders one visual layer per upgrade class owned |
| Buffalo | 500k | ~25 days | — |
| Fondue | 1.2M | — | — |
| The Abyssal Dip | 3M | — | Endgame skin; a wink at The Trench's seafloor |

Only the current tier's quirk applies (tiers do not stack).

Because lifetime crunch is deliberately un-multiplied, the dip ladder is paced by **real elapsed CPU
time and nothing else** — Seasoning cannot buy your way up it. Only `fryer` tiers move it, by adding
genuine parallel work, which is why the last tiers assume a fully-built kitchen (~4× throughput) and
still read as a month-long endgame. That is the intended shape: the bowl is where you optimise, the
dip is where you show you actually did the hours.

**Explicitly cut from v1 (YAGNI):** trading, gifting, alliances, seasons/board wipes, multi-table
play, any chip that is not banked by its own author.

**Rejected alternatives** (recorded so they don't get re-proposed):

- *A banking fee, or a chip that "scorches" if left in the fryer.* Both are invented costs layered
  on top of a real one. Compounding supplies the same pressure honestly, so neither is needed.
- *Reusing the action PoW's own overshoot as the chip, avoiding the second grind.* Impossible
  without a node change: the winning nonce would have to be written into the body, but the body
  feeds `contentHash`, which feeds the challenge — recording the nonce invalidates the proof of that
  nonce. A chained scheme (each bank publishes the previous bank's nonce, verified one move late)
  would work, but saves 0.4% on the chips that matter. Not worth the complexity. See §6 Phase 3.
- *Normalising score by device class or self-reported hashrate.* Argon2id's memory-hardness already
  bounds the hardware spread (§3), and a self-reported rate is precisely the number a cheater lies
  about.

**Accepted trade-off:** because the chip preimage is author-bound but has no validity window, a
player can pre-grind nonces with a script and bank them later. The score is work, and that is work
genuinely performed, so this is accepted rather than defended against — it costs exactly as much CPU
either way. It does mean the client must be worth using for reasons other than being mandatory.

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
  own table post **that were authored by the table's owner**. Other tables are display input for the
  leaderboard, never balance input. This is what keeps every observer's fold byte-identical even when
  they host different subsets of tables.
- **Owner enforcement is mandatory, not incidental.** Anyone can reply to any post, so a fold that
  does not check `author_id` lets a stranger drive your state for the price of one reply: advancing
  your decay clock to floor your bowl, inflating your lifetime crunch to shove you into a
  faster-decaying dip tier, or spending your crumbs on a `buy`. Foreign replies are **skipped
  entirely** — before any clock advance or state mutation — and never appear in the move log.
  `ChipsHeader` therefore carries `owner` (the table post's `author_id`), because the fold cannot
  otherwise know whose table it is folding.
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

## 4. Client architecture — one core, two shells

The engine, PoW library and entire UI are **identical on both targets**. Only the host layer differs:
the browser relays through the gateway node (reef/chess pattern), the desktop talks to its own
sidecar node (Trench pattern). Nothing in the game rules depends on which.

```
chips-client/
  src/
    lib/chipsEngine.ts        # pure deterministic fold — no host access, no I/O
    lib/chipsPow.ts           # preimage construction + verify (hash-wasm argon2id)
    lib/crunch.worker.ts      # N parallel Argon2id grinders, off-thread
    lib/host.ts               # THE ONLY seam: submit(), read(), requestContent()
    ...UI
  src-tauri/                  # desktop shell only: node sidecar, node_manager.rs,
                              # rpc_handoff.rs (reuse Trench's wiring)
```

- `host.ts` is the seam and the only file with two implementations (gateway RPC vs. sidecar RPC).
  If anything else needs to know its target, the boundary has leaked.
- Grinders are Web Workers on both targets; `fryer` upgrades raise the worker count. Grinding never
  runs on the main thread (reef learned this the hard way — `reef-client/src/lib/pow.worker.ts`).
- Signing and PoW happen in-process on both; keys never leave the device. Submission is
  non-custodial either way.
- Browser build deploys via the established `deploy-web-clients` path with build-time env
  verification — a localhost RPC fallback must never ship to production.

### Platform asymmetry (accepted, and mitigated)

Desktop grinds 24/7, minimized, on every core. A browser tab is throttled in the background, stops
when closed, and on mobile will drain battery and be killed. Because lifetime crunch is literally
CPU-seconds, **a browser player cannot compete on total work** — not because their hardware is
worse, but because their runtime doesn't persist. This is platform discrimination arriving where
§3 eliminated hardware discrimination, and it is not solvable by normalisation (a self-reported
platform flag is trivially spoofed).

Mitigated with **two boards**, both folded from state that already exists:

| Board | Metric | Shape |
|---|---|---|
| **Total Crunch** | lifetime crunch (un-multiplied) | marathon — desktop grinders own it, honestly |
| **Crispest Chip** | highest `bits` ever banked | sprint — one good session can top it, reachable from a tab |

`crispest_chip` is a running max over verified banks: one integer in the fold, no new verification.

## 5. Testing

- `chipsEngine` unit tests on the reef pattern: move ordering with equal timestamps, decay across
  hour boundaries and long gaps, `SOG_MAX_HOURS` clamping, rejected-but-present banks (over-claimed
  bits, sub-minimum bits, duplicate nonce), unaffordable buys, bowl-cap overflow, golden-band
  payout, dip-tier quirk boundaries (exactly-12 h queso gap).
- A determinism test folding a fixed synthetic reply stream twice and asserting byte-identical state.
- A round-trip test: grind a low-difficulty chip, fold it, assert the credited crumbs.
- A **cost-curve coherence test** asserting every `bowl` tier is affordable under the preceding cap
  and that no upgrade is priced above the cap in force when it unlocks — the gating in §1 is load-
  bearing for pacing and silently breaks if a constant is edited in isolation.
- A **linearity test**: banking one 14-bit chip and banking 64 eight-bit chips credit the same base
  crumbs (before Seasoning), pinning the "reward tracks work" property against future retunes.

## 6. Build path

- **Phase 1a (this spec).** Shared engine + UI, `bank`/`buy`, decay, upgrades, dip ladder, both
  boards — shipped as the **browser client** at swimchain.io/chips. Web-first because it is the
  proven path, needs no shell to iterate, and anyone can play it the day it lands.
- **Phase 1b.** Wrap the same code in the Tauri shell as `ChipsAndDip.exe` with a node sidecar.
  Purely additive: the only new code is `host.ts`'s sidecar implementation plus the shell. Unlike
  The Trench — whose lantern mechanic *requires* a running node — nothing in these game rules needs
  one, so the desktop build is an upgrade path for people who want to grind hard, not a prerequisite.
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
