# The Shoal — Design

*Spec. Written 2026-07-27. Status: design agreed, not yet built.*

A lightweight MMO in which fifteen to twenty-five real players share one body of water,
see each other move and speak, and survive by staying near one another. It runs on the
players' own machines. Nothing of ours needs to be running for two strangers to swim
together.

---

## 1. What is being proven

**A skeptic must be able to say: those are many real people in one shared world, visibly
together, and no server is involved.**

The falsifiable demonstration, in one sentence: *two laptops on a LAN with the internet
unplugged, one player vouches the other in, blooms appear, and a shark takes the lonely
one.* If that runs, the claim holds.

One residual dependency is named honestly rather than hidden: **peer discovery.** On a LAN,
mDNS finds peers with nothing deployed. On the open internet a bootstrap seed is needed to
find a first peer — a network-layer fact of every P2P system, not a game server.

### 1.1 This is a game, not a showcase

**Binding rule (operator directive).** No mechanic exists to demonstrate the substrate, and
no player-facing copy ever refers to nodes, chains, spaces, posts, replies, or Swimchain.
Sea language only. An earlier draft rendered real network spaces as landmarks; it was cut
precisely because it was a technical showcase wearing a game costume.

This document is an engineering spec and necessarily describes the plumbing. The diegetic
rule governs the product, not this file.

---

## 2. The game

### 2.1 The fantasy

You are a small fish in a big dark sea. You are not strong. The only thing keeping you
alive is the other fish, and they are all real people.

### 2.2 The engine

> **Food grows in the open, safety is in the crowd, and they are never in the same place.**

Every other rule exists to keep that sentence true.

### 2.3 The loop (60–90 s)

1. A bloom lights up in open water, away from the crowd.
2. Players peel off in ones and twos. You watch the school thin around you.
3. Tension rises. The water goes quiet — the hush.
4. The sweep takes whoever is genuinely exposed. Not the slowest, not the unluckiest: the
   loneliest.
5. Survivors bunch tight, breathe, and the next bloom lights.

### 2.4 Verbs

**Steer** — hold a heading and glide with weight. **Dart** — a short burst on a ~10–12 s
cooldown. **Eat.** **Speak** — a brief bubble over your head.

**Dart is the real currency of the game.** It is simultaneously how you reach a bloom before
anyone else and how you save your life, and its cooldown is tuned so that trade-off is live
every single loop. Its cooldown is displayed as prominently as size — it is the second
scoreboard.

**Speech never costs you your life.** A single message carries both your heading vector and
your word, so talking is never the reason you were caught. Silencing players at the tense
moment would kill the only thing that brings anyone back.

### 2.5 The world authors itself

Nothing is on a timer. Both the reward and the threat are functions of where everyone has
been, so there is no hidden schedule to leak and no authored content to exhaust.

- **Food grows where the school isn't.** Nothing blooms under a pile of hiding fish. The
  bloom map is a picture of where nobody has been; the sea refills exactly the places you
  were too scared to go.
- **The predator is summoned by greed.** Tension rises as the school spreads chasing food
  and falls when it bunches. Cross the threshold and something comes. The danger is authored
  live by strangers being greedy at the same time.

Blooms are **rivalrous** — a bloom feeds a bounded number of bites before it is gone. If one
bloom could feed the whole school, the optimal play would be a single tight blob walking the
map together, tension would never rise, and the core tension would quietly stop existing.

**The moral is legible without a word of text: the shark is something the school does to
itself.**

### 2.6 Wild fish

The sea is full of fish that are not people. They shoal, they feed, they scatter, and they
count toward shielding and toward tension.

They exist because **an ocean containing only twenty players and nothing else is a barren
ocean** — this is world-building, correct at any population, and explicitly *not* a patch for
a small player base. Designing around our current size rather than the game at scale is the
wrong trade (operator ruling).

**Wild fish never speak.** Speech is the honest tell: anyone who says a word is a person. The
game never claims otherwise and never needs to.

