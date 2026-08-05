# Challenges for the robot player — and for you

Companion to `CHIPS_ROBOT_PLAYER.md`. That brief makes the robot an oracle; this
one makes it an **opponent**. Same machinery, and the framing matters: a QA bot
nobody wants to beat gets switched off, and a rival gets watched.

Every challenge below doubles as coverage. The reason a challenge is *fun* is
usually the same reason it's a good test: it forces a decision the game has
never been played hard against.

## The numbers you're both playing against

Read from the source, 2026-08-05:

```
base earn        TICK_CRUMBS 250 per TICK_MS 2500   = 100 crumbs/sec, 1 fryer, seasoning 1
crackle wait     CRACKLE_BASE_S 15 x 2^(k+1)        = 30s, 60s, 120s, 240s, 480s
ceiling          GOLDEN_CRACKLES 5 (x32)            Long Fry raises it to 6 (x64)
chip worth       pot x 2^crackles
double dip       1 in (mod x DOUBLE_DIP_RARITY)     mod 4 -> 1 in 40, mod 2 -> 1 in 20
burner           haste 1/6, drain 0.0591/tick       EV-negative, ~1% of pot kept on a full ride
prestige         TIP_FLOOR 4,000    SALT_PER_TIP 10    salt = sqrt-shaped
```

| band | boss | floor (lifetime chips) | HP (crumbs) | char |
|---|---|---|---|---|
| 0 | the porcelain | 2,000,000 | one blow | 1 |
| 1 | the table | 4,000,000 | 12,000,000,000 | 2 |
| 2 | the chip from 1974 | 8,000,000 | 48,000,000,000 | 3 |
| 3 | the rat's family | 16,000,000 | 160,000,000,000 | 5 |
| 4 | the first fryer | 32,000,000 | 512,000,000,000 | 8 |
| 5 | the other side | 64,000,000 | 1,536,000,000,000 | 13 |

## House rules

1. **Fresh table, mainnet, no seeded state.** A challenge starts at `lifetime 0`.
2. **The chain is the referee.** A score is whatever `foldChips` says over
   `get_replies` — not what a screen showed. If the client and the chain
   disagree, that is a bug and the run is void (and worth more than the score).
3. **The robot posts its runs.** Table id, final fold, wall-clock. You can
   re-fold any claim it makes.
4. **A void run is a finding.** Any fold regression, unpaid dip, or `movesFrom >
   movesTo` during a run cancels the score and files a report. The robot is
   trying to win; if it *can't*, that is the interesting result.

---

## THE SPRINT — most crumbs in 10 minutes

Fresh table, ten minutes, highest `lifetimeChips`.

**Why it's interesting:** this is the window where the burner is *correct*. The
Burner Knob is EV-negative on paper and measured at **+135.5% at x64 over 10
minutes**, falling to **+0.1% at 120 minutes** — it isn't a multiplier, it's a
time compressor. So Sprint and Marathon invert the optimal play with identical
rules, which is the most interesting thing in the whole balance table.

**Coverage:** burner haste/drain, crackle ladder under pressure, the dip-vs-hold
decision at every rung.

## THE MARATHON — most crumbs in 2 hours

Same, two hours.

**Why:** the burner is now worthless and parking wins. The real decisions are
seasoning-ladder order, when to take a bowl upgrade instead of a fryer, and
whether double-dip pays for itself at 1-in-40.

**Coverage:** sog decay, cap management, the long tail of the upgrade chain,
and any move-queue behaviour that only shows up after hundreds of moves.

## ONE CHIP — the single biggest dip

One chip. Highest single credited dip. Everything else is preparation.

**Why:** value is `pot x 2^crackles`, pot grows linearly, multiplier doubles per
rung, and the ladder is **terminal** at 5 (or 6 with Long Fry). There is a real
optimum and it moves with your seasoning. Add a 1-in-40 double-dip proc and the
top of the leaderboard is part nerve.

**Coverage:** `worthOf`, the ceiling, Long Fry, double-dip, and the bowl cap —
because the biggest chip you can *make* may be bigger than the bowl can *hold*,
and that is a decision, not an accident.

## THE DESCENT — deepest band, no tips

One bowl, no tipping, deepest band broken. Beat `the table` and you're past
where the operator got in a full night.

**Why:** the floor doubles per band while boss HP is now fixed per band, so the
binding constraint changes as you go. Band 1 wants 12B of chips; band 2 wants
48B and eight million lifetime to be allowed to swing at all.

**Coverage:** the whole boss path, `bossHpFrozen`, band sequencing, and the
`rejected-shallow` edge where you break a band and immediately swing at the next
one before you're deep enough.

## OLD SALT — most prestige in 45 minutes

Tip as often as you like. Highest `oldSalt`.

**Why:** salt is sqrt-shaped on purpose, so two short runs beat one run of twice
the length — tipping *early* is a live strategy rather than a consolation prize.
Finding the actual optimal tip cadence is a genuine open question in this game
and nobody has answered it.

**Coverage:** the tip path end to end, the keep-a-jar rule, and the rebuild loop
that broke repeatedly on 2026-08-04.

## CLEAN HANDS — 100 dips, zero waste

100 dips with **zero spilled crumbs and zero rejected buys**. Fastest wall-clock
wins; any spill or rejection ends the attempt.

**Why:** this is the discipline challenge, and it's the one most likely to find
bugs. Zero spill means never letting a chip outgrow the bowl. Zero rejections
means never buying out of chain order and never double-queuing a jar.

**Coverage:** exactly the failure modes of 2026-08-04 — `rejected-order` on a
missing prefix, the same jar queued twice, and the cap/room arithmetic.

---

## Beyond chips

The expensive parts of this robot — mint an identity, get it sponsored, drive a
real client, re-fold the chain and diff it against what the client believes —
are **not chips-specific**. They are the same for `reef-client`,
`chess-client`, `shoal-client` and `trench-client`.

So the robot should be a thin game adapter over a shared core:

```
  core:  identity + sponsorship + RPC + fold-diff + invariant runner + run recorder
    |
    +-- chips    : cook / dip / buy / descend / tip
    +-- reef     : place / claim
    +-- chess    : move
    +-- shoal    : school / drift
    +-- trench   : whatever the homestead loop is
```

Two payoffs beyond QA. **Cross-game invariants come free** — "no client state
may disagree with a re-fold of the chain" is the same assertion everywhere, and
[[project_get_replies_duplicate_content_ids]] notes reef/chess/shoal never got
the dedupe fix chips did, so the first honest run may find it for them. And an
**always-on opponent is content**: a bot on the leaderboard that plays every
night is a reason to come back, on a network whose whole premise is that there
is no server to keep score.

## Recording a run

Post to the debug space, same shape as a ⚑ report so the same tooling reads it:

```json
{"kind":"chips-run","challenge":"sprint-10m","by":"robot",
 "table":"sha256:...","startedAt":0,"endedAt":0,
 "score":{"lifetimeChips":0,"crumbs":0,"deepest":0,"oldSalt":0},
 "void":null,"foldHash":"..."}
```

`void` carries the reason when an invariant tripped. **A run that voids is worth
more than a run that scores** — it means the robot found something while trying
to win, which is the entire point of making it want to.
