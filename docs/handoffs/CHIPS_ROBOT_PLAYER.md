# Brief: a robot that plays Dippin' Chips through the real UI

**For:** Fable
**From:** the 2026-08-04 overnight session
**Status:** not started — this is a spec, not a report

## Why

Five bugs shipped and were caught on 2026-08-04, every one by the operator
tapping a phone at midnight, and every one with a **machine-checkable
invariant** that a robot playing the game would have caught in minutes:

| Bug | The invariant it violated |
|---|---|
| Boss bar un-beat itself | a beaten band must stay beaten |
| Victory card named the wrong boss | the card must name the band that fell |
| Reconcile ate fresh buys | a jar bought must stay owned until a tip |
| Same jar queued twice | a jar must appear at most once in the queue |
| Settling buy retired by an old namesake | a move is settled only by its own twin |

None of these need a human eye. They need something that plays for an hour and
asserts. That is the whole ask.

**This is not a UI-polish bot.** It is a consistency oracle: it drives the real
client, then checks the client's own beliefs against the chain.

## What to build

A Playwright (or Puppeteer — dealer's choice, Playwright preferred for its
tracing) script that:

1. boots a **local node** and serves the chips client against it,
2. mints an identity and gets it sponsored,
3. plays a long session through the DOM — cook, dip, buy, descend, tip,
4. after every action, asserts the invariants below,
5. on any failure, files a `⚑` report **and** dumps a chain re-fold beside it.

Target: an unattended hour of play with zero assertion failures.

### Do NOT run this against mainnet

`chips-client/.env.production` points `VITE_CHIPS_RPC` at `https://swimchain.io/rpc`.
A robot there mints real PoW, pollutes a live space, and competes with real
players for a seed that already struggles to form blocks. Use a **local
regtest/testnet node** (`scripts/node-manager.sh`) and build the client with
`VITE_CHIPS_RPC` pointed at it. Regtest PoW is 0.1% of mainnet, which is also
the only way a robot gets enough moves per hour to be useful.

The env vars that must be set at build time (Vite bakes them; a bare
`npm run build` ships a bundle that dials localhost and has no space):
`VITE_CHIPS_RPC`, `VITE_CHIPS_SPACE`, `VITE_GAME_SPONSOR`,
`VITE_CHIPS_BOTTOM_SPACE`, `VITE_CHIPS_DEBUG_SPACE`.

## The invariants — this is the actual deliverable

Assert after every action. Each one is a real bug from one night.

**Monotonicity (the strongest single check).** The client already computes this
and reports it: a fold regression where `movesFrom > movesTo` means history got
**shorter** — a move was deleted, not merely mis-shown. See `lib/foldWatch.ts`.
This one line named two of the five bugs and is the highest-value assertion in
the whole list.

- `state.moves.length` never decreases between polls.
- `lifetimeChips`, `oldSalt`, `deepest`, `char` never decrease, ever.
- `crumbs` decreases **only** via a buy, a tip, or a dip that spilled.
- `owned` shrinks **only** across a tip.

**Boss.** `bossHp(band)` is now a pure function of the band, so:
- the HP shown for a given band is identical on every poll and every reload;
- once `broken` reaches N it never goes below N without a `tip`;
- the victory card names the band that fell, not `state.broken` after the fold.

**Queue.**
- no two entries share `(kind, key)` for a buy, or `(kind, ms)` for a dip;
- a move whose body is on chain leaves the queue within ~2 polls;
- the queue never grows monotonically for more than ~60s (a stall).

**Shop.**
- a jar in flight is never offered (`openJarsOf` takes `pending` — verify the
  DOM agrees);
- clicking an offered jar always produces either an owned jar or a **visible**
  refusal — never silence. A `rejected-order` with no UI path is a bug.

**Dips.** `credited == min(amount, bowlCap - crumbsBefore)`, and `spilled ==
amount - credited`. The `dips` ring in the report already records all five
fields; assert on it directly.

## The oracle: client vs chain

The strongest check is not any single invariant — it is **differential**:

```
get_replies(tableId, 5000)  ->  foldChips(...)  ->  compare to the client's own fold
```

`foldChips` is pure and importable. Pull the replies, fold them, and diff
against the live `state`. Any divergence is either a real bug or a pending move
— and the queue tells you which. `docs`/memory note
`project_chips_debug_report_retrieval` has the exact RPC recipe; note the limit
matters (500 silently truncated an 886-move table and folded a WRONG state).

## Gotchas that will cost you an evening if you skip them

- **`npm test` does not typecheck.** `scripts/test-all.mjs` runs each file
  through `tsx`, which strips types without checking them. A green suite can
  still fail `tsc -b`. Run `npm run build` too.
- **Rejected buys are silent.** No toast, no state change — the jar just never
  appears. Assert on the fold outcome, not on the screen.
- **A tip is destructive and deliberate-looking.** `tip <keep>` carries a keep,
  so the robot must never wander into the keep picker by accident; drive tips
  explicitly and assert the reset that follows.
- **The report's `rejects` list has a false-positive mode** when a jar was
  queued twice: the first buy succeeds, the second folds `rejected-owned`, and
  a successful purchase looks like a failure. Cross-check against `owned`.
- **Reports lose their tail.** `reportBug` posts multi-part with no retry, so
  parts after an interruption are stranded. The useful fields (`lostMoves`,
  `rejects`, `queueDupes`, `regressions`) are deliberately near the FRONT of the
  payload for this reason — part 1 is usually enough.
- **Blocks are slow** (5–13 min observed on mainnet, faster on regtest). Never
  assert "confirmed" on a wall-clock deadline; assert on mempool visibility via
  `get_replies`, which serves from the mempool.

## Stretch, only after the above is green

Play adversarially rather than sensibly: buy the same jar twice as fast as the
DOM allows, tip mid-purchase, background the tab for a minute mid-dip, kill the
node under the client and bring it back. Every bug this session came from a
*race*, not from an ordinary sequence — the sensible player would have found
none of them.