**They bolt at the hush — and that is the point.** When the water goes quiet the wild shoal
scatters and vanishes, and the crowd you are left standing in is made only of people. Cover
that felt solid a second ago evaporates exactly when it matters, so wild fish make the sea
alive without ever becoming a substitute for the players around you. The thesis survives
intact: *your safety is other people.*

The engineering cost is real and is stated in §3.8.

### 2.7 Hunger

**Size decays slowly while you are in the water and not eating.** This is the load-bearing
rule and it was missing from the first draft, which two independent reviewers each
identified as fatal.

Without it, size only ever falls through being scattered, and scattering only happens to
those who leave the crowd — so any player with size is strictly better off never eating
again. The equilibrium is a permanent immobile ball of large veterans while newcomers do all
the foraging and stay small. Worse, quitting-while-ahead becomes the dominant strategy: a
system that rewards logging off.

Hunger makes the ball leak continuously and turns the bloom into relief rather than
temptation. It is *hunger, not rot*: **decay ticks only while present.** Time away costs
nothing, ever. You return the size you left.

### 2.8 Size

Eating grows you. Size is worn on the body and is the scoreboard.

- **Size shields.** A larger fish counts for more when the sweep looks for who is exposed,
  so veterans have a job: be a wall for the small ones. Status at the top of this game is
  pro-social, not predatory.
- **Size senses.** A larger fish feels the hush a beat earlier and can call it. Size must
  confer a real power or sandbagging wins — staying small, tucked, and never eating.
- **Size is the tastiest thing alone.** The sweep prefers the largest exposed fish.
- **Scatter costs a fixed bite of size, not a percentage.** Big fish therefore risk
  proportionally less and are pulled out of the ball rather than parked in it.

There is deliberately **no turn-drag**. At a five-second action cadence, weight-by-clumsiness
does not read as *mighty and ponderous*; it reads as *the controls got worse as I got
better*. Preferential targeting is the same brake applied legibly instead of as friction.

### 2.9 Failure

You are never killed. You are **scattered** — knocked smaller, dazed and drifting a few
seconds while everyone else eats. Costly enough to sting, gentle enough that nobody quits.

### 2.10 Exposure and the tether

The decision must be made *before* the hush, or the panic moment is a coin flip dressed as a
choice. So **exposure is permanently visible on your own body**: a tether to your nearest
neighbours, short and taut and warm when tucked in, long and thin and cold as you drift.

The sweep therefore never asks *guess*. It asks: **you already knew you were exposed — was
one more bite worth it?** That converts a reaction test into a commitment test, the only kind
that works at this cadence.

One tether object collapses four legibility problems: what danger is (the tether thinning),
what the telegraph is (it goes red as the water hushes), what shielding is (big fish anchor
several tethers), and why you were scattered (yours was the longest).

**On scatter, the moment freezes for two seconds** — desaturated, every fish's tether drawn
at once, yours the long one. Non-verbal, geometric, unarguable. *"You were furthest from your
neighbours"* is an abstract cause of death, and unexplained punishment in the first two
minutes is the most reliable quit trigger there is.

The tether **fades with accumulated playtime** and the hush carries it from then on.
Legibility beats mystique in the first ten minutes; mystique wins afterwards. Since every
client can compute exposure exactly, hiding it permanently would only mean someone builds an
overlay and beats the players who didn't.

### 2.11 The sweep, precisely

The whole game's verdict is delivered here, so it is specified tightly.

**Absolute threshold, not maximum.** The sweep takes every fish whose exposure exceeds a
fixed threshold — which may be **nobody** if the school is tight, or **three** if it is
loose. It does not always take exactly one.

This is the anti-griefing rule. Under a take-the-maximum rule, nineteen players who drift
away from one person make that person permanently the loneliest with no counterplay
available — and in a persistent twenty-person world with the same faces every night, that
will happen to the new, the awkward, and the annoying. Under an absolute threshold, a victim
saves themselves by hugging *anyone*, and two outcasts form a mutual-aid society, which is a
better story than either had.

