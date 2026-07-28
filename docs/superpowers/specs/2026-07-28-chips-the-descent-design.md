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
| 13 | **the other side** | you come up through the bottom of another bowl — see §7 |

`BEYOND_LINES` (the seven throwaway labels) is replaced by this table, and the
generic continuation lines move *below* it for anyone who digs past 13.

---

## 3. The boss is an ACT, not a threshold — and it TAKES THE SCREEN

Reaching a band's lifetime does not break it. Something has to be *done*, and it
must be done with **verbs the game already has** — dip, hold, overcook, feed,
whistle, lobby, gamble, shoo, bless. No combat system, no new input model.

**MODAL, operator's ruling** (over my recommendation of a background condition).
It is the right call twice over.

First, a set-piece can be *drawn*: "the bowl cracking above you" and "four table
legs splintering one at a time" are images, where a background condition is only
ever a sentence in a toast.

Second — and this is where my recommendation was simply built on a false premise
— **THIS IS NOT AN IDLE GAME.** It is Cookie-Clicker-inspired and actively
played: `cooking.ts` calls itself "DESIGNER-PACED, COOKIE-CLICKER HONEST" and
`chipsConst.ts` states flatly that this is "a game with no offline progress". The
player is at the screen by definition. I argued against modal on the grounds that
it "stops an idle game dead"; there is no idle game to stop. Presence is
guaranteed rather than hoped for, which also means the bosses can be genuinely
demanding.

Two rules, then — not to protect an absent player, but because the fight should
be the real game rather than a minigame:

1. **THE POT KEEPS TICKING BEHIND IT.** The fight is your actual rack under a
   spotlight, with your actual pots and your actual multipliers. Nothing pauses.
   Losing costs real time; winning is the game you already know how to play.
2. **You choose when it starts.** Not because someone might be away — they are
   not — but because entering a hard fight with cold pots and a spent blessing
   is a worse decision than the game should force on you. The boss waits at the
   band until you take it, so the setup is part of the fight.

Each is losable and retryable. The rule that keeps them honest: a boss should be
beatable by a player who *understands* the game, not one who has merely idled in
it longer.

| band | the boss | how you beat it | what the takeover shows |
|---|---|---|---|
| 8 | **the porcelain** | land ONE dip worth more than everything else you have banked this run | the bowl from beneath, filling the screen. Every dip puts a hairline in it. The last one goes through. |
| 9 | **the table** | hold all four fryers at ×32 or better | four legs above you. Each fryer that reaches ×32 splinters one; drop below and it grows back. |
| 10 | **the chip from 1974** | beat its worth in a single dip, inside a window | it and your best fryer side by side, its number sitting there the whole time |
| 11 | **the rat's family** | shoo them all inside a window while still banking | they come in from the edges of the screen and keep coming |
| 12 | **the first fryer** | everything overcooks whether you want it to or not — the pot drains constantly and you must still land a ×64 | the whole view lit red, every pot visibly bleeding |
| 13 | **the other side** | there is no fight — see §7 | — |

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

**ONCE PER BOSS, operator's ruling.** Not re-earnable. The descent is a campaign,
not a farm: char cannot inflate, ability pricing stays stable forever, and the
five abilities are a finite set you eventually own outright. It also gives the
deep game a real END to its power curve, which is what stops it swallowing the
shallow one.

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

Bought in any order, so char is a real choice rather than a track.

### The vendor is SCOOP (operator: "something that followed you down")

The small dog. Layer 0. The **first character in the game** — and the writing set
this up long before anybody planned a descent:

> small dog seen guarding empty stool for **eleven months**; declines to explain;
> calls it "a business meeting."

> scoop announces retirement from begging, **effective after one more chip**.
> sources confirm this is the ninth retirement.

> i've done the math. you can't eat all of them. **i've done the math twice.**

He was never begging. He was waiting for somebody to dig. He has been asking for
one more chip since the first minute of the game, and at the bottom you find out
what for.

