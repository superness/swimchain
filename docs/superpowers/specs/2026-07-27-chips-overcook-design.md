# Overcook — design

**Date:** 2026-07-27
**Status:** approved, not yet implemented
**Client:** `chips-client` (Dippin' Chips)

## The ask

> "replace the auto-gold-dipper with a new type of upgrade that lets you 'overcook' a
> fryer which takes from its points in the pot but increases the rate of crisping"

Refined in conversation to: the Sous Chef is **not** deleted — it moves deeper, to the
queso angel — and overcook takes its old slot at avo.

## What overcook is

A per-fryer toggle. Tap the flame on a fryer; while it is lit, that fryer's pot bleeds
every tick and its crackles come sooner. Tap again to stop. **One fryer at a time.**

Its job is to **manufacture a golden chip on demand** for the queso angel, who sells
Seasoning IV and accepts nothing but a golden. It is a tool for buying *time*. It is not
a way to make money, and the numbers cannot be tuned to make it one — see below.

## What was measured before designing it

Two Monte Carlo simulations over the real `cooking.ts` curve (`scripts/overcooksim.ts`,
`scripts/overcooksim2.ts`). Both are kept in the repo alongside `flowsim.ts`, because
they are what settled the design and will re-settle it if the constants move.

**Cycling regime** — dip at your target multiplier, start a fresh chip, repeat.
Crumbs/sec relative to never overcooking:

| strategy | dip at ×32 | ×16 | ×8 |
|---|---|---|---|
| never overcook | 100% | 100% | 100% |
| haste ⅓, **no drain** | **100.0%** | **100.1%** | **100.0%** |
| haste ⅓, drain 1%/tick | 51% | 69% | 83% |
| haste ⅓, drain 3%/tick | **24%** | 41% | 60% |

**Parking regime** — one chip, fixed session, overcook off once the target is banked,
dip at the end:

| session | never | 3%/tick, always | 3%/tick, to ×16 | no drain |
|---|---|---|---|---|
| 10 min | 100% | 104% | 115% | 162% |
| 30 min | 100% | 90% | 97% | 104% |
| 120 min | 100% | 97% | 99% | **100.0%** |

Three findings, all load-bearing:

1. **Pure haste is exactly EV-neutral.** 100.0% across every dip target — an empirical
   confirmation of `cooking.ts`'s own claim that the value rate is flat across
   dip-early and hold-for-golden.
2. **Any drain is severe in the cycling regime**, because it compounds across the whole
   climb: 3% per 2.5s tick leaves 24% of base at ×32.
3. **Parking dominates on long sessions**, and haste's edge decays to exactly zero.

The structural reason: value = `potRate × total_time × 2^k`. Haste shrinks `total_time`
in exact proportion to how much sooner the multiplier lands, and the multiplier is
**terminal** at ×32 — so speed has nothing to compound into. **No (drain, haste) pair
makes overcook profitable.** This is a property of the game's shape, not of the numbers.

## Therefore: it is deliberately EV-negative

This is a design decision, taken with the measurements above in hand, and the
implementation must say so where someone would otherwise "fix" it.

What makes it worth owning anyway: **a chip fed to a vendor forfeits its entire pot.**
`onFeed` calls `take(index)` and charges the jar's crumb cost through `onBuy`; the pot
is never paid out. So the moment you decide a chip is going to the angel, its pot stops
being money and becomes fuel — and burning it costs nothing you were not already losing.

The decision that makes it interesting:

- **Free** when you commit: you need a golden, you have none, you burn a fryer to get one.
- **Expensive** when you flinch: you overcook speculatively, then dip instead because the
  bowl filled or the angel was never armed. You paid full price for nothing.

**Known narrowness, accepted.** Under parking, every untouched fryer drifts to ×32 in
~15 minutes and stays there, so late game you always have a spare golden and never need
to make one. Overcook's window is the early-to-mid game: one or two fryers, the angel
newly met, nothing to spare. This is why it is priced as a cheap early jar rather than a
big-ticket upgrade, and why the later rung should sell *more fryers at once* rather than
a hotter burn.

## Shop placement

| critter | layer | sells |
|---|---|---|
| avo the unripe | 1 | `season2`, **`overcook`** |
| queso angel | 3 | `season4`, **`autodip`** |

Teaching order: make a golden on purpose (overcook) → meet who wants one (the angel,
who feeds only golden) → automate it away (Sous Chef).

`sells` is client policy (`crew.ts`); the fold checks only `UPGRADES`, `UPGRADE_CHAINS`
and cost. Moving the Sous Chef is free.

## Numbers

| constant | value | why |
|---|---|---|
| `OVERCOOK_HASTE` | `1/3` | crackle waits scale by this; a chip at ×8 reaches golden in ~4 min instead of ~12 |
| `OVERCOOK_DRAIN` | `0.03` per tick | visible bleed; ~5% of pot survives 4 minutes of burn |
| `overcook` cost | `120_000` | between Seasoning II (90k) and the old Sous Chef (300k); affordable ~25 min in, well before the angel at ~2.3h |
| Sous Chef cost | `300_000`, **unchanged** | it is a fold constant; changing it re-scores history |

`crackleHaste` already exists in `tickChip` for the detector upgrades, so overcook passes
`1/3` where the detector passes `0.75`. No new cooking machinery.

## Consensus vs policy

| change | kind | safe? |
|---|---|---|
| new `overcook` key in `UPGRADES` | fold | **yes** — an append. No reply has ever named this key, so no history re-folds. Same precedent as `cellar2`. |
| `sells` moves | client policy | yes |
| `OVERCOOK_HASTE` / `OVERCOOK_DRAIN` | client policy | yes — cooking is client-side; the chain accepts the declared `dip <amount>` |
| which fryer is lit | client-only, not persisted | yes |

**Nothing in the fold moves.** In particular `MAX_CRACKLES` and the ×32 ceiling are not
touched, and `autodip`'s cost is not touched.

## UI

- A flame control on each fryer, off by default.
- While lit: the fryer reads `OVERCOOKING`, showing the drain and the haste.
- Lighting a second fryer moves the flame; it never lights two.
- The caption must not resize the slot — see the `.basket-slot` width rule and the note
  above it. Any new caption obeys the same constraint.

## Testing

TDD throughout, and every load-bearing test must be **watched failing** against the
behaviour it names before the fix lands. This repo has shipped vacuous tests before.

1. **Haste alone is EV-neutral** — the sim harness, asserted rather than eyeballed.
   Fails if `tickChip`'s hazard curve stops being `TICK / (CRACKLE_BASE × 2^(k+1) × haste)`.
2. **Drain applies only to the lit fryer** — two chips, one lit; the other's pot is
   untouched tick for tick.
3. **One at a time** — lighting fryer B while A is lit leaves exactly one lit. Mutation:
   an implementation that keeps a `Set` of lit fryers fails this.
4. **The fold is unmoved** — folding a fixture with `overcook` bought yields the same
   crumbs as before for every *other* key, and an `overcook` buy on a table that cannot
   afford it still folds `rejected-cost`.
5. **flowsim targets do not move.** The default player never lights the flame, so all 14
   session targets must be byte-identical before and after. If they move, something
   reached into shared state.

## Rejected alternatives

- **Let overcook push past ×32** (×64, ×128 while lit). The only version that would
  matter late, since it is the one thing parking cannot hand you. Rejected by the
  operator: "leave it as it is." It would also lift the game's ceiling and force a
  re-grade of the bowl caps and every flowsim target.
- **Tune it to be EV-neutral.** Impossible while ×32 is terminal — measured, above.
- **Drop the drain (pure haste).** Provably neutral and strictly better to leave on
  forever, which makes the toggle a chore rather than a decision.
- **Delete `autodip`.** Would fold every past Sous Chef purchase as `rejected-parse` and
  re-score those tables. Never do this.

## Open

- The flame's exact art and placement on the basket.
- The later chained rung (`overcook2` — light two fryers at once). Deferred; when it
  lands it must be appended at a chain tail, and a rung must never gate shallower than
  its predecessor (`crew.test.ts` enforces this and has caught it once already).