**Exposure is a neighbour count, not a nearest-neighbour distance:** the size-weighted count
of neighbours within a radius, floored at three. Under any nearest-neighbour formulation, a
*pair* is nearly as safe as a school and gets all the food, so the game's real texture
becomes buddy-pairing whether designed for or not. The floor of three prices that
deliberately: a trio is the minimum viable foraging party. A pair is a marriage; a trio has
politics.

**Tension uses a robust statistic** — the fraction of players outside the core, anchored on
the median — and **any single player's contribution is capped.** Under a mean-based measure,
one player swimming far out spikes tension and darts back to safety while a rival is caught
in the open: a personal *call the shark on my enemy* button.

**The largest contributor to tension becomes a preferred target.** Greed calls the shark, and
the shark knows your name.

### 2.12 The hush window

```
T+0    Hush begins. Your action timer is REFUNDED.
T+0..4 Commit window. Your position still counts. You have at least one action.
T+4    INPUT LOCK. Nothing after this counts. Four seconds of network slack.
T+4..8 Dread. You cannot act. You watch it come, knowing what you chose.
T+8    Resolution, against locked inputs only.
```

Two hard rules, each fixing a specific defect:

1. **One action must always suffice to survive a telegraph.** Without the refund at T+0, a
   hush arriving one second after you spend an action leaves you scattered by the clock
   rather than by a decision — constantly, to everyone, indistinguishable from randomness.
2. **Resolution binds only on inputs timestamped at or before the lock**, on quantized
   positions, with an integer exposure count and a deterministic tiebreak. Without the lock,
   two clients holding different input sets compute different answers whenever the top two
   are close — and in a bunched school they are *always* close. "The shark ate the wrong
   fish" is the most trust-destroying bug this game can have, and it is a correctness
   problem, not a tuning problem.

### 2.13 Terrain

The sea has a handful of named places — a kelp stand, a wreck, a drop-off, a shelf. This is
the cheapest fix on the list and it repairs the most: it gives blooms legible places to
appear, gives the sweep lanes to come down, gives speech something worth saying (*"kelp!"* is
a complete rally call in one word), gives griefing victims somewhere to run, and gives the
space memory so returning feels like returning *somewhere*.

Without it the minute between sweeps is "hold a heading", which is waiting. With it, that
minute is *be near people, at the good spot, before the others get there.*

Terrain is hand-authored and purely a game object. It is never derived from, and never
refers to, anything on the network.

### 2.14 Tides

**The water is high at fixed hours.** Outside high tide the shoal is thin.

Tides do not violate the no-attendance principle: they govern *when*, not *how much*, and
missing one costs nothing at all. They give a reason to return that is an appointment rather
than a manipulation — no streak, no login bonus, no decay-while-away.

### 2.15 Shoals split and merge

One body of water holds a good school of fifteen to twenty-five. Past that the water thickens
and a second shoal opens nearby; you feel crowding and swim to the quieter one. Shoals also
**merge downward**: two thin waters become one healthy one.

Shoal-hopping is lossless — you keep your size — and is therefore also the anti-griefing
escape hatch. It is **always available**, never gated on population.

### 2.16 Newcomers

Anyone may install and swim in **the shallows** immediately: a smaller body of water with the
real mechanics, no vouch required. This is the tutorial, and it costs no text.

Entry to the open ocean requires being **vouched in** by an established player. Unvouched
newcomers appear as small fish circling at the edge of the real water, visible to everyone,
and letting one in is an in-game act — never a link, a code, or an out-of-band chore.

**Vouchees are kin.** They shield you harder than strangers do, they render with a visible
bond, and your marks accrue from their survival. Without a *private* return, recruiting is a
public good that everyone free-rides on and nobody does.

Never let a downloader dead-end. A player who cannot reach the shoal sees a place, not an
error.

### 2.17 Identity and marks

Names are persistent and visible. You can see whether your voucher is in the water.

Long-term identity comes from **marks earned in moments, never hours**: held the edge through
a sweep and wasn't taken; brought in five newcomers. A player should earn their first mark
inside the first hour or two — evidence the world noticed them. Rare marks are for month
three.

### 2.18 The teaching moment

One lesson makes the game click: **the predator is not the danger — distance is the danger.**