**How he plays:** he appears at the porcelain, sits a little further down each
band, and **says nothing** — no lines, no price tags — until the lava. Everything
before that is simply him being there, which is worse. His art already exists
(`CritterArt id="scoop"`), so the cost is copy and one placement rule.

The descent's character arc is therefore the shallow game's oldest running joke,
paid off. Nothing had to be invented for it.

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

## 7. Layer 13 — THE OTHER SIDE (operator's ruling)

You dig through the lava and come **up** through the bottom of another bowl, on
another table. The tunnel is a circle.

### The game already wrote this

Nothing here is invented. The fourth beat of the porcelain reveal — shipped,
`Bowl.tsx`, seen by every player at Queso — is:

> you were never digging down. you were emptying a bowl. **someone set it out
> for you.**

That is a question the game has been asking since layer 3 and has never
answered. And stamped on the underside, readable only from below:

> `DISHWASHER SAFE. MICROWAVE SAFE. NOT SAFE.`

"NOT SAFE" is a throwaway joke on first read. It is a warning on the second.

So layer 13 is not new lore, it is the **payoff of existing lore**, and the
whole descent becomes the act of finding out who set the bowl out. The answer
is: the last person who dug out of it.

### The inversion

The reveal's beats run again as you surface, turned around. Where the first
read ended *"someone set it out for you"*, this one ends:

> you are not coming up. you are being poured. **somebody is going to find
> this.**

The player who was the digger becomes the thing at the bottom of the next
bowl. That is the entire emotional shape of the feature and it costs four
lines of copy.

### Whose bowl?

**A real one.** `list_space_posts` already enumerates every table on the chain
(the boards use it), so the bowl you surface through can carry an actual
player's name chalked on the table above. Read-only, no new consensus, no
interaction — you never touch their run and they never know. You simply learn
you were never the only one down here.

That turns the loop social for the price of a read the client already makes.
If the space is empty of other tables it falls back to an unnamed table, which
is its own kind of sad and perfectly in voice.

### What breaking it does

It is **THE DEEP TIP**: you reset like a tip, but you keep salt AND char, and a
**bowl count** goes up — "you have come up through N bowls". The count is the
one number that only the descent can move, and it is what the deep leaderboard
should rank on.

Everything the shallow game does on a tip still happens (one fryer, no jars),
so this needs no new reset machinery — only a new reason to want one.

### What changes on the second bowl

Cheap, escalating, all copy and palette:
- the crew greet you differently once you have come up through one
- the strata labels shift ("the porcelain (again)" → and by the third, they
  stop numbering it)
- the maker's mark on each new bowl is subtly wrong, and gets worse

---

## 8. The bowl count: no ceiling, and a nod (operator's ruling)

The count never stops. What stops is the ceremony.

The descent's payoff is narrative, and a revelation does not repeat. Salt and char
are numbers and numbers repeat fine, but "you were never digging down" lands
exactly once. So:

| bowl | what the game does |
|---|---|
| 1st | the full inversion — every beat, the maker's mark, all of it |
| 2nd | one short beat. "it happened again" is a different feeling from both "it happened" and "it happens", and it is the last time the game will say anything |
| 3rd+ | **a nod.** You surface. The count goes up. No ceremony, no copy. |

The nod is the whole design: **they know they did it.** A game that keeps
congratulating you for a thing you now do routinely is a game that has stopped
believing you. The horror became your commute, and saying nothing about that says
more than any amount of copy would.

Mechanically it is a restart they *choose*: char and salt both survive, so
everything permanent they have earned comes with them and the numbers only ever
go up. The count itself is the one thing the deep leaderboard ranks on, which is
a second argument against a ceiling — it has to still mean something at ten.

Concretely, the nod is the count sitting in the hood beside old salt, without
comment. That is the entire third-bowl-onward presentation.

---

## 9. ENLIGHTENMENT — the comedy the loop unlocks

