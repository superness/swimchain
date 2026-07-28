# The Descent — design sketch

**Status:** design only, nothing built. Operator ruled: bosses as the gate ("an
'ACT' like having to beat a 'boss' to progress"), player-paced ("it's up to the
player if they wanna keep going"), currency named **char**.

**The problem it solves.** A player who reaches the Abyssal Dip owns all 28 jars,
has met the last critter, and has read the deepest ticker line. The tunnel keeps
drawing bands forever — `tunnelDepth.ts` generates them at 2× lifetime each — but
they are seven throwaway chalk lines (`'the dip goes on'`, `'and on'`, `'and
on…'`) over a reused palette, and nothing lives in them. There is an endgame
*loop* (tip for salt) but no *ending*, and no reason to go deeper than the last
jar you could afford.

---

## 1. What already exists (the cheap part)

`lib/tunnelDepth.ts` is already built for this and says so:

> The tunnel NEVER ends. Below the last defined tier the bands continue forever
> — the fold's `dipIndex` stops at the Abyss, but the visual keeps digging: each
> synthetic band spans twice the lifetime of the one above it.

- `bandAt(ordinal)` returns `{ ordinal, key, label, beyond }` for **any** depth.
- `bandsAround(depth)` windows the DOM to ~9 bands however deep you go.
- Band 7+k spans `[1,000,000 · 2^k, 1,000,000 · 2^(k+1))`.

So the descent's *scroll, thresholds and rendering budget are done*. What is
missing is: names, palettes, residents, and a reason.

**`dipIndex` must not move.** It is fold state and it stops at 7. Depth below the
Abyss is display-derived from `lifetimeChips` today and should stay that way —
see §6.

---

## 2. The strata

Layers 8+ get real names, palettes and residents. The operator's list, filled in:

| # | band | what it is |
|---|---|---|
| 8 | **the porcelain** | the bowl you have been eating out of, from below |
| 9 | **the table** | sticky varnish, a ring from a glass, someone's initials |
| 10 | **the floor** | tile and grout, and a chip that has been down there since 1974 |
| 11 | **the dirt** | roots, cold, and things that live in it |
| 12 | **the lava** | the fryer that was always underneath the whole shop |
| 13 | **???** | deliberately unnamed — see §7 |

`BEYOND_LINES` (the seven throwaway labels) is replaced by this table, and the
generic continuation lines move *below* it for anyone who digs past 13.

---

## 3. The boss is an ACT, not a threshold

Reaching a band's lifetime does not break it. Something has to be *done*, and it
must be done with **verbs the game already has** — dip, hold, overcook, feed,
whistle, lobby, gamble, shoo, bless. No combat system, no new input model.

Each boss is a **timed condition that tests the mechanic its layer is about**,
and each is losable and retryable. The rule that keeps them honest: a boss should
be beatable by a player who *understands* the game, not one who has merely idled
in it longer.

| band | the boss | how you beat it | what it tests |
|---|---|---|---|
| 8 | **the porcelain** | land ONE dip worth more than everything else you have banked this run | holding to the ceiling instead of cashing early |
| 9 | **the table** | hold all four fryers at ×32 or better *simultaneously* | parallel management, the thing four fryers were always for |
| 10 | **the chip from 1974** | it has been cooking for fifty years and has a number on it. Beat its worth in a single dip, inside a window | the long fry, and nerve |
| 11 | **the rat's family** | every fryer latched at once; shoo them all inside a window while still banking | the shoo verb, under pressure |
| 12 | **the first fryer** | everything overcooks whether you want it to or not — the pot drains constantly and you must still land a ×64 | overcook mastery |
| 13 | ??? | — | — |

**Layer 12 is the keystone.** Overcook is deliberately EV-negative and the code
says so in three places; its boss is a forced-overcook fight, and its reward
(§5) is the ability that finally makes it pay. A mechanic the game currently
tells you not to use becomes the thing you beat a boss with and then keep.

---

## 4. Char — earned on DEPTH, not lifetime

Salt is `sqrt(lifetimeChips / TIP_FLOOR) × 10` — it rewards **how much you made**.
Char rewards **how far you got**. Two different axes, so a rich shallow run and a
poor deep one pay different currencies and neither is strictly better.

- **A lump per boss**, fixed, the first time each is beaten.
- **A trickle per band descended** below the porcelain, so digging between
  bosses is not dead time.
- Char survives a tip, like salt. That is the entire point.

Open number: whether char is also re-earnable on later runs (diminishing), or
strictly once per boss. Once-per-boss is cleaner and makes the descent a
*campaign* rather than a farm; it also means char cannot inflate.

---

## 5. What char buys — verbs, not percentages

Salt already owns "+N% every tick". Char must not be a second multiplier or the
two collapse into one stat. **Char buys rule changes**, and each is thematically
the layer it came from:

| ability | from | what it does |
|---|---|---|
| **the crack** | porcelain | a tip keeps ONE jar of your choosing |
| **the grain** | table | a second chip cooks in each fryer |
| **the tile** | floor | crumbs stop going soft entirely (sog immunity) |
| **the burrow** | dirt | the rat works FOR you — his hoard pays out instead of siphoning |
| **the magma** | lava | **overcook feeds the multiplier instead of draining the pot** |

Bought in any order, so char is a real choice rather than a track. Sold by a new
deep vendor (§7), not by the first chip — the first chip is the end of the
*shallow* game and should stay that.

**`the magma` is the design's centre of gravity** and everything else is
calibrated against it. It should be built and simulated first (`scripts/` has the
harness — `overcooksim.ts` and `longfrysim.ts` already measure exactly this),
because if overcook-that-pays breaks the curve, the whole ability set needs
re-pricing.

---

## 6. Where this touches the fold — the thing to get right first

[[project_fold_rules_are_permanent]] applies. Splitting it up front:

**Consensus (fold) — must be decided once and never moved:**
- Whether char is fold state or client-derived. It cannot be client-derived if
  a boss can be *lost*, because "did you beat it" is not a function of
  `lifetimeChips` — it is an event. **This wants a new reply verb** (`broke
  <band>`), the way `tip` is one.
- Boss defeat must be *verifiable from the chain*, or it is a claim. The dip
  verb is already self-declared (`dip <amount>`) on the Cookie-Clicker-honest
  precedent, so `broke <band>` fits the same rule — but say so on purpose.

**Policy (client) — free to retune forever:**
- Band names, palettes, residents, all boss conditions and windows.
- Ability effects. Every one of the five above is client-side: the fold records
  that char was spent, the client does the rest — exactly how `overcook`,
  `wingcall` and `longfry` already work.

That split means the *only* irreversible decision is the shape of `broke`. Get
that right and everything else stays tunable.

---

## 7. Open, deliberately

1. **Layer 13.** Left blank on purpose — it should be the operator's, and it is
   the payoff for the whole descent. The shallow game's last character says "i
   waited through seven dips to find a friend"; whatever is under the lava
   should answer that.
2. **The deep vendor.** Who sells char abilities? A new critter met at the
   porcelain, or something that has been following you down.
3. **Char re-earnable or once-only** (§4).
4. **Does a boss interrupt play, or run in the background?** A modal fight stops
   the idle game dead; a background condition ("all four at ×32 right now") lets
   the game keep running and rewards noticing. Leaning background, consistent
   with how the wing, the oracle and the committee already work.

---

## 8. Build order, if approved

1. `broke <band>` fold verb + char accrual — the only permanent decision.
2. Bands 8–12: names, palettes, `BEYOND_LINES` replacement. Cheap, visible, ships alone.
3. `the magma`, simulated against `overcooksim`/`longfrysim` before anything is priced.
4. Bosses one at a time, cheapest first (the porcelain is a single comparison).
5. Remaining abilities, priced against whatever the magma sim says.

Steps 1 and 2 are independently shippable and worth doing even if the rest waits.