It is taught without text. A newcomer spawns slightly *outside* the school, tether already
stretched, with a sweep inbound. The other fish begin converging. Following a visibly moving
crowd is one of the most reliable unprompted behaviours in games. They move in, the tether
goes short and warm, the sweep passes, and someone further out is scattered in front of them.

If they don't follow, they are scattered — which is fine, because scatter is cheap, and the
frozen replay delivers the same lesson geometrically.

---

## 3. Architecture

### 3.1 Shell

A Tauri desktop app with the `sw` node bundled as a sidecar resource, following
`trench-client/`'s pattern exactly (`ui/` Vite + React, `src-tauri/` Tauri 2). Launching the
game starts the player's node. **The player's node is the only infrastructure the game has.**

### 3.2 Two state layers, deliberately unequal

| | Presence | Durable |
|---|---|---|
| carries | heading vector, facing, speech, emote | eat-claims, marks, vouches, name |
| fold | last-write-wins per swimmer, TTL ~90 s | full append-only fold |
| history | worthless by design; decay sweeps it | permanent |
| reorg | irrelevant — already stale | confirmed / tentative frontier |

Folding presence as last-write-wins is what keeps this lightweight: a shoal of twenty folds
to twenty rows no matter how long the session has run. The thousands of dead vectors behind
it are exactly what content decay exists for.

### 3.3 Motion

A player never writes a step. They write a **swim vector** — `{x, y, heading, speed, t}` —
meaning *from here, at this instant, I am heading that way*. Every other client dead-reckons
forward from that one message and renders a smooth glide. A new vector is emitted only on a
change of mind: turn, stop, arrive, dart.

Continuous-looking motion at roughly one write every 3–8 seconds. This is ordinary netcode
dead reckoning, and positioning-as-the-verb is the shape this medium can carry.

### 3.4 Live channel

Each client subscribes over WebSocket to **its own** node for `content_new`
(`src/rpc/events.rs:47`) and paints on arrival. Latency is gossip propagation — seconds.
Blocks are not in the interactive loop; they only harden the past.

### 3.5 A shoal is a space

Each body of water is one app-addressed space (`@shoal:main`, plus named waters). Sharding is
therefore free, and a crowded shoal never slows a quiet one.

### 3.6 Verified platform constraints

| Fact | Source | Consequence |
|---|---|---|
| Action PoW ≈ 8–10 bits Argon2id | `chips-client/src/lib/host.ts:103` | ~1 write per 3–8 s per player |
| `MAX_ACTIONS_PER_SPACE = 2_000`, lowest-PoW eviction | `src/blocks/builder.rs:92` | ≈3.3 writes/s/shoal → 15–25 fish |
| Block interval 600 s | `src/blocks/leader.rs:16` | Blocks harden; they never gate play |
| RPC write cap 120/min, env-overridable | `src/rpc/rate_limiter.rs:70` | Localhost backstop we own |
| `MAX_OFFER_SPONSEES = 10` | `src/sponsorship/offer_validation.rs:35` | Ten vouches per player |
| `MAX_REPLIES_PER_SPACE_PER_HOUR` **not implemented** | absent from `src/`; spec-only at `specs/SPEC_11_SPONSORSHIP_ACCESS.md:332` | No protocol throttle. Had it existed, this design would be dead |

**Eviction is a feature.** Past capacity the mempool sheds its lowest-PoW actions first, so
the client mines speech slightly harder than movement: when a place gets packed, footsteps
stutter before anyone's words are lost. Client policy, not a fold rule.

### 3.7 Scoring, and its honest bound

Size folds from **durable eat-claims** — `I ate at (x, y) at t`. A claim credits only if the
deterministic bloom map had food there and the author was not above the exposure threshold at
the covering sweep. **Being scattered therefore costs zero writes**: the world simply stops
crediting a fish that was out alone, and the food it just took is voided.

Bloom placement and tension read a **bounded window** of recent presence (well within the
90 s TTL), so a client joining mid-session reconstructs both from data that is still live.