Operator: *"otherwise they are now 'enlightened' :D for more jokes / 'you were
always in the matrix neo' etc."*

Coming up through someone else's bowl is not just a counter. It is a **state**,
and it is the funniest thing the descent gives us, because the shallow game's
entire cast can now be re-written for an audience that KNOWS.

`enlightened` is one boolean derived from `bowls > 0`. It swaps line pools. That
is the whole implementation — `pickLine` already picks from a per-critter pool
(`crew.ts`), so this is content, not machinery.

### The rule that makes it funny

**Nobody agrees about what you saw.** Some of them knew. Some refuse to know.
Some knew and are annoyed you found out. None of them will have a straight
conversation about it, because none of them ever has about anything.

### The cast, enlightened

- **scoop** — knew the whole time, and it costs him nothing to say so:
  *"you took your time."* / *"i said one more chip. i meant one more chip."*
- **the first chip** — the shallow game's last line was *"i said nothing because
  you had not arrived yet."* Its enlightened version inverts exactly:
  *"you came back. i said nothing because you had not left yet."*
- **the weeping onion** — denial, load-bearing:
  *"i'm fine. it's the caramelization. it was never the caramelization."*
- **cheese rat** — unbothered:
  *"so you've seen outside. i live here. legally you still can't prove that."*
- **queso angel** — you have joined the wrong side of a verb:
  *"you have been witnessed. you have also been witnessing. it does not suit
  you, child."*
- **the committee** — procedure absorbs everything:
  *"a motion has been raised that the bowl does not exist. the motion is out of
  order. the motion carries."*
- **the hermit** — betrayed:
  *"OH SO NOW you know about the celery. NOW. WHO SENT YOU."*
- **the wing** — finally, an actual epistemology:
  *"there was never a bird. THERE WAS NEVER A BOWL EITHER. one of those is a
  lie and i will not be told which."*
- **the fondue oracle** — smug, and entitled to be:
  *"i told you. i told you and you dipped anyway. the strings do not lie. they
  just don't explain."*

### The ticker, enlightened

- *there is no long spoon.* — the game already sells a jar called **The Long
  Spoon** (`detector3`), so the joke is a film allusion and an inventory
  reference at once, and costs one line.
- *local man reports table has underside. table declines to confirm.*
- *management denies bowl. management is a bowl.*
- *four experts who translated the underside inscription have been reassigned.*
- *shop confirms it was built around the dip. shop cannot say who built the shop.*

### Why this is the cheapest content in the feature

Every one of these is a string in an array. `crew.ts` already keys its ticker by
layer and its critter lines by id; enlightenment is one more axis on data that is
already shaped for it. **It also doubles the value of a second playthrough for
the price of writing**, which is exactly what the operator asked the descent to
do — the jokes are the reason to go round again, not the multipliers.

---

## 10. Still open

1. **What scoop finally says at the lava.** The single most important line in the
   feature, and it should not be written in a hurry.
2. **Boss retry cost.** Free retries make a modal a slot machine; a cost makes it
   a decision. Leaning free, but the boss does not re-offer until you have dug a
   little further — so the cost is time rather than a resource.

---

## 11. Build order, if approved

1. `broke <band>` fold verb + char accrual — the only permanent decision. The
   deep tip (§7) is the same verb at band 13, so design it to carry a band
   number from the start rather than bolting one on.
1b. The `enlightened` line pools (§9). Pure content, no machinery, shippable the
   day `bowls > 0` exists — and the highest laughs-per-hour in the whole plan.
2. Bands 8–12: names, palettes, `BEYOND_LINES` replacement. Cheap, visible, ships alone.
3. `the magma`, simulated against `overcooksim`/`longfrysim` before anything is priced.
4. Bosses one at a time, cheapest first (the porcelain is a single comparison).
5. Remaining abilities, priced against whatever the magma sim says.

Steps 1 and 2 are independently shippable and worth doing even if the rest waits.