**Accepted limitation.** Once presence has decayed, a very late verifier cannot independently
re-derive an old window; surviving eat-claims are simply credited. This follows the operator's
standing ruling on Chips & Dip — *we can be as secure and authentic as Cookie Clicker is; it
is a game* — and is recorded here so nobody later mistakes it for an oversight.

### 3.8 Simulating wild fish without an authority

Wild fish affect exposure and tension, so every client must simulate them **identically** or
the sweep resolves differently on different screens.

They are stepped deterministically on the same quantized tick and the same settled snapshot
the sweep resolves against — never on live presence, which differs between clients. Their
seed derives from confirmed chain state. Their inputs are only their own prior state plus
locked player vectors, so the simulation is a pure function every client can run.

This is the single largest piece of engineering in the design and it is not optional: a
host-peer arrangement would reintroduce an authority and forfeit the claim in §1.

---

## 4. Consensus vs. policy

Per `project_fold_rules_are_permanent`: fold constants re-score all history and split
clients, so the consensus surface is kept deliberately small and decided **now**.

| **Consensus — permanent** | **Policy — free to change forever** |
|---|---|
| Exposure formula (size-weighted neighbour count, radius, floor of 3) | Tension threshold values, bloom rate, dart cooldown |
| Absolute sweep threshold and target selection | All art, sound, camera, tether rendering |
| Hush timing: refund at T+0, input lock at T+4, resolve at T+8 | PoW priority for speech over movement |
| Position quantization and deterministic tiebreak | Dead-reckoning smoothing and interpolation |
| Vector and eat-claim wire format | Crowding warnings, shoal-split UX |
| Presence TTL and last-write-wins rule | Tide hours, terrain layout, marks and their names |
| Wild-fish simulation rules, seed and tick | Wild-fish appearance, variety, ambient behaviour |
| Hunger rate; size credited per bite; fixed scatter cost | Tutorial, tether fade curve, replay presentation |

Nothing in the left column may be tuned after launch. Everything that could plausibly live on
the right has been put there.

---

## 5. Out of scope

Cut deliberately, each addable later without re-scoring anything: any economy, trading, or
currency; combat or targeting; levels and skill trees; chain-derived terrain; a costly-signal
*call* verb for veterans (strong candidate for v2).

**Not cut:** wild fish are in (§2.6) — as permanent ecosystem, never as a population patch.
Designing around our current size rather than the game at scale is the wrong trade (operator
ruling).

---

## 6. Verification

1. **Determinism.** A recorded session replays byte-identically on a fresh client. Divergence
   at any sweep is a release blocker.
2. **Sweep agreement under latency.** Simulated uneven latency across N clients; all must
   agree on the caught set at every sweep. This is the correctness test the input lock exists
   to pass.
3. **Hush survivability.** Property test: for every possible action-timer phase at hush onset,
   one action suffices to reach shielding.
4. **The ball.** Simulate hunger off and hunger on; confirm that hunger-off produces the
   turtled equilibrium and hunger-on does not. *The test must fail against the bug it names.*
5. **Griefing.** With N−1 players colluding to isolate one, confirm the victim can reach
   safety by joining any other fish.
6. **Wild-fish determinism.** N clients with uneven latency simulate an identical wild shoal
   across a full session, including the bolt at every hush.
7. **The serverless demonstration.** Two laptops, LAN only, internet unplugged, one vouches
   the other, blooms appear, a sweep resolves identically on both screens.
8. **Screen review.** A game-designer first-session review, code forbidden, gates the work —
   the standing bar for game changes in this repo.

---

## 7. Provenance

Section 2 was substantially rebuilt after review by two independent game-design
perspectives, which converged separately on: the missing hunger rule, the unplayable
telegraph window, cross-client divergence in sweep resolution, ostracism with no counterplay,
turn-drag as felt-friction, size as a pure liability, and speech costing a player their life.
The closest existing comparable is Agar.io, whose central lesson — *mass has to bleed* — was
the rule the first draft had removed.

Related: `project_the_trench`, `project_reef_game`, `project_chips_and_dip`,
`project_fold_rules_are_permanent`, `feedback_production_value_bar`.
